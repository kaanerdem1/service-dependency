# Service Dependency

Servis bağımlılığı + değişiklik onay ürünü.

## Mimari

```
web/      → React (Vite) UI
server/  → Node (Express) API  · 
```

UI `/api/*` çağırır; Vite dev proxy → `http://127.0.0.1:4000`.

### Kodda nereye bakmalı?


| Konu                                | Dosya                                    |
| ----------------------------------- | ---------------------------------------- |
| API rotaları                        | `server/src/index.ts`                    |
| Servis bağımlılığı (`affectsEdges`) | `server/src/data.ts`                     |
| Method + call-graph                 | `server/src/methods.ts`                  |
| Servis etki BFS                     | `server/src/impact.ts`                   |
| Talep / onay / inbox                | `server/src/changeRequests.ts`           |
| UI kabuk                            | `web/src/App.tsx`                        |
| Servis haritası                     | `web/src/components/ImpactMap.tsx`       |
| Method haritası                     | `web/src/components/MethodImpactMap.tsx` |
| Domain tipleri                      | `web/src/types.ts`                       |


Mock’u yeniden üretmek: `python3 scripts/gen_mock_catalog.py`

## Çalıştırma

İki terminal:

```bash
# API
cd server
npm install
npm run dev
```

```bash
# UI
cd web
npm install
npm run dev
```

UI: [http://127.0.0.1:5173](http://127.0.0.1:5173) · API: [http://127.0.0.1:4000/api/health](http://127.0.0.1:4000/api/health)

Dokümanlar: `docs/ServiceDependency.md`, `docs/UI_UX_GEREKSINIMLER.md`, `docs/ONAY_ZINCIRI_SENARYOLAR.md`