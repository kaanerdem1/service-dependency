# `welcome/` — boş orta sahne

Kullanıcı henüz servis, süreç veya klasör seçmemişken `ServicesMainStage` bu klasörü gösterir.

| Dosya | Rol |
|-------|-----|
| `WelcomeScreen.tsx` | Adım listesi + spotlight; `WelcomePreview` kartlarını döner |
| `WelcomePreview.tsx` | Her tur adımı için mini illüstrasyon / metin |

**Kim açar:** `shell/ServicesMainStage.tsx` — `!hasSelection` iken.

**State yok** — tamamen sunum; navigasyon App / sidebar’dan gelir.

Kabuk: [shell/rehber.md](../shell/rehber.md) · Üst harita: [components/rehber.md](../rehber.md)
