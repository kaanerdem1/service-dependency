# Süreç haritası (BPM) — modül rehberi

Kaynak graf: sunucu `GET /api/processes/:no/flow` (PAR/XML parse). İki kullanım modu: **tam akış** (tüm graf) ve **akış rotası** (kullanıcının seçtiği yol). Ürün: [docs/process-flow.md](../../../docs/process-flow.md).

Drawer’dan süreç açma: [workflows/rehber.md](../workflows/rehber.md). Servis haritası **ayrı grup**: [service-map/rehber.md](../service-map/rehber.md).

## Otomatik çizim vs referans dosyası

| Süreç | Layout |
|-------|--------|
| **105116 (KTF)** | `processFlowReferenceLayout.ts` — onaylı HTML’den **sabit x/y** ve bazı ok tipleri; üzerine `ProcessFlowMap` fan/spread düzeltmeleri |
| **Diğer tüm `no`** | `ProcessFlowMap` içinde `layeredLayout()` — katmanlı otomatik yerleşim, `classifyRoute()` ile direct/jump/back |

Yani `processFlowReferenceLayout.ts` “her BPM için” değil; **tek referans süreci** için duruyor. Yeni süreçler XML’den gelir, koordinat dosyası gerekmez.

**Başka BPM’de referans dosyası işe yarar mı?** Hayır — sözlük anahtarları KTF düğüm **adları/id’leri**. Başka `no` için kod referansa hiç bakmaz; yalnızca `layeredLayout` + `classifyRoute` çalışır. İleride başka süreç için piksel referans istenirse: ayrı dosya + `ProcessFlowMap` içinde `graph.no === '…'` koşulu (KTF modeli).

**Karışık süreçleri denemek için** (İş akışları drawer → süreç ara; yerel DB örnekleri):

| `no` | ~düğüm | Türkçe ad (katalog) | Layout |
|------|--------|---------------------|--------|
| `105116` | 217 | KTF Düzenleme | **Referans** (`processFlowReferenceLayout`) |
| `105118` | 207 | Teminat Mektubu Güncelleme | Otomatik `layeredLayout` |
| `105131` | 182 | G.Nakdi Kredi Kullandırım | Otomatik |
| `105119` | 174 | Iskonto KTF oluşturma | Otomatik |
| `105113` | 158 | KRM Düzenleme | Otomatik |
| `105801` | 15 | CRD TCMB policy (featured) | Otomatik, küçük graf |
| `105251` | 32 | CRD pricing delete (featured) | Otomatik |

Görsel fark: yalnızca **`105116`** onaylı HTML koordinatlarına oturur; diğer tüm `no` değerleri aynı canvas kodunu kullanır, konumlar algoritmadan gelir (kalabalık grafiklerde oklar sıkışabilir — o zaman o süreç için ayrı referans dosyası + `graph.no` koşulu gerekir, KTF gibi).

## Dosya → kim çağırır

```
App / useProcessFlowNav
  → ProcessFlowPage (useProcessFlowPage)
       ├─ processFlowNo + !routeId → ProcessFlowMap (tam akış)
       └─ routeId veya rota modu   → ProcessFlowRouteBuilder
```

| Dosya | Ne yapar | Kim kullanır |
|-------|----------|--------------|
| `useProcessFlowPage.ts` | Flow API, rota modu, `ProcessFlowPage` state | `ProcessFlowPage.tsx` |
| `ProcessFlowPage.tsx` | Map / RouteBuilder / drawer iskeleti | `ServicesMainStage` |
| `ProcessFlowMap.tsx` | Tam graf canvas, notlar, arama, snapshot | `ProcessFlowPage` |
| `ProcessFlowRouteBuilder.tsx` | Prefix rotası, geçiş seçimi, kaydet | `ProcessFlowPage` |
| `ProcessFlowCanvas.tsx` | Kademeli keşif (hover ile açılan alt graf) | Eski/alternatif UI yolları |
| `processFlowReferenceLayout.ts` | KTF koordinat + rota override | **Yalnızca** `ProcessFlowMap` when `no===105116` |
| `processFlowCamera.ts` | Start/frame odak, fitView | `ProcessFlowMap`, keşif canvas |
| `processFlowCanvasLayout.ts` | Keşif canvas kolon yerleşimi | `ProcessFlowCanvas` |
| `useProcessFlowHover.ts` | Hover komşuluk, sürükleme | Map + Canvas |
| `processFlowIds.ts` | Sink/dummy id yardımcıları | Map, drawer, layout |
| `processUserRoute.ts` | Rota ziyaret listesi, ileri/geri | RouteBuilder, drawer rotalar |
| `processPathNarrative.ts` | Yol → anlatım adımları (PDF) | Snapshot, kayıtlı rota |
| `useSaveProcessRoute.ts` | Kaydet / farklı kaydet / PDF | RouteBuilder |
| `processRouteStore.ts` (`web/src/`) | localStorage rotalar | Workflows drawer, App nav |
| `ProcessFlowDetailDrawer.tsx` | Düğüm detay + not (PATCH node-descriptions) | Map, RouteBuilder |
| `ProcessFlowRouteBar.tsx` | Rota adım şeridi | RouteBuilder |
| `ProcessFlowMapSearch.tsx` | Harita içi arama | Map |
| `processFlowDrawerNav.ts` | Gelen/giden geçiş listesi | Drawer, Map |
| `processFlowTransitionServices.ts` | Geçiş etiketlerinden servis ipuçları | Map kenarları |
| `processFlowNotes.ts` | Yapışkan notlar (local) | Map |
| `processFlowSummary.ts` | Graf özeti metin | Map UI |
| `processFlowMapSearchMatch.ts` | Arama eşleme | MapSearch |
| `ProcessFlowScreens.tsx` | Süreç ekranları listesi | Detail drawer |
| `ProcessNodeServicePreview.tsx` | Düğümde servis önizleme | Map node |
| `ProcessHighLevelView.tsx` / `processHighLevel.ts` | Yüksek seviye özet (KTF demo) | Ayrı görünüm |
| `KtfHtmlFlow.tsx` | Eski HTML iframe demo | Nadiren / referans |

## Sunucu tarafı (okuma)

`server/src/inventory/processFlowService.ts`, `parProcessParser.ts` — web bu rehberin dışında; sadece API sözleşmesi `web/src/api/client.ts` ve `types.ts` `ProcessFlowGraph`.

## Yeni kod nereye?

- Tam akış davranışı → `ProcessFlowMap.tsx` veya `processFlowCamera.ts`
- Rota modu kuralı → `processUserRoute.ts`
- Yeni süreç için layout → genelde **hiçbir yere sabit koordinat ekleme**; KTF gibi istisna gerekiyorsa ayrı `referenceLayout` + `graph.no` koşulu
