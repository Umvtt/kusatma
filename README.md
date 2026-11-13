# Kuşatma

Arkadaşlarınla birlikte zombi sürülerine karşı dayandığın, tarayıcıda çalışan ortak bir hayatta kalma oyunu. 20 kişiye kadar oynanır, kurulum ya da hesap gerekmez.

Oyna:

- https://umvtt.github.io/kusatma/ (ana site)
- https://kusatma.umvtt.workers.dev/ (yedek)
- https://umvtt-games.umvtt.deno.net/kusatma/ (okul aynası)

Üç adres de aynı oyunu ve aynı sunucuyu kullanır; birine ulaşamazsan diğerini dene.

## Nasıl oynanır

İlk oyununda kısa bir eğitim seni adım adım gezdirir (ana menüde **Nasıl oynanır?** ile tekrar açabilirsin).

Hemen oynamak istersen **Hızlı oyna**'ya bas: bu sürümde açık, yer olan bir oda varsa ona katılırsın (önce lobidekiler, sonra moladakiler); yoksa tek başına bir oyun hemen başlar. Arkadaşlarınla oynamak için:

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
| F | Dipçik: önündeki zombileri iter ve sersemletir, Kalkanlı'nın kalkanını düşürür |
| Fare tekerleği / + − | Yakınlaştır, uzaklaştır |
| 1–9 | Molada: açık sekmedeki şeyi satın al |
| Q / E | Molada: cephanelik sekmeleri |
| 1–4 | Savaşta: eşya kullan (el bombası, barikat, ilk yardım, hava saldırısı) |
| Tab | Skor tablosu |
| M | Sesi aç / kapat |
| V | Sesli sohbette basılı tut konuş, kısa bas mikrofonu açık bırak |
| Z | Hızlı takım mesajları (1–7 ile seç) |
| G | Nişan aldığın yeri takımına işaretle |

### Telefonda

Telefonu yan çevir. Sol çubukla yürü, sağ çubukla nişan al; çubuğu ittiğin sürece silah ateş eder. Yetenek, Dipçik, eşyalar, Menü ve Skor için ekrandaki düğmeleri kullan. Odada **Hızlı** düğmesi takım mesajlarını açar ("Yardım!", "Buraya gel!", "Şuraya bak" gibi); yeri olan mesajlar haritada işaret bırakır.

**Kontrolleri düzenle** (Ayarlar → Dokunmatik kontroller → Düzenle): çubukları, Yetenek, Dipçik ve mikrofon düğmelerini parmağınla sürükleyip istediğin yere koy; joystick ve düğme boyutunu, saydamlığı ayarla. **Serbest joystick** açıkken sol çubuk ekranın sol yarısında parmağını nereye koyarsan orada belirir. **Sıfırla** her şeyi ilk hâline döndürür. Düzen yalnızca o telefonda saklanır.

Telefon yan tutulunca lobi ve Cephanelik ekrana sığar: lobide oda kodu ve sekmeler üstte, sınıf kartları solda kayar, seçili sınıfın ayrıntıları sağda durur, tuşlar altta; Cephanelik'te sekmeler, altın, Sargı ve Hazırım solda, satın alınacaklar sağda kendi içinde kayar.

Odadayken sayfayı yenilersen aynı sekmeden yeniden katıldığında eski yerine (ilerlemenle) hemen dönersin.

### Ayarlar

