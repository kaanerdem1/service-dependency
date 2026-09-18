# `motion/` — **animasyonlu** geçişler

**Ekranda:** Sidebar pin olurken yumuşak kayma, sekme değişince fade, modal açılışında hareket — “hissiyat”; veri veya iş kuralı yok.

| Grup | Nerede fark edersin | Dosyalar |
|------|---------------------|----------|
| Hover / pin | Sol rail, yüzey switch | `MorphHover`, `MorphHoverButton` |
| Toast / rozet | Hata bandı, ağaç rozetleri | `MotionToast`, `StatusBadge` |
| Modal / sheet | CR, inbox | `MotionModal`, `MotionSheet`, `MotionDrawer` |
| Sekmeler | Servis stage sekmeleri | `StageTabs`, `StageTabPanels` |
| Liste | ⌘K sonuçları | `MotionList` |
| Harita dock | Zoom satırı | `DockMagnifyRow` |
| Diğer | Sayı animasyonu, skeleton | `AnimatedNumber`, `SkeletonShimmer`, … |
| Ayar | (görünmez) | `config.ts` — süre, easing |

Servis ekranı stilleri ayrıca `styles/*.css`. DWH kendi CSS’ini kullanır.

Kabuk: [shell/rehber.md](../components/shell/rehber.md).
