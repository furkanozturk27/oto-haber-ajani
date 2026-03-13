const Parser = require("rss-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const RSS_FEEDS = [
    { url: "https://www.reddit.com/r/cars/top/.rss?t=day", source: "Reddit r/cars" },
    { url: "https://www.motor1.com/rss/", source: "Motor1" },
    { url: "https://jalopnik.com/rss", source: "Jalopnik" },
];

const MAX_ITEMS_PER_FEED = 3;

const SYSTEM_PROMPT = `Sen profesyonel bir otomobil gazetecisi ve podcast sunucususun. Verilen haberleri birleştir, tekrar edenleri ele ve en ilgi çekici 3 haberi seç. Haberleri akıcı, sohbet havasında ve Türkçe bir podcast metni olarak hazırla. Reddit haberlerinde topluluğun reaksiyonlarına değin. Podcast'in sonuna "Gizli Garaj" isimli özel bir köşe ekle. Bu köşede; 90'lar ve 2000'lerin efsanevi araçlarına (örneğin VW Golf Mk4, Opel Vectra veya Toyota Corolla AE101 gibi) dair retro bir detay, modifiye kültürü veya bir anı paylaş. Ayrıca podcast'in uygun bir yerinde günümüz araçlarının aşırı elektronik yapısını, efsanevi 1.6 Multijet motorların o saf mekanik dayanıklılığı ve sorunsuzluğu ile esprili bir dille kıyasla.`;

/**
 * Tek bir RSS kaynağından en güncel haberleri çeker.
 * @param {object} feed - { url, source }
 * @param {Parser} parser - rss-parser örneği
 * @returns {Promise<Array>} Haber dizisi
 */
async function fetchFeed(feed, parser) {
    try {
        const data = await parser.parseURL(feed.url);
        const items = (data.items || []).slice(0, MAX_ITEMS_PER_FEED);

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

/**
 * Tüm RSS kaynaklarından haberleri toplar.
 * @returns {Promise<Array>} Tüm haberler
 */
async function fetchAllFeeds() {
    const parser = new Parser({
        headers: {
            "User-Agent": "OtoHaberAjani/1.0 (RSS Reader)",
            Accept: "application/rss+xml, application/xml, text/xml",
        },
        timeout: 10000,
    });

    const results = await Promise.allSettled(
        RSS_FEEDS.map((feed) => fetchFeed(feed, parser))
    );

    const allNews = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            allNews.push(...result.value);
        }
    }

    return allNews;
}

/**
 * Gemini API ile podcast metni üretir.
 * @param {Array} news - Haber listesi
 * @returns {Promise<string>} Podcast metni
 */
async function generatePodcastScript(news) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY ortam değişkeni tanımlı değil.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const newsText = news
        .map(
            (item, i) =>
                `${i + 1}. [${item.source}] ${item.title}\n   Link: ${item.link}\n   Tarih: ${item.date}\n   Özet: ${item.snippet}`
        )
        .join("\n\n");

    const userPrompt = `İşte bugünün otomobil haberleri:\n\n${newsText}\n\nYukarıdaki haberleri kullanarak podcast metnini hazırla.`;

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 4096,
        },
    });

    const response = result.response;
    const text = response.text();

    if (!text) {
        throw new Error("Gemini API boş bir yanıt döndü.");
    }

    return text;
}

/**
 * Vercel Serverless Function handler
 */
module.exports = async function handler(req, res) {
    try {
        console.log("[CRON] Oto Haber Ajanı çalışmaya başladı...");

        // 1) RSS kaynaklarından haberleri çek
        const news = await fetchAllFeeds();

        if (news.length === 0) {
            console.warn("[CRON] Hiçbir kaynaktan haber alınamadı.");
            return res.status(500).json({
                success: false,
                error: "Hiçbir RSS kaynağından haber çekilemedi.",
            });
        }

        console.log(`[CRON] Toplam ${news.length} haber çekildi.`);

        // 2) Gemini API ile podcast metnini oluştur
        const podcastScript = await generatePodcastScript(news);

        console.log("[CRON] Podcast metni başarıyla oluşturuldu.");

        // 3) Başarılı yanıt dön
        return res.status(200).json({
            success: true,
            generatedAt: new Date().toISOString(),
            newsCount: news.length,
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