Ana menüden ya da oyun içinde Esc menüsünden açılır: ses seviyesi, müzik (oyunun kendi müziği: aralarda sakin, dalgada hareketli, boss gelince ağır; 0'a çekince kapanır), gece karanlığı, yakınlaştırma, ekran sarsıntısı, hasar sayıları ve kameranın nişan yönüne kayması. **Pil tasarrufu** oyunu 30 FPS'te çalıştırır, en yüksek grafiği kullanmaz ve parçacıkları yarıya indirir; telefon daha az ısınır ve pil daha uzun gider. **Oto** (varsayılan) pil %20'nin altına düşüp şarjda değilken ya da telefon en düşük grafikte bile zorlanınca kendiliğinden açılır. Ayarlar tarayıcında saklanır.

Oda kurulurken ya da odaya bağlanırken bekleme ekranında ipuçları döner; lobide seçili haritanın küçük bir önizlemesi ve bir ipucu görünür.

## Sınıflar

| Sınıf | Silah | Yetenek | Pasif |
| --- | --- | --- | --- |
| Asker | Tüfek | **Hızlı Ateş**: 6 sn iki kat hızlı ateş | Canın yarıdan fazlayken +%10 hasar |
| Doktor | Makineli | **İyileştir**: yakındakileri iyileştirir, düşenleri kaldırır | Can yenilenir, yanındakiler de; düşenleri iki kat hızlı kaldırır |
| Tamirci | Pompalı | **Taret**: 20 sn ateş eden taret | Eşyalar %25 ucuz, barikatlar iki kat sağlam |
| Nişancı | Dürbünlü tüfek | **Odak**: 5 sn iki kat hasar, her şeyi deler | +%12 kritik vuruş |
| Kalkancı | Ağır makineli | **Kalkan**: 5 sn %70 az hasar | %15 az hasar, zor savrulur |
| Alevci | Alev makinesi | **Alev Patlaması**: etraftakileri yakar | Alev tutuşturur, patlamalardan yarı hasar |
| Bombacı | Bomba atar | **Mayın**: yere mayın bırakır | +2 el bombası, bombalar %30 sert |
| İzci | Çift tabanca | **Depar**: 4 sn %60 daha hızlı | +%15 altın, uzaktan toplar, hızlı Dipçik |
| Mühendis | Karabina | **Tamir Dronu**: arkadaşları iyileştirir, barikat ve taret onarır | İki saldırı dronu hep yanında uçar ve ateş eder |
| Kimyager | Asit tabancası | **Zehir Bulutu**: nişan alınan yere büyük zehir bulutu | Mermiler zehirler; zehirli zombiler takımdan %20 fazla hasar alır |
| Komutan | Ağır tabanca | **İkmal Sandığı**: yakındakilere can, altın ve 5 sn iki kat hasar | Yakınındaki herkes %10 sert vurur |
| Tesla | Tesla tabancası | **Tesla Bobini**: 12 sn yakındaki zombileri zincirleme çarpan bir bobin | Her vuruş iki zombiye daha sıçrar |
| Avcı | Arbalet | **Ok Yağmuru**: önüne yelpaze gibi dokuz delici ok | Oklar zombileri bir an yere çiviler |
| Kılıççı | Kılıç (yakın dövüş) | **Kasırga**: 3 sn dönerek etrafındaki her şeyi biçer, %40 az hasar alır | Kılıç vuruşlarının bir kısmı can olarak döner |
| Eğitmen | Tabanca | **Saldır!**: köpek nişan alınan yere fırlar, 4 sn iki kat sert ısırır ve hedefi çiviler | Yanında hep bir saldırı köpeği gezer, zombileri yakalayıp yavaşlatır |
| Ajan | Susturuculu tabanca | **Gölge**: 5 sn görünmez olur, zombiler onu kaybeder; gölgeden ilk vuruşu iki kat | Sırtı dönük hedeflere %50 daha sert vurur |
| Hacker | Akıllı tabanca | **Ele Geçir**: önündeki 3 zombiyi 8 sn kendi tarafına geçirir, süre bitince patlarlar | Mermileri hedefe hafifçe döner; yakınındaki taret, dron ve bobinler %25 sert vurur |

Lobide bir sınıfa tıklayınca (ya da fareyle üstüne gelince) yandaki panel her şeyi gösterir: rolü, değerler, yetenek, pasif, yetenek ustalığı ve silah serisi. Kartlardaki renkli noktalar hangi takım arkadaşının o sınıfı seçtiğini gösterir.

Asker, Doktor, Tamirci ve Nişancı ücretsizdir. Diğerleri elmasla açılır (İzci 450, Kalkancı 500, Alevci 700, Bombacı 800, Mühendis 1400, Kimyager 1500, Komutan 1800, Tesla 2000, Avcı 2000, Kılıççı 1600, Eğitmen 1700, Ajan 1900, Hacker 2200). Kilitli sınıfları **Deneme Alanı** modunda deneyebilirsin ama o mod elmas, XP ve görev ilerlemesi vermez; diğer bütün oyunlarda yalnızca sahip olduğun sınıflar seçilir.

## PvP

Oda kurarken (ya da lobide) mod olarak **PvP** seçilince oyuncular birbirine karşı dövüşür; zombi gelmez. Üç türü var:

| Tür | Kurallar |
| --- | --- |
| Takım Savaşı | Mavi ve Kırmızı takım. 30 leşe ilk ulaşan ya da 8 dakika sonunda önde olan kazanır. Ölen 5 sn sonra kendi tarafında doğar. |
| Herkes Herkese | Herkes tek başına. 20 leşi ilk yapan ya da 8 dakika sonunda en çok leşi olan kazanır. |
| Düello | Bire bir. Üç raundu ilk alan kazanır; her raunt en çok 90 saniye. |

- Maç 15 saniyelik **hazırlıkla** başlar: herkes 1200 altınla cephanelikten silah yolunu ve yükseltmelerini seçer. Leş 250, asist 90 altın verir; ölüyken de alışveriş yapılabilir.
- Doğunca 2 saniye koruma vardır. Takım arkadaşına hasar verilmez.
- Sınıflar ve yetenekler aynıdır ama oyunculara göre ayarlanır: canlar 1,6 kat, silah hasarı oyunculara daha az işler, silah seviyesinin etkisi azalır. Bir maçta öldürmek birkaç saniye sürer.
- Ekranda: üstte skor ve süre, leş akışında kim kimi neyle indirdi, vurulduğun yönü gösteren kırmızı oklar, ölünce seni kimin indirdiği ve geri sayım.
- Hesabı olanlar **dereceli** oynar: kazanınca puan alır, kaybedince puan kaybeder (rakiplerin puanına göre). Ligler **Bronz → Gümüş → Altın → Platin → Elmas**, her biri üç kademe. Her maç biraz elmas da verir.
- Her ay yeni sezon başlar; puanın %60'ı kalır ve geçen sezon ulaştığın en yüksek lige göre elmas ödülü alırsın (profilindeki PvP kartından). Sıralamada ayrı bir PvP sekmesi var.

## Klanlar, sınıf seviyeleri ve rozetler

- **Klan:** 1.000 elmasla klan kur (ad 3–20 harf, etiket 2–4 harf/rakam) ya da bir klana katıl. Klanlar herkese açık ya da istekle olabilir. Lider ve yardımcılar istekleri kabul eder, oyuncu davet eder ve üye çıkarır; lider yardımcı atar ve liderliği devredebilir. En çok 20 üye. Etiketin oyunda ve lobide adının önünde görünür (ör. **[GK] Ahmet**). Klan puanı, üyelerin o sezon kazandığı sezon XP'sinin toplamıdır; sıralamada **Klanlar** sekmesi var.
- **Sınıf seviyeleri:** her sınıf, onunla temizlediğin her dalgada 10 + 2×dalga XP kazanır; seviye en çok 30. Her seviye 20 elmas verir. Seviyeler profilindeki sınıf kartlarında görünür.
- **Rozetler:** dalga rekoru, öldürme sayısı, PvP galibiyetleri ve ligi, sınıf seviyeleri, klan, oyuncu seviyesi ve giriş serisi için 16 rozet. Oynadıkça kendiliğinden kazanılır, profilinde koleksiyon olarak görünür.
- **Tarayıcı bildirimleri:** Ayarlar'dan açarsan site arka plandaki bir sekmedeyken mesaj, arkadaşlık isteği, oda ve klan davetleri bildirim olarak gelir.
- **Telefon bildirimleri (Android uygulaması 45.0 ve sonrası):** uygulamada hesabına girince bir kez izin sorulur. İzin verirsen oyun kapalıyken bile özel mesaj, arkadaşlık isteği, klan daveti ve klan katılma isteği telefonuna bildirim olarak gelir; bildirime dokununca oyun ilgili sayfada açılır. Ayarlar'daki **Telefon bildirimleri** anahtarıyla kapatabilirsin; çıkış yapınca telefonun hesaptan ayrılır. Bildirim gelmiyorsa telefonun Ayarlar → Uygulamalar → Kuşatma → Bildirimler bölümünden açık olduğuna bak.

## Hesap, elmas ve mağaza

Hesap isteğe bağlıdır ama açınca oyun bir siteye dönüşür:

- **Ana sayfa:** seviyen, günlük ödül, bugün kazandığın elmas, arkadaşların, öne çıkan eşya, açık odalar.
- **Elmas:** temizlediğin her dalga elmas ve XP verir. Geç dalgalar ve bosslar daha çok verir; zorluk (Kolay ×0,75, Zor ×1,3, Kâbus ×1,7) ve mod (Hayatta Kalma ×1,2, Günün Görevi ×1,3, Boss Akını ×1,5, Tek Can ×2) çarpanları birbiriyle çarpılır. Tek başına oyunlar %75 verir. Varsayılan sınır günde 1000, saatte 300 elmastır. Her gün bir de günlük ödül ve çark var.
- **Mağaza:** sınıflar, şapkalar, renkler, silah kaplamaları, çerçeveler, isim renkleri, unvanlar ve temalar. Bazen indirim, sınırlı süreli eşya ya da 2× elmas etkinliği olur.
- **Profil ve dolap:** seviyen ve istatistiklerin; aldıklarını buradan giyersin. Başka oyuncular profiline bakabilir.
- **Arkadaşlar:** ad ile istek gönder, kimin çevrimiçi olduğunu ve hangi odada oynadığını gör, tek tıkla katıl, özel mesaj at. Rahatsız eden birini bildirebilirsin.
- **Görevler:** her gün üç görev (elmas ve XP), seviye yolu (her seviye elmas; 5, 10, 15, 20, 30, 40 ve 50. seviyelerde satılmayan unvan, çerçeve ve isim rengi) ve 33 başarım.
- **Ayarlar:** tema, gizlilik (istekler, çevrimiçi görünme, odanı gösterme, sıralama), ad değiştirme (elmasla), şifre değiştirme, hesabı silme.

Elmaslar sunucuda tutulur ve kontrol edilir; odadaki herkes, sunucunun imzaladığı bir "kart" sayesinde kimin hangi sınıfa ve eşyaya sahip olduğunu bilir.

## Android uygulaması

Android telefonda siteyi açınca üstte **Android uygulaması** düğmesi çıkar (ya da `https://umvtt.github.io/kusatma/app/kusatma.apk`). İndirip kur; tarayıcına "bilinmeyen uygulamaları yükle" izni vermen gerekebilir. Tarayıcı "zararlı olabilir" derse **Yine de indir**, Google Play Protect uyarırsa **Diğer ayrıntılar → Yine de yükle** de; uygulama Play Store'da olmadığı için bu uyarılar çıkar. 46.0'dan beri uygulama başka uygulama kurma izni istemiyor, bu yüzden Play Protect çok daha az takılıyor. Uygulama oyunu doğrudan siteden açar, bu yüzden her oyun güncellemesi uygulamaya da anında gelir; tekrar kurman gerekmez. Ana adrese ulaşılamazsa okul aynasını dener. Geri tuşu oyundaki Esc gibi çalışır.

Uygulamanın dosyası yapı numarasıyla adlanır (ör. **Kuşatma 47.0.apk**). Uygulama normal güncellemelerde hiçbir şey sormaz. Yalnızca uygulamanın kendisinde önemli bir değişiklik olduğunda (`app/version.json` içindeki `min` uygulamanın sürümünden büyükse) atlanamayan bir "Önemli güncelleme" ekranı gösterir ve **Güncelle** ile sitedeki güncelleme sayfasını açar; yeni dosya eskisinin üstüne kurulur. Telefon bildirimleri Firebase Cloud Messaging ile gelir; bu yüzden uygulama 45.0 Firebase ayar dosyasıyla (`google-services.json`, depoda değildir) derlenir. Yeni APK'yı yapmak için `android/` klasöründe aynı imza anahtarıyla `gradle assembleRelease -PversionCode=<yeni numara>` çalıştırılır, çıkan dosya `app/kusatma-<yapı>.0.apk` ve kopyası `app/kusatma.apk` olarak konur ve `app/version.json` içindeki `v` bir artırılır. İmza anahtarı depoda değildir; aynı anahtar olmadan yeni sürüm eskisinin üstüne kurulamaz.

## Haritalar

Kurucu lobide haritayı, zorluğu ve modu seçer. Harita her oyunda yeniden oluşturulur ve oyuncu sayısıyla birlikte büyür: tek başına 3600×2400, her oyuncuyla 240×160 daha, 20 kişiyle 5840×3840. Oyun sırasında biri katılırsa sınırlar yavaşça genişler. Kalabalık oyunlarda zombiler biraz daha çok ve sağlam olur (her ek oyuncu için +%20 zombi, +%5 can, boss canı +%20).

| Harita | Özellik |
| --- | --- |
| Meydan | Beton bloklar ve kasalar |
| Benzinlik | Arabalar, pompalar, dükkanlar |
| Hastane Bahçesi | Çitler, ambulanslar, binalar |
| Orman | Sık ağaçlar, kayalar, kütükler |
| Liman | Konteyner yığınları arasında dar koridorlar, bir yanı deniz |
| Kış Köyü | Karlı evler, çamlar, kar yığınları, donmuş göl |
| Metro İstasyonu | Karanlık peronlar ve raylar. Arada bir tren geçer: korna çalıp ray kırmızı yanıp sönünce çekil, önüne çıkan her şeyi ezer |
| Alışveriş Merkezi | Mağaza sıraları, büfeler, saksılar ve geniş koridorlar |
| Askerî Üs | Kum torbaları, gözetleme kuleleri, çadırlar, tank enkazları ve helikopter pisti |
| Lunapark | Atlıkarınca, büfeler, renkli ışıklar; korku evinden arada bir zombi sürüsü fırlar |

Zorluk seviyeleri: Kolay, Normal, Zor, Kâbus.

Modlar: **Klasik** (dalgalar arası mola, 5 dalgada bir boss), **Hayatta Kalma** (5. dalgadan sonra mola yok), **Boss Akını** (her dalgada boss), **Tek Can** (düşen kalkamaz), **Deneme Alanı** (tek başına, her sınıf, ödül yok) ve **Günün Görevi** (herkese aynı harita, sınıf ve zorluk; günün ilk denemesi sıralamaya girer).

Dalga ortasında bazen harita olayı çıkar: **Karartma**, **İkmal uçağı**, **Sürü akını** ya da **Kanlı ay**.

## Zombiler

| Zombi | Davranış |
| --- | --- |
| Yürüyen | Duvarların etrafından dolaşır, sürüyle birlikte oyuncuları çevreler |
| Koşucu | Hızlıdır, yaklaşınca üstüne atılır |
| İri | Kırmızı uyarıdan sonra hızla saldırıp oyuncuyu savurur |
| Tükürücü | Mesafeyi korur, uzaktan asit tükürür (4. dalgadan itibaren) |
| Patlayan | Yanına gelince patlar; öldürülünce de patlayıp yakındaki zombilere zarar verir (5. dalga) |
| Kalkanlı | Önden gelen mermileri kalkanıyla durdurur. Yandan, arkadan, ateşle ya da patlamayla vur; ya da **Dipçik** ile kalkanını düşürüp birkaç saniye önden vur (6. dalga) |
| Çağırıcı | Uzakta durup yeni zombiler çağırır. Önce onu indirin (8. dalga) |
| Sıçrayıcı | Çömelir, sonra barikatların ve kasaların üstünden atlayıp yere çarpar (6. dalga) |
| Hayalet | Yarı saydamdır; ara sıra duvarların içinden geçerek üstüne gelir (7. dalga) |
| Doğurgan | Ölünce dört hızlı Sürüngen'e bölünür (8. dalga) |
| Zırhlı | Zırhı kırılana kadar sıradan mermiler az işler. Delici mermi, ateş, patlama, asit ve Nişancı zırhı yok sayar (9. dalga) |
| Şifacı | Geride durup etrafındaki zombileri iyileştirir. Önce onu indirin (10. dalga) |
| Kazıcı | Toprağın altına girer; altındayken vurulamaz, yanında çıkar (7. dalga) |
| Çığlıkçı | Çığlık atar, yakındaki zombiler hızlanır (9. dalga) |
| Donmuş | Vurduğu oyuncuyu üşütüp yavaşlatır, ölünce parçalanır (6. dalga) |
| Yarasa | Beşli sürüler halinde duvarların ve barikatların üstünden uçarak gelir (7. dalga) |
| Zombi köpek | Dörtlü sürüler, çok hızlı; en az canı kalan oyuncuya saldırır (5. dalga) |

8. dalgadan sonra bazı zombiler **seçkin** olur: hızlı, patlayıcı, kendini iyileştiren ya da zırhlı. Canları 2,5 kat, altınları 4 kattır ve ölünce eşya düşürürler.

### Bosslar

Her 5 dalgada bir boss gelir: sırayla **Dev** (yere vurur), **Kraliçe** (yelpaze şeklinde asit, koşucu çağırır), **Koç** (art arda hücum eder), **Dev Hurda** (araba fırlatır), **Cadı** (ölüleri kaldırır, ışınlanır, tükürür) ve **Dev Solucan** (yerin altından gelir; kırmızı halka görününce kaç, oradan fırlar). 20. dalgadan sonra iki farklı boss birlikte gelir.

## Eşyalar ve silahlar

Ölen zombiler bazen eşya düşürür: **Sargı** (can), **Altın**, **Güç** (10 sn iki kat hasar), **Hız** (10 sn daha hızlı). Bosslar her zaman eşya bırakır.

Cephanelik dört sekmedir: **Silah**, **Gelişim**, **Eşya**, **Takım**.

**Silah:** beş seviye (150, 400, 850, 1500, 2400 altın). Seviye I'de sınıfına açık yollardan birini seçersin (her sınıfın 3–4 yolu var), seviye III'te yolun iki dalından birini. Seviye V dalın özel gücünü açar. Dalı 250 altına değiştirebilir, yolu sıfırlayıp harcadığının yarısını geri alabilirsin.

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Ağır | Yavaş ama çok sert | Sarsıcı (her vuruş sersemletir) · Yıkıcı (patlayan mermi) |
| Seri | Çok hızlı ateş | Fırtına (seken mermi) · Çift namlu (üç mermi) |
| Delici | Deler, menzil artar; Kalkanlı'nın kalkanını bir kez deler ama mermi %40 güç kaybeder, her zombide %15 daha | Keskin (üç kat kritik) · Ray (her şeyi, kalkanları da deler) |
| Buz | Yavaşlatır | Donduran (buz kalıbı) · Kırılgan (ölünce buz patlaması) |
| Zehir | Zehirler | Salgın (zehir bulutu) · Asit (kalkan eritir, bosslara tam işler) |
| Elektrik | Şimşek sıçrar | Zincir (sersemletir) · Aşırı yük (yıldırım düşer) |
| Yangın | Tutuşturur | Napalm (yananlar patlar) · Kor (yerde alev bırakır) |

Zehir yalnızca Kimyager'de, elektrik yalnızca Tesla'da, yangın yalnızca Alevci'de, buz yalnızca Nişancı'da vardır. Asker, Doktor, Nişancı ve Tamirci'nin bir de sınıfa özel sekizinci yolu var: bomba atar, uyutucu dart, raylı top ve çivi tabancası.

**Gelişim:** hasar, atış hızı, can, hız, yetenek süresi, kritik vuruş, yenilenme, zırh, mıknatıs, üç seviyelik yetenek ustalığı ve Sargı.

**Eşya:** el bombası, barikat, ilk yardım, hava saldırısı. Savaşta 1–4 ile (telefonda düğmelerle) kullanılır.

**Takım:** herkesin altın koyduğu ortak zırh, ortak güç, saha hastanesi ve ganimet. Seviye dolunca bütün takım kazanır.

## Teknik notlar

- Saf HTML, CSS ve JavaScript. Derleme adımı yok.
- Çok oyunculu bağlantı [PeerJS](https://peerjs.com/) (WebRTC) ile kurulur. Oyunu kurucunun tarayıcısı yönetir, diğer oyuncular ona bağlanır. Bu yüzden kurucunun sekmesi açık kalmalı ve internet bağlantısı iyi olmalı.
- Her oyuncuyla iki kanal açılır: oyunun anlık durumu ve tuşlar sırasız, hızlı bir kanaldan, geri kalan her şey güvenilir kanaldan gider. Kurucu her oyuncuya yalnızca onun onayladığı durumdan bu yana değişenleri yollar, böylece kaybolan bir paket oyunu dondurmaz, kendiliğinden toparlanır.
- Kurucu ayrılırsa (sekmeyi kapatsa bile) oyun bitmez: en önce katılan oyuncu kurucu olur, diğerleri birkaç saniye içinde altınları, yükseltmeleri ve sınıflarıyla birlikte yeniden bağlanır. Bunun için kurucu 5 saniyede bir, bağlantı boşken oyunun yedeğini sıradaki oyuncuya gönderir.
- **Sesli sohbet:** lobide **Sesli sohbeti aç**'a ya da oyunda yuvarlak mikrofon düğmesine bas (telefonda Dipçik'in üstünde). Konuşmak için düğmeye ya da **V**'ye basılı tut; parmağın düğmeden kaysa da bırakana kadar konuşursun. Kısa dokunuş (ya da V'ye kısa basış) mikrofonu açık bırakır, tekrar dokununca kapanır; lobideki "Mikrofon hep açık" anahtarı aynı şeydir. Konuşurken düğmenin etrafındaki halka sesine göre büyür. Yanındaki **×** sesli sohbeti kapatır. Ses doğrudan oyuncudan oyuncuya gider, sunucudan geçmez. Skor tablosundan istediğin oyuncuyu susturabilirsin. Takım Savaşı'nda yalnızca takım arkadaşların duyar.
- Kurucu herkesin **pingini** ölçer: takım listesinde ve skor tablosunda görünür, misafirler kendi pinglerini sol üstte görür.
- Bir oyuncunun bağlantısı kısa süre koparsa oyun onu otomatik olarak yeniden bağlar; altını, yükseltmeleri ve yeri 45 saniye korunur. Oyuna geç katılan ya da geri dönen oyuncu, takımın ortalamasının %75'ine yetişecek kadar altın alır.
- Büyük mesajlar (örneğin kalabalık dalgalardaki oyun yedeği) parçalara bölünerek gönderilir.
- Gelen her mesaj biçim ve boyut açısından denetlenir. Uzun süre çok fazla mesaj gönderen oyuncu odadan atılır.

## GitHub Pages ile yayınlama

1. Depoda **Settings → Pages**'e git.
2. **Source** olarak **Deploy from a branch** seç, **main** dalını ve **/ (root)** klasörünü seçip kaydet.
3. Bir dakika içinde oyun `https://<kullanıcı-adı>.github.io/kusatma/` adresinde açılır.

## workers.dev yedeği

`https://kusatma.umvtt.workers.dev/` aynı dosyaları Cloudflare'den sunar (`wrangler.toml`, `.assetsignore`). `main` dalına her gönderimde `.github/workflows/workers-site.yml` siteyi oraya da yükler. Bunun için depoda iki gizli değer gerekir: `CLOUDFLARE_API_TOKEN` (yalnızca Workers yükleme yetkisi olan bir token) ve `CLOUDFLARE_ACCOUNT_ID`. Bunlar yoksa yükleme adımı atlanır.

## Yerelde çalıştırma

ES modülleri kullanıldığı için dosyayı doğrudan açmak yerine küçük bir sunucu başlat:

```bash
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresini aç.
