# Issue management entegrasyonu

Intranet **issue / change** aracı onay ve ticket tutar; **Service Dependency (SD)** statik katalogdan **etkilenen servis listesi ve haritayı** üretir. İki sistem birbirinin yerine geçmez — [PRODUCT.md §2](./PRODUCT.md#2-sınır-sd-vs-issue-management).

Issue aracı da React ise hedef, harita/ağaç UX’ini **embed** etmek; API ayrı kalabilir (`server/` + Postgres).

**Diğer dokümanlar:** [Kurulum](../README.md) · [db.md](./db.md)

---

## 1. “App.tsx kabuğu” ne demek?

Orchestration bugün **`web/src/App.tsx`** içinde: seçim state’i, veri yükleme, sidebar, surface (Servis / DWH), süreç akışı geçişleri. Alt bileşenler (`ModuleTree`, `ImpactMap`, …) ayrı dosyalarda; **bağlantıları** App kuruyor.


| Sorumluluk         | Örnek state / fonksiyon                                       |
| ------------------ | ------------------------------------------------------------- |
| Seçim modeli       | `pivotId`, `selectedMethodId`, `catalogNode`, `tab`           |
| Veri yükleme       | `service`, `impact`, `affected`, `tree` + onlarca `useEffect` |
| Gezinme geçmişi    | `history`, `historyIndex`, `selectPivot`, `selectMethod`      |
| Kabuk UI           | masthead, sidebar pin/resize, tema, surface (servis / DWH)    |
| Issue-benzeri akış | `session`, inbox, change request modalları                    |
| Yardımcılar        | arama, ⌘K, favoriler, snapshot trail                          |


**Alt bileşenler** (`ModuleTree`, `ImpactMap`, `RelationshipTable` vb.) olgun ve ayrı dosyalarda; fakat **birbirine nasıl bağlanacakları** `App.tsx` içinde.

```
┌─────────────────────────────────────────────────────────┐
│  App.tsx  ← kabuk: state + routing + layout + data flow │
├──────────────┬──────────────────────────────────────────┤
│ ModuleTree   │  ImpactMap / Tablo / Overview / Ekranlar  │
│ (bileşen)    │  (bileşenler — App’ten prop alır)        │
└──────────────┴──────────────────────────────────────────┘
```

Issue’ya taşınacak olan **harita, ağaç, tablo UX** alt bileşenlerde. Taşınması zor olan kısım **bu orchestration katmanı**.  
`CatalogWorkbench` önerisi: bu katmanı `App.tsx`’ten çıkarıp **yeniden kullanılabilir bir sarmalayıcı** yapmak; `App.tsx` ince bir “standalone shell” kalır.

---

## 2. Hedef senaryo

Issue management (intranet) içinde, bir issue kaydına bağlı servis için etki analizi:

```
Issue detay: INC-1234
├─ [Özet] [Yorumlar] [Etki analizi] …
└─ Etki analizi sekmesi
     └─ <CatalogWorkbench serviceId="sd-37504" issueId="INC-1234" … />
```

**Önerilen prensipler:**

1. `CatalogWorkbench` **gibi bir sarmalayıcı çıkar** — issue sadece bu bileşeni render eder.
2. **Issue’da tek sekme / route olarak göm** — tam sayfa ikinci uygulama hissi verme.
3. **API ayrı servis olarak kalsın** — `server/` + `inventory_db`; issue backend’ine gömme zorunluluğu yok.
4. **CR / inbox’u issue’ya bırak** — SD’deki mock talep akışı issue workflow ile çakışmasın.

---

## 3. Entegrasyon modelleri


| Model                                        | Açıklama                              | Refactor    | Risk             |
| -------------------------------------------- | ------------------------------------- | ----------- | ---------------- |
| **A — Ayrı URL + link**                      | Issue’dan yeni sekme / deep link      | Küçük       | Düşük            |
| **B — iframe**                               | Issue sekmesinde iframe               | Küçük + CSP | Orta             |
| **C — React embed (**`CatalogWorkbench`**)** | Issue route içinde aynı UX            | Orta        | Orta (kontrollü) |
| **D — Monolith merge**                       | Tüm `web/src` issue repo’suna kopyala | Büyük       | Yüksek           |


**Öneri:** Önce **A** (POC), sonra **C** (asıl UX taşıma). **D**’den kaçın.

### İlk yapılacak (F1) — deep link, tam pencere

Issue entegrasyonunda **ilk adım bu:** issue kaydından SD’ye **yeni sekme veya link** ile gitmek.

```
Issue INC-1234  →  [Etki analizini aç]
                      ↓
https://…/katalog?service=sd-37504&from=INC-1234
                      ↓
SD tam pencere (bugünkü standalone layout)
```

- **Performans:** Bugünkü uygulama ile aynı; entegrasyon ek yükü yok.
- **Refactor:** Küçük — `?service=` query okuma + issue’da custom field.
- **Tam pencere:** Evet — kendi masthead/sidebar’ı ile tam ekran.

**Alternatif (aynı işlev):** Reverse proxy ile aynı origin, farklı path:

```
https://issues.intra.local/tools/katalog/?service=sd-37504
```

Deep link ile **aynı performans**; SSO cookie paylaşımı kolaylaşır. Hangisi infra’ya uygunsa o seçilir — ikisi de F1 kapsamında.

Embed (`CatalogWorkbench`) ve iframe **F2+**; F1 bitmeden gerekmez.

---

## 4. `CatalogWorkbench` refactor — uygulamayı bozar mı?

**Hayır — doğru yapılırsa mevcut standalone uygulama aynen çalışır.**

Yaklaşım: **extract + thin wrapper**, rewrite değil.

```tsx
// Yeni: web/src/CatalogWorkbench.tsx
export function CatalogWorkbench(props: CatalogWorkbenchProps) { … }

// App.tsx sadeleşir:
export default function App() {
  return (
    <StandaloneShell>   {/* masthead, DWH switch, inbox — opsiyonel */}
      <CatalogWorkbench mode="standalone" … />
    </StandaloneShell>
  )
}

// Issue app:
<CatalogWorkbench
  mode="embed"
  serviceId={issue.fields.serviceId}
  issueId={issue.id}
  user={session.user}
  features={{ cr: false, inbox: false, welcome: false, dwh: false }}
/>
```


|                    | Standalone (bugünkü) | Embed (issue)               |
| ------------------ | -------------------- | --------------------------- |
| Sidebar / masthead | Açık                 | `mode="embed"` ile gizlenir |
| CR / inbox         | Açık                 | `features.cr: false`        |
| DWH yüzeyi         | Açık                 | `features.dwh: false`       |
| Derin link         | —                    | `initialServiceId` prop     |


**Regresyon riski:** Orta — extract sırasında state taşınırken davranış kopyalanmalı.  
**Mitigasyon:** Extract öncesi/sonrası aynı E2E veya manuel smoke (`ss.md` servisleri).

---

## 5. Refactor kapsamı ve efor (mevcut yapıya göre)

### 5.1 Taşınacak paket (issue’ya gidecek)


| Dizin / dosya                                                         | Rol                  |
| --------------------------------------------------------------------- | -------------------- |
| `web/src/components/*` (harita, ağaç, tablo, overview, ekran/process) | UI                   |
| `web/src/motion/*`                                                    | Animasyon / sekmeler |
| `web/src/impact/*`                                                    | Harita filtreleri    |
| `web/src/api/client.ts`                                               | API istemcisi        |
| `web/src/types.ts`                                                    | Tipler               |
| `web/src/App.css` (veya parçalanmış)                                  | Stiller              |
| `web/src/useModuleTreeKeyboard.ts`, `useServiceFavorites.ts`          | Hook’lar             |


### 5.2 `App.tsx`’ten çıkarılacak mantık → `CatalogWorkbench`

- ~35 `useState` + ~85 hook kullanımının büyük kısmı
- `selectPivot`, `selectCatalogNode`, `selectMethod`, veri fetch effect’leri
- Sekme / stage layout (`StageTabs`, `StageTabPanels`)
- Sidebar + main workspace birleşimi (embed modda sadeleştirilmiş layout)

### 5.3 `App.tsx`’te kalacak (standalone only)

- Masthead, tema, surface switch (servis / DWH)
- Inbox, change request modalları
- Welcome / onboarding (embed’de kapalı)
- `DwhPage` routing

### 5.4 Issue entegrasyonu için ek (henüz yok)


| İş                                             | Efor            | Zorunlu             |
| ---------------------------------------------- | --------------- | ------------------- |
| `CatalogWorkbench` + `CatalogWorkbenchProps`   | 3–5 gün         | Evet                |
| `mode: 'standalone'                            | 'embed'` layout | 1–2 gün             |
| `features` flag’leri (cr, inbox, dwh, welcome) | 1 gün           | Evet                |
| Deep link / `initialServiceId`                 | 0.5–1 gün       | Çok faydalı         |
| CSS scope (`.sd-catalog` prefix)               | 2–3 gün         | Embed için evet     |
| SSO — mock session kaldır                      | 2–4 gün         | Prod için evet      |
| npm workspace / `@org/catalog-ui` paketi       | 1–2 gün         | Issue ayrı repo ise |


**Toplam kabaca:** 2–3 sprint (1 geliştirici), harita/ağaç regresyon testi dahil.

### 5.5 Bilinçli olarak taşınmayabilecekler

- `DwhPage` + `web/src/dwh/*` — issue kapsamı servis kataloğu ise
- `WelcomeScreen` — issue içinde gereksiz
- CR / inbox UI — issue workflow kullanılacaksa

---

## 6. “Tüm repo’yu issue’ya yapıştır” vs `CatalogWorkbench`


|                            | Repo yapıştır                        | CatalogWorkbench            |
| -------------------------- | ------------------------------------ | --------------------------- |
| CSS çakışması              | Yüksek (`App.css` ~13k satır global) | Scope / prefix ile kontrol  |
| Çift navigasyon            | Masthead + issue header              | Embed modda SD chrome gizli |
| Bundle                     | DWH + onboarding + CR hepsi girer    | `features` ile kesilir      |
| SD’de bağımsız geliştirme  | Fork / merge conflict                | Paket güncellenir           |
| Issue’ya servis id bağlama | Manuel                               | `serviceId` prop            |


---

## 7. Altyapı (API tarafı — issue aracından bağımsız)

```
Issue React app  ──HTTP──►  SD API (Express :4000)
                                  │
                                  ▼
                            inventory_db (Postgres env)
                            [opsiyonel] DWH Postgres stage
```

Env örneği:

```env
CATALOG_SOURCE=inventory
INVENTORY_PGDATABASE=inventory_db
INVENTORY_PGSCHEMA=env
VITE_API_BASE_URL=https://servis-katalogu.intra.local/api   # issue farklı host’taysa
```

Issue tarafında **custom field:** `service_id = sd-37504` (veya servis adı + arama — daha zayıf).

---

## 8. Karşılaşılacak sorunlar

### Auth

- Bugün: `GET /api/session-users` mock; UI `users[0]` seçer. **Direktör / yetkili ayrımı yok.**
- İş akışı oluşturma ve servis değişiklik notu yazma: `resolveCatalogCanEdit()` (`web/src/auth/catalogAccess.ts`).
- Standalone demo: düzenleme **açık**.
- Intranet gömülünce host, SSO sonrası şunu set eder (UI gizler; localStorage yazımı da reddeder):

```js
window.__SD_CATALOG__ = { canEdit: user.roles.includes('catalog_editor') }
```

- Geçici önizleme: `?sdEdit=0` (salt okuma) / `?sdEdit=1` (düzenle).
- Deploy: `VITE_SD_CATALOG_EDIT=0`.
- Prod: API gateway JWT / SSO header → SD session → aynı `canEdit` (sunucu tarafı da şart; client flag tek başına güvenlik değil).

### Issue ↔ servis eşlemesi

- Issue’da servis id alanı yoksa entegrasyon kopuk kalır.

### CR / inbox çakışması

- SD talep store bellekte (`changeRequests.ts`); restart’ta silinir.
- Issue zaten ticket yönetiyorsa SD CR’yi kapat veya senkron API yaz.

### Veri seyrekliği

- Ekran/process ~%1–2 serviste dolu; boş liste normal.
- ~25k konumsuz servis → jar/sahiplik boş görünür.

### Performans

**Kritik kural (embed / issue sekmesi):** Issue sekmesi **görünmeden** ağaç, harita ve impact API çağrısı yapma. Sekme tıklanınca mount + fetch.

```tsx
// Issue sekmesi — örnek
{activeTab === 'impact' ? (
  <CatalogWorkbench serviceId={issue.serviceId} … />
) : null}
```


| Yöntem                           | Performans vs bugün   | Tam pencere?        |
| -------------------------------- | --------------------- | ------------------- |
| Deep link / ayrı host            | Aynı                  | Evet                |
| Reverse proxy (`/tools/katalog`) | Aynı                  | Evet                |
| iframe                           | İlk yükleme daha ağır | Hayır (kutu)        |
| Embed (issue sekmesi)            | Lazy tab ile iyi      | Hayır (sekme alanı) |


Deep link ve reverse proxy **performans cezası vermez**; sadece navigasyon farkı.

### React sürümü

- SD: React 19. Issue farklı major ise peer dependency hizala.

---

## 9. Önerilen fazlar


| Faz    | İş                                                                                                   | Çıktı                             |
| ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| **F0** | API + DB intranet deploy, SSO                                                                        | Çalışan backend                   |
| **F1** | **Deep link** `?service=sd-xxx` **veya** reverse proxy `/tools/katalog` — issue’dan tam pencere link | **İlk yapılacak**                 |
| **F2** | `CatalogWorkbench` extract + `mode="embed"`                                                          | Issue sekmesine gömülebilir modül |
| **F3** | CSS scope + npm paket                                                                                | Temiz issue entegrasyonu          |
| **F4** | Etki listesini issue API’sine yazma                                                                  | Otomasyon                         |
| **F5** | CR/inbox kaldır veya issue sync                                                                      | Tek workflow                      |


---

## 10. Smoke test (extract sonrası)

`ss.md` servisleri ile standalone ve embed modda:

- Ağaç: grup → jar → servis lazy load
- ⌘K / arama → servis seç → jar vurgusu temizlenir
- Harita: hub `PROPOSAL_MAIN_GET` (`sd-37504`)
- Tablo: katmanlı liste, L2/L3 açılım
- Ekranlar / Process: boş durum metinleri
- Jar katalog: servis lazy loading (+N)

---

## 11. Özet


| Soru                         | Cevap                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| App.tsx kabuğu?              | Tüm state + veri akışı + layout; alt UX bileşenleri bunun altında       |
| UI taşımak mantıklı mı?      | Evet — issue da React ise                                               |
| `CatalogWorkbench` bozar mı? | Hayır — extract + wrapper; standalone aynı kalır                        |
| Refactor büyüklüğü?          | Orta: ~2–3 sprint; monolith merge’dan çok daha az risk                  |
| En iyi yol?                  | Sarmalayıcı çıkar → issue sekmesine göm → API ayrı kalsın → CR issue’da |


---

## 12. Modül bölme (App.tsx → CatalogWorkbench)

**Amaç:** Rastgele dosya bölmek değil; orchestration’ı çıkarmak. UI zaten `components/`, `motion/`, `impact/` altında.

**Katman kuralı (tek yön — alt üstü import etmez):**

```
types, api  →  components, motion  →  catalog/hooks  →  CatalogWorkbench  →  App / Issue
```


| Modül                               | İş                                       |
| ----------------------------------- | ---------------------------------------- |
| `catalog/hooks/useCatalogSelection` | pivot, tab, history, catalogNode         |
| `catalog/hooks/useCatalogData`      | impact, service, tree fetch              |
| `CatalogWorkbench`                  | hook’ları birleştirir, layout            |
| `StandaloneShell`                   | masthead, inbox, DWH, welcome            |
| `components/*`                      | saf UI — props alır, global state tutmaz |


**Güvenli sıra:** (1) selection hook extract → (2) data hook → (3) JSX → `CatalogWorkbench` → (4) embed mode → (5) CSS scope. Her adımda `ss.md` smoke.

**Bağımlılık kaçarsa:** Circular import build’de patlar (Vite/TS). Kalıcı çözüm: katman kuralını CI’da `dependency-cruiser` ile zorla.

---

## 13. Yardımcı araçlar


| Araç                                                                     | Ne işe yarar                               | Not                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| **[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)** | Import kuralları, circular tespit, CI gate | `depcruise src` — “components → catalog yasak” gibi kurallar |
| **[madge](https://github.com/pahen/madge)**                              | Hızlı circular / graf                      | `madge --circular web/src`                                   |
| **Graphviz**                                                             | Bağımlılık SVG                             | depcruise                                                    |
| **npm workspaces / pnpm**                                                | `@org/catalog-ui` paketi                   | Issue ayrı repo ise                                          |
| **TypeScript project references**                                        | Paket sınırları                            | `tsc -b` ile kırık import erken yakalanır                    |
| **oxlint + tsc** (projede var)                                           | Lint / tip                                 | Refactor sırasında zaten kullan                              |
| **Playwright / Vitest**                                                  | Regresyon                                  | Henüz yok; extract sonrası 5–10 smoke test değerli           |
| **React DevTools**                                                       | Component ağacı                            | Extract sonrası hangi prop’un nereden geldiğini gör          |
| **React Sight** (Chrome ext.)                                            | Canlı component graf                       | Büyük app’te ağır; ara sıra yeter                            |


Otomatik “App.tsx’i böl” aracı yok — extract **elle + IDE refactor** (VS Code “Extract to function/hook”). AI/codemod (jscodeshift) büyük stateful component’te güvenilir değil; hook extract’ı insan yönlendirmeli.

**Örnek CI kuralı (dependency-cruiser fikri):**

```js
// components/* → catalog/* import edemez
// api/* → hiçbir UI import edemez
```

---

## 14. Refactor sonrası geliştirme kolay mı?

**Kısa cevap:** Evet — orta vadede **daha kolay**; extract haftasında **biraz daha yavaş**.


|                              | Bugün (App.tsx)             | Sonra (CatalogWorkbench)           |
| ---------------------------- | --------------------------- | ---------------------------------- |
| Yeni özellik (harita, tablo) | `components/` — zaten kolay | Aynı — değişmez                    |
| Seçim / fetch davranışı      | App.tsx’te 1500 satır ara   | `catalog/hooks/` — net adres       |
| Issue embed                  | Mümkün değil / kırılgan     | `<CatalogWorkbench />` — tek satır |
| “Nerede değiştiririm?”       | App.tsx scroll              | Dosya adı söylüyor                 |
| İlk onboarding               | Tek dosya = basit algı      | 2–3 katman öğrenmek gerek          |


**Ne zorlaşır:** Extract bitene kadar iki yerde geçici duplikasyon; CSS scope taşıması; issue + standalone iki mod test.

**Ne kolaylaşır:** Issue entegrasyonu; bağımsız paket release; circular import CI’da yakalanır; yeni geliştirici App.tsx okumak zorunda kalmaz.

**Pratik öneri:** Standalone `npm run dev` akışı aynı kalsın. Issue geliştiricisi sadece `CatalogWorkbench` API’sini (`serviceId`, `features`) bilsin — iç hook’lara dokunmasın. Böylece günlük SD geliştirmesi bugünkü kadar akıcı kalır.