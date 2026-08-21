# Yeni audit

## Kaynaklar (kullanıcı)

- [Motion examples — cursor kategorisi](https://motion.dev/examples?utm_source=chatgpt.com&category=cursor)
- [Animate UI docs](https://animate-ui.com/docs)
- [Morphin — Animated Dashboard Chart UI](https://morphin.dev/components/animated-dashboard-chart-ui) · [Morphin ana sayfa](https://morphin.dev/)
- [Morphin — Animated Expandable Card Stack](https://morphin.dev/components/animated-expandable-card-stack)
- [21st.dev community components](https://21st.dev/community/components)

---

## Animasyon taraması (ürün: servis katalog + etki haritası)

Projede `motion` kurulu (`web/src/motion/*`). Animate UI’nin çoğu maddesi Motion.dev ile **aynı primitive** — ayrı “Animate UI paketi” görsel fark yaratmaz.

### Özet (ne alınır, ne alınmaz)


| Kaynak                                                                           | Ürüne değer  | Not                                                         |
| -------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------- |
| Motion.dev (layout, tabs, number, list, loading)                                 | Yüksek       | Cursor kategorisi düşük                                     |
| Animate UI (Tabs, Accordion, Tooltip, Collapsible, Counter, Sidebar, AutoHeight) | Yüksek       | Copy-paste, Tailwind varsayımı var                          |
| Morphin (dock, chart, card stack)                                                | Orta (ilham) | Çoğu **Pro paywall**; chart/card stack çekirdek ürüne uymaz |
| 21st.dev community                                                               | Seçici       | Sidebar/drawer/dock faydalı; hero/shader/AI chat faydasız   |


---

### 1. [Motion.dev](http://Motion.dev) — ✅ uygulandı (2026-08-21)

Kaynak: [Motion examples](https://motion.dev/examples)

**Tamamlanan:** tab pill (`layoutId`), layout (sidebar/drawer/katman), AnimatedNumber, liste enter/exit, tooltip spring, skeleton, ağaç accordion, dialog animasyonları. Paket: `motion` (`web/src/motion/`*).

**Hâlâ alınmamalı (cursor + dekoratif):**

- [Cursor: trail](https://motion.dev/examples/react-cursor-trail), [trail velocity](https://motion.dev/examples/react-cursor-trail-velocity)
- [Magnetic filings](https://motion.dev/examples/react-magnetic-filings), [Magnetic target](https://motion.dev/examples/react-cursor-magnetic)
- [iOS pointer](https://motion.dev/examples/react-ios-pointer) — Motion+; harita pan ile çatışır
- [Cursor: Follow / Multi-follow](https://motion.dev/examples/react-cursor-follow)
- [Bobble hover](https://motion.dev/examples/react-bobble-hover)

**İleride ilham (düşük öncelik):**

- [Create Button](https://motion.dev/examples/react-create-button) — “Değişiklik talebi” expand menü
- [Floating Action Button](https://motion.dev/examples/react-floating-action-button) — tam ekran / dock grip

---

### 2. Animate UI — ⚠️ Motion.dev ile örtüşüyor

**Fark yok sayılır:** Tabs pill, Tooltip, Accordion, Counter, Dialog → zaten §1’de var.  
**Gerçekten farklı olan:** AutoHeight (arama listesi), Popover (proje filtresi) — bunlar wrapper; görsel etki sınırlı.

---

### 3. Morphin.dev — ✅ denendi (2026-08-21)

**Uygulanan (§1’den farklı, test edilebilir):**

1. **Dock magnification** — harita dock ikonları hover’da scale + yukarı kalkma (`DockBtn`)
2. **Animated Status Badge** — inbox’ta pulse rozetler (`StatusBadge`)
3. **Navbar morph hover** — sekme üzerinde kayarak morph arka plan (`MorphHoverIndicator`)

**Ayrıca (audit notu + kullanıcı geri bildirimi):**

- ~~Pivot settle~~ — geri alındı (daha kötü hissettirdi); orijinal morph + snap
- **Sidebar overlay** — hover’da panel workspace’i itmeden `translate3d` ile kayar (76px sabit layout)
- **Değişiklik talebi** — oturum açıksa her serviste (tek kullanıcı)

**Alınmamalı:** Dashboard chart, card stack, 3D showcase.

---

### 4. 21st.dev community

Kaynak: [Community components](https://21st.dev/community/components)

**Alınabilir:**

1. **Animated Sidebar** — hover/collapse (önceki audit’teki 21st sidebar ile aynı aile)
  - [sidebar-001](https://21st.dev/@unlumen/components/sidebar-001)  
  - [SidebarShowcase](https://21st.dev/@ruixen.ui/components/sidebar-showcase)
2. **Animated Drawer** — Etki Özeti / metod paneli
  - [Animated Drawer (newest)](https://21st.dev/community/components)  
  - [Drawer (Vaul)](https://21st.dev/@sshahaider/components/drawer) — yön: sağ panel
3. **Dock Tabs** — harita alt dock ikon hover (magnify)
  - [Dock Tabs](https://21st.dev/@designali-in/components/dock-tabs)  
  - Uyarı: 10 renkli app ikonu demo; **sadece hover scale + gap** al, ikon setini kopyalama.
4. **Expandable Content Card** — servis seçilince özet kartı
  - [Community newest](https://21st.dev/community/components)
5. **Animated Status Badge** (Morphin’deki ile aynı iş) — 21st “Features / UI” içinde aranabilir; inbox satırları

**Alınmamalı (katalog ürününe zarar):**

- Scroll media expansion hero, Container Scroll, Spline Scene, Spotlight Card, Background Paths, Liquid Glass/Neon/Rainbow button, Shader/Siri Wave  
- AI Chat / Agent Dock / V0 chat — ürün APM chatbot değil  
- Testimonials, Pricing, Marquee text

---

### 5. Uygulama önceliği (bu repo)

1. **Pivot settle ince ayar** — radial mod, fitView padding
2. **21st drawer** (§4)
3. **Status badge** — İlişkiler listesine genişlet

FARKLI NOKTAYA ÖNERİ: 



Sol üstteki ikon ve ürün adı üst ortaya alınıp soldaki modüller kısmı biraz daha yukarı taşınabilir ? 