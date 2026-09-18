# `search/` — **⌘K** komut paleti

**Ekranda:** Klavyede **⌘K** (Windows’ta Ctrl+K) ile açılan ortadaki arama penceresi — servis, jar, süreç ararsın; Enter ile seçince ilgili ekrana gidersin.

| Dosya | Ekranda | Ne işe yarar |
|-------|---------|--------------|
| `CommandPalette.tsx` | Modal’ın tamamı | Arama kutusu, sonuç listesi, kapat |
| `SearchHitsPortal.tsx` | Sonuç listesinin DOM yeri | Taşmayı önlemek için body’ye portal |
| `SearchHitLabel.tsx` | Her sonuç satırının başlığı | Servis/süreç adı, tür rozeti |
| `SearchHitContent.tsx` | Satır alt metni | Yol, jar, ek ipucu |

Kim açar: `shell/AppShellOverlays.tsx`. Klavye: `navigation/useCommandPaletteKeyboard.ts`. CSS: `styles/cmdk.css`.

Son seçilenler: `stores/serviceRecents.ts`.
