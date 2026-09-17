# `components/shell/` — uygulama kabuğu (sunum)

State **burada tutulmaz**; `App.tsx` + `navigation/*` hook’ları veriyi prop olarak verir.

| Dosya | App / üst bileşen | Alt bileşenler / not |
|-------|-------------------|----------------------|
| `AppMasthead.tsx` | `App.tsx` | Yüzey switch, tema, inbox rozeti → `SurfaceSwitch`, `ThemeSwitch` |
| `AppShellOverlays.tsx` | `App.tsx` | `CommandPalette`, CR/inbox modalları, toast |
| `ServicesWorkspace.tsx` | `App.tsx` (servis yüzeyi) | `ModuleSidebar` + `ServicesMainStage` |
| `useServicesWorkspaceProps.ts` | `App.tsx` | Sidebar + stage prop nesneleri |
| `useAppShellOverlaysProps.ts` | `App.tsx` | Overlay prop nesnesi |
| `ModuleSidebar.tsx` | `ServicesWorkspace` | `ModuleTree`, `ShortcutsPanel`, `WorkflowsPanel` |
| `ServicesMainStage.tsx` | `ServicesWorkspace` | Welcome, `ProcessFlowPage`, `WorkflowInfoPage`, katalog, `ServiceStage` |
| `ServiceStage.tsx` | `ServicesMainStage` | Sekmeler, `MapStage`, tablolar, katalog panelleri |
| `StageVisitPath.tsx` | `ServiceStage` | Ziyaret breadcrumb → `useVisitHistory.visitSteps` |
| `sidebarIcons.tsx` | `ModuleSidebar`, drawer başlıkları | SVG ikonlar |

CSS: `styles/shell.css` (masthead, sidebar, drawer iskeleti).

Kabuk navigasyon kuralları: `navigation/rehber.md`.
