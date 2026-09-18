# `server/src` — **API** (tarayıcının arkası)

**Ekranda:** Kullanıcı doğrudan görmez; sol **ağaç**, **harita**, **süreç canvas**, **DWH** ekranları `:4000` üzerindeki bu kodun `/api` cevaplarıyla dolar. Vite dev’de istekler proxy ile buraya gider.

## İstek akışı (basit)

```
Tarayıcı /api/...  →  createApp()
                        ├─ /api/dwh/*     → dwh/
                        └─ diğer /api/*   → routes/
```

| Dosya | UI’da neyi besler |
|-------|-------------------|
| `createApp.ts` | Tüm API’nin giriş kapısı |
| `startServer.ts` | Port dinleme, env |
| `data.ts` | Mock modda demo ağaç (`CATALOG_SOURCE=mock`) |
| `impactGraph.ts` | Harita sekmesi etki grafı |
| `notes.ts` | Servis notları |
| `changeRequests.ts` | Inbox / değişiklik talebi |
| `methods.ts` | Metod listesi (mock dal) |

## Alt klasörler

| Klasör | Ekrana karşılık | rehber |
|--------|-----------------|--------|
| `routes/` | Her `/api/...` uç tanımı | [routes/rehber.md](./routes/rehber.md) |
| `inventory/` | Gerçek PG katalog + BPM XML | [inventory/rehber.md](./inventory/rehber.md) |
| `dwh/` | DWH sekmesi verisi | [dwh/rehber.md](./dwh/rehber.md) |
| `lib/` | Mock vs inventory seçimi | [lib/rehber.md](./lib/rehber.md) |

## Test ve bakım

```bash
npm run test --prefix server
```

Bakım scriptleri: [scripts/rehber.md](../scripts/rehber.md).

Kurulum: [README.md](../../README.md) · Tablolar: [docs/db.md](../../docs/db.md).
