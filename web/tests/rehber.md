# `web/tests`

Node **tsx test runner** — saf TS modülleri, React mount yok.

```bash
npm run test --prefix web
# veya repo kökü: npm test
```

| Dosya | Ne doğrular |
| --- | --- |
| `processFlowMapBuildGraph.test.ts` | `processFlowMap/buildGraph` — layout, highlight |
| `processFlowExtract.test.ts` | Süreç metin / extract yardımcıları |
| `swimlaneProjection.test.ts` | Swimlane projeksiyon |
| `appShellHelpers.test.ts` | `navigation/appShellHelpers` |

Sunucu smoke + inventory testleri: [server/src/rehber.md](../../server/src/rehber.md).
