# Refactor planı — okunabilir kod ve anlaşılır yorumlar

Bu belge, **davranışı bozmadan** kod tabanını parçalara ayırma ve **Türkçe / sade dilde** yorum ekleme yol haritasıdır. Her faz ayrı PR ile gidebilir; büyük “tek seferde her şey” refactor yapılmaz.

**İlgili:** [PRODUCT.md](./PRODUCT.md), [process-flow.md](./process-flow.md), [catalog-persistence.md](./catalog-persistence.md).

---

## 1. Neden refactor?


| Sorun                                                                                  | Etki                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `App.tsx`, `ProcessFlowCanvas.tsx`, `WorkflowsPanel.tsx` binlerce satır | Yeni özellik zor, hata riski yüksek                    |
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



### Faz 0 — Harita ve “README her klasörde” (1 PR, düşük risk) ✅ tamam

- [x] `web/src/components/process/` — README (Faz 3 ile güncellendi).
- [x] `web/ARCHITECTURE.md` — yüzeyler, store’lar, event’ler.
- [x] `navigation/README.md`, `components/shell/README.md` genişletildi.
- [x] PR checklist bu belgenin §7 bölümünde (issue açmadan kullanılabilir).

**Çıktı:** Yeni gelen “nereye kod yazarım?” sorusunun cevabı.

---



### Faz 1 — `App.tsx` parçalama (2–4 PR) ✅ tamam

**Sorun:** ~2000 satır; navigasyon, süreç rotası, favoriler, DWH geçişi iç içe.

| Taşınacak parça | Hedef | Durum |
|---|---|---|
| Drawer görünürlük (shortcuts, workflows) | `navigation/useNavDrawers.ts` | ✅ Yapıldı |
| Servis geçmişi / breadcrumb (geri/ileri yığını) | `navigation/useVisitHistory.ts` | ✅ Yapıldı |
| Süreç açma / rota açma | `navigation/useProcessFlowNav.ts` | ✅ Yapıldı |
| Render: kabuk JSX (sidebar + servis sahnesi) | `components/shell/*` | ✅ İlk dilim |
| Seçim: pivot / metod / katalog / temizle | `navigation/useServiceSelection.ts` | ✅ Yapıldı |
| Sahne verisi: servis + etki + metod grafı | `navigation/useServiceStageData.ts` | ✅ Yapıldı |
| Render: servis workspace | `components/shell/ServicesWorkspace.tsx` | ✅ Yapıldı |
| Render: masthead + overlay | `AppMasthead`, `AppShellOverlays` | ✅ Yapıldı |
| Render: sadece kabuk | `App.tsx` ~400–600 satır | ✅ ~620 satır; workspace/overlay prop hook’ları |

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

**Yapıldı (4. adım):** Kabuk JSX — sol kenar çubuğu `components/shell/ModuleSidebar.tsx`,
seçili servis sahnesi `components/shell/ServiceStage.tsx`, ziyaret yolu ve sidebar ikonları
ayrı dosyalara taşındı. Satır ~1800 → ~1200.

**Yapıldı (5. adım):** `useServiceSelection` — `selectPivot` / `selectMethod` /
`selectCatalogNode` / `clearSelection` / workflow dönüşü; `useServiceStageData`
pivot ve metod graf yüklemesi. Drawer başlangıcı `appShellHelpers.ts`.

**Yapıldı (6–7. adım):** `ServicesWorkspace` + `ServicesMainStage`; `AppMasthead` +
`AppShellOverlays`. Yeni servis seçimi her zaman Harita sekmesi (`useServiceSelection`).

**Bitti sayılır:** İş kuralları `navigation/*`; App kabuk + persist + workspace prop bağlama.

---



### Faz 2 — İş akışları drawer (1–2 PR) ✅ tamam

**Sorun:** `WorkflowsPanel.tsx` ~1300 satır; süreç listesi, BPM rota grupları, workflow ağacı, arama.

| Parça | Hedef dosya | Durum |
|--------|-------------|-------|
| BPM rota grupları + filtre UI | `components/workflows/ProcessRoutesPanel.tsx` | ✅ Yapıldı |
| Süreç listesi (featured + scroll) | `components/workflows/ProcessCatalogList.tsx` | ✅ Yapıldı |
| Rename/delete dialog | `components/workflows/ProcessRouteDialogs.tsx` (portal) | ✅ Yapıldı |
| Folder ağacı (`FolderBlock`, `DropZone`, arama kutusu) | `WorkflowFolderBlock` / `WorkflowDropZone` / `WorkflowsSearch` | ✅ Yapıldı |

