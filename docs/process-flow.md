# Süreç katalogu — tam akış ve kullanıcı rotası

PAR / jBPM XML **inventory_db**’den gelir (`env.process`). Arayüzde iki mod vardır: grafiğin tamamını gezmek (**tam akış**) ve kendi adım adım yolunu kaydetmek (**akış rotanı oluştur**).

**Bağlantılar:** [PRODUCT.md](./PRODUCT.md) · ingest sorunları [db.md §13](./db.md#13-process-xml--db-eski-hale-döndü--tabloya-yazılmıyor) · kalıcılık [catalog-persistence.md](./catalog-persistence.md)

---

## 1. Tam akış (`ProcessFlowMap` / `processFlowMap/`)

İnce export: `ProcessFlowMap.tsx` · gövde: `processFlowMap/ProcessFlowMapCore.tsx` — [processFlowMap/rehber.md](../web/src/components/process/processFlowMap/rehber.md).

**Nereden açılır:** Modül ağacı → Process sekmesi, sol paneldeki süreç listesi (İş akışları), arama.

**Ne yaparsın:**

- Katmanlı layout; düğümde hover veya tıklama ile yol vurgusu (path focus) veya komşuluk modu.
- Sağ **Detay** çekmecesi: gelen/giden geçişler, ekranlar, servise git, alt süreç. Düğüm başlık/metin notları **`node_descriptions`** kolonunda (DB); kayıt `PATCH /api/processes/:no/node-descriptions`.
- **Snapshot:** Seçili düğüme kadar yol → PDF (`processPathSnapshot.ts`).
- Haritaya **yapışkan not** ekleme — konum ve metin şimdilik tarayıcıda (`processFlowNotes.ts`); DB planı [catalog-persistence.md §5](./catalog-persistence.md#5--süreç-haritası-yapışkan-notları).

**Akış Rotanı Oluştur** ile rota moduna geçersin (aşağı).

---

## 2. Akış rotanı oluştur (`ProcessFlowRouteBuilder`)

| Adım | Davranış |
|------|-----------|
| Başlangıç | Yeni oturum; yalnız start düğümü (yarım kalan taslak otomatik devam etmez) |
| İlerleme | Canvas’taki hayalet oklardan geçiş seç; yatay **occurrence** zinciri |
| Gezinme | Geri / ileri; üst **breadcrumb** (`ProcessFlowRouteBar`) ile atlama |
| Kaydet | **Kaydet** — açık kaydın üzerine yazar; **Farklı kaydet** — yeni id |
| Durum | Kayıt sonrası rota **completed** sayılır |
| Saklama | Bugün `localStorage` (`processRouteStore.ts`); hedef `process_user_route` — bkz. [catalog-persistence §4](./catalog-persistence.md#4--akış-rotaları) |
| Liste | Sol panel → **İş akışları** → **Akış Rotaları** |

---

## 3. Kod referansı

| Konu | Dosya |
|------|--------|
| Sayfa / mod geçişi | `web/src/components/process/ProcessFlowPage.tsx` |
| Rota state | `web/src/components/process/processUserRoute.ts` |
| PDF anlatım | `web/src/components/process/processPathNarrative.ts` |
| Düğüm açıklamaları (API) | `server/src/inventory/processNodeDescriptions.ts` |
| XML parse | `server/src/inventory/parProcessParser.ts` |
| Akış API | `server/src/inventory/processFlowService.ts` |
| Testler | `server/src/inventory/processUserRoute.test.ts` |

---

## 4. Layout backlog (tam akış)

- Uzun katman atlayan kenarlar için kanal / dummy-node routing.
- Karar düğümünde çoklu ok port yayılımı.
- Çok katmanlı layout’ta ek barycenter iterasyonu.

Örnek süreç numaraları için ekip içi smoke listesi: repo kökünde `ss.md` (varsa, gitignore).
