# 🚗 Oto Haber Ajanı

Otomobil dünyasının en güncel haberlerini RSS kaynaklarından çekip, Gemini AI ile Türkçe bir podcast metnine dönüştüren Vercel serverless cron job projesi.

---

## 📋 Ön Gereksinimler

Başlamadan önce aşağıdakilerin bilgisayarında kurulu olduğundan emin ol:

- **Node.js** → [nodejs.org](https://nodejs.org) adresinden indir ve kur.
- **Git** → [git-scm.com](https://git-scm.com) adresinden indir ve kur.
- **GitHub hesabı** → [github.com](https://github.com) üzerinden ücretsiz bir hesap aç.
- **Vercel hesabı** → [vercel.com](https://vercel.com) adresinden GitHub hesabınla kayıt ol.
- **Gemini API Key** → [aistudio.google.com/apikey](https://aistudio.google.com/apikey) adresinden ücretsiz bir API anahtarı al.

---

## 1️⃣ Projeyi Git ile Başlatıp GitHub'a Yükleme

### Adım 1: GitHub'da yeni bir repo oluştur

1. [github.com/new](https://github.com/new) adresine git.
2. **Repository name** kısmına `oto-haber-ajani` yaz.
3. Sayfanın altındaki **"Create repository"** butonuna tıkla.
4. Açılan sayfada bir URL göreceksin. Bu URL'yi kopyala (örnek: `https://github.com/KULLANICI_ADIN/oto-haber-ajani.git`).

### Adım 2: Terminali aç ve projenin olduğu klasöre git

Proje klasörünün içinde (bu klasör, `package.json` dosyasının olduğu yer) bir terminal aç. Windows'ta klasörün içinde sağ tıklayıp **"Terminalde aç"** seçeneğini kullanabilirsin.

### Adım 3: Aşağıdaki komutları sırayla çalıştır

```bash
# 1. Git'i bu klasörde başlat
git init

# 2. Tüm dosyaları Git'e ekle
git add .

# 3. İlk commit'i oluştur
git commit -m "İlk commit: Oto Haber Ajanı projesi"

# 4. Ana dalı "main" olarak adlandır
git branch -M main

# 5. GitHub reposunu bağla (URL'yi kendi repo adresinle değiştir!)
git remote add origin https://github.com/KULLANICI_ADIN/oto-haber-ajani.git

# 6. Kodu GitHub'a yükle
git push -u origin main
```

> **⚠️ Önemli:** 5. komuttaki URL'yi GitHub'da oluşturduğun reponun URL'si ile değiştirmeyi unutma!

✅ **Tamamlandı!** GitHub'daki repo sayfanı yenilediğinde dosyalarını göreceksin.

---

## 2️⃣ GitHub Projesini Vercel'e Bağlayıp Deploy Etme

### Adım 1: Vercel'e giriş yap

1. [vercel.com](https://vercel.com) adresine git ve GitHub hesabınla giriş yap.

### Adım 2: Yeni proje oluştur

1. Vercel panelinde sağ üstteki **"Add New..."** → **"Project"** butonuna tıkla.
2. **"Import Git Repository"** bölümünde GitHub repolarının listesi çıkacak.
3. `oto-haber-ajani` reposunun yanındaki **"Import"** butonuna tıkla.

### Adım 3: Deploy et

1. Açılan sayfada ayarları değiştirmene gerek yok, Vercel Node.js projesini otomatik algılayacak.
2. **"Deploy"** butonuna tıkla.
3. Birkaç saniye içinde projen deploy edilmiş olacak. 🎉

✅ **Tamamlandı!** Artık projen canlıda. Ama henüz API anahtarını eklemedik, o yüzden cron job çalışmaz. Hemen bir sonraki adıma geç.

---

## 3️⃣ Vercel'e GEMINI_API_KEY Ekleme (En Önemli Adım!)

Bu adım olmadan proje çalışmaz çünkü Gemini AI'ya bağlanabilmek için API anahtarına ihtiyaç var.

### Adım 1: Vercel proje ayarlarına git

1. [vercel.com/dashboard](https://vercel.com/dashboard) adresine git.
2. Projeler listesinden **"oto-haber-ajani"** projesine tıkla.
3. Üst menüden **"Settings"** sekmesine tıkla.

### Adım 2: Environment Variables sayfasını aç

1. Sol menüden **"Environment Variables"** seçeneğine tıkla.

### Adım 3: API anahtarını ekle

1. **"Key"** yazan kutucuğa şunu yaz:
   ```
   GEMINI_API_KEY
   ```
2. **"Value"** yazan kutucuğa Google'dan aldığın API anahtarını yapıştır. (Örnek: `AIzaSyB...` şeklinde uzun bir metin)
3. Hemen altında **"Environment"** seçenekleri var. Üçü de işaretli olsun:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
4. **"Save"** butonuna tıkla.

### Adım 4: Projeyi yeniden deploy et (önemli!)

Ortam değişkenini ekledikten sonra projeyi yeniden deploy etmen gerekir ki değişiklik aktif olsun:

1. Üst menüden **"Deployments"** sekmesine git.
2. En üstteki deployment'ın yanındaki **üç nokta (⋮)** menüsüne tıkla.
3. **"Redeploy"** seçeneğine tıkla ve onay ver.

✅ **Tamamlandı!** Artık projen her gün saat 08:00 UTC'de (Türkiye saatiyle 11:00) otomatik çalışacak ve Türkçe bir otomobil podcast metni üretecek.

---

## 🧪 Manuel Test Etme

Deploy işlemi tamamlandıktan sonra projenin çalışıp çalışmadığını test etmek için tarayıcına şu adresi yaz:

```
https://PROJE_ADRESIN.vercel.app/api/cron
```

> Vercel panelindeki **"Domains"** kısmından proje adresini görebilirsin.

Eğer her şey doğru çalışıyorsa, ekranda şuna benzer bir JSON çıktısı göreceksin:

```json
{
  "success": true,
  "generatedAt": "2026-03-13T08:00:00.000Z",
  "newsCount": 9,
  "podcastScript": "Merhaba sevgili dinleyiciler..."
}
```

---

## 📁 Proje Yapısı

```
oto-haber-ajani/
├── api/
│   └── cron.js          ← Serverless fonksiyon (ana kod)
├── package.json         ← Proje bağımlılıkları
├── vercel.json          ← Cron job ayarları
└── README.md            ← Bu dosya
```

---

## 📰 Haber Kaynakları

| Kaynak | Açıklama |
|--------|----------|
| Reddit r/cars | Topluluk haberleri ve tartışmalar |
| Motor1 | Profesyonel otomobil haberleri |
| Jalopnik | Otomobil kültürü ve yorumlar |
