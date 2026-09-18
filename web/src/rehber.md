# `web/src` — frontend’in tam haritası

**İlk kez bakıyorsan:** ekran parçaları için [components/rehber.md](./components/rehber.md) (ekran → klasör tablosu). Mimari özet: [docs/web-architecture.md](../../docs/web-architecture.md).

## Kök dosyalar (sayfa açılışı)

| Dosya | Kullanıcıya etkisi |
|-------|-------------------|
| `main.tsx` | Uygulamayı tarayıcıya mount eder, tema |
| `App.tsx` | Görünen sayfa iskeleti (ince); asıl wiring → `app/` |
| `app/useServiceCatalogShell.ts` | Servis kataloğu state ve effect’lerin çoğu |
| `appNavPersist.ts` | Sekme yenileyince son seçimi hatırlama |
| `types.ts` | API ile UI arasında ortak veri şekilleri |
| `theme.ts` | Açık/koyu tema adı, localStorage |

## Klasörler — “ekranda ne?” özeti

| Klasör | Ekranda karşılığı | rehber |
|--------|-------------------|--------|
| `components/` | Gördüğün neredeyse her UI parçası | [components/rehber.md](./components/rehber.md) |
| `navigation/` | Tıklama/klavye sonucu (görünmez mantık) | [navigation/rehber.md](./navigation/rehber.md) |
| `stores/` | Favoriler, rotalar, iş akışları kayıtları | [stores/rehber.md](./stores/rehber.md) |
| `styles/` | Renk, boşluk, sekme görünümü | [styles/rehber.md](./styles/rehber.md) |
| `api/` | Sunucuya giden istekler | [api/rehber.md](./api/rehber.md) |
| `impact/` | Harita düğüm yerleşimi (canvas arkası) | [impact/rehber.md](./impact/rehber.md) |
| `snapshot/` | CR / harita / süreç PDF paketleri | [snapshot/rehber.md](./snapshot/rehber.md) |
| `motion/` | Geçiş animasyonları (sidebar, modal) | [motion/rehber.md](./motion/rehber.md) |
| `dwh/` | Üst bardan **DWH** sekmesi | [dwh/rehber.md](./dwh/rehber.md) |
| `search/` (components) | ⌘K | [components/search/rehber.md](./components/search/rehber.md) |
| `shortcuts/` | Drawer kısayol etiket metinleri | [shortcuts/rehber.md](./shortcuts/rehber.md) |
| `ui/` | DWH ve bazı formlarda küçük kit | [ui/rehber.md](./ui/rehber.md) |
| `auth/` | “Yazma yetkisi var mı?” kontrolleri | [auth/rehber.md](./auth/rehber.md) |
| `mock/` | Demo veri (normalde API kullanılır) | [mock/rehber.md](./mock/rehber.md) |
| `tests/` | Otomatik regresyon testleri | [tests/rehber.md](./tests/rehber.md) |

Repo kökündeki `dwh/` klasörü örnek dump / legacy Python — UI değil → [dwh/rehber.md](../../dwh/rehber.md).

Ürün kapsamı: [docs/PRODUCT.md](../../docs/PRODUCT.md).
