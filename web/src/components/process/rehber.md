# `process/` — **BPM süreç** ekranı (tam akış + rota)

**Ekranda:** İş akışları drawer’ından bir **süreç** seçince orta alanı kaplayan büyük **akış diyagramı** — düğümler, oklar, sağ **Detay** çekmecesi, üstte “Akış Rotanı Oluştur”. İkinci mod: adım adım **rota oluşturma** (geçiş seç, kaydet).

Servis **Harita** sekmesi farklı modül → [service-map/rehber.md](../service-map/rehber.md). Ürün: [docs/process-flow.md](../../../docs/process-flow.md).

## İki mod (kullanıcı gözüyle)

| Mod | Ekranda ne yaparsın |
|-----|---------------------|
| **Tam akış** | Tüm süreci gez, düğüme tıkla, yol vurgula, not ekle, PDF snapshot |
| **Akış rotası** | Sadece seçtiğin geçişlerden yol oluştur, kaydet; drawer’da “Akış Rotaları”ndan tekrar aç |

Layout: tüm süreç numaraları için otomatik katmanlı yerleşim (`processFlowMap/buildGraph.ts`).

## Örnek süreç no’ları (yerel DB)

| `no` | ~düğüm | Katalog adı |
|------|--------|-------------|
| `105116` | 217 | KTF Düzenleme |
| `105118` | 207 | Teminat Mektubu Güncelleme |
| `105801` | 15 | CRD TCMB (küçük, hızlı test) |

## Dosyalar — ekrana karşılık

| Dosya | Ekranda nereye karşılık gelir | Ne işe yarar |
|-------|------------------------------|--------------|
| `ProcessFlowPage.tsx` | Süreç modunun tam sayfası | Tam akış mı rota mı, yükleme hatası |
| `ProcessFlowMap.tsx` | Tam akış canvas sarmalayıcı | React Flow provider |
| `processFlowMap/` | Canvas’ın kendisi | [processFlowMap/rehber.md](./processFlowMap/rehber.md) |
| `ProcessFlowRouteBuilder.tsx` | Rota modu UI | Geçiş seçimi, kaydet, adım şeridi |
| `ProcessFlowDetailDrawer.tsx` | Sağdan açılan detay | Gelen/giden geçişler, ekranlar, not |
| `ProcessFlowMapSearch.tsx` | Harita üstü arama | Düğüm adında ara, sıradaki eşleşme |
| `ProcessFlowRouteBar.tsx` | Rota modunda üst şerit | Kayıtlı adımlar |
| `ProcessFlowScreens.tsx` | Drawer’da ekran listesi | Süreç ekran OID’leri |
| `processRouteStore.ts` (`stores/`) | (drawer listesi) | Kayıtlı rotalar localStorage |
| `useProcessFlowPage.ts` | (görünmez) | API’den graf çek, mod geçişi |

Kamera, hover, notlar, PDF: `processFlowCamera.ts`, `useProcessFlowHover.ts`, `processFlowNotes.ts`, `processPathNarrative.ts`.

Sunucu: PAR/XML parse → `server/src/inventory/processFlowService.ts`. API sözleşmesi: `types.ts`, `api/client.ts`.

Yeni özellik: tam akış → `processFlowMap/`; rota kuralları → `processUserRoute.ts`.
