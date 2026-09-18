# `navigation/` — tıklayınca **ne olacağını** yöneten hook’lar

**Ekranda doğrudan görünmez**; ama her etkileşimin arkası burada: ağaçtan servis seçince hangi sekme açılır, drawer kapanır mı, süreç canvas’a geçilir mi, ⌘K Esc ile kapanır mı.

UI parçaları: [components/rehber.md](../components/rehber.md). `App.tsx` ince kalır; mantık burada.

## Sol panel ve drawer

| Hook / dosya | Kullanıcı ne yapar | Sonuç |
|--------------|-------------------|--------|
| `useSidebarLayout.ts` | Sidebar’ı pinler / genişletir | Panel genişliği, dar rail |
| `useNavDrawers.ts` | Favoriler veya İş akışları kısayolu | Hangi drawer açık |

## Seçim ve gezinme

| Hook / dosya | Kullanıcı ne yapar | Sonuç |
|--------------|-------------------|--------|
| `useServiceSelection.ts` | Ağaçtan servis/jar seçer | Orta alan katalog/harita, pivot id |
| `useVisitHistory.ts` | Haritada düğüm gezer, breadcrumb tıklar | Geri/ileri, ziyaret yolu çubuğu |

## Süreç

| Hook / dosya | Kullanıcı ne yapar | Sonuç |
|--------------|-------------------|--------|
| `useProcessFlowNav.ts` | Drawer’dan süreç veya kayıtlı rota açar | Orta alan BPM; servisten geri dönüş |

## Veri

| Hook / dosya | Ne zaman | Sonuç |
|--------------|----------|--------|
| `useServiceStageData.ts` | Seçili servis değişince | API: detay, etki grafı, metodlar |

## Modallar ve klavye

| Hook / dosya | Kullanıcı ne yapar | Sonuç |
|--------------|-------------------|--------|
| `useCommandPaletteKeyboard.ts` | ⌘K / Esc | Palet aç/kapa |
| `useInboxAndChangeRequests.ts` | Inbox / CR ikonları | Modal state |

## Sayfa yenileyince

| Hook / dosya | Ne saklar |
|--------------|-----------|
| `usePersistedAppNav.ts` | Seçili servis, açık süreç → `sessionStorage` (`appNavPersist.ts`) |

| `appShellHelpers.ts` | Klavye hedefi, drawer restore yardımcıları |

Mimari: [docs/web-architecture.md](../../../docs/web-architecture.md).
