# `overlays/` — üstte açılan **modallar**

**Ekranda:** Masthead’deki **inbox** veya değişiklik talebi akışından açılan pencereler — ekran karartılır, ortada form/liste. Issue yönetiminin tamamı dış sistemde; burada katalog içi **talep + snapshot** desteği var.

| Dosya | Ekranda ne açılır | Ne işe yarar |
|-------|-------------------|--------------|
| `InboxPanel.tsx` | Gelen kutusu listesi | Bekleyen talepler |
| `ChangeRequestModal.tsx` | Değişiklik talebi formu | Snapshot paketi ekle, gönder |
| `RequestDetailModal.tsx` | Tek talebin detayı | Snapshot listesi, indirme |
| `NewServiceRequestModal.tsx` | Yeni servis talebi | Boş talep oluştur |

Hepsi `shell/AppShellOverlays.tsx` üzerinden. State: `navigation/useInboxAndChangeRequests.ts`.

Snapshot üretimi: [snapshot/rehber.md](../../snapshot/rehber.md). CSS: `styles/overlays.css`.
