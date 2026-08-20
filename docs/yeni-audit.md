# Audit sonrası yapılacaklar

> TypeUI audit (Aug 2026) + manuel test geri bildirimleri. Tamamlananlar silinir.

---

## Tamamlandı

- Service 360 sekmeleri + Servis İşlevi sekmesi
- Sidebar üst boşluk sıkılaştırma
- **Batch A:** title/meta/og, collapse butonu sidebar içi, Yan bağ etiketi + tooltip
- **Batch B (kısmi):** lejant renk ayrımı (Proje mavi / Metod turuncu)
- Topbar ürün açıklaması
- Arama placeholder: metod

---

## Batch B — Görsel cilalama (kalan)

**4. Sidebar + tree IDE tarzı**  
Ağır kutu/gölge yerine düz liste; proje başlıkları, sakin tipografi.

---

## Batch C — İçerik (kalan)

**8. Boş durum / yükleme metinleri**  
Ne olacak + Ne yapmalısın şablonu.

---

## Bug fix (P0)

**9. Panel açılınca canvas re-layout**  
Etki Özeti drawer açıldığında node kartları kesiliyor.

**10. Harita alt dock çakışması**  
En alttaki node ile alttaki dock üst üste biniyor — canvas alt padding / fitView ayarı.

---

## Ertelenen

SSR / indexlenebilir servis URL’leri — iç araç için şimdilik gerek yok.
