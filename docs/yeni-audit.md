# Audit sonrası yapılacaklar

> TypeUI audit (Aug 2026) + manuel test geri bildirimleri. Tamamlananlar silinir.

---

## Tamamlandı (bu tur)

- **Service 360 tarzı sekme satırı** — başlık solda, Harita / İlişkiler / Servis İşlevi sekmeleri + ikonlar sağda
- **Sidebar üst boşluk** — Modüller başlığı, arama, lejant arası padding sıkılaştırıldı

---

## Batch A — Hızlı kazanım

**1. Title + meta + og tags**  
`index.html`: `Servis Bağımlılık Haritası`, meta description, og:title/description.

**2. Collapse butonunu sidebar içine taşı**  
`‹` butonu main’e taşmasın; Modüller satırının içinde kalsın.

**3. "17" (Yan Bağ) açıklaması**  
Sayının ne olduğu tooltip veya kısa etiket ile görünsün.

---

## Batch B — Görsel cilalama

**4. Sidebar + tree IDE tarzı**  
Ağır kutu/gölge yerine düz liste; proje başlıkları, sakin tipografi (audit madde 6–7).

**5. Lejant renk ayrımı**  
Proje / Metod tonları birbirinden net ayrılsın (renk körlüğü).

---

## Batch C — İçerik

**6. Servis özeti şablonu (genişlet)**  
Servis İşlevi sekmesindeki metin; upstream/downstream sayılarından otomatik özet.

**7. Topbar kısa ürün açıklaması**  
*「Servis bağımlılıkları ve değişiklik etkisi」* alt satır.

**8. Boş durum / yükleme metinleri**  
Ne olacak + Ne yapmalısın şablonu; `changes.md` Batch 3 ile uyumlu.

---

## Bug fix (P0)

**9. Panel açılınca canvas re-layout**  
Etki Özeti drawer açıldığında node kartları kesiliyor; `mapLayout` yeniden hizalamalı.

---

Harita görünümünde bazen en alttaki node ile alttaki dock üst üste biniyor onu düzgün ayarla ne yapabiliriz söyle. 

