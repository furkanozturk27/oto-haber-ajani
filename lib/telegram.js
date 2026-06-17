const https = require("https");

async function sendTelegram(text, imageUrl = null) {
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
        const prefix = chunks.length > 1 ? `[Kısım ${i + 1}/${chunks.length}]\n\n` : "";
        const message = prefix + chunks[i];

        // Eğer ilk mesajsa ve görsel varsa, sendPhoto kullanalım. 
        // Telegram sendPhoto açıklaması (caption) 1024 karakterle sınırlıdır!
        // O yüzden görseli ayrı bir mesaj olarak atıp hemen altına metni atmak daha garantidir.
        if (i === 0 && imageUrl) {
            console.log("[TELEGRAM] Kapak fotoğrafı gönderiliyor...");
            await sendTelegramPhoto(botToken, chatId, imageUrl);
        }

        // Gemini'nin Markdown (**) formatını Telegram'ın kabul ettiği HTML formatına çevirelim
        // Telegram MarkdownV2'si çok kırılgandır, bu yüzden HTML en güvenlisidir.
        let htmlMessage = message
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Kalın (bold)
            .replace(/\*(.*?)\*/g, '<i>$1</i>') // İtalik
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>') // Linkler
            .replace(/`/g, ''); // Inline code'ları kaldır (Telegram HTML'de sorun yaratabilir)

        const payload = JSON.stringify({
            chat_id: chatId,
            text: htmlMessage,
            parse_mode: "HTML",
            disable_web_page_preview: true
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
                            console.error(`[TELEGRAM] Mesaj Hata (${res.statusCode}):`, data);
                        }
                        resolve(data);
                    });
                }
            );
            req.on("error", (err) => {
                console.error("[TELEGRAM] Mesaj Bağlantı hatası:", err.message);
                resolve();
            });
            req.write(payload);
            req.end();
        });

        if (i < chunks.length - 1) {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    console.log(`[TELEGRAM] Bülten ${chunks.length} parça halinde gönderildi.`);
}

async function sendTelegramPhoto(botToken, chatId, imageUrl) {
    const payload = JSON.stringify({
        chat_id: chatId,
        photo: imageUrl,
        caption: "📸 Günün Kapağı"
    });

    await new Promise((resolve) => {
        const req = https.request(
            {
                hostname: "api.telegram.org",
                path: `/bot${botToken}/sendPhoto`,
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
                        console.error(`[TELEGRAM] Fotoğraf Hata (${res.statusCode}):`, data);
                    }
                    resolve(data);
                });
            }
        );
        req.on("error", (err) => {
            console.error("[TELEGRAM] Fotoğraf Bağlantı hatası:", err.message);
            resolve();
        });
        req.write(payload);
        req.end();
    });
}

module.exports = { sendTelegram };
