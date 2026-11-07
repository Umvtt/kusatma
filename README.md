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
| 1–6 | Molada yükseltme satın al |
| Tab | Skor tablosu |

## Sınıflar

| Sınıf | Silah | Yetenek |
| --- | --- | --- |
| Asker | Piyade tüfeği | **Öfke**: 6 sn boyunca iki kat hızlı ateş |
| Sıhhiye | Hafif makineli | **Şifa Dalgası**: yakındakileri iyileştirir, düşenleri kaldırır |
| Mühendis | Pompalı | **Taret**: 20 sn boyunca ateş eden taret kurar |
| Keskin Nişancı | Uzun namlu | **Odak**: 5 sn iki kat hasar, sınırsız delme |

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