**Store:** `processRouteStore.ts` zaten ayrı; üst yorum + export grupları net. Bu fazda ayrıca
Türkçe arama filtresindeki **İ/I** büyük/küçük harf hatası (`routeMatchesFilter`) test yazılırken
yakalandı ve `foldTurkish` yardımcı fonksiyonuyla düzeltildi.

**Sonuç:** `WorkflowsPanel.tsx` ~1290 → ~550 satır. Drawer artık composition: katalog, rotalar,
arama, klasör ağacı ayrı dosyalar; state hâlâ panelde merkezi.

**Bitti sayılır:** `WorkflowsPanel` yalnızca birleştirir (composition).

---



### Faz 3 — Süreç haritası ve rota modu (3–5 PR) ✅ tamam

**Sorun:** `ProcessFlowCanvas.tsx`, `ProcessFlowRouteBuilder.tsx`, `ProcessFlowMap.tsx` büyük; state makinesi dağınık.


| Adım | İş                                                                                                   | Durum |
| ---- | ---------------------------------------------------------------------------------------------------- | ----- |
| 3a   | `processUserRoute.ts` + `processPathNarrative.ts` — tek “rota domain” README                         | ✅ |
| 3b   | Canvas: layout / zoom / hover ayrı modüller (`processFlowCanvasLayout.ts`, `useProcessFlowHover.ts`) | ✅ |
| 3c   | Route builder: kaydet / snapshot çağrıları tek `useSaveProcessRoute` hook                            | ✅ |
| 3d   | `ProcessFlowPage.tsx` ince orchestrator                                                              | ✅ |


**3a:** Domain dosyalarına Türkçe üst yorum eklendi; harita `components/process/README.md`.

**3b:** Keşif canvas yerleşimi + hover komşuluğu `processFlowCanvasLayout.ts`; tam akış kamerası `processFlowCamera.ts`; hover/drag `useProcessFlowHover.ts` (Map + Canvas). `ProcessFlowMap` layout gövdesi hâlâ Map’te (ayrı invariant / ORIGIN).

**3c:** `useSaveProcessRoute` — kaydet / farklı kaydet / PDF; RouteBuilder yalnız UI.

**3d:** `useProcessFlowPage` yükleme + rota modu; `ProcessFlowPage` JSX orchestrator. Map `key` = `graph.no`.

Davranış değişmedi.

**Yorum odağı:** Tam akış vs kayıtlı rota farkı ([process-flow.md](./process-flow.md) ile aynı cümleler).

---



### Faz 4 — DWH — KAPSAM DIŞI

`web/src/dwh/` ve `server/src/dwh/` **bu refactor planına dahil değil**. Modülü başka
kişi geliştirecek; burada parçalanmaz, taşınmaz, “fırsat bu ya” düzeltilmez.

---



### Faz 5 — CSS bölme (2–3 PR, görsel regresyon dikkat) ✅ (DWH hariç)

**Sorun:** Tek `App.css`.


| Dosya                         | İçerik                                           | Durum |
| ----------------------------- | ------------------------------------------------ | ----- |
| `styles/process-flow.css`     | PF harita, rota, `hl-*`                          | ✅ |
| `styles/shell.css`            | Masthead, sidebar, drawer iskeleti                | ✅ |
| `styles/workflows-drawer.css` | `sc-*` klasör, süreç listesi, rota satırları     | ✅ |
| `styles/dwh.css`              | DWH stage — **taşınmadı** (kapsam dışı)          | — |
| `styles/cmdk.css`             | Komut paleti                                     | ✅ |
| `styles/service-map.css`      | Etki haritası (placeholder; stiller `App.css`)     | ⏳ |
| `App.css`                     | `@import` + harita + katalog / tablo / welcome     | ✅ |


**Kural:** Taşırken class adı **değiştirilmez** (sadece dosya taşınır).

**Smoke:** [refactor-visual-regression.md](./refactor-visual-regression.md)

---



### Faz 6 — Sunucu `inventory/` (1–2 PR) ✅ çekirdek doc

- [x] `processFlowService.ts` — modül + `listProcesses` doc.
- [x] `parProcessParser.ts` — modül + adım özeti.
- [x] `processCatalogSchema.ts` — extended vs legacy paragraf.

**Bitti sayılır (doc):** Route ince kalması ayrı issue; parser/service davranışı değişmedi.

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
5. **Faz 4 yok** — DWH kapsam dışı (ayrı ekip).
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

- Web `tsc`: kritik hatalar giderildi (2026-03 tur); yeni uyarılar ayrı issue.
- `App.css` ~10k satır (katalog/tablo); harita `service-map.css`, PF `process-flow.css`.

---



## 9. Sonraki adım

- **Refactor:** Planlanan dilimler tamam (Faz 7 hariç).
- **Feature (sonra):** Faz 7 DB + API ([catalog-persistence.md](./catalog-persistence.md)).