# `workflow-stage/` — kayıtlı iş akışı tam sayfa

**Drawer değil** — sol panelden bir iş akışı klasörü/akışı seçilince orta sütunda tam ekran akış editörü.

| Dosya | Rol | Kim kullanır |
|-------|-----|--------------|
| `WorkflowInfoPage.tsx` | Sayfa iskeleti, başlık, `WorkflowFlowCanvas` | `ServicesMainStage` |
| `WorkflowFlowCanvas.tsx` | Adım kartları, kenarlar, servis arama, mock alanlar | `WorkflowInfoPage`, drawer içi önizleme yolları |
| `WorkflowStepReorder.tsx` | Sürükle-bırak adım sırası | `WorkflowsPanel`, `WorkflowFolderBlock` |
| `WorkflowIcons.tsx` | Klasör / dal ikonları (`WorkflowFolderGlyph`, `GitBranchIcon`) | Drawer + katalog chip |

**Veri:** `web/src/workflowStore.ts` (localStorage).

**Drawer ile ilişki:** Aynı store; drawer parçaları → [workflows/rehber.md](../workflows/rehber.md). Drawer’da düzenleme → burada tam canvas.

Bağımlılıklar: [sidebar/TreeKindIcon](../sidebar/TreeKindIcon.tsx), [search/SearchHitLabel](../search/SearchHitLabel.tsx), [catalog/ServiceChangeLog](../catalog/ServiceChangeLog.tsx) (değişiklik rozeti).
