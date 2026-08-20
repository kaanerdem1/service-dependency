# UI/UX iyileştirmeleri — son kullanıcı odaklı

> Her batch 3 madde; test sonrası tamamlananlar silinir.

---

## Batch 3 — Genel metin ve terminoloji

**7. Türkçe / İngilizce tutarlılık (kalan)**  
Kullanıcı metinlerinde *Method → Metod*; arama placeholder *「Servis veya metod ara…」*.

**8. Boş durum metinleri şablonu**  
Tüm `empty-hint` / `map-info-empty` / gelen kutusu boş mesajları: **Ne olacak** + **Ne yapmalısın**.

**9. Yükleme ve hata durumları**  
*「Servis haritası hazırlanıyor…」* vb.; `api-banner` eylem önerisi.

---

## Batch 4 — Navigasyon ve ilk 30 saniye

**10. Topbar’da kısa ürün açıklaması**  
*「Servis bağımlılıkları ve değişiklik etkisi」* alt satır.

**11. Arama placeholder ve ilk odak**  
Placeholder güncellemesi; isteğe bağlı arama focus.

---

## Batch 5 — Harita, gelen kutusu, talep akışı

**13. Dock grupları için kısa açıklama**  
Katman / görünüm / bilgi — `i` popover’da tek cümle.

**14. Gelen kutusu boş durumları**  
Onay yok / bildirim yok mesajlarını genişlet.

**15. Talep / snapshot dili**  
Snapshot listesi açıklaması; trail satırları (`formatTrail`).

---

## Batch 6 — Erişilebilirlik ve cilalar

**16. Odak halkası ve klavye**  
`:focus-visible` — ağaç, sekmeler, dock.

**17. `aria-live` tutarlılığı**  
Servis seçimi, pivot, toast, gelen kutusu sayacı.

**18. Responsive: dar ekran**  
`<1024px` sidebar overlay; boş durum kartı; dock tek satır.





**. Lejant renkleri birbirine çok yakın**  
Sol üstteki "Proje / Paket / Servis / Metod" noktaları — Proje (turuncu-sarı) ile Metod (kahve-turuncu) tonları göz düzeyinde neredeyse ayırt edilemiyor. Renk körlüğü olan kullanıcılar için bu ayrım daha da zorlaşır.



**3. "17" (Yan Bağ) hâlâ açıklanmıyor**  
Geçen turda sorduğum soru hâlâ cevapsız — bu sayı neyi temsil ediyor, üstüne gelince tooltip var mı yok, belli değil.



**1. Sağdaki node kartları panel tarafından kesiliyor**  
"Etki Özeti" paneli açılınca canvas genişliği daralmış ama 2. katman kartları hâlâ eski konumlarında duruyor — bu yüzden `outbound_multichannel_notification_delivery_router` gibi isimler `notifilivery_router` şeklinde çirkin bir şekilde bölünmüş, `digital_storefront_catalog_ch` / `perience_api` de aynı şekilde kesik. Bu bir layout/responsive hatası: panel açıldığında canvas'ın kendini yeniden hizalaması (re-layout) gerekiyor, şu an sadece üstüne biniyor.

