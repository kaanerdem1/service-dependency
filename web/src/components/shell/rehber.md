# `shell/` — sayfa iskeleti (kabuk)

**Ekranda:** Uygulamanın “çerçevesi” — üst masthead, sol sidebar kolonu, ortadaki büyük içerik alanı. Seçtiğin servise göre orta alan **katalog**, **harita**, **süreç** veya **iş akışı** ekranına döner; kabuk aynı kalır.

Burada **seçim state’i tutulmaz**; `App.tsx` ve `navigation/*` hook’ları veriyi prop olarak verir.

Komşular: [sidebar/](../sidebar/rehber.md), [workflows/](../workflows/rehber.md), [search/](../search/rehber.md), [overlays/](../overlays/rehber.md)

| Dosya | Ekranda nereye karşılık gelir | Ne işe yarar |
|-------|------------------------------|--------------|
| `AppMasthead.tsx` | En üst şerit | Servis/DWH switch, tema, inbox ikonu |
| `SurfaceSwitch.tsx` | Masthead’de “Servis” / “DWH” | İki farklı uygulama yüzeyi arası geçiş |
| `ThemeSwitch.tsx` | Masthead’de tema düğmesi | Açık/koyu tema |
| `ServicesWorkspace.tsx` | Sol panel + orta sütunun birleşimi | Servis kataloğu ana layout |
| `ModuleSidebar.tsx` | Sol sütun | Ağaç, drawer tetikleyicileri, favoriler/iş akışları alanı |
| `ServicesMainStage.tsx` | Orta büyük alan | Seçime göre welcome / servis stage / süreç / iş akışı sayfası |
| `ServiceStage.tsx` | Bir servis seçiliyken orta alan | Üst sekmeler (Genel bakış, Harita, …), breadcrumb ziyaret yolu |
| `StageVisitPath.tsx` | Servis stage üstünde küçük yol çubuğu | Haritada gezindiğin düğümler arası geri/ileri |
| `AppShellOverlays.tsx` | Sayfanın üstünde (modal katman) | ⌘K paleti, CR/inbox pencereleri, toast |
| `useServicesWorkspaceProps.ts` | (görünmez) | Sidebar + stage’e giden prop’ları App’ten toplar |
| `useAppShellOverlaysProps.ts` | (görünmez) | Overlay modallarına giden prop’ları toplar |
| `sidebarIcons.tsx` | Drawer başlık ikonları | SVG ikon seti |

CSS: `styles/shell.css`. Navigasyon kuralları: [navigation/rehber.md](../../navigation/rehber.md).
