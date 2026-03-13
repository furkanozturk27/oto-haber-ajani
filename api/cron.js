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
    for (let i = 0; i < text.length; i += MAX_LENGTH) {
        chunks.push(text.slice(i, i + MAX_LENGTH));
    }

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
    const dayOfWeek = now.getUTCDay(); // 0=Pazar, 1=Pazartesi, 5=Cuma

    let daysBack;
    if (dayOfWeek === 1) {
        // Pazartesi: Son 3 günün haberleri (Cuma-Cumartesi-Pazar)
        daysBack = 3;
    } else if (dayOfWeek === 5) {
        // Cuma: Son 4 günün haberleri (Pazartesi-Salı-Çarşamba-Perşembe)
        daysBack = 4;
    } else {
        // Manuel tetikleme durumunda son 3 gün
        daysBack = 3;
    }

    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - daysBack);
    startDate.setUTCHours(0, 0, 0, 0);

    return {
        startDate,
        endDate: now,
        daysBack,
        dayName: dayOfWeek === 1 ? "Pazartesi" : dayOfWeek === 5 ? "Cuma" : "Manuel",
    };
}

// ─── Sistem Komutu ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sen "En Otomobil Haberleri" podcast'inin sunucususun. Profesyonel bir otomobil gazetecisi ve tutkulu bir araba insanısın.

KESİN KURALLAR:
- Bana ASLA finans, borsa, şirket politikası, CEO açıklamaları, elektrikli araç yatırımı, satış rakamları veya kurumsal haber getirme.
- SADECE şu konulardaki haberleri seç: motor mekaniği, yeni performans araçları, retro/klasik araçlar, modifiye kültürü, sürücü odaklı haberler, yarış haberleri, ilginç otomobil hikayeleri.
- Eğer verilen haberlerin hepsi sıkıcı şirket/finans haberleri ise, podcast metninin başına "Bugün dişe dokunur bir haber yok, garajda takılalım!" yaz ve direkt "Gizli Garaj" köşesine geç. Bu durumda Gizli Garaj bölümünü ekstra uzun ve detaylı yap.

TÜRKİYE ÖNCELİĞİ:
- Türkiye kaynaklarından gelen haberler (Motor1 Türkiye, Otopark, Sekizsilindir, Otoaktüel) ÇOK ÖNEMLİDİR.
- Türkiye otomobil piyasası, ÖTV/KDV değişiklikleri, yerli üretim, Türkiye'deki lansman ve fiyat güncellemeleri, Türkiye'deki modifiye kültürü gibi konular podcastte ÖNCELİKLİ olarak ve GENİŞ YER AYRILIARAK işlenmelidir.
- Türkiye haberleri varsa, bunlar podcastin ilk sırasında yer almalıdır.

HABER SEÇİM MANTIĞI:
- Haberleri seçerken sayı sınırı koyma. Kurallara uyan tüm önemli haberleri kullan.
- Bir haberin önemini şöyle belirle: Eğer aynı haber birden fazla kaynakta geçiyorsa, o haber gerçekten önemlidir ve kesinlikle podcastte yer almalıdır. Tekrar eden haberleri birleştirip tek bir kapsamlı haber olarak sun.
- Sadece tek bir kaynakta geçen ama gerçekten ilginç/sürücü odaklı haberler de dahil edilebilir.
- Sana verilen tarih aralığı dışındaki haberleri KULLANMA. Sadece belirtilen tarih aralığındaki haberleri işle.

PODCAST FORMATI:
- Haberleri akıcı, sohbet havasında ve Türkçe bir podcast metni olarak hazırla.
- Reddit haberlerinde topluluğun reaksiyonlarına ve yorumlarına değin.
- Podcast'in uygun bir yerinde günümüz araçlarının aşırı elektronik yapısını, efsanevi 1.6 Multijet motorların o saf mekanik dayanıklılığı ve sorunsuzluğu ile esprili bir dille kıyasla.
- Podcast'in sonuna "Gizli Garaj" isimli özel bir köşe ekle. Bu köşede; 90'lar ve 2000'lerin efsanevi araçlarına (örneğin VW Golf Mk4, Opel Vectra, Toyota Corolla AE101, Fiat Tipo, Renault Broadway, Tofaş Doğan, Kartal gibi) dair retro bir detay, modifiye kültürü veya bir anı paylaş.`;

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

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 8192,
        },
    });

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

            const noNewsMsg = "🎙️ *En Otomobil Haberleri*\n\n⚠️ Bu dönemde kaynaklardan haber çekilemedi. Bir sonraki bölümde görüşmek üzere!";
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
        const telegramHeader = `🎙️ *En Otomobil Haberleri — ${dateRange.dayName} Bölümü*\n📅 ${startStr} — ${endStr} | 📰 ${news.length} kaynaktan derlendi\n\n`;
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
