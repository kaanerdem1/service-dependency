# `workflow-stage/` — **kayıtlı iş akışı** tam sayfa

**Ekranda:** Sol **İş akışları** drawer’ından bir klasör/akış seçince orta sütunda açılan **tam ekran editör** — adım kartları, aralarında oklar, sürükle-bırak sıra. Drawer’daki küçük önizleme değil; asıl düzenleme burada.

| Dosya | Ekranda | Ne işe yarar |
|-------|---------|--------------|
| `WorkflowInfoPage.tsx` | Sayfa başlığı + canvas alanı | İş akışı meta, geri link |
| `WorkflowFlowCanvas.tsx` | Adım kartları ve bağlantılar | Servis arama, mock alanlar, düzenleme |
| `WorkflowStepReorder.tsx` | Sürükle-bırak sıra | Drawer veya listede adım taşıma |
| `WorkflowIcons.tsx` | Klasör/dal ikonları | Drawer ağacında görsel |

Veri: `stores/workflowStore.ts` (tarayıcı localStorage). Drawer parçaları: [workflows/rehber.md](../workflows/rehber.md).

CSS: `styles/workflow-stage.css`, `workflow-canvas.css`.
