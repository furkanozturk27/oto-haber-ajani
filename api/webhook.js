const { sendTelegram } = require("../lib/telegram");
const { fetchAllFeeds, markNewsAsSent } = require("../lib/news");
const { generateNewsDigest } = require("../lib/ai");
const https = require("https");

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot Webhook endpointi.');
    }

    try {
        const body = req.body;
        if (!body || !body.message || !body.message.text) {
            return res.status(200).send('OK');
        }

        const text = body.message.text.trim();
        const chatId = body.message.chat.id;

        // Güvenlik: Sadece environment variable'daki CHAT ID'ye cevap ver (isteğe bağlı ama güvenlidir)
        const allowedChatId = process.env.TELEGRAM_CHAT_ID;
        if (allowedChatId && String(chatId) !== String(allowedChatId)) {
            return res.status(200).send('OK');
        }

        if (text.startsWith("/haber")) {
            await sendSimpleTelegramMessage(chatId, "⏱️ Taze otomobil haberleri toparlanıyor, fotoğraflar aranıyor ve yapay zeka bülteni hazırlıyor... Lütfen bekleyin.");

            const { allNews, startDate, endDate } = await fetchAllFeeds(1);

            if (allNews.length === 0) {
                await sendSimpleTelegramMessage(chatId, "⚠️ Son 24 saat içinde yeni bir otomobil haberi bulunamadı (veya hepsi daha önce gönderilmiş).");
                return res.status(200).send('OK');
            }

            const startStr = startDate.toLocaleDateString("tr-TR");
            const endStr = endDate.toLocaleDateString("tr-TR");
            
            const podcastScript = await generateNewsDigest(allNews, `${startStr} - ${endStr}`);

            let coverImage = null;
            for (const item of allNews) {
                if (item.imageUrl) {
                    coverImage = item.imageUrl;
                    break;
                }
            }

            const telegramHeader = `⚡ *Anlık Otomobil Haber Bülteni*\n📅 ${startStr} — ${endStr} | 📰 ${allNews.length} yeni haber\n\n`;
            
            await sendTelegram(telegramHeader + podcastScript, coverImage);
            await markNewsAsSent(allNews);
        }

        return res.status(200).send('OK');
    } catch (err) {
        console.error("[WEBHOOK] Hata:", err.message);
        return res.status(200).send('OK');
    }
};

async function sendSimpleTelegramMessage(chatId, text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const payload = JSON.stringify({ chat_id: chatId, text: text });

    return new Promise((resolve) => {
        const req = https.request(
            {
                hostname: "api.telegram.org",
                path: `/bot${botToken}/sendMessage`,
                method: "POST",
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
            },
            (res) => resolve()
        );
        req.on("error", () => resolve());
        req.write(payload);
        req.end();
    });
}
