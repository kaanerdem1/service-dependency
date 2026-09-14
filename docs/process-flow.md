# Process katalogu — tam akış ve kullanıcı rotası

> Ürün özeti: [PRODUCT.md](./PRODUCT.md) · Test servisleri: [ss.md](../ss.md)

Süreç tanımı (jBPM / PAR XML) inventory’den gelir; UI’da **tam grafik** ve **adım adım kendi rotanı oluşturma** iki mod olarak sunulur.

---

## Tam akış (`ProcessFlowMap`)

- Süreç ağacından veya aramadan açılır; katmanlı layout, path focus, alt süreç / servis drill-down.
- Düğüm seçilince drawer: gelen/giden geçişler, ekranlar, **Snapshot** (PDF).
- Snapshot: seçili düğüme kadar yol, `exportProcessPathSnapshotPdf` — görsel **yılan (snake)** düzeni; uzun yollar satır kırarak aşağı iner (`web/src/snapshot/processPathSnapshot.ts`).

---

## Akış rotanı oluştur (`ProcessFlowRouteBuilder`)

- Tam akış ekranındaki **Akış Rotanı Oluştur** ile açılır; **sıfırdan** başlar (yalnız başlangıç düğümü, taslak oturumu devam etmez).
- Kullanıcı canvas’taki hayalet düğümlerden geçiş seçer; rota yatay occurrence zinciri olarak çizilir.
- **Geri / İleri** cursor; breadcrumb (`ProcessFlowRouteBar`) ile adım seçimi ve kamera.
- **Kaydet** diyaloğu:
  - **Kaydet** — kayıtlı rota açıksa aynı kaydın üzerine yazar; yoksa yeni kayıt.
  - **Farklı kaydet** — yeni id (orijinal durur); yalnız kayıtlı rota varken ve adım/ad kayıtlıdan farklıysa aktif.
- Kayıtlar `localStorage` (`web/src/processRouteStore.ts`); sol panel **Akış Rotaları** (`WorkflowsPanel`).

---

## Kod referansı

| Konu | Dosya |
|------|--------|
| Sayfa / mod geçişi | `web/src/components/ProcessFlowPage.tsx` |
| Rota state makinesi | `web/src/components/processUserRoute.ts` |
| PDF adım metni | `web/src/components/processPathNarrative.ts` |
| XML parse | `server/src/inventory/parProcessParser.ts` |
| API | `server/src/inventory/processFlowService.ts` |
| XML DB onarımı | [db.md §13](./db.md#13-process-xml--db-eski-hale-döndü--tabloya-yazılmıyor) |
| Unit testler | `server/src/inventory/processUserRoute.test.ts` |

---

## Açık iyileştirmeler (layout)

Tam akış haritasında hâlâ backlog:

- Uzun katman atlayan kenarlar için dummy-node / kanal routing (spagetti azaltma).
- Karar düğümünde aynı noktadan giren/çıkan okların port yayılımı.
- Çok katmanlı layout’ta ek barycenter iterasyonları.

Detay ve örnek süreç notları: [ss.md](../ss.md) (backlog bölümü).
