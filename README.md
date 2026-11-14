# Kuşatma

Arkadaşlarınla birlikte zombi sürülerine karşı dayandığın, tarayıcıda çalışan ortak bir hayatta kalma oyunu. 20 kişiye kadar oynanır, kurulum ya da hesap gerekmez.

Oyna:

- https://umvtt.github.io/kusatma/ (ana site)
- https://kusatma.umvtt.workers.dev/ (yedek)
- https://umvtt-games.umvtt.deno.net/kusatma/ (okul aynası)

Üç adres de aynı oyunu ve aynı sunucuyu kullanır; birine ulaşamazsan diğerini dene.

## Nasıl oynanır

İlk oyununda kısa bir eğitim seni adım adım gezdirir (ana menüde **Nasıl oynanır?** ile tekrar açabilirsin).

Hemen oynamak istersen **Hızlı oyna**'ya bas: bu sürümde lobisinde bekleyen, yer olan bir oda varsa ona katılırsın ve sınıfını seçersin; yoksa tek başına bir oyunun lobisi açılır, sınıfını seçip **Hazırım**'a basarsın. Arkadaşlarınla oynamak için:

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

**Ekran düzeni** (telefonda Ayarlar → Ekran düzeni → Düzenle): iki joystick, Yetenek, Dipçik, mikrofon, eşyalar, Menü/Skor tuşları, dalga kutusu, can ve altın, boss çubuğu, Cephanelik tuşu ve haritayı parmağınla sürükleyip istediğin yere koy. Bir parçaya dokununca seçilir; kaydırma çubuğuyla boyutunu ayarlarsın (çoğu %70–150, harita %60–160). Parçalar ekran dışına çıkamaz. Saydamlığı da ayarlayabilir, tek parçayı ya da hepsini sıfırlayabilirsin. Düzen yalnız o telefonda saklanır. **Serbest joystick** açıkken sol çubuk ekranın sol yarısında parmağını nereye koyarsan orada belirir. **Sıfırla** her şeyi ilk hâline döndürür. Düzen yalnızca o telefonda saklanır.

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
- **Telefon bildirimleri (Android uygulaması 45.0 ve sonrası):** uygulamada hesabına girince bir kez izin sorulur. İzin verirsen oyun kapalıyken bile özel mesaj, arkadaşlık isteği, klan daveti ve klan katılma isteği telefonuna bildirim olarak gelir; bildirime dokununca oyun ilgili sayfada açılır. Ayarlar → **Bildirim seçenekleri**'nden hangi bildirimleri istediğini (özel mesaj, arkadaşlık isteği, oda daveti, klan, duyurular) tek tek seçebilir ve **sessiz saatler** koyabilirsin (o saatlerde bildirim gelmez); aynı seçimler tarayıcı bildirimlerine de uygulanır. Oyunda olmayan bir arkadaşını odana davet edersen telefonuna bildirim gider; dokununca uygulama açılır ve doğrudan odaya katılır. Duyurularda resim de olabilir (uygulama arka plandayken görünür). Ayarlar'daki **Telefon bildirimleri** anahtarıyla hepsini kapatabilirsin; çıkış yapınca telefonun hesaptan ayrılır. Bildirim gelmiyorsa telefonun Ayarlar → Uygulamalar → Kuşatma → Bildirimler bölümünden açık olduğuna bak.

## Hesap, elmas ve mağaza

Hesap isteğe bağlıdır ama açınca oyun bir siteye dönüşür:

