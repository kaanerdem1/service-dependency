# `workflows/` — **İş akışları** sol drawer’ı

**Ekranda:** Sol panelden **“İş akışları”** (veya kısayol) ile açılan çekmece — süreç arama, öne çıkan BPM listesi, kayıtlı **Akış Rotaları**, kendi klasörlerinde tuttuğun iş akışları.

**Not:** Drawer’da sürece tıklayınca orta alanda açılan **büyük BPM canvas** → [process/rehber.md](../process/rehber.md). Drawer’da bir iş akışına tıklayınca açılan **tam sayfa editör** → [workflow-stage/rehber.md](../workflow-stage/rehber.md).

| Dosya | Ekranda nereye karşılık gelir | Ne işe yarar |
|-------|------------------------------|--------------|
| `WorkflowsPanel.tsx` | Drawer’ın tamamı | Sekmeler, arama, listeleri bir araya getirir |
| `WorkflowsSearch.tsx` | Drawer üstündeki arama kutusu | Süreç / katalog araması |
| `ProcessCatalogList.tsx` | “Süreçler” listesi (featured vb.) | Bir süreç no’ya tıklayınca tam akış açılır |
| `ProcessRoutesPanel.tsx` | “Akış Rotaları” bölümü | Daha önce kaydettiğin adım adım yollar |
| `ProcessRouteDialogs.tsx` | Rota yeniden adlandır / sil onayı | Modal (portal) |
| `WorkflowFolderBlock.tsx` | Klasör + alt akış ağacı | Sürükle-bırak ile düzenleme |
| `WorkflowDropZone.tsx` | Klasörler arası bırakma alanı | Sürükle-bırak hedefi |

Veri: `stores/workflowStore.ts` (iş akışları), `stores/processRouteStore.ts` (rotalar). CSS: `styles/workflows-drawer.css`.

Süreç açma mantığı: `navigation/useProcessFlowNav.ts`. Ürün: [docs/process-flow.md](../../../docs/process-flow.md).
