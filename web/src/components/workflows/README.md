# `components/workflows/` — İş akışları drawer'ının parçaları

Bu klasör, `WorkflowsPanel.tsx` içinden çıkarılan **sunum (presentational)**
bileşenlerini barındırır. State (hangi grup açık, filtre metni, hangi rota
siliniyor) hâlâ `WorkflowsPanel.tsx` içinde merkezi tutulur; buradaki
bileşenler yalnızca prop alıp render eder.

| Dosya | Ne gösterir | Kimden veri alır |
|-------|-------------|-------------------|
| `ProcessCatalogList.tsx` | "SÜREÇLER" bölümü — öne çıkan/aranan BPM süreçleri | `pocProcesses` (API: `listPocProcesses`) |
| `ProcessRoutesPanel.tsx` | "AKIŞ ROTALARI" bölümü — BPM'e göre gruplu kayıtlı rotalar, filtre | `processRouteStore.ts` (localStorage) |
| `ProcessRouteDialogs.tsx` | Rota "yeniden adlandır" / "sil" onay modalleri (body portal) | `pendingRename` / `pendingDelete` state'i |
| `WorkflowsSearch.tsx` | Drawer arama kutusu + süreç/servis sonuçları | `WorkflowsPanel` arama state'i |
| `WorkflowDropZone.tsx` | Sürükle-bırak hedefi | `workflowStore` MIME + drag peek |
| `WorkflowFolderBlock.tsx` | Akış takibi klasör/akış ağacı | `workflowStore` + üst callback'ler |

**Neden state burada değil?** Aktif süreç/rota bilgisi (`processFlowNo`,
`activeRouteId`) drawer'ı açan üst bileşenden (`App.tsx`) geliyor; "hangi BPM
grubu açık" kararı da bu bilgiye bağlı. Tek yerde tutmak, "seçince rota
listesi neden kayıyor/kaymıyor" gibi soruların cevabını tek dosyada
aranabilir kılıyor (bkz. `../../processRouteStore.ts` üstündeki not).

**İlgili:** [../../../../docs/refactor-plan.md](../../../../docs/refactor-plan.md) — Faz 2.