- **Ana sayfa:** seviyen, günlük ödül, bugün kazandığın elmas, arkadaşların, öne çıkan eşya, açık odalar.
- **Elmas:** temizlediğin her dalga elmas ve XP verir. Geç dalgalar ve bosslar daha çok verir; zorluk (Kolay ×0,75, Zor ×1,3, Kâbus ×1,7) ve mod (Hayatta Kalma ×1,2, Günün Görevi ×1,3, Boss Akını ×1,5, Tek Can ×2) çarpanları birbiriyle çarpılır. Tek başına oyunlar %75 verir. Varsayılan sınır günde 1000, saatte 300 elmastır. Her gün bir de günlük ödül ve çark var.
- **Mağaza:** sınıflar, şapkalar, renkler, silah kaplamaları, çerçeveler, isim renkleri, unvanlar ve temalar. Bazen indirim, sınırlı süreli eşya ya da 2× elmas etkinliği olur.
- **Profil ve dolap:** seviyen ve istatistiklerin; aldıklarını buradan giyersin. Başka oyuncular profiline bakabilir.
- **Arkadaşlar:** ad ile istek gönder, kimin çevrimiçi olduğunu ve hangi odada oynadığını gör, tek tıkla katıl, özel mesaj at. Bir arkadaşın odaya girince (sen oyunda değilken) ekranda **Katıl** tuşlu kısa bir bildirim çıkar. Rahatsız eden birini bildirebilirsin.
- **Görevler:** her gün üç görev (elmas ve +100 XP), her pazartesi üç büyük **haftalık görev** (60–170 elmas ve +300 XP), seviye yolu (her seviye elmas; 5, 10, 15, 20, 30, 40 ve 50. seviyelerde satılmayan unvan, çerçeve ve isim rengi) ve 33 başarım. Oyun sırasında bir görev ya da başarım tamamlanınca üstte hemen bir kart çıkar; ödülü Görevler sayfasından alırsın.
- **Haftanın sıralaması:** o hafta kazandığın sezon XP'si sayılır (Sıralama → Bu hafta, Görevler sayfası). Hafta pazartesi 00:00'da (Türkiye saati) biter; ilk 10 bir sonraki hafta Görevler sayfasından elmas alır: 1. 1.000, 2. 700, 3. 500, 4–5. 300, 6–10. 200.
- **Ayarlar:** tema, gizlilik (istekler, çevrimiçi görünme, odanı gösterme, sıralama), ad değiştirme (elmasla), şifre değiştirme, hesabı silme.

Oyun bitince sonuç ekranında ödüller verilir (Takımın yıldızı, Kasap, Yıkıcı, Melek, Toplayıcı, Boss avcısı, Elit avcısı, Ölümsüz). **Sonucu paylaş** dalga, harita, sınıfın, sayıların ve ödüllerinle bir resim hazırlar: telefonda doğrudan paylaşabilir, bilgisayarda indirebilirsin (Android uygulamasında ekran görüntüsü al).

Elmaslar sunucuda tutulur ve kontrol edilir; odadaki herkes, sunucunun imzaladığı bir "kart" sayesinde kimin hangi sınıfa ve eşyaya sahip olduğunu bilir.

## Android uygulaması

Android telefonda siteyi açınca üstte **Android uygulaması** düğmesi çıkar (ya da `https://umvtt.github.io/kusatma/app/kusatma.apk`). İndirip kur; tarayıcına "bilinmeyen uygulamaları yükle" izni vermen gerekebilir. Tarayıcı "zararlı olabilir" derse **Yine de indir**, Google Play Protect uyarırsa **Diğer ayrıntılar → Yine de yükle** de; uygulama Play Store'da olmadığı için bu uyarılar çıkar. 46.0'dan beri uygulama başka uygulama kurma izni istemiyor, bu yüzden Play Protect çok daha az takılıyor. Uygulama oyunu doğrudan siteden açar, bu yüzden her oyun güncellemesi uygulamaya da anında gelir; tekrar kurman gerekmez. Ana adrese ulaşılamazsa okul aynasını dener. Geri tuşu oyundaki Esc gibi çalışır.

Uygulamanın dosyası yapı numarasıyla adlanır (ör. **Kuşatma 48.0.apk**). Uygulamanın yeni bir sürümü çıktığında (zorunlu olmayan) menüde ve Ayarlar → Hesap'ta **Güncelle** düğmesi görünür; dokununca telefonun tarayıcısında indirme sayfası açılır, istemezsen eski sürümle oynamaya devam edersin. 48.0, oyunun telefonun Wi-Fi'de mi mobil veride mi olduğunu görebilmesini ekler (performans raporları için). Uygulama normal güncellemelerde başka hiçbir şey sormaz. Yalnızca uygulamanın kendisinde önemli bir değişiklik olduğunda (`app/version.json` içindeki `min` uygulamanın sürümünden büyükse) atlanamayan bir "Önemli güncelleme" ekranı gösterir ve **Güncelle** ile sitedeki güncelleme sayfasını açar; yeni dosya eskisinin üstüne kurulur. Telefon bildirimleri Firebase Cloud Messaging ile gelir; bu yüzden uygulama 45.0 Firebase ayar dosyasıyla (`google-services.json`, depoda değildir) derlenir. Yeni APK'yı yapmak için `android/` klasöründe aynı imza anahtarıyla `gradle assembleRelease -PversionCode=<yeni numara>` çalıştırılır, çıkan dosya `app/kusatma-<yapı>.0.apk` ve kopyası `app/kusatma.apk` olarak konur ve `app/version.json` içindeki `v` bir artırılır. İmza anahtarı depoda değildir; aynı anahtar olmadan yeni sürüm eskisinin üstüne kurulamaz.

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

**Silah:** beş seviye (150, 400, 850, 1500, 2400 altın). Seviye I'de sınıfının dört yolundan birini seçersin; her sınıfın yolları kendine özeldir, başka sınıfta yoktur. Seviye III'te yolun iki dalından birini seçersin, seviye V dalın özel gücünü açar. Dalı 250 altına değiştirebilir ya da yolu sıfırlayıp harcadığın altının yarısını geri alabilirsin. Her yolun kendi rengi, silah görünümü ve sesi var.

Bazı yollar yeni şeyler yapar: **ısınan** silahlar tetiğe bastıkça hızlanır; **işaret** vurulan zombinin herkesten daha çok hasar almasını sağlar; **bitirme** canı azalmış zombilere çok sert vurur; **can emme** vurduğun hasarın bir kısmını canına çevirir; **çekme** zombileri sana doğru çeker; **birikim** aynı zombiye art arda vurdukça hasarı artırır; **sekme** mermiyi bir zombiden ötekine sektirir. Zehir yalnızca Kimyager'de, şimşek yalnızca Tesla'da, ateş yalnızca Alevci'de, buz yalnızca Nişancı'da vardır.

**Asker**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Ağır kalibre | Daha yavaş ama çok sert vurur; vuruşlar zombileri biraz iter | Sarsıcı (her vuruş zombiyi sersemletir) · Yıkıcı (mermiler küçük patlamalar yapar) |
| Taramalı | Tetiğe bastıkça ısınır: ateş hızı gittikçe artar | Kızgın namlu (mermiler bir zombiden diğerine seker) · Çift şarjör (ısınınca her atışta üç mermi) |
| Süngü | Yakındaki zombilere çok daha sert vurur ve onları iter | Hücum (hızlanırken iki kat hasar) · Siper (yakın vuruşlar canını yeniler) |
| Bomba atar | Tüfek yerine bomba atar: yavaş ama her atış patlar | Geniş alan (patlamalar zombileri sarsar) · Seri atar (her atışta iki bomba) |

**Doktor**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Uyutucu dart | Dartlar zombileri uyuşturur: çok yavaşlarlar ve sersemlerler | Narkoz (dartlar zombileri bir an uyutur) · Teşhis (sersemleyen zombiler iki kat hasar alır) |
| Kan emici | Vurduğun hasarın bir kısmı canına döner | Kan bankası (fazla can yakındaki takım arkadaşlarına gider) · Bağışıklık (can emerken bir süre daha az hasar alırsın) |
| Neşter | Canı azalmış zombileri bitirir; dartlar bir zombiyi deler | Cerrah (canı üçte birin altındakiler tek vuruşta düşer) · Otopsi (şarapnel daha geniş ve sert) |
| Adrenalin | Vuruşlar yeteneğini doldurur, öldürmek seni hızlandırır | Yüksek doz (hızlanırken çok daha hızlı ateş) · Şok iğnesi (sersemleyen zombiler daha çok hasar alır) |

**Tamirci**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Çivi tabancası | Pompalı yerine çok hızlı çivi yağdırır, çiviler zombileri yere çakar | Çakıcı (çivilenen zombiler %30 fazla hasar alır) · Şarapnel (her atışta üç çivi) |
| Kalın saçma | Daha az ama çok sert saçma; yakındakileri geri fırlatır | Koç (fırlayan zombiler çarptıklarına hasar verir) · Saçma yağmuru (çok daha fazla saçma) |
| Şarapnel | Her saçma çarptığı yerde küçük bir patlama yapar | Misket (patlamalar zombileri sersemletir) · Tahrip (iri zombilere ve bosslara iki kat) |
| Mıknatıs | Vurduğun zombileri sana doğru çeker; çekilenler bir an sendeler | Çekim (çekilen zombiler birbirine çarpıp hasar alır) · Ezici (çekilen zombiler bir süre daha yavaş) |

