# 3D Nexus

**3D Nexus**, Android telefon ve tarayıcı için Türkçe, mobil öncelikli bir 3D stüdyo ve sahneden görsel üretme uygulamasıdır.

## Özellikler

- GLB/GLTF dosyasını telefondan seçme, çoklu model ve Khronos Damaged Helmet örneği
- Tek parmak orbit, pinch zoom, ızgara, ışık, arka plan, FOV ve otomatik döndürme
- PNG, JPG ve WebP üretimi
- Varsayılan 1080×1080 çıktı
- JPG/WebP için hedef KB'ye ikili aramayla yaklaşan kalite optimizasyonu
- Son 50 çıktıyı IndexedDB galerisinde saklama ve yeniden indirme
- Yüklenen modelleri IndexedDB'de saklama
- Proje/stüdyo/export ayarlarını Zustand persist ile otomatik kaydetme
- Türkçe 6 adımlı ilk kullanım turu
- PWA service worker ve Capacitor Android altyapısı

## Kurulum

Node.js 20+ önerilir.

    npm install
    npm run dev -- --host

Terminalde görünen yerel ağ adresini Android Chrome'da aç. Chrome menüsünden **Ana ekrana ekle** seçeneğiyle PWA olarak kullanabilirsin.

## Android APK

    npm install
    npm run build
    npx cap add android
    npm run android:sync
    npx cap open android

Android Studio açıldığında **Build > Build APK(s)** ile APK oluşturabilirsin.

## Kullanım

1. **Model yükle** ile GLB/GLTF seç veya Damaged Helmet örneğini aç.
2. Sahneyi parmağınla döndür, iki parmakla yakınlaştır.
3. Masaüstünde sağ panelden arka plan, ışık ve kamerayı ayarla.
4. Format ve 1080×1080 gibi çıktı ölçülerini seç. JPG/WebP kullanıyorsan hedef KB gir.
5. **Görsel Üret** ile çıktıyı oluştur. Görsel Galeriye kaydolur ve indirilebilir.

## Kayıt nerede tutulur?

Ayarlar tarayıcının localStorage alanında, model dosyaları ve galeri IndexedDB içindeki **3DNexus** veritabanında tutulur. Tarayıcı site verilerini silersen yerel projeler de silinir. Önemli dosyalarının ayrıca yedeğini tut.

## Bilinen sınırlar

İlk çekirdek sürüm GLB/GLTF odaklıdır. Uzak model URL'lerinde sunucunun CORS izni gerekir. Çok büyük modeller düşük bellekli telefonlarda WebGL sınırına takılabilir. PNG kayıpsız olduğu için hedef-KB kalite optimizasyonu JPG/WebP ile sınırlıdır. Android galeriye doğrudan MediaStore yazımı yerine tarayıcı/Android indirme akışı kullanılır.

## Sonraki sürüm fikirleri

OBJ/STL/FBX yükleyicileri, sahne nesnesi transform araçları, materyal editörü, HDR stüdyo presetleri, proje paketi içe/dışa aktarma, yerel Android galeri entegrasyonu, AI destekli model/görsel araçları ve çoklu dil.

## Lisans

MIT. Ayrıntılar için LICENSE dosyasına bakın.
