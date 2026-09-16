# Süreç katalogu — tam akış ve kullanıcı rotası

PAR / jBPM XML inventory’den gelir (`env.process`). UI’da iki mod vardır: **tüm grafiği gezmek** ve **kendi adım adım rotanı kaydetmek**.

Ürün bağlamı: [PRODUCT.md](./PRODUCT.md) · Veri / ingest: [db.md §13](./db.md#13-process-xml--db-eski-hale-döndü--tabloya-yazılmıyor)

---

## 1. Tam akış (`ProcessFlowMap`)

**Nereden açılır:** Modül ağacı → Process sekmesi, iş akışları panelindeki süreç listesi, arama.

**Ne yaparsın:**

- Katmanlı layout; düğüm hover / tık ile **path focus** veya komşuluk vurgusu.
- Drawer: gelen ve giden geçişler, ilişkili ekranlar, servise git, alt süreç.
- **Snapshot:** Seçili düğüme kadar yol → PDF (yılan düzeni, `processPathSnapshot.ts`).
- Haritaya **not** ekleme (konum localStorage’da; DB kalıcılığı planı [db.md §14](./db.md#14-ortak-katalog--kalıcılık-localstorage-yerine-db)).

**Buton:** **Akış Rotanı Oluştur** → rota moduna geçer (aşağı).

---

## 2. Akış rotanı oluştur (`ProcessFlowRouteBuilder`)

| Adım | Davranış |
|------|-----------|
| Başlangıç | Sıfırdan; yalnız start düğümü (taslak oturumu devam etmez) |
| İlerleme | Canvas’taki hayalet seçeneklerden geçiş seç; yatay **occurrence** zinciri |
| Gezinme | Geri / ileri imleç; üst **breadcrumb** (`ProcessFlowRouteBar`) ile atlama |
| Kaydet | **Kaydet** — açık kaydın üzerine yazar veya yeni id; **Farklı kaydet** — yeni kayıt |
| Durum | Kayıt sonrası rota **`completed`** sayılır (Taslak ayrımı UI’da yok) |
| Saklama | `localStorage` — `web/src/processRouteStore.ts` |
| Liste | Sol panel → **İş akışları** → **Akış Rotaları** |

---

## 3. Kod referansı

| Konu | Dosya |
|------|--------|
| Sayfa / mod geçişi | `web/src/components/ProcessFlowPage.tsx` |
| Rota state makinesi | `web/src/components/processUserRoute.ts` |
| PDF anlatım metni | `web/src/components/processPathNarrative.ts` |
| XML parse | `server/src/inventory/parProcessParser.ts` |
| API | `server/src/inventory/processFlowService.ts` |
| Testler | `server/src/inventory/processUserRoute.test.ts` |

---

## 4. Layout backlog (tam akış)

- Uzun katman atlayan kenarlar için kanal / dummy-node routing.
- Karar düğümünde çoklu ok port yayılımı.
- Çok katmanlı layout’ta ek barycenter iterasyonu.

Örnek süreç notları: [ss.md](../ss.md)