**Nişancı**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Raylı top | Tek dev atış, her şeyi ve kalkanları deler | Aşırı yük (kritik atışlar üç kat vurur) · Hızlı şarj (atış yolundaki zombiler sersemler) |
| Kriyojenik | Mermiler zombileri dondurur ve yavaşlatır | Donduran (vuruşlar zombileri buz kalıbına çevirebilir) · Kırılgan (donan zombiler ölünce buz parçalarına patlar) |
| Av işareti | Vurduğun zombi işaretlenir: herkesten daha çok hasar alır | Gözcü (işaret yakındaki zombilere de yayılır) · Kafadan (kritikler üç kat vurur) |
| Seken mermi | Mermi vurduğu zombiden yakındaki bir başkasına seker | Bilardo (her sekme biraz daha sert vurur) · Delip geçen (mermiler kalkanları da deler) |

**Kalkancı**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Koçbaşı | Ağır mermiler zombileri geri iter, yaklaşmalarını zorlaştırır | Duvar (itilen zombiler sersemler) · Ezen (bosslara karşı her vuruş zırhını deler) |
| Baskı ateşi | Kalkanın arkasından hızlı ateş; vurulan zombiler yavaşlar | Kurşun duvarı (yavaşlayan zombiler daha çok hasar alır) · Sürekli ateş (ısınınca mermiler zombileri deler) |
| Zırh kıran | Mermiler kalkanlı ve zırhlı zombileri deler | Delici (mermiler her şeyi deler) · Parçalayıcı (zırhlı ve elit zombilere iki kat) |
| Kan bağı | Yakındaki zombilere daha sert vurur ve canını yeniler | Kale (can yenilerken daha az hasar alırsın) · Öfke (canın yarının altındayken iki kat hasar) |

**Alevci**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Cehennem | Alev çok daha uzun yakar ve yayılır | Napalm (yanan zombiler ölünce patlar) · Kor (vuruşlar yerde alev bırakır) |
| Alev halısı | Alev yere yapışır: arkanda yanan bir yol bırakırsın | Orman yangını (yanan zemin zombileri yavaşlatır) · Lav (zeminde yanan zombiler patlar) |
| Uzun hortum | Alev daha uzağa gider, daha çok zombiyi deler | Alev topu (patlamalar zombileri tutuşturur) · Basınç (alev zombileri geri iter) |
| Termit | Kalkan ve zırhları eritir, iri zombilere çok sert | Eritici (bossları tutuşturur, yanmaları uzun sürer) · Kıvılcım (kıvılcımlar zombileri sersemletir) |

**Bombacı**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Büyük şarj | Bombalar daha sert ve geniş patlar | Yer sarsan (patlamalar zombileri sersemletir) · Bunker kırıcı (patlama alanı çok büyür) |
| Misket | Her atışta birden çok küçük bomba saçar | Halı bombası (her atışta beş bomba) · Seri misket (bombalar daha geniş patlar) |
| Yapışkan | Patlama yapışkan bir sıvı saçar: zombiler çok yavaşlar | Zamk (yapışan zombiler bir an tamamen durur) · Katran (yere zombileri yavaşlatan bir katran gölü bırakır) |
| Sekme bombası | Bomba ilk çarptığı yerde patlar, sonra bir kez daha sekip patlar | Zıplayan (her sekme daha geniş patlar) · Gecikmeli (ikinci patlama zombileri sersemletir) |

**İzci**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Hazine avcısı | Öldürdüğün zombilerden fazladan altın düşer | Yağmacı (elit ve iri zombilerden üç kat altın) · Kumarbaz (kritikler fazladan altın verir) |
| Sekme | Mermiler vurduğu zombiden bir başkasına seker | Akrobat (her sekme biraz daha sert) · Kesişen (sekmeler kritik vurabilir) |
| Akıncı | Öldürmek seni hızlandırır, koşarken daha hızlı ateş edersin | Rüzgar (hızlanırken mermiler deler) · Vur kaç (hızlanırken iki kat hasar) |
| Keskin nişan | Yüksek kritik şansı; kritikler çok sert | Ölümcül (kritikler üç kat vurur ve deler) · Göz kararı (kritik vuruşlar zombiyi sersemletir) |

**Mühendis**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Hedef lazeri | Vurduğun zombiler işaretlenir, dronlar ve taretler onlara çok daha sert vurur | Kilit (işaretli zombiye taretler iki kat vurur) · Tarama (işaretli zombiler yavaşlar) |
| Şok tabancası | Mermiler zombileri bir an sersemletir | Kısa devre (sersemleyen zombiler daha çok hasar alır) · Darbe (darbe zombileri geri iter) |
| Perçin | Aynı zombiye art arda vurdukça her mermi daha sert vurur | Matkap (birikim dolunca zombi sersemler) · Hidrolik (birikim dolunca zombi patlar) |
| Seyyar havan | Tüfek yerine küçük havan mermileri atar: yavaş ama alan hasarı | Şarapnel (patlamalar zombileri sersemletir) · Otomatik yükleyici (her atışta iki havan) |

**Kimyager**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Toksin | Vurduğun zombiler zehirlenip can kaybeder | Salgın (ölen zombiler zehir bulutu bırakır) · Nörotoksin (zehirlenen zombiler bir an felç olur) |
| Asit gölü | Atışlar yere asit gölü bırakır | Bataklık (göldeki zombiler yavaşlar) · Kostik (göller kalkanları da eritir) |
| Aşındırıcı | Asit zombilerin derisini eritir: herkesten daha çok hasar alırlar | Eritici (asit kalkanları eritir, bosslara tam işler) · Delici asit (atışlar her şeyi deler) |
| Patlayan şişe | Şişe atar: çarptığı yerde patlayıp zehir saçar | Bulut (bulut daha geniş ve uzun) · Molotof kimyası (her atışta iki şişe) |

**Komutan**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Hedef göster | Vurduğun yerdeki zombiler işaretlenir: takımın onlara çok daha sert vurur | Ateş desteği (işaretli zombiler yavaşlar) · Taarruz (takım hızlanırken daha sert vurur) |
| Komuta tüfeği | Daha yavaş ama çok sert, delip geçen atışlar | Top (atışlar küçük patlamalar yapar) · Mermi yolu (atışlar her şeyi deler, kalkanları da) |
| Sancak | Öldürdüğün her zombi yakındaki takım arkadaşlarının canını yeniler | Moral (öldürmek takımı bir an hızlandırır) · Saflar (yanındaki her arkadaş için daha sert) |
| Keskin göz | Yüksek kritik şansı, menzil artar | Usta nişancı (kritikler üç kat vurur) · Emir (kritik vuruşlar zombiyi işaretler) |

**Tesla**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Yüksek gerilim | Vuruşlar yakındaki zombilere sıçrar | Zincir (şimşek çarptığı zombileri sersemletir) · Aşırı yük (arada bir hedefe yıldırım düşer) |
| Plazma topu | Yavaş, parlayan plazma topları: çarptığı yerde patlar ve sersemletir | Yıldız (patlama yakındaki zombilere şimşek atar) · Füzyon (sersemletme çok daha uzun) |
| Kondansatör | Aynı zombiye vurdukça yük birikir, her vuruş daha sert | Boşalma (yıldırım çevredekilere de vurur) · Yüksek kapasite (birikim hiç sıfırlanmaz, sadece azalır) |
| Manyetik alan | Vurduğun zombileri kendine çeker ve şimşekle yavaşlatır | Kara delik (çekilen zombiler sıkışıp birbirine hasar verir) · Faraday (yakındaki zombiler sana vurunca çarpılır) |

