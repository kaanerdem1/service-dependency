# Updates

## Harita bilgi alanı ve ziyaret yolu

### Eski hali

- Ziyaret yolu sağdaki `Etki özeti` bilgi alanının içinde gösteriliyordu.
- Harita node'larının üzerine gelince sağ panelde hem `Ana etki yolu` güncelleniyor hem de ziyaret yolu bölümü bazı durumlarda animasyonla daralıp açılıyordu.
- Sağ panelde mouse hareketini takip eden spotlight/parıltı efekti vardı.
- `Ana etki yolu` servisleri numarasız, düz yol listesi olarak gösteriliyordu.

### Yeni hali

- Ziyaret yolu sağ panelden çıkarıldı ve üstteki `Harita / İlişkiler / Servis İşlevi` sekmelerinin altına taşındı.
- Ziyaret yolu artık klasör yolu gibi `/` ile ayrılıyor: `Servis A / Servis B / Servis C`.
- Ziyaret yolundaki servis isimleri tıklanabilir; bir isme basınca ilgili servisin görünümüne geri dönülür.
- Sağdaki `Etki özeti` alanında artık sadece `Ana etki yolu` gösteriliyor.
- `Ana etki yolu` adımları `1`, `2`, `3` şeklinde numaralandırıldı.
- Sağ paneldeki hover kaynaklı fazla hareket azaltıldı; ziyaret yolu collapse animasyonu ve spotlight/parıltı efekti kaldırıldı.

## Harita kapsam filtresi

### Eski hali

- Harita filtresi tek proje seçimiyle çalışıyordu.
- Aynı anda birden fazla proje seçilemiyordu.
- Jar/paket bazında etki zinciri süzme seçeneği yoktu.

### Yeni hali

- Filtre kontrolü `Kapsam filtresi` olarak güncellendi.
- Aynı anda birden fazla proje seçilebiliyor.
- Etki haritasında görünen jar/paketler ayrıca listeleniyor ve seçili jar'a göre filtreleme yapılabiliyor.
- Jar/paket isimleri sol modül ağacındaki package node adlarıyla aynı gösteriliyor.
- Proje ve jar seçimleri birlikte çalışıyor; eşleşen servisler ve merkeze giden ara yollar haritada korunuyor.
- Aktif filtre varsa tek tuşla tüm seçimler temizlenebiliyor.

## Dark mode harita yüzeyi

### Eski hali

- Dark mode açıldığında sol menü ve üst kabuk koyulaşıyor, harita üst alanı/canvası beyaz kalıyordu.
- Sonraki ilk denemede canvas ve sağ bilgi alanı gereğinden fazla koyu kalmıştı.

### Yeni hali

- Dark mode'da haritanın üst alanı, canvası ve sağ `Etki özeti` alanı açık gri tonlara alındı.
- Bu gri tonlar, sol menü ve üst kabuktaki koyu alandan belirgin şekilde daha açık tutuldu.
- Node kartları canvasla aynı renkte kalmasın diye canvas arka planından daha açık bir yüzeye taşındı.
- `Tam ekran` satırı da beyaz kalmayacak şekilde açık gri harita yüzeyine dahil edildi.
- Sağ bilgi kartındaki `Ana etki yolu` yeşili daha koyu ve okunaklı hale getirildi.
- Filtre popover renkleri açık gri harita yüzeyiyle uyumlu olacak şekilde güncellendi.

## Servis ve method hiyerarşisi

### Eski hali

- Sol modül ağacı `Proje > Jar > Servis > Method` gibi davranıyordu.
- Method tanımı zorunlu olarak `serviceId` taşıyordu.
- `GET /api/methods/:id` method detayını dönerken method'un bağlı olduğu servisten tekrar listeleme yapıyordu.

### Yeni hali

- Sol modül ağacı `Proje > Jar > Servis/Method` modeline çekildi.
- Servis ve method aynı jar altında kardeş olabilir; ayrıca ihtiyaç olduğunda birbirinin parent/child'ı olarak da gösterilebilir.
- Method tanımı artık `projectId` ve `packageId` taşır; `serviceId` opsiyoneldir.
- Mock veriye jar altında doğrudan duran method örnekleri eklendi.
- Mock ağaçta `service -> method` ve `method -> service` örnekleri eklendi.
- Call graph mock'unda servis metodu -> jar metodu ve jar metodu -> servis metodu örnek çağrıları eklendi.
- Method haritası, servise bağlı olmayan methodları jar adıyla gruplayabilecek şekilde güncellendi.
