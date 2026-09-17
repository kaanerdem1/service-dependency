# `web/src` — modül haritası (Türkçe)

Bu dosya **hangi klasörün ne işe yaradığını** ve **içindeki dosyaların birbirine nasıl bağlandığını** özetler. Ayrıntılı alt rehberler klasör içinde `rehber.md` veya `README.md` olarak durur.

| Klasör | Ne tutar | Detay |
|--------|----------|--------|
| `App.tsx`, `appNavPersist.ts` | Uygulama kabuğu, yüzey (Servis/DWH), persist | `navigation/rehber.md`, `components/shell/rehber.md` |
| `navigation/` | Seçim, geçmiş, drawer, süreç açma hook’ları | `navigation/rehber.md` |
| `components/shell/` | Masthead, sidebar, workspace JSX | `components/shell/rehber.md` |
| `components/workflows/` | İş akışları drawer parçaları | `components/workflows/rehber.md` |
| `components/process/` | Süreç haritası dokümantasyonu | `components/process/rehber.md` |
| `components/` (kök) | Harita, süreç UI, katalog, modallar | `components/rehber.md` |
| `snapshot/` | Snapshot paketi, iz, PDF | `snapshot/rehber.md` |
| `impact/` | Etki haritası layout yardımcıları | `impact/rehber.md` |
| `motion/` | Animasyon / motion bileşenleri | `motion/rehber.md` |
| `ui/` | Küçük paylaşılan UI (Button, Field) | `ui/rehber.md` |
| `styles/` | CSS dilimleri (`App.css` @import) | `web/ARCHITECTURE.md` |
| `dwh/` | DWH yüzeyi (ayrı ekip; burada refactor yok) | — |
| `api/`, `auth/`, `mock/` | HTTP istemci, yetki, mock veri | `api/client.ts` üst yorum |

**Veri akışı (Servis yüzeyi):** `api/client` → hook’lar (`navigation/*`, `useServiceStageData`) → `shell/*` → kullanıcı. **Süreç haritası:** `api` process flow → `useProcessFlowPage` → `ProcessFlowPage` → Map veya RouteBuilder.

Ürün belgeleri: [docs/PRODUCT.md](../docs/PRODUCT.md), [docs/process-flow.md](../docs/process-flow.md).
