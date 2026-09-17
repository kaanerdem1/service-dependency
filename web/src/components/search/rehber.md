# Arama ve ⌘K — modül grubu

Komut paleti ve arama sonuç satırları. ## Dosya → rol

| Dosya | Rol |
|-------|-----|
| `CommandPalette.tsx` | ⌘K modal — servis/süreç/jar arama |
| `SearchHitsPortal.tsx` | Hit listesini body’ye portal |
| `SearchHitLabel.tsx` | Sonuç satırı başlık |
| `SearchHitContent.tsx` | Sonuç satırı gövde |

## Bağlantılar

- Render: `shell/AppShellOverlays.tsx`
- Klavye: `navigation/useCommandPaletteKeyboard.ts`
- Seçim: `navigation/useServiceSelection.ts`, `useProcessFlowNav.ts`
- Sık kullanılanlar: `serviceRecents.ts`

CSS: `styles/cmdk.css`.

