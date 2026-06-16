const Parser = require("rss-parser");
const { kv } = require("@vercel/kv");

// RSS Kaynakları
const INTERNATIONAL_FEEDS = [
    { url: "https://www.reddit.com/r/cars/top/.rss?t=week", source: "Reddit r/cars" },
    { url: "https://www.motor1.com/rss/", source: "Motor1 (Global)" },
    { url: "https://jalopnik.com/rss", source: "Jalopnik" },
    { url: "https://www.thedrive.com/feed", source: "The Drive" },
    { url: "https://www.carscoops.com/feed/", source: "CarScoops" },
    { url: "https://www.roadandtrack.com/rss/all.xml", source: "Road & Track" },
    { url: "https://www.autoblog.com/rss.xml", source: "Autoblog" },
];

const TURKEY_FEEDS = [
    { url: "https://www.motor1.com/tr/rss/", source: "Motor1 Türkiye" },
    { url: "https://www.otopark.com/feed/", source: "Otopark" },
    { url: "https://www.sekizsilindir.com/feed/", source: "Sekizsilindir" },
    { url: "https://www.otoaktuel.com.tr/rss", source: "Otoaktüel" },
];

const RSS_FEEDS = [...INTERNATIONAL_FEEDS, ...TURKEY_FEEDS];
const MAX_ITEMS_PER_FEED = 5;

// Görsel çıkartma fonksiyonu
function extractImage(item) {
    if (item.enclosure && item.enclosure.url && item.enclosure.url.startsWith("http")) {
        return item.enclosure.url;
    }
    
    // HTML content içinden ilk img tag'ini bul
    const content = item.content || item.contentSnippet || "";
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1] && imgMatch[1].startsWith("http")) {
        return imgMatch[1];
    }
    return null;
}

async function fetchFeed(feed, parser, startDate) {
    try {
        const data = await parser.parseURL(feed.url);
        let items = (data.items || [])
            .filter((item) => {
                const itemDate = new Date(item.pubDate || item.isoDate || 0);
                return itemDate >= startDate;
            });
            
        // KV Kontrolü (Hafıza)
        const newItems = [];
        for (const item of items) {
            const link = item.link || "";
            if (!link) continue;
            
            try {
                // Link KV'de var mı diye kontrol et
                const exists = await kv.get(`is_sent_${link}`);
                if (!exists) {
                    newItems.push(item);
                }
            } catch (kvError) {
                // KV kurulu değilse veya hata verdiyse normal devam et
                console.warn(`[KV UYARISI] Redis erişimi başarısız: ${kvError.message}. Filtreleme atlanıyor.`);
                newItems.push(item);
            }
        }

        items = newItems.slice(0, MAX_ITEMS_PER_FEED);

        return items.map((item) => {
            return {
                source: feed.source,
                title: item.title || "Başlık yok",
                link: item.link || "",
                snippet: (item.contentSnippet || item.content || "").replace(/<[^>]*>?/gm, '').slice(0, 500),
                date: item.pubDate || item.isoDate || "",
                imageUrl: extractImage(item)
            };
        });
    } catch (err) {
        console.error(`[RSS HATA] ${feed.source} kaynağından veri alınamadı:`, err.message);
        return [];
    }
}

async function fetchAllFeeds(daysBack = 1) {
    const parser = new Parser({
        headers: {
            "User-Agent": "OtoHaberAjani/2.0 (RSS Reader)",
            Accept: "application/rss+xml, application/xml, text/xml",
        },
        timeout: 10000,
    });

    const now = new Date();
    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - daysBack);
    startDate.setUTCHours(0, 0, 0, 0);

    const results = await Promise.allSettled(
        RSS_FEEDS.map((feed) => fetchFeed(feed, parser, startDate))
    );

    const allNews = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            allNews.push(...result.value);
        }
    }

    return { allNews, startDate, endDate: now };
}

// Gönderilen haberleri KV'ye kaydetme fonksiyonu (7 gün = 604800 saniye)
async function markNewsAsSent(newsArray) {
    try {
        for (const item of newsArray) {
            if (item.link) {
                await kv.set(`is_sent_${item.link}`, "1", { ex: 604800 });
            }
        }
        console.log(`[KV] ${newsArray.length} haber 'gönderildi' olarak işaretlendi.`);
    } catch (err) {
        console.error(`[KV HATA] Haberler işaretlenirken hata:`, err.message);
    }
}

module.exports = { fetchAllFeeds, markNewsAsSent, RSS_FEEDS };
