const Parser = require("rss-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const https = require("https");

// ─── Telegram Bildirim ───────────────────────────────────────────────
async function sendTelegram(text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn("[TELEGRAM] Bot token veya chat ID tanımlı değil, bildirim atlanıyor.");
        return;
    }

    const MAX_LENGTH = 4000;
    const chunks = [];
    let currentChunk = "";

    const paragraphs = text.split("\n\n");
    for (const p of paragraphs) {
        if (currentChunk.length + p.length + 2 > MAX_LENGTH) {
            if (currentChunk) chunks.push(currentChunk.trimEnd());
            
            if (p.length > MAX_LENGTH) {
                let tempP = p;
                while (tempP.length > 0) {
                    chunks.push(tempP.slice(0, MAX_LENGTH));
                    tempP = tempP.slice(MAX_LENGTH);
                }
                currentChunk = "";
            } else {
                currentChunk = p + "\n\n";
            }
        } else {
            currentChunk += p + "\n\n";
        }
    }
    if (currentChunk) chunks.push(currentChunk.trimEnd());

    for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `📄 Bölüm ${i + 1}/${chunks.length}\n\n` : "";
        const message = prefix + chunks[i];

        const payload = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "Markdown",
        });

        await new Promise((resolve) => {
            const req = https.request(
                {
                    hostname: "api.telegram.org",
                    path: `/bot${botToken}/sendMessage`,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                    },
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => (data += chunk));
                    res.on("end", () => {
                        if (res.statusCode !== 200) {
                            console.error(`[TELEGRAM] Hata (${res.statusCode}):`, data);
                        }
                        resolve(data);
                    });
                }
            );
            req.on("error", (err) => {
                console.error("[TELEGRAM] Bağlantı hatası:", err.message);
                resolve();
            });
            req.write(payload);
            req.end();
        });

        if (i < chunks.length - 1) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    console.log(`[TELEGRAM] Podcast metni ${chunks.length} parça halinde gönderildi.`);
}

// ─── RSS Kaynakları ──────────────────────────────────────────────────

// 🌍 Yabancı Kaynaklar
const INTERNATIONAL_FEEDS = [
    { url: "https://www.reddit.com/r/cars/top/.rss?t=week", source: "Reddit r/cars" },
    { url: "https://www.motor1.com/rss/", source: "Motor1 (Global)" },
    { url: "https://jalopnik.com/rss", source: "Jalopnik" },
    { url: "https://www.thedrive.com/feed", source: "The Drive" },
    { url: "https://www.carscoops.com/feed/", source: "CarScoops" },
    { url: "https://www.roadandtrack.com/rss/all.xml", source: "Road & Track" },
    { url: "https://www.autoblog.com/rss.xml", source: "Autoblog" },
];

// 🇹🇷 Türkiye Kaynakları
const TURKEY_FEEDS = [
    { url: "https://www.motor1.com/tr/rss/", source: "Motor1 Türkiye" },
    { url: "https://www.otopark.com/feed/", source: "Otopark" },
    { url: "https://www.sekizsilindir.com/feed/", source: "Sekizsilindir" },
    { url: "https://www.otoaktuel.com.tr/rss", source: "Otoaktüel" },
];

const RSS_FEEDS = [...INTERNATIONAL_FEEDS, ...TURKEY_FEEDS];

const MAX_ITEMS_PER_FEED = 5;

// ─── Tarih Hesaplama ─────────────────────────────────────────────────

/**
 * Bugünün gününe göre haber toplanacak tarih aralığını hesaplar.
 * Pazartesi: Cuma-Pazartesi arası (hafta sonu haberleri)
 * Cuma: Pazartesi-Cuma arası (hafta içi haberleri)
 */
function getDateRange() {
    const now = new Date();
    const daysBack = 1;

    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - daysBack);
    startDate.setUTCHours(0, 0, 0, 0);

    return {
        startDate,
        endDate: now,
        daysBack,
        dayName: "Günlük",
    };
}

// ─── Sistem Komutu ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sen profesyonel bir otomobil habercisi ve editörüsün. Otomobil tutkunları için günlük bir bülten hazırlıyorsun.