**Avcı**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Çelik uç | Oklar daha çok zombiyi deler, menzil artar | Ok yağmuru (deldiği her zombi oku daha sert yapar) · Keskin uç (kritikler kalkanları da deler) |
| Kanca | Oklar zombileri sana doğru çeker | Zıpkın (çekilen zombiler sersemler) · Tuzak (çekilen zombilere iki kat) |
| Çift kiriş | Her atışta iki ok | Yelpaze (her atışta beş ok) · Paralel (oklar daha hızlı atılır) |
| Patlayıcı ok | Oklar ilk zombiye saplanıp patlar | Fişek (patlama zombileri sersemletir) · Dinamit (iri zombilere ve bosslara iki kat) |

**Kılıççı**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Ağır kılıç | Daha yavaş ama çok sert savurur, zombileri geri iter | Balyoz (savuruş yere çarpıp çevreye hasar verir) · Cellat (canı azalmış zombileri tek vuruşta bitirir) |
| Çift kılıç | Çok daha hızlı savurur | Kasırga dansı (her savuruşta iki kesik) · Kan çiçeği (kanayan zombiler yavaşlar) |
| Uzun kılıç | Savuruş daha uzağa ve daha geniş yetişir | Mızrak (savuruş havaya bir kesik dalgası fırlatır) · Pala (savuruş arkayı da keser) |
| Kan kılıcı | Çok daha fazla can emer, canı azalmış zombilere sert | Vampir (canın doluyken emilen can kan kalkanına dönüşür: canının %35'ine kadar, önce o hasar alır; kırmızı çubuk olarak görünür) · İnfazcı (bitirdiğin zombi canını doldurur) |

**Eğitmen**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| İz sürme | Vurduğun zombiler işaretlenir; köpeğin onlara saldırır ve çok sert ısırır | Koku (işaret yakındaki zombilere de yayılır) · Sürü (ışaretli zombiler yavaşlar) |
| Kemik kıran | Vuruşlar zombileri sakatlar: yavaşlar ve sendelerler | Topal (sakat zombilere köpek iki kat ısırır) · Kırık (yavaşlayan zombiler sersemler) |
| Seri tabanca | Çok daha hızlı ateş eder; köpeğin de hızlanır | Fırtına (mermiler bir zombiden diğerine seker) · Takım işi (köpek ısırdığı zombiyi sersemletir) |
| Ödül tasması | Vuruşlar Saldır! yeteneğini doldurur; köpek öldürünce altın düşer | Eğitimli (saldır! sırasında köpek iki kat ısırır) · Av köpeği (köpek her öldürdüğünde seni iyileştirir) |

**Ajan**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Suikast | Yüksek kritik şansı; kritikler çok sert ve sessiz | Kalp atışı (kritikler üç kat vurur) · Gölge vuruşu (görünmezken her atış kritik) |
| İnfaz | Canı azalmış zombileri çok sert vurur | Temizlik (canı üçte birin altındakiler tek vuruşta düşer) · İz bırakmayan (öldürünce bir an görünmez olursun) |
| Hayalet mermi | Mermiler hedefe döner ve zombileri deler | Güdümlü (mermiler her şeyi deler) · Sızma (kalkanlı zombilere iki kat) |
| Çapraz ateş | Her atışta iki mermi açılı gider | Saçılım (her atışta dört mermi) · Tuzak ateşi (sersemleyen zombiler daha çok hasar alır) |

**Hacker**

| Yol | Etkisi | Dallar (seviye V gücü) |
| --- | --- | --- |
| Aşırı hız | Tetiğe bastıkça işlemci ısınır: ateş hızı gittikçe artar | Soğutucu (ısınınca mermiler zombileri deler) · Paralel işlem (ısınınca her atışta üç mermi) |
| Virüs | Vurduğun zombiye virüs bulaşır: ölünce yakındakilere geçer ve onları sersemletir | Solucan (virüslü zombiler yavaşlar) · Truva (patlama zombileri sersemletir) |
| Güçlü çekirdek | Daha yavaş ama çok sert, hedefe daha iyi dönen mermiler | Kuantum (mermiler küçük patlamalar yapar) · Yeniden başlat (öldürmek yeteneği çok daha çabuk doldurur) |
| EMP | Mermi yerine EMP topu atar: çarptığı yerde patlar, zombileri sersemletir | Kısa devre (sersemleyen zombiler daha çok hasar alır) · Elektromanyetik (patlamaya yakalanan zombiler sana doğru çekilir) |

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
- Büyük mesajlar parçalara bölünerek gönderilir. Kurucunun oyun yedeği (59. yapıdan beri) sıkıştırılarak, yaklaşık beş kat küçük gider ve yalnızca o oyuncunun bağlantısı boşken yollanır.
- **Zayıf telefonlar için hız (61. yapı):** zombilerin yol haritası kurucuda eskisinden 10–30 kat hızlı hesaplanıyor (yuvarlama hatası yüzünden bazı haritalarda, en çok Liman'da, yarım saniyeye varan takılmalar oluyordu). Kan ve yanık izleri bütün haritanın tek resmi yerine yalnızca bir şey döküldüğü yerlerdeki küçük parçalarda tutulur; ekranda olmayanlar çizilmez, solanlar silinir. Ekran dışındaki ışıklar hesaplanmaz, uzaktaki zombiler hedeflerini daha seyrek kontrol eder. Belleği az (3 GB ve altı) ya da işlemcisi zayıf (4 çekirdek ve altı) telefonlar Otomatik grafikte Düşük ile başlar ve haritanın zemin resmi onlarda daha hafiftir. Oyunun bütün parçaları açılışta aynı anda inmeye başlar.
- **Sıkıştırılmış güncellemeler (60. yapı):** kurucu her oyuncuya yalnızca o oyuncunun aldığını onayladığı durumdan bu yana değişeni yollar: oyuncuların değişmeyen bilgileri (altın, eşyalar, silah) tekrar gitmez, zombiler tek bir kısa yazı dizisi olarak ve çoğu zaman yalnızca ne kadar yürüdükleriyle gider. Geç dalgada bir oyuncuya giden veri saniyede yaklaşık 18 KB'tan 7 KB'a indi. Bu yüzden 60. yapı eski sürümlerle aynı odada oynayamaz.
- **Zayıf bağlantıda donma (59. yapı):** kurucunun telefonu her oyuncuya saniyede 15 kez oyunun durumunu yollar. Yükleme hızı yetmezse eski durumlar sıraya girmez: o oyuncunun bağlantısında çeyrek saniyelik veriden fazlası beklerse kurucu o anı atlar ve sonra en yenisini yollar. Ekranın dışındaki zombiler daha seyrek güncellenir, küçük harita yarım saniyede bir yenilenir. Güncelleme kısa süre gecikirse zombiler gittikleri yöne yürümeye devam eder (en çok 0,6 saniye); 1 saniyeden uzun sürerse üstte **"Bağlantı zayıf"** yazar. Sesli sohbet konuşma için yeterli 20 kbps kullanır; kurucunun bağlantısı bir oyuncuya yetişemezse ses birkaç saniyeliğine 12 kbps'ye iner.
- **Performans raporları:** çerez tercihlerinde istatistiklere izin verdiysen oyun, oynarken dakikada bir ve bir donmadan hemen sonra sunucuya kısa bir özet yollar: kare hızı, takılmalar, kurucudan veri beklenen donmalar, ping, Wi-Fi mi mobil veri mi (Android söylüyorsa; iPhone söylemez), doğrudan mı aktarma sunucusu üzerinden mi bağlı, sesli sohbet açık mı ve o anda oyunda ne olduğu. Sunucu bunları yalnızca toplar; kişisel bilgi yoktur.
- Gelen her mesaj biçim ve boyut açısından denetlenir. Uzun süre çok fazla mesaj gönderen oyuncu odadan atılır.
- **Hile koruması:** kurucu, misafirlerin bildirdiği vuruşları silahın yapabileceğiyle sınırlar (silahın menzili dışındaki zombilere vuruş sayılmaz) ve sınıfın koşabileceğinden hızlı hareketleri kabul etmez; böyle bir oyuncu bulunduğu yere geri çekilir. Sunucu elması ve en iyi dalgayı yalnızca sırayla geçilen dalgalar için verir: dalga atlayan rapor sayılmaz. Oyuna sonradan katılan oyuncunun dalgası odanın kurucusunun ulaştığı dalgaya göre doğrulanır.

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

Tarayıcı açmadan hızlı denetim (her modül açılıyor mu, kurucu hileleri reddediyor mu, kayıplı bağlantıda ölen zombiler ekranda kalıyor mu):

```bash
node test/run.mjs
```
