# Kuşatma

Arkadaşlarınla birlikte zombi sürülerine karşı dayandığın, tarayıcıda çalışan ortak bir hayatta kalma oyunu. 15 kişiye kadar oynanır, kurulum ya da hesap gerekmez.

## Nasıl oynanır

1. Takma adını yaz ve **Oda kur**'a bas.
2. Ekranda çıkan 6 karakterlik **oda kodunu** arkadaşlarına gönder. Onlar da kodu girip **Katıl**'a bassın.
3. Herkes bir sınıf seçsin, sonra kurucu **Oyunu başlat**'a bassın.
4. Dalgalar arasındaki molada **Cephanelik**'ten yükseltme al.

| Tuş | İşlev |
| --- | --- |
| W A S D / ok tuşları | Hareket |
| Fare | Nişan |
| Sol tık | Ateş |
| Boşluk / Sağ tık | Sınıf yeteneği |
| Fare tekerleği / + − | Yakınlaştır, uzaklaştır |
| 1–7 | Molada silah ve yükseltme satın al |
| Tab | Skor tablosu |
| M | Sesi aç / kapat |

### Telefonda

Telefonu yan çevir. Sol çubukla yürü, sağ çubukla nişan al; çubuğu ittiğin sürece silah ateş eder. Yetenek, Menü ve Skor için ekrandaki düğmeleri kullan.

### Ayarlar

Ana menüden ya da oyun içinde Esc menüsünden açılır: ses seviyesi, gece karanlığı, yakınlaştırma, ekran sarsıntısı, hasar sayıları ve kameranın nişan yönüne kayması. Ayarlar tarayıcında saklanır.

## Sınıflar

| Sınıf | Silah | Yetenek |
| --- | --- | --- |
| Asker | Tüfek | **Hızlı Ateş**: 6 sn boyunca iki kat hızlı ateş |
| Doktor | Makineli | **İyileştir**: yakındakileri iyileştirir, düşenleri kaldırır |
| Tamirci | Pompalı | **Taret**: 20 sn boyunca ateş eden taret kurar |
| Nişancı | Dürbünlü tüfek | **Odak**: 5 sn iki kat hasar, mermiler her şeyi deler |
| Kalkancı | Ağır makineli | **Kalkan**: 5 sn boyunca %70 daha az hasar |
| Alevci | Alev makinesi | **Alev Patlaması**: etraftaki tüm zombileri yakar |
| Bombacı | Bomba atar | **Mayın**: yere mayın bırakır (en fazla 3) |
| İzci | Çift tabanca | **Depar**: 4 sn boyunca %60 daha hızlı |

## Haritalar

Kurucu lobide haritayı ve zorluğu seçer. Harita her oyunda yeniden oluşturulur ve oyuncu sayısıyla birlikte büyür: tek başına 1800×1200, 15 kişiyle 4320×2880. Oyun sırasında biri katılırsa sınırlar yavaşça genişler.

| Harita | Özellik |
| --- | --- |
| Meydan | Beton bloklar ve kasalar |
| Benzinlik | Arabalar, pompalar, dükkanlar |
| Hastane Bahçesi | Çitler, ambulanslar, binalar |
| Orman | Sık ağaçlar, kayalar, kütükler |

Zorluk seviyeleri: Kolay, Normal, Zor, Kâbus.

## Zombiler

| Zombi | Davranış |
| --- | --- |
| Yürüyen | Duvarların etrafından dolaşır, sürüyle birlikte oyuncuları çevreler |
| Koşucu | Hızlıdır, yaklaşınca üstüne atılır |
| İri | Kırmızı uyarıdan sonra hızla saldırıp oyuncuyu savurur |
| Tükürücü | Mesafeyi korur, uzaktan asit tükürür (4. dalgadan itibaren) |
| Patlayan | Yanına gelince patlar; öldürülünce de patlayıp yakındaki zombilere zarar verir (5. dalga) |
| Kalkanlı | Önden gelen mermileri kalkanıyla durdurur. Yandan, arkadan, ateşle ya da patlamayla vur (6. dalga) |
| Çağırıcı | Uzakta durup yeni zombiler çağırır. Önce onu indirin (8. dalga) |

### Bosslar

Her 5 dalgada bir boss gelir: sırayla **Dev** (yere vurur), **Kraliçe** (yelpaze şeklinde asit, koşucu çağırır) ve **Koç** (art arda hücum eder). 20. dalgadan sonra iki farklı boss birlikte gelir.

## Eşyalar ve silahlar

Ölen zombiler bazen eşya düşürür: **Sargı** (can), **Altın**, **Güç** (10 sn iki kat hasar), **Hız** (10 sn daha hızlı). Bosslar her zaman eşya bırakır.

Cephanelikte her sınıfın silahı iki kez geliştirilebilir (150 ve 400 altın). Her seviye hasarı ve atış hızını artırır, ayrıca sınıfa özel bir bonus verir (Tamirci'ye daha çok saçma, Nişancı'ya daha çok delme, Bombacı'ya daha geniş patlama, Alevci'ye daha uzun menzil).

## Teknik notlar

- Saf HTML, CSS ve JavaScript. Derleme adımı yok.
- Çok oyunculu bağlantı [PeerJS](https://peerjs.com/) (WebRTC) ile kurulur. Oyunu kurucunun tarayıcısı yönetir, diğer oyuncular ona bağlanır. Bu yüzden kurucunun sekmesi açık kalmalı ve internet bağlantısı iyi olmalı.
- Gelen her mesaj biçim ve boyut açısından denetlenir. Saniyede çok fazla mesaj gönderen oyuncu odadan atılır.

## GitHub Pages ile yayınlama

1. Depoda **Settings → Pages**'e git.
2. **Source** olarak **Deploy from a branch** seç, **main** dalını ve **/ (root)** klasörünü seçip kaydet.
3. Bir dakika içinde oyun `https://<kullanıcı-adı>.github.io/kusatma/` adresinde açılır.

## Yerelde çalıştırma

ES modülleri kullanıldığı için dosyayı doğrudan açmak yerine küçük bir sunucu başlat:

```bash
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresini aç.
