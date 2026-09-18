/**
 * Süreç akışı — domain ve UI parçaları (Faz 3).
 *
 * Tam akış = tüm BPM grafını gezmek (`processFlowMap/ProcessFlowMapCore`, export `ProcessFlowMap.tsx`).
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
 * Modül haritası (TR): [rehber.md](./rehber.md)
 * Kaynak dosyalar bu klasörde. Üst harita: [docs/web-module-layout.md](../../../../docs/web-module-layout.md).
 */
