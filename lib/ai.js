const { GoogleGenerativeAI } = require("@google/generative-ai");

const SYSTEM_PROMPT = `Sen profesyonel bir otomobil habercisi ve editörüsün. Otomobil tutkunları için günlük bir bülten hazırlıyorsun.

KESİN KURALLAR:
- Bana ASLA finans, borsa, şirket politikası, CEO açıklamaları, elektrikli araç yatırımı, satış rakamları veya kurumsal haber getirme.
- SADECE şu konulardaki haberleri seç: motor mekaniği, yeni performans araçları, retro/klasik araçlar, modifiye kültürü, sürücü odaklı haberler, yarış haberleri, ilginç otomobil hikayeleri.
- ASLA "Merhaba", "podcast'e hoş geldiniz" veya "Gizli Garaj'da takılalım" gibi sohbet tarzı ifadeler kullanma. Doğrudan profesyonel, net, tarafsız ve ciddi bir haber dili kullan.
- KESİN KURAL: Her haberin sonuna MUTLAKA o haberin orijinal bağlantısını ekle. Sana verilen "Link: ..." verisini kullanarak "🔗 [Haberi Oku](link_adresi)" şeklinde her haberin hemen altına yerleştir.

TÜRKİYE ÖNCELİĞİ:
- Türkiye kaynaklarından gelen haberler (Motor1 Türkiye, Otopark, Sekizsilindir, Otoaktüel vb.) ÇOK ÖNEMLİDİR ve bültenin en üstünde yer almalıdır.

BÜLTEN KATEGORİ FORMATI:
Bülteni MUTLAKA aşağıdaki 4 kategori başlığı altında sun:
1. 🇹🇷 Türkiye Gündemi
2. 🔧 Garaj & Modifiye
3. 🏎️ Performans ve Motorsporları
4. 🌍 Dünyadan Kısa Kısa

Eğer bir kategoriye ait hiç haber yoksa o kategoriyi yazma. Haberleri ilgili kategorinin altına akıcı, profesyonel bir dille (madde madde veya net başlıklarla) yerleştir. Her haber başlığını kalın (bold) yap.`;

async function generateNewsDigest(news, dateRangeStr) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY ortam değişkeni tanımlı değil.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const newsText = news
        .map(
            (item, i) =>
                `${i + 1}. [${item.source}] ${item.title}\n   Link: ${item.link}\n   Tarih: ${item.date}\n   Özet: ${item.snippet}`
        )
        .join("\n\n");

    const userPrompt = `Bu bülten ${dateRangeStr} dönemini kapsıyor. 
İşte elimizdeki taze otomobil haberleri:

${newsText}

Yukarıdaki haberleri kullanarak kategori formatına uygun bülteni hazırla. SADECE sana verilen bu haberleri kullan.`;

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
            break;
        } catch (error) {
            console.error(`[GEMINI] ⚠️ API Hatası (Deneme ${attempt}/${maxRetries}):`, error.message);
            if (attempt === maxRetries) {
                throw error;
            }
            const waitTime = attempt * 5000;
            console.log(`[GEMINI] ⏳ ${waitTime/1000} saniye beklenip tekrar deneniyor...`);
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

module.exports = { generateNewsDigest };
