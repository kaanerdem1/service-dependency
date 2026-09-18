# `app/` — `App.tsx`’in **arkasındaki** kabuk mantığı

**Ekranda:** Doğrudan bir bileşen yok; ama **her şeyin bağlandığı yer** — sol ağaç seçimi değişince API çağrısı, drawer prop’ları, overlay modalları buradan `App.tsx`’e gider.

| Dosya | Ne yapar (kullanıcı dilinde) |
|-------|------------------------------|
| `useServiceCatalogShell.ts` | “Hangi servis/süreç açık, hangi modal, hangi veri yüklendi” — eskiden `App.tsx` içindeki uzun gövde |
| `App.tsx` (üst dizin) | Masthead, workspace, overlay’leri JSX ile birleştirir; mümkün olduğunca kısa kalır |

Yeni özellik: iş kuralı burada veya `navigation/` / `stores/`; görünüm `components/` altında.
