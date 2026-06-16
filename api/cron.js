const { sendTelegram } = require("../lib/telegram");
const { fetchAllFeeds, markNewsAsSent, RSS_FEEDS } = require("../lib/news");
const { generateNewsDigest } = require("../lib/ai");

module.exports = async function handler(req, res) {
    try {
        console.log("[CRON] Oto Haber Ajanı çalışmaya başladı...");

        // Son 1 günün haberlerini çek
        const { allNews, startDate, endDate } = await fetchAllFeeds(1);

        if (allNews.length === 0) {
            console.warn("[CRON] Hiçbir kaynaktan yeni haber alınamadı.");
            const noNewsMsg = "📰 *Otomobil Haber Bülteni*\n\n⚠️ Son 24 saat içinde yeni bir otomobil haberi bulunamadı (veya hepsi okundu).";
            try { await sendTelegram(noNewsMsg); } catch (e) { /* sessizce geç */ }

            return res.status(200).json({ success: true, message: "Yeni haber yok." });
        }

        console.log(`[CRON] Toplam ${allNews.length} yeni haber çekildi.`);

        const startStr = startDate.toLocaleDateString("tr-TR");
        const endStr = endDate.toLocaleDateString("tr-TR");
        
        const podcastScript = await generateNewsDigest(allNews, `${startStr} - ${endStr}`);
        console.log("[CRON] Bülten metni başarıyla oluşturuldu.");

        // Kapak fotoğrafı için en az bir görsel bul (ilk bulduğu resim)
        let coverImage = null;
        for (const item of allNews) {
            if (item.imageUrl) {
                coverImage = item.imageUrl;
                break;
            }
        }

        const telegramHeader = `📰 *Günlük Otomobil Haber Bülteni*\n📅 ${startStr} — ${endStr} | 📰 ${allNews.length} yeni haber\n\n`;
        
        try {
            await sendTelegram(telegramHeader + podcastScript, coverImage);
        } catch (telegramErr) {
            console.error("[TELEGRAM] Bildirim gönderilemedi:", telegramErr.message);
        }

        // Başarıyla gönderilen haberleri veritabanına kaydet (tekrarları önlemek için)
        await markNewsAsSent(allNews);

        return res.status(200).json({ success: true, message: "Bülten başarıyla gönderildi." });
    } catch (err) {
        console.error("[CRON] Beklenmeyen hata:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
