# Sol panel (sidebar) — modül grubu

Sidebar **iskeleti** (`ModuleSidebar`, pin, drawer) → `shell/ModuleSidebar.tsx`. **İçerik parçaları** bu klasörde.

## Dosya → rol → kim render eder

| Dosya | Rol | Üst bileşen |
|-------|-----|-------------|
| `ModuleTree.tsx` | Proje → jar → servis ağacı, seçim | `shell/ModuleSidebar` |
| `ShortcutsPanel.tsx` | Favoriler drawer içeriği | `ModuleSidebar` (Favoriler) |
| `FavoriteStarButton.tsx` | Servis satırında yıldız | `ModuleTree`, arama hit’leri |
| `SidebarHoverTip.tsx` | Dar rail’de hover ipucu | `ModuleSidebar` |
| `TreeKindIcon.tsx` | Ağaç düğüm ikonu (proje/jar/servis) | `ModuleTree` |
| `TreeOptionsRadial.tsx` | Ağaç satırı radial menü | `ModuleTree` |
| `useModuleTreeKeyboard.ts` | Klavye ile ağaç gezinme | `ModuleTree` |

## Drawer (aynı sidebar kolonu, farklı grup)

İş akışları içeriği → [workflows/rehber.md](../workflows/rehber.md) (`WorkflowsPanel.tsx` + `workflows/*`).

## Navigasyon / state

- Seçim: `navigation/useServiceSelection.ts`
- Drawer açık: `navigation/useNavDrawers.ts`
- Genişlik / pin: `navigation/useSidebarLayout.ts`
- Favoriler: `useServiceFavorites.ts`

CSS: `styles/shell.css` (`.sidebar`, drawer, rail).

Arama hit satırları: [search/rehber.md](../search/rehber.md) (`ShortcutsPanel` → `SearchHitLabel`).
