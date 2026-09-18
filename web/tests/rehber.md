# `web/tests` — **otomatik** regresyon testleri

**Ekranda:** Hiçbir şey; geliştirici `npm test` çalıştırınca layout ve yardımcı fonksiyonların bozulmadığını kontrol eder.

```bash
npm run test --prefix web
# veya repo kökü: npm test
```

| Test dosyası | Ne korur (kullanıcı etkisi) |
|--------------|----------------------------|
| `processFlowMapBuildGraph.test.ts` | Süreç haritası düğüm/ok layout’u |
| `processFlowExtract.test.ts` | Süreç metin çıkarma |
| `swimlaneProjection.test.ts` | Swimlane hesabı |
| `appShellHelpers.test.ts` | Navigasyon yardımcıları |

Sunucu testleri: [server/src/rehber.md](../../server/src/rehber.md).
