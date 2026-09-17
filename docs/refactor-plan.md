# Refactor planı — okunabilir kod ve anlaşılır yorumlar

Bu belge, **davranışı bozmadan** kod tabanını parçalara ayırma ve **Türkçe / sade dilde** yorum ekleme yol haritasıdır. Her faz ayrı PR ile gidebilir; büyük “tek seferde her şey” refactor yapılmaz.

**İlgili:** [PRODUCT.md](./PRODUCT.md), [process-flow.md](./process-flow.md), [catalog-persistence.md](./catalog-persistence.md).

---

## 1. Neden refactor?


| Sorun                                                                                  | Etki                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `App.tsx`, `DwhPage.tsx`, `ProcessFlowCanvas.tsx`, `WorkflowsPanel.tsx` binlerce satır | Yeni özellik zor, hata riski yüksek                    |
| `App.css` ~18k satır                                                                   | Stil nerede, hangi ekrana ait belirsiz                 |
| Navigasyon + store + UI aynı dosyada                                                   | “Rota açılınca ne oluyor?” sorusu uzun grep gerektirir |
| Az modül üstü açıklama                                                                 | Onboarding yavaş                                       |


**Hedef:** Bir geliştirici (veya bankacı-teknik PO) dosya adına / üst yoruma bakınca **“bu ne işe yarıyor?”** sorusunu 30 saniyede cevaplayabilsin.

---



## 2. İlkeler (değişmez kurallar)

1. **Davranış önce:** Refactor PR’larında işlev değişikliği yok; gerekiyorsa ayrı feature PR.
2. **Küçük dilimler:** Hedef ~300–800 satırlık dosyalar; tek PR’da 1–3 dosya taşıma.
3. **İsimler Türkçe UI, İngilizce kod:** Değişken/fonksiyon İngilizce kalır; **yorumlar ve modül başlıkları Türkçe** (ekip dili).
4. **Yorum = neden + sınır:** “Ne yaptığı” çoğu zaman koddan okunur; **neden böyle**, **neye dokunmaz**, **hangi API/store** kritik.
5. **Test / smoke:** Süreç rotası, iş akışı drawer, DWH lineage, servis haritası — her faz sonrası kısa manuel smoke ([process-flow.md](./process-flow.md), kök `ss.md` varsa).

---



## 3. Yorum standardı (eklenecek metinler)

Her yeni veya taşınan dosyanın **en üstüne** kısa blok:

```ts
/**
 * [Modül adı — Türkçe]
 *
 * Ne yapar: …
 * Ne yapmaz: …
 * Veri: localStorage / API / props …
 * İlgili ekran: …
 */
```

**Dosya içi:** Sadece

- iş kuralları (ör. “Sadece görünür prefix kaydedilir”),
- sıra / invariant (“Kayıt sırası korunur; seçim listeyi oynatmaz”),
- performans veya UX tuzağı (“Harita her hover’da rebuild edilmez”).

**Yazılmaz:** `// i++`, `// state güncelle`, bariz prop adı tekrarı.

**Store dosyaları:** Storage key, max limit, event adı ve **kim dinler** bir paragrafta.

---



## 4. Mevcut harita (kısa)

```
web/src/
  App.tsx                 — kabuk: yüzey (Servis/DWH), drawer, geçmiş, pivot
  appNavPersist.ts        — sekme / son konum
  processRouteStore.ts    — kayıtlı akış rotaları (localStorage)
  workflowStore.ts        — iş akışı klasör + adımlar
  components/
    ProcessFlow*.tsx      — BPM harita, rota modu, drawer
    WorkflowsPanel.tsx    — iş akışları drawer (süreç, rotalar, takip)
    ModuleTree, Impact*   — servis kataloğu ve etki
  dwh/                    — DWH sayfa, lineage, harita
server/src/
  inventory/              — süreç XML, servis ağacı, katalog
  dwh/                    — lineage API
```

---



## 5. Fazlar



### Faz 0 — Harita ve “README her klasörde” (1 PR, düşük risk)

- [ ] `web/src/components/process/` altında süreç UI’sını toplamak için **boş klasör + README.md** (hangi dosya ne zaman taşınacak listesi).
- [ ] `web/src/features/` veya mevcut yapıda **ARCHITECTURE.md** (web kökünde): yüzeyler, store’lar, event’ler tablosu.
- [ ] `docs/refactor-plan.md` maddelerini issue/PR checklist’e bağla.

**Çıktı:** Yeni gelen “nereye kod yazarım?” sorusunun cevabı.

---



### Faz 1 — `App.tsx` parçalama (2–4 PR) ⏳ 3. adım tamam

**Sorun:** ~2000 satır; navigasyon, süreç rotası, favoriler, DWH geçişi iç içe.

