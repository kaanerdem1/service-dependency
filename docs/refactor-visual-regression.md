# CSS / kabuk — manuel smoke (isteğe bağlı)

Refactor bitti; bu liste **yeni CSS PR’larında** veya büyük stil taşımasından sonra hızlı göz kontrolü içindir. Otomasyon yok — Playwright screenshot diff ileride ayrı issue olabilir.

Hard refresh (`Cmd+Shift+R`). Temalar: **mixed** ve **white**.

## Önce bak

| Alan | Ne bozulursa | Kod grubu (rehber) |
|------|----------------|---------------------|
| Masthead, sidebar rail, drawer (Favoriler / İş akışları) | `shell.css`, `workflows-drawer.css` | `shell/`, `sidebar/`, `workflows/` |
| Servis etki haritası, tam ekran harita, ziyaret yolu | `service-map.css` | `service-map/rehber.md` |
| Süreç haritası / rota modu | `process-flow.css` | `process/rehber.md` |
| ⌘K | `cmdk.css` | `search/rehber.md` |

## Import zinciri (`App.css`)

1. `process-flow.css`  
2. `service-map.css`  
3. `shell.css`  
4. `workflows-drawer.css`  
5. `cmdk.css`  

Bir `@import` eksikse ilgili bölüm **tamamen stilsiz** görünür.

## Kısa akış

1. Servis seç → Harita / Tablo / sekmeler  
2. İş akışları drawer → süreç aç → (105116 dışında) otomatik layout  
3. Pin kaldır → fare sidebar’da kal → çıkınca rail  
4. DWH yüzeyine geç (lineage açılır)

**Yapılacak zorunlu iş yok** — sadece regresyon şüphesinde bu listeyi kullan.