KESİN KURALLAR:
- Bana ASLA finans, borsa, şirket politikası, CEO açıklamaları, elektrikli araç yatırımı, satış rakamları veya kurumsal haber getirme.
- SADECE şu konulardaki haberleri seç: motor mekaniği, yeni performans araçları, retro/klasik araçlar, modifiye kültürü, sürücü odaklı haberler, yarış haberleri, ilginç otomobil hikayeleri.
- ASLA "Merhaba, podcast'e hoş geldiniz" veya "Gizli Garaj'da takılalım" gibi sohbet tarzı ifadeler kullanma. Doğrudan profesyonel, net, tarafsız ve ciddi bir haber dili kullan.

TÜRKİYE ÖNCELİĞİ:
- Türkiye kaynaklarından gelen haberler (Motor1 Türkiye, Otopark, Sekizsilindir, Otoaktüel) ÇOK ÖNEMLİDİR.
- Türkiye otomobil piyasası, ÖTV/KDV değişiklikleri, yerli üretim, Türkiye'deki lansman ve fiyat güncellemeleri, Türkiye'deki modifiye kültürü gibi konular bültende ÖNCELİKLİ olarak işlenmelidir.
- Türkiye haberleri varsa, bunlar bültenin ilk sırasında yer almalıdır.

HABER SEÇİM MANTIĞI:
- Bir haberin önemini şöyle belirle: Eğer aynı haber birden fazla kaynakta geçiyorsa, o haber gerçekten önemlidir ve kesinlikle bültende yer almalıdır. Tekrar eden haberleri birleştirip tek bir kapsamlı haber olarak sun.
- Sana verilen tarih aralığı dışındaki haberleri KULLANMA. Sadece belirtilen tarih aralığındaki haberleri işle.

BÜLTEN FORMATI:
- Haberleri akıcı, profesyonel ve Türkçe bir günlük haber bülteni formatında (madde madde veya net başlıklarla) hazırla.
- Her haberin başlığını net bir şekilde kalın (bold) veya emoji ile belirginleştir.
- Podcast tarzı giriş-gelişme-sonuç veya "Görüşmek üzere" gibi vedalar YAZMA.
- Sadece saf, okuması kolay, doyurucu günlük otomobil haberleri sun.`;

// ─── RSS Çekme ───────────────────────────────────────────────────────

async function fetchFeed(feed, parser, startDate) {
    try {
        const data = await parser.parseURL(feed.url);
        const items = (data.items || [])
            .filter((item) => {
                // Tarih filtresi: Sadece belirlenen tarih aralığındaki haberleri al
                const itemDate = new Date(item.pubDate || item.isoDate || 0);
                return itemDate >= startDate;
            })
            .slice(0, MAX_ITEMS_PER_FEED);

        return items.map((item) => ({
            source: feed.source,
            title: item.title || "Başlık yok",
            link: item.link || "",
            snippet: (item.contentSnippet || item.content || "").slice(0, 500),
            date: item.pubDate || item.isoDate || "",
        }));
    } catch (err) {
        console.error(`[RSS HATA] ${feed.source} kaynağından veri alınamadı:`, err.message);
        return [];
    }
}

async function fetchAllFeeds(startDate) {
    const parser = new Parser({
        headers: {
            "User-Agent": "OtoHaberAjani/1.0 (RSS Reader)",
            Accept: "application/rss+xml, application/xml, text/xml",
        },
        timeout: 10000,
    });

    const results = await Promise.allSettled(
        RSS_FEEDS.map((feed) => fetchFeed(feed, parser, startDate))
    );

    const allNews = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            allNews.push(...result.value);
        }
    }

    return allNews;
}

// ─── Gemini ile Podcast Üretimi ──────────────────────────────────────

async function generatePodcastScript(news, dateRange) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY ortam değişkeni tanımlı değil.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const startStr = dateRange.startDate.toLocaleDateString("tr-TR");
    const endStr = dateRange.endDate.toLocaleDateString("tr-TR");

    const newsText = news
        .map(
            (item, i) =>
                `${i + 1}. [${item.source}] ${item.title}\n   Link: ${item.link}\n   Tarih: ${item.date}\n   Özet: ${item.snippet}`
        )
        .join("\n\n");

    const userPrompt = `Bugün ${dateRange.dayName} günü. Bu bölüm ${startStr} - ${endStr} tarihleri arasındaki haberleri kapsıyor.

