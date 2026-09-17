# `components/workflows/` — İş akışları drawer parçaları

Ana bileşen: `../WorkflowsPanel.tsx` (composition). Drawer `ModuleSidebar` içinde açılır.

| Dosya | `WorkflowsPanel` içinde | Veri / store |
|-------|-------------------------|--------------|
| `ProcessCatalogList.tsx` | Süreç listesi (featured + scroll) | API süreç katalog |
| `ProcessRoutesPanel.tsx` | BPM “Akış Rotaları” grupları | `processRouteStore.ts` |
| `ProcessRouteDialogs.tsx` | Rename / sil (portal) | `processRouteStore` |
| `WorkflowsSearch.tsx` | Drawer arama kutusu | API search |
| `WorkflowFolderBlock.tsx` | Klasör ağacı bloğu | `workflowStore.ts` |
| `WorkflowDropZone.tsx` | Sürükle-bırak hedefleri | `workflowStore` |

App navigasyon: süreç/rota açma → `navigation/useProcessFlowNav.ts` (`openProcessFlow`, `openProcessRoute`).

CSS: `styles/workflows-drawer.css` (`sc-*` sınıfları).

Detay: `workflows/README.md` (varsa) ve [docs/process-flow.md](../../../docs/process-flow.md).
