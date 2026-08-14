1- [x] Etki özeti (servis · ekip · proje) — seçili servise göre haritanın solunda bilgi kutusu

2- [x] Ziyaret yolu — başlangıç servis/method ve tıklanarak gidilen yol dikey ağaç

3- [x] Servislere not ekleme — MVP: badge + popover; team|all; ekle + kendi notunu sil

4- Snapshot — anlık yol geçmişi + ekran görüntüsü

5- [~] Sol hiyerarşi renk + hiza (proje/paket/servis/method; kalan ince ayar)

6- Radial (halka) görünüm — dock’ta LTR ↔ halka; 1. katman >12 komşuda öner (bkz. REFERANS)

7- Yoğun oklar — yan bağlar (cascade) varsayılan gizli; dock’ta aç/kapa; yüksek derecede `+N bağ` chip

8- Sağ detay paneli kaldırıldı — CR / talep akışı yeniden bağlanacak (şimdilik inbox)

---

### UX notu — servis notları (madde 3)

**Amaç:** Servis düğümüne bağlanan, ekipçe görülen kısa bağlam (risk, WIP, “bu sprint dokunma”, onay bekliyor).

**Görünüm (şık + az gürültü)**
- Node’da not varsa sağ üstte küçük **📌 / nokta** (sayı: `2`); yoksa hover’da pin.
- Tıklanınca **hafif popup** (method popup gibi sürüklenebilir).
- Haritada uzun metin yok — sadece işaret + liste popup’ta.

**İçerik modeli**
- `serviceId`, `author` (session kullanıcı), `role` (member | lead), `body` (~280 karakter), `createdAt`, `visibility`: `team` | `all`.
- Thread değil: kronolojik **kısa not listesi**.
- Lead notu: sol şerit + “Lead” etiketi.

**Kim ne yapar (MVP)**
- Her giriş yapan: `team` / `all` not bırakabilir, kendi notunu silebilir.
- Okuma: aynı ekip veya `all`.

**Akış**
1. Node pin’e tıkla.
2. Kısa yazım + Enter / Ekle; görünürlük seçimi.
3. Liste: en yeni üstte.

**İlk sürüm (MVP) — landed**
- Mock API (`/api/services/:id/notes`, `/api/notes/counts`) + session user.
- UI: node badge + popover listesi.

**Bilerek sonra**
- Pin / resolve, mentions (@kişi), dosya eki, CR’ye bağlama, e-posta bildirimi.
- Lead’in başkasının notunu sabitlemesi.
