# `components/workflows/` — İş akışları drawer parçaları

**Drawer grubu:** `WorkflowsPanel.tsx` (state + composition) ve parça bileşenler bu klasörde. Sidebar iskeleti: [shell/ModuleSidebar.tsx](../shell/ModuleSidebar.tsx).

Süreç **canvas** drawer değil → [process/rehber.md](../process/rehber.md). İş akışı **tam sayfa** → [workflow-stage/rehber.md](../workflow-stage/rehber.md).

| Dosya | Rol | Veri / store |
|-------|-----|--------------|
| `WorkflowsPanel.tsx` | Drawer composition + state | `workflowStore`, `processRouteStore`, API arama |
| `ProcessCatalogList.tsx` | Süreç listesi (featured + scroll) | API süreç katalog |
| `ProcessRoutesPanel.tsx` | BPM “Akış Rotaları” grupları | `processRouteStore.ts` |
| `ProcessRouteDialogs.tsx` | Rename / sil (portal) | `processRouteStore` |
| `WorkflowsSearch.tsx` | Drawer arama kutusu | API search |
| `WorkflowFolderBlock.tsx` | Klasör ağacı bloğu | `workflowStore.ts` |
| `WorkflowDropZone.tsx` | Sürükle-bırak hedefleri | `workflowStore` |

App navigasyon: süreç/rota açma → `navigation/useProcessFlowNav.ts` (`openProcessFlow`, `openProcessRoute`).

CSS: `styles/workflows-drawer.css` (`sc-*` sınıfları).

Detay: `workflows/README.md` (varsa) ve [docs/process-flow.md](../../../docs/process-flow.md).