| Taşınacak parça | Hedef | Durum |
|---|---|---|
| Drawer görünürlük (shortcuts, workflows) | `navigation/useNavDrawers.ts` | ✅ Yapıldı |
| Servis geçmişi / breadcrumb (geri/ileri yığını) | `navigation/useVisitHistory.ts` | ✅ Yapıldı |
| Süreç açma / rota açma | `navigation/useProcessFlowNav.ts` | ✅ Yapıldı |
| Render: sadece kabuk | `App.tsx` ~400–600 satır | ⏳ Sonraki adım |

**Yapıldı (1. adım):** `useNavDrawers` — Favoriler/İş akışları drawer state'i, yüzey değişince
kapatma, son açık drawer hafızası (`lastServicesDrawerRef`) ve bu iki panele özel klavye
kısayolları tek dosyaya taşındı. `App.tsx`'teki diğer 20+ çağrı noktası (`setShortcutsOpen(false)`
vb.) aynı isimlerle hook'tan geliyor — davranış birebir korundu, sadece tanım yeri değişti.

**Yapıldı (2. adım):** `useVisitHistory` — Geri/İleri yığını (`history`, `historyIndex`,
`navDirection`), `goBack`/`goForward`/`selectVisitIndex`/`saveMapViewState` ve bunlardan türeyen
`breadcrumb`/`visitSteps`/`visitTrailForCmdk` tek dosyaya taşındı. `history`/`historyIndex`/
`setHistory`/`setHistoryIndex`/`setNavDirection` bilinçli olarak **ham state** olarak dışa açık
bırakıldı (`clearSelection`, `selectPivot`, `selectMethod` gibi fonksiyonlar öncekiyle birebir
aynı şekilde doğrudan güncelliyor) — davranışı hiç değiştirmeden, düşük riskli bir taşıma.

**Yapıldı (3. adım):** `useProcessFlowNav` — Süreç/rota state'i (`processFlowNo`, `processRouteId`,
`processFlowReturn`, `processFlowStack`, `processFlowRestoreNodeId`) ve iş kuralları
(`openProcessFlow`, `openProcessRoute`, `openServiceFromProcessFlow`,
`restoreProcessFlowFromService`, `openSubProcessFromFlow`, `backToParentProcessFlow`,
`dismissProcessFlow`) tek dosyaya taşındı. `selectPivot` ve ziyaret geçmişi setter'ları bu
hook'tan *sonra* tanımlandığı için ref ile bağlandı (`selectPivotRef`, `historyApiRef`) —
önceki `onRestoreProcessFlowRef` deseni buraya taşındı, `App.tsx`'te ayrıca restore ref'i yok.

**Bitti sayılır:** `App.tsx` yalnızca layout + provider + route benzeri dallanma; iş kuralı yok.

---



### Faz 2 — İş akışları drawer (1–2 PR) ✅ ilk adım tamam

**Sorun:** `WorkflowsPanel.tsx` ~1300 satır; süreç listesi, BPM rota grupları, workflow ağacı, arama.

| Parça | Hedef dosya | Durum |
|--------|-------------|-------|
| BPM rota grupları + filtre UI | `components/workflows/ProcessRoutesPanel.tsx` | ✅ Yapıldı |
| Süreç listesi (featured + scroll) | `components/workflows/ProcessCatalogList.tsx` | ✅ Yapıldı |
| Rename/delete dialog | `components/workflows/ProcessRouteDialogs.tsx` (portal) | ✅ Yapıldı |
| Folder ağacı (`FolderBlock`, `DropZone`, arama kutusu) | Şimdilik `WorkflowsPanel.tsx` içinde | ⏳ Sonraki adım |

**Store:** `processRouteStore.ts` zaten ayrı; üst yorum + export grupları net. Bu fazda ayrıca
Türkçe arama filtresindeki **İ/I** büyük/küçük harf hatası (`routeMatchesFilter`) test yazılırken
yakalandı ve `foldTurkish` yardımcı fonksiyonuyla düzeltildi.

**Sonuç:** `WorkflowsPanel.tsx` ~1290 → ~1010 satıra indi (3 yeni dosyaya ~440 satır taşındı).
Her yeni dosyada üst modül yorumu var; state hâlâ `WorkflowsPanel`'de merkezi (bkz.
`components/workflows/README.md`).

**Bitti sayılır (sonraki PR):** `FolderBlock`/`DropZone`/arama kutusu da ayrılınca `WorkflowsPanel`
yalnızca birleştirir (composition).

---



### Faz 3 — Süreç haritası ve rota modu (3–5 PR)

**Sorun:** `ProcessFlowCanvas.tsx`, `ProcessFlowRouteBuilder.tsx`, `ProcessFlowMap.tsx` büyük; state makinesi dağınık.


| Adım | İş                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 3a   | `processUserRoute.ts` + `processPathNarrative.ts` — tek “rota domain” README                         |
| 3b   | Canvas: layout / zoom / hover ayrı modüller (`processFlowCanvasLayout.ts`, `useProcessFlowHover.ts`) |
| 3c   | Route builder: kaydet / snapshot çağrıları tek `useSaveProcessRoute` hook                            |
| 3d   | `ProcessFlowPage.tsx` ince orchestrator                                                              |


**Yorum odağı:** Tam akış vs kayıtlı rota farkı ([process-flow.md](./process-flow.md) ile aynı cümleler).

---



### Faz 4 — DWH (2–4 PR).  --- DWH ELLENMEYECEK.

**Sorun:** `DwhPage.tsx` ~1760 satır; sekmeler, ziyaret geçmişi, lineage panel.


| Parça                 | Hedef                                                          |
| --------------------- | -------------------------------------------------------------- |
| Stage sekmeleri state | `dwh/useDwhStage.ts`                                           |
| Tablo/rapor detay     | `DwhDetailStage.tsx`                                           |
| Kolon lineage         | Zaten `DwhColumnLineagePanel`; “Anlatım modu” gelecekte buraya |
| Harita                | `DwhLineageMap` + layout ayrı                                  |


**Bitti sayılır:** `DwhPage` veri yükleme + sekme koordinasyonu.

---



### Faz 5 — CSS bölme (2–3 PR, görsel regresyon dikkat)

**Sorun:** Tek `App.css`.


| Dosya                         | İçerik                                           |
| ----------------------------- | ------------------------------------------------ |
| `styles/shell.css`            | Sidebar, drawer, masthead                        |
| `styles/process-flow.css`     | PF harita, rota çubuğu                           |
| `styles/workflows-drawer.css` | sc-process-*, sc-route-*                         |
| `styles/dwh.css`              | DWH stage                                        |
| `App.css`                     | `@import` veya Vite’ta `main.tsx` import zinciri |


**Kural:** Taşırken class adı **değiştirilmez** (sadece dosya taşınır).

---



### Faz 6 — Sunucu `inventory/` (1–2 PR)

- [ ] `processFlowService.ts`: featured süreç listesi vs arama — fonksiyon başına 1 satır Türkçe doc.
- [ ] `parProcessParser.ts`: XML → graph; parser adımları numaralı yorum (audit ile uyumlu).
- [ ] Ortak: `processCatalogSchema.ts` “extended vs legacy” tek paragraf.

**Bitti sayılır:** API route dosyası (`index.ts`) ince; iş mantığı service’te.

---



### Faz 7 — Kalıcılık API’leri (refactor değil, feature — sıraya al)

[catalog-persistence.md](./catalog-persistence.md) uygulanırken:

- Client store’lar **adapter** katmanı: `localStorage` → `fetch` aynı arayüz.
- Refactor faz 1–2’deki store ayrımı buna zemin hazırlar.

---



## 6. Öncelik sırası (öneri)

1. **Faz 0 + Faz 2** — Az risk, son dokunduğumuz drawer netleşir.
2. **Faz 1** — En çok günlük geliştirmeyi rahatlatır.
3. **Faz 3** — Süreç ürününün çekirdeği.
4. **Faz 5** — CSS (paralel yapılabilir).
5. **Faz 4** — DWH ayrı ekip/zaman dilimi.
6. **Faz 6–7** — Backend + DB.

---



## 7. PR checklist (her refactor PR’ında)

- [ ] Davranış değişmedi (veya CHANGELOG / process-flow notu).
- [ ] Taşınan dosyada üst modül yorumu var.
- [ ] Kritik invariant için en az bir unit test korundu veya eklendi.
- [ ] Smoke: iş akışları drawer, bir süreç aç, bir rota aç (varsa).
- [ ] `npm run build --prefix web` (bilinen TS borcu ayrı issue ise not düş).

---



## 8. Bilinen teknik borç (refactor sırasında dokunma / ayrı issue)

- Web `tsc` uyarıları: `ProcessFlowCanvas`, `ProcessFlowRouteBuilder`, `workflowStore`, `DwhLineageMap` (2026-03).
- `App.css` boyutu — Faz 5’e bırak.

---



## 9. Sonraki adım (seninle netleştirelim)

1. Faz 0 + **ProcessRoutesPanel** ayırma ile başlayalım mı?
2. Refactor PR’larında yorum dili **tamamen Türkçe** mi, yoksa modül başlığı TR / detay EN mi?
3. CSS bölme Vite’ta tek bundle mı kalsın, yoksa lazy yüzey (DWH) ayrı chunk mu?

Onayladığın sıraya göre ilk PR’ı açabiliriz.