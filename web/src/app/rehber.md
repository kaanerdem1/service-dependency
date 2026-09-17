# `web/src/app`

Ana kabuğun **state / effect / prop wiring** katmanı.

| Dosya | Rol |
| --- | --- |
| `useServiceCatalogShell.ts` | Eski `App.tsx` gövdesi; hook olarak export edilir |
| `App.tsx` (üst dizin) | Layout, masthead, workspace, overlay JSX |

Yeni özellik eklerken: iş mantığı ve hook’lar burada veya `navigation/` / `stores/` altında; `App.tsx` mümkün olduğunca sade kalsın.
