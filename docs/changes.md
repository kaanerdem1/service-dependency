# Backlog

## Harita

7- Yoğun oklar — yan bağlar varsayılan gizli; dock’ta **Yan bağ** grubu ile aç/kapa ✅ · `+N bağ` chip · Holten bundle (ağaç omurgası)

8- Etki özeti drawer kapalıyken açma ipucu zayıf (küçük ‹) — “Özet” etiketi veya kenar şeridi

9- Bağlantı türü (senkron/asenkron) — veri modeli gerekir

## UX / a11y

4- **Snapshot** ✅ — trail + PNG + JSON · otomatik: talep açılışı / onay / kapı açık · manuel: dock Kaydet

   Tam spec: [`docs/SNAPSHOT.md`](./SNAPSHOT.md)

   **Özet:** Ekran görüntüsü tek başına yetmez. Snapshot; talep/onay anında hop-1 etki kümesini, harita görünümünü (katman, yan bağ, layout), kullanıcı gezinme yolunu ve katalog revizyonunu kilitler. Yönetici post-mortem’de *kapsam / süreç / katalog* ayrımını yapabilir.

   **MVP (P0):**
   - `explore` — kullanıcı “Kaydet”
   - `cr_open` — talep açılışında otomatik
   - `approval` — owner flag atınca otomatik
   - Talep detayında liste + JSON indir
   - `navigationTrail` + `viewState` + sunucuda yeniden hesaplanmış `impact`

   **P1:** PNG watermark, read-only yeniden oynatma, `gate_open`, olay sonrası canlı katalog diff

10- Klavye turu (modül ağacı, React Flow) — manuel test
