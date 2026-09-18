# `server/scripts` — **operasyon** (geliştirici / DBA)

**Ekranda:** Doğrudan UI yok; terminalden çalıştırınca katalog veya süreç verisini düzeltir — sonuç bir sonraki sayfa yenilemede görünür.

| Komut / script | Sonuç ekranda |
|----------------|---------------|
| `npm run ingest:process-par` | Süreç drawer’ında gerçek BPM listesi (XML DB’ye) |
| `npm run verify:process-catalog` | (log) katalog tutarlılık |
| `npm run audit:process-parse` | (log) parse denetimi |
| `npm run backup:inventory-db` | Yerel PG yedek dosyası |

Otomatik test: `npm run test --prefix server`. Kurulum: [README.md](../../README.md).
