/**
 * Süreç akışı — domain ve UI parçaları (Faz 3).
 *
 * Tam akış = tüm BPM grafını gezmek (`ProcessFlowMap`).
 * Akış rotası = kullanıcının seçtiği adım zinciri (`processUserRoute` +
 * `ProcessFlowRouteBuilder`). İkisi aynı XML grafını kullanır; kayıtlı rota
 * localStorage’dadır (`processRouteStore.ts`).
 *
 * | Dosya | Rol |
 * |-------|-----|
 * | `processUserRoute.ts` | Rota state: ziyaret, auto-advance, geri/ileri |
 * | `processPathNarrative.ts` | Yol → PDF anlatım adımları |
 * | `processRouteStore.ts` (`web/src/`) | Kayıtlı rotalar |
 * | `useProcessFlowPage.ts` | Graf yükleme + tam akış / rota modu |
 * | `ProcessFlowPage.tsx` | İnce orchestrator (Map vs RouteBuilder) |
 * | `processFlowCamera.ts` | Tam akış kamerası (start / frame) |
 * | `useProcessFlowHover.ts` | Hover + sürükleme vurgusu |
 * | `processFlowCanvasLayout.ts` | Eski KTF keşif canvas yerleşimi |
 * | `useSaveProcessRoute.ts` | Rota kaydet + PDF snapshot |
 *
 * Ayrıntı: [docs/process-flow.md](../../../docs/process-flow.md)
 */
