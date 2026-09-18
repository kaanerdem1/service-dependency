# Refactor / CSS — test senaryoları

Otomatik: repo kökünde `npm test` (server route registry + web unit testleri).

## Otomatik (her CSS / route diliminden sonra)

```bash
npm test
cd web && npm run build
```

| Test | Ne kanıtlar |
|------|-------------|
| `catalogRoutes.registry.test.ts` | 47 katalog HTTP ucu kayıtlı |
| `processFlowMapBuildGraph.test.ts` | Süreç layout / buildGraph regresyonu |
| Diğer server/web testleri | Parser, rota store, app shell |

## Manuel smoke — servis kataloğu

1. `npm run devall` — API + web ayakta.
2. Hard refresh (`Cmd+Shift+R`).
3. Sol ağaçtan bir **servis** seç → **Genel bakış / bento** kartları düzgün (tur 2: `catalog-bento.css`).
4. **Komşular / etki** sekmeleri — tablo, path filtresi, legend (`stage-neighbors.css`).
5. **Harita** sekmesi — dock zoom/hop, stage chrome, genişlet (`service-map-dock`, `service-map-stage`).
6. **⌘K** arama — hit etiketleri (`cmdk-hit-tags.css`).
7. Snapshot / trail UI varsa (`snapshots-ui.css`).

## Manuel smoke — süreç

1. İş akışları drawer → süreç **105801** (küçük) veya **105116** (KTF).
2. Canvas, arama, drawer, path highlight.
3. (Opsiyonel) PATCH node-descriptions — süreç route split sonrası.

## Manuel smoke — API (süreç route)

```bash
curl -s http://127.0.0.1:4000/api/health | head -c 80
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:4000/api/processes?q=105"
```

Inventory kapalıysa `/api/processes` → 404 `not_available` beklenir.

## Tema / responsive

- `[data-theme='white']` — surface switch, workspace.
- Viewport ~720px ve ~860px — remainder / stage media query’leri.

## Bilinçli kapsam dışı

- Piksel-perfect screenshot CI (yok).
- DWH yüzeyi (`DwhPage.css` ayrı; bu liste servis kataloğu odaklı).
