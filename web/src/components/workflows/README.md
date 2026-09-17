# `components/workflows/` — İş akışları drawer'ının parçaları

Bu klasör **`WorkflowsPanel.tsx`** (composition + state) ve ondan çıkarılan
**sunum** parçalarını barındırır. Parça bileşenler prop alıp render eder;
drawer state merkezi olarak `WorkflowsPanel.tsx` içindedir.

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

**İlgili:** [rehber.md](./rehber.md) · Süreç canvas: [process/rehber.md](../process/rehber.md) · Layout planı: [docs/web-module-layout.md](../../../../docs/web-module-layout.md)