İşte bu dönemin otomobil haberleri:

${newsText}

Yukarıdaki haberleri kullanarak podcast metnini hazırla. SADECE ${startStr} - ${endStr} arasındaki haberleri kullan, daha eski haberleri dahil etme.`;

    let result;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                generationConfig: {
                    temperature: 0.9,
                    maxOutputTokens: 8192,
                },
            });
            break; // Başarılı olursa döngüden çık
        } catch (error) {
            console.error(`[GEMINI] ⚠️ API Hatası (Deneme ${attempt}/${maxRetries}):`, error.message);
            if (attempt === maxRetries) {
                throw error; // Tüm denemeler başarısızsa hatayı fırlat
            }
            // Bekleme süresi: 1. denemede 5sn, 2. denemede 10sn
            const waitTime = attempt * 5000;
            console.log(`[GEMINI] ⏳ ${waitTime / 1000} saniye beklenip tekrar deneniyor...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
    }

    const response = result.response;
    const text = response.text();

    if (!text) {
        throw new Error("Gemini API boş bir yanıt döndü.");
    }

    return text;
}

// ─── Vercel Serverless Handler ───────────────────────────────────────

module.exports = async function handler(req, res) {
    try {
        console.log("[CRON] Oto Haber Ajanı çalışmaya başladı...");

        // 1) Tarih aralığını hesapla
        const dateRange = getDateRange();
        console.log(`[CRON] ${dateRange.dayName} bölümü: Son ${dateRange.daysBack} günün haberleri toplanıyor...`);

        // 2) RSS kaynaklarından haberleri çek (tarih filtreli)
        const news = await fetchAllFeeds(dateRange.startDate);

        if (news.length === 0) {
            console.warn("[CRON] Hiçbir kaynaktan haber alınamadı.");

            const noNewsMsg = "📰 *Otomobil Haber Bülteni*\n\n⚠️ Son 24 saat içinde kaynaklardan otomobil haberi çekilemedi.";
            try { await sendTelegram(noNewsMsg); } catch (e) { /* sessizce geç */ }

            return res.status(500).json({
                success: false,
                error: "Hiçbir RSS kaynağından haber çekilemedi.",
            });
        }

        console.log(`[CRON] Toplam ${news.length} haber çekildi.`);

        // 3) Gemini API ile podcast metnini oluştur
        const podcastScript = await generatePodcastScript(news, dateRange);
        console.log("[CRON] Podcast metni başarıyla oluşturuldu.");

        // 4) Telegram bildirimi gönder
        const startStr = dateRange.startDate.toLocaleDateString("tr-TR");
        const endStr = dateRange.endDate.toLocaleDateString("tr-TR");
        const telegramHeader = `📰 *Günlük Otomobil Haber Bülteni*\n📅 ${startStr} — ${endStr} | 📰 ${news.length} kaynak\n\n`;
        try {
            await sendTelegram(telegramHeader + podcastScript);
        } catch (telegramErr) {
            console.error("[TELEGRAM] Bildirim gönderilemedi:", telegramErr.message);
        }

        // 5) Kaynak bazlı özet
        const sourceSummary = RSS_FEEDS.map((feed) => {
            const feedNews = news.filter((n) => n.source === feed.source);
            return {
                source: feed.source,
                url: feed.url,
                fetchedCount: feedNews.length,
            };
        });

        // 6) Başarılı yanıt dön
        return res.status(200).json({
            success: true,
            generatedAt: new Date().toISOString(),
            episode: {
                day: dateRange.dayName,
                coveragePeriod: `${startStr} - ${endStr}`,
                daysBack: dateRange.daysBack,
            },
            sources: sourceSummary,
            newsCount: news.length,
            news: news.map((item) => ({
                source: item.source,
                title: item.title,
                link: item.link,
                date: item.date,
            })),
            podcastScript,
        });
    } catch (err) {
        console.error("[CRON] Beklenmeyen hata:", err.message);
        return res.status(500).json({
            success: false,
            error: err.message || "Bilinmeyen bir hata oluştu.",
        });
    }
};
