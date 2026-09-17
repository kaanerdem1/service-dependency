/**
 * Süreç akışı — rota domain’i (Faz 3a).
 *
 * Tam akış = tüm BPM grafını gezmek (`ProcessFlowMap`).
 * Akış rotası = kullanıcının seçtiği adım zinciri (`processUserRoute` +
 * `ProcessFlowRouteBuilder`). İkisi aynı XML grafını kullanır; kayıtlı rota
 * localStorage’dadır (`processRouteStore.ts`).
 *
 * | Dosya (bir üst klasör) | Rol |
 * |------------------------|-----|
 * | `processUserRoute.ts` | Rota state: ziyaret, auto-advance, geri/ileri |
 * | `processPathNarrative.ts` | Yol → PDF anlatım adımları |
 * | `processRouteStore.ts` (`web/src/`) | Kayıtlı rotalar |
 * | `ProcessFlowPage.tsx` | Tam akış / rota modu geçişi |
 *
 * Ayrıntı: [docs/process-flow.md](../../../docs/process-flow.md)
 */
