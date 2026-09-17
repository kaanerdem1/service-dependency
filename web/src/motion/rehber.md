# `motion/` — animasyon katmanı

**Ne değil:** İş mantığı veya API yok. **Ne:** [Framer Motion](https://motion.dev/) / `motion/react` ile tekrar kullanılan animasyonlu UI parçaları — servis kabuğu ve haritada ortak “his”.

Servis ekranı CSS’i ayrıca `styles/*.css` ve `styles/App.css` içinde; motion bileşenleri **React tarafında** geçiş, liste, modal, sekme animasyonunu üstlenir.

## Bileşen grupları

| Grup | Dosyalar | Nerede |
|------|----------|--------|
| Hover / pin | `MorphHover.tsx`, `MorphHoverButton.tsx` | Sidebar rail, yüzey switch |
| Geri bildirim | `MotionToast.tsx`, `MotionBanner` (varsa), `StatusBadge.tsx` | App hata bandı, ağaç rozetleri |
| Modal / sheet | `MotionModal.tsx`, `MotionSheet.tsx`, `MotionDrawer.tsx` | CR, inbox, yardım |
| Sekmeler | `StageTabs.tsx`, `StageTabPanels.tsx` | `ServiceStage` sekmeleri |
| Liste | `MotionList.tsx`, `MotionListItem` | Arama sonuçları, sidebar |
| Harita | `DockMagnifyRow.tsx` | `service-map/ImpactChrome` |
| Yardımcı | `AnimatedNumber.tsx`, `AutoHeight.tsx`, `MotionPopover.tsx`, `MotionTooltip.tsx`, `MotionSpotlight.tsx`, `SkeletonShimmer.tsx`, `TreeAccordion.tsx`, `MotionProgress.tsx` | Çeşitli |
| Sabitler | `config.ts` | Süre, spring, easing |

DWH yüzeyi kendi CSS’ini kullanır; motion’dan seçici import edebilir.

Kabuk: [components/shell/rehber.md](../components/shell/rehber.md) · Harita: [service-map/rehber.md](../components/service-map/rehber.md).
