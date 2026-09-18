# Web UI — `components/` klasör düzeni

**`web/src/components/`** ekrana göre parçalanmıştır: dosya adı aramak yerine **hangi UI alanını** değiştirdiğine göre klasöre gir.

Ana giriş: [web/src/components/rehber.md](../web/src/components/rehber.md)  
Üst harita: [web/src/rehber.md](../web/src/rehber.md)

---

## Nereye bakmalı?

| Soru | Konum |
|------|--------|
| Seçim, geçmiş, drawer state? | `web/src/navigation/` + `App.tsx` |
| Sidebar + orta sütun iskeleti? | `components/shell/` |
| Harita, BPM, katalog, ⌘K, …? | Aşağıdaki domain klasörü |
| Boş liste / snapshot listesi? | `components/shared/` |

`components/` **kökünde `.tsx` yok** — yalnızca `README.md` ve `rehber.md`.

---

## Alt klasörler

| Klasör | Kullanıcının gördüğü | Giriş bileşeni |
|--------|----------------------|----------------|
| `shell/` | Masthead, workspace, sekme iskeleti | `ServicesWorkspace`, `ServiceStage` |
| `sidebar/` | Modül ağacı, favoriler parçaları | `ModuleTree`, `ShortcutsPanel` |
| `workflows/` | “İş akışları” drawer | `WorkflowsPanel` |
| `welcome/` | Seçim yokken orta sahne / tur | `WelcomeScreen` |
| `workflow-stage/` | İş akışı tam sayfa editörü | `WorkflowInfoPage` |
| `process/` | BPM haritası ve kayıtlı rotalar | `ProcessFlowPage` · canvas: `processFlowMap/` |
| `service-map/` | Servis ve metod etki haritası | `ImpactMap` / `impactMap/`, `MethodImpactMap` / `methodImpactMap/` |
| `catalog/` | Servis detay sekmeleri, tablo | `ServiceCatalogPanels`, … |
| `search/` | Komut paleti (⌘K) | `CommandPalette` |
| `overlays/` | CR, inbox, talep modalları | `AppShellOverlays` importları |
| `shared/` | `EmptyState`, `SnapshotList` | Katalog + overlays |

Her klasörde **`rehber.md`**: dosya listesi, kim import eder, store/CSS notları.

---

## `components/` dışı (ilgili katmanlar)

| Yol | Rol |
|-----|-----|
| `navigation/` | Hook’lar: seçim, geçmiş, drawer, süreç açma |
| `impact/` | Harita yerleşim matematiği (`service-map/` kullanır) |
| `snapshot/` | İz, PNG/PDF |
| `motion/` | Animasyon sarmalayıcıları |
| `styles/` | `App.css` @import dilimleri — [styles/rehber.md](../web/src/styles/rehber.md) |
| `api/`, `auth/`, `mock/` | HTTP istemci, yetki, demo — ilgili `rehber.md` |
| `tests/` | tsx unit testler — [tests/rehber.md](../web/tests/rehber.md) |
| `dwh/` | DWH yüzeyi (bu ağacın dışında) |

---

## Not

Modüler bölme **2026-09-17** tamamlandı. Yeni kod, ekran alanının sahibi **domain klasörüne** eklenir.
