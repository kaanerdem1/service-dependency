# Yeni audit

## Kaynaklar (kullanıcı)

- [Motion examples — cursor kategorisi](https://motion.dev/examples?utm_source=chatgpt.com&category=cursor)
- [Animate UI docs](https://animate-ui.com/docs)
- [Morphin — Animated Dashboard Chart UI](https://morphin.dev/components/animated-dashboard-chart-ui) · [Morphin ana sayfa](https://morphin.dev/)
- [Morphin — Animated Expandable Card Stack](https://morphin.dev/components/animated-expandable-card-stack)
- [21st.dev community components](https://21st.dev/community/components)

---

## Animasyon taraması (ürün: servis katalog + etki haritası)

Projede şu an **Motion / Framer Motion yok**; animasyonlar CSS. Aşağıdaki öneriler ya `motion` ekleyerek ya da aynı pattern’i CSS/layoutId denkliğiyle kopyalayarak alınabilir. Hedef: katalog/etki analizi okunabilirliği — pazarlama hero / shader / custom cursor değil.

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

**Tamamlanan:** tab pill (`layoutId`), layout (sidebar/drawer/katman), AnimatedNumber, liste enter/exit, tooltip spring, skeleton, ağaç accordion, dialog animasyonları. Paket: `motion` (`web/src/motion/*`).

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



### 2. Animate UI

Kaynak: [Introduction](https://animate-ui.com/docs) · [Components](https://animate-ui.com/docs/components)  
shadcn registry + Tailwind + Motion. NPM paketi değil: **kopyala, stillerimizi uygula**. Tailwind yoksa primitive’lerin motion kısmını alıp CSS token’lara bağlamak gerekir.

**Alınabilir:**

1. **Tabs (kaydırılan içerik + spring)** — Harita ↔ İlişkiler (şu an CSS `translateX`)
  - [Tabs component](https://animate-ui.com/docs/components/animate/tabs)
2. **Tooltip (layout morph, delay)** — ağaç + dock tooltipleri tek sistem
  - [Tooltip](https://animate-ui.com/docs/components/animate/tooltip)  
  - [Tooltip primitive](https://animate-ui.com/docs/primitives/animate/tooltip)
3. **Accordion / Collapsible** — Proje → Jar → Servis ağacı
  - [Radix Accordion](https://animate-ui.com/docs/components/radix/accordion)
4. **Sidebar + SidebarRail** — hover-expand + kilitle (şu anki rail’e en yakın hazır parça)
  - [Animated Sidebar (shadcn + Animate UI)](https://animate-ui.com/docs/components/radix/sidebar)  
  - Tüm sidebar’ı rewrite etme; **rail + width spring** fikirlerini al.
5. **Sheet** — Etki Özeti sağ panel (aç/kapa, daralt)
  - Changelog’da Radix Sheet primitive: [Changelog](https://animate-ui.com/docs/changelog)
6. **Counter** — blast radius sayıları
  - [Changelog — Counter primitive](https://animate-ui.com/docs/changelog)
7. **AutoHeight** — arama dropdown, proje filtresi popover, özet gövde
  - [AutoHeight](https://animate-ui.com/docs/primitives/effects/auto-height)
8. **Dialog / Popover / Progress** — talep modal, proje filtresi, katman yükleme
  - [Changelog](https://animate-ui.com/docs/changelog)

**Alınmamalı:**

- Backgrounds (gravity stars vb.) — harita canvas’ı zaten dolu  
- Animated Lucide icon set’in tamamı — her satırda icon bounce okumayı bozar  
- Cursor primitive — Motion cursor ile aynı sebep

---



### 3. [Morphin.dev](http://Morphin.dev)

Kaynak: [morphin.dev](https://morphin.dev/)  
Çoğu kart **“Pro users only”**. Doğrudan kopya değil; görsel referans.

**Alınabilir (ilham / gerekirse Pro):**

1. **Motion System Dock Navigation** — dock’a en yakın örnek (tab transition, height, scrollable panel)
  - [Dock navigation](https://morphin.dev/components/motion-system-dock-navigation-component-for-react-and-framer-motion)  
  - Bizim dock: zoom/katman/yan bağ. MacOS “app dock magnification” değil; **ikon scale-on-hover + panel height** bakılabilir.
2. **Animated Status Badge with Table** — İlişkiler listesi / talep inbox satır durumu
  - [Ana sayfa listesinde](https://morphin.dev/)
3. **Animated Navbar Menu with Morphing Hover** — üst Geri/İleri + sekme pill
  - [Ana sayfa listesinde](https://morphin.dev/)

**Alınmamalı (ürün özü değil):**

- [Animated Dashboard Chart UI](https://morphin.dev/components/animated-dashboard-chart-ui) — line/progress SaaS dashboard; lineage haritası chart değil  
- [Animated Expandable Card Stack](https://morphin.dev/components/animated-expandable-card-stack) — galeri/stack; servis ağacı değil  
- 3D Work Showcase, Scroll Text Reveal, Team Cards, Currency Converter, File Upload — başka ürün

**Kısmi:**

- Customer Support Agent Dashboard / AI Workspace — inbox + metrik kart layout ilhamı; animasyon öncelikli değil

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

**Motion.dev maddeleri tamamlandı.** Sırada:

1. **Dock hover scale (hafif)** — 21st Dock Tabs / Morphin dock; magnification abartma
2. **Animate UI** maddeleri (§2) — gerekirse Tabs/Tooltip/Sheet kaynaklarından ince ayar
3. **21st / Morphin** (§3–4) — dock, drawer, sidebar ilhamları

Bağımlılık: `motion` paketi kurulu. `prefers-reduced-motion`: sayı tick ve liste stagger sadeleşir.





FARKLI NOKTAYA ÖNERİ: 

harita görünümünde yeni bir node'a tıklayınca onu merkeze alırken kayan animasyonun ardından keskin bir geçiş oluyor onu yumuşatmak laızm, 