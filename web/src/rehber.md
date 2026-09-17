# `web/src` — modül haritası

**İlk okuma (UI):** [components/rehber.md](./components/rehber.md) · **Mimari özet:** [docs/web-architecture.md](../../docs/web-architecture.md)

## Kökte kalan dosyalar (bilinçli)

Giriş noktası ve paylaşılan tipler — her biri tek sorumluluk:

| Dosya | Rol |
|-------|-----|
| `main.tsx` | React mount, tema, `SnapshotTrailProvider` |
| `App.tsx` | İnce kabuk (JSX); wiring → `app/useServiceCatalogShell.ts` |
| `app/` | [app/rehber.md](./app/rehber.md) |
| `appNavPersist.ts` | `sessionStorage` navigasyon okuma/yazma |
| `types.ts` | Paylaşılan TS tipleri (API ↔ UI) |
| `theme.ts` | Tema adı (`AppTheme`), `localStorage` |

Büyük CSS artık **`styles/`** altında (`App.css`, `index.css`, `responsive.css` + dilimler).

## Alt klasörler

| Klasör | Ne tutar | rehber |
|--------|----------|--------|
| `components/` | Ekran parçaları (domain alt klasörleri) | [components/rehber.md](./components/rehber.md) |
| `navigation/` | App hook’ları (seçim, geçmiş, drawer) | [navigation/rehber.md](./navigation/rehber.md) |
| `stores/` | localStorage store modülleri | [stores/rehber.md](./stores/rehber.md) |
| `shortcuts/` | Panel kısayol etiketleri / favori listesi | [shortcuts/rehber.md](./shortcuts/rehber.md) |
| `motion/` | Animasyon bileşenleri (Framer Motion) | [motion/rehber.md](./motion/rehber.md) |
| `styles/` | Global CSS ve feature dilimleri | [docs/web-architecture.md](../../docs/web-architecture.md) § CSS |
| `impact/` | Servis haritası layout math | [impact/rehber.md](./impact/rehber.md) |
| `snapshot/` | Snapshot izi, PNG/PDF | [snapshot/rehber.md](./snapshot/rehber.md) |
| `ui/` | Küçük form/kart kit | [ui/rehber.md](./ui/rehber.md) |
| `dwh/` | DWH React yüzeyi | [dwh/rehber.md](./dwh/rehber.md) |
| `api/`, `auth/`, `mock/` | HTTP istemci, yetki, demo veri | `api/client.ts` üst yorum |

## `motion/` kısaca

Animasyon **katmanı** — sidebar pin, sekmeler, modallar, liste geçişleri. İş kuralı yok; detay: [motion/rehber.md](./motion/rehber.md).

## Repo kökü `dwh/`

Stage dump, ER JSON, eski `lineage_app` örneği → [dwh/rehber.md](../../dwh/rehber.md) (React kodu `web/src/dwh/`).

Ürün: [docs/PRODUCT.md](../../docs/PRODUCT.md)
