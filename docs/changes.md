# UI/UX iyileştirmeleri — yapılacaklar listesi

> Her grupta en fazla birkaç madde; bitenler listeden silinir.

---

## Grup 3 — Metin ve dil

**7. Türkçe tutarlılık**  
Arayüzde *Method → Metod*; arama kutusu *「Servis veya metod ara…」*.

**8. Boş ekran mesajları**  
Her boş durumda: **Ne olacak** + **Ne yapabilirsin** (şablon).

**9. Yükleme ve hata**  
*「Servis haritası hazırlanıyor…」* gibi net mesajlar; API hatasında ne yapılacağı yazılsın.

---

## Grup 4 — İlk kullanım

**10. Üst çubukta kısa açıklama**  
*「Servis bağımlılıkları ve değişiklik etkisi」* alt satır.

**11. Arama kutusu**  
Placeholder güncellemesi; isteğe bağlı otomatik odak.

---

## Grup 5 — Harita, inbox, talep

**13. Dock ipuçları**  
Katman / görünüm / bilgi grupları — `i` ile tek cümle açıklama.

**14. Boş gelen kutusu**  
Onay yok / bildirim yok mesajlarını netleştir.

**15. Snapshot metinleri**  
Liste açıklaması; gezinme özeti satırları okunaklı olsun.

---

## Grup 6 — Erişilebilirlik ve son rötuşlar

**16. Klavye ve odak**  
`:focus-visible` — ağaç, sekmeler, dock.

**17. Ekran okuyucu**  
Servis seçimi, pivot, bildirimler için `aria-live`.

**18. Dar ekran**  
`<1024px` sidebar üstte overlay; dock tek satır.

---

## Bilinen sorunlar (henüz düzeltilmedi)

**Lejant renkleri birbirine çok yakın**  
Sol üstteki proje / paket / servis / metod noktaları — özellikle proje ile metod tonları ayırt edilsin.

**「17」 yan bağ sayısı açıklanmıyor**  
Bu sayı neyi gösteriyor; tooltip veya kısa metin eklenmeli.

**Panel açıkken kartlar kesiliyor**  
Etki özeti paneli açılınca 2. katman düğüm isimleri bölünüyor; canvas yeniden hizalanmalı.
