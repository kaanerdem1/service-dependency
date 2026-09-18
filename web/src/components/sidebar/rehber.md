# `sidebar/` — sol panelin **içeriği**

**Ekranda:** Sol taraftaki **modül ağacı** (proje → jar → servis), satırlardaki **yıldız (favori)**, daraltılmış rail’de **hover ipuçları**. Sidebar’ın dış çerçevesi (genişlik, pin) → `shell/ModuleSidebar.tsx`.

**İş akışları drawer’ının iç listeleri** bu klasörde değil → [workflows/rehber.md](../workflows/rehber.md).

| Dosya | Ekranda nereye karşılık gelir | Ne işe yarar |
|-------|------------------------------|--------------|
| `ModuleTree.tsx` | Sol ağacın kendisi | Tıklayınca servis/jar seçimi, aç/kapa dallar |
| `FavoriteStarButton.tsx` | Ağaç satırı veya arama sonucundaki yıldız | Favorilere ekle/çıkar |
| `ShortcutsPanel.tsx` | “Favoriler” drawer içi | Pinlediğin servislerin listesi |
| `TreeKindIcon.tsx` | Satır başı ikon | Proje / jar / servis ayrımı |
| `TreeOptionsRadial.tsx` | Satır üzerinde radial menü | Ek ağaç aksiyonları |
| `SidebarHoverTip.tsx` | Sidebar dar iken fareyle üstüne gelince | Tam isim / kısa açıklama |
| `useModuleTreeKeyboard.ts` | (klavye) | Ok tuşlarıyla ağaçta gezinme |

Seçim ve drawer açık/kapalı: [navigation/rehber.md](../../navigation/rehber.md). CSS: `styles/shell.css`, `tree.css`.
