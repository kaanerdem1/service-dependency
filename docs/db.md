# Inventory DB — entegrasyon rehberi

> Kaynak notlar: `/Users/kaanerdem/Desktop/db/db.txt`  
> İlgili: [new.md §1.1](./new.md) (dış katalog importu), [README](./README.md) (çalıştırma)

Bu doküman, **inventory_db** (`env` şeması) verisinin service-dependency uygulamasına nasıl bağlanacağını adım adım anlatır. Kod henüz yazılmadı; restore sonrası karar ve uygulama checklist’i.

---

## 0. Özet


| Soru                                 | Cevap                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Bu DB ne?                            | Statik **servis / metod / call-graph / ekran / process** kataloğu (Retechfin inventory taraması)  |
| DWH (`stage.katalog_*`) ile aynı mı? | **Hayır** — ayrı veritabanı / şema; Servis yüzeyi buradan, DWH yüzeyi Postgres `stage` şemasından |
| Dump dosyası                         | `inventory_db_export` — PostgreSQL **custom dump** (PG **18.4**); PG 17 restore edemez            |
| Restore sonrası DB adı               | pgAdmin’de örn. `inventory_db`; şema `**env**`                                                    |
| Mock’un yerini ne alır?              | `server/src/data.ts`, `server/src/methods.ts` → read-only `**server/src/inventory/***` katmanı    |


---

## 1. Dump’ı açma (pgAdmin)

1. PostgreSQL **18** sunucusuna bağlan (PG 17 → `unsupported version (1.16)` hatası).
2. **Create Database** → örn. `inventory_db`.
3. DB’ye sağ tık → **Restore** → Format: **Custom or tar** → dosya: `inventory_db_export`.
4. Sol ağaç: **Schemas → env → Tables** ( `public` boş kalabilir — normal ).
5. Doğrulama:

```sql
SELECT COUNT(*) FROM env.service_definition WHERE status = 1;
SELECT COUNT(*) FROM env.call_edge;
```

Beklenen mertebe (restore sonrası örnek): ~37k servis tanımı, ~484k call edge, ~224k java_method.

---

## 2. `db.txt` sorguları — tablolar ne anlama geliyor?

`db.txt` dosyasındaki yorumlar ile gerçek şema eşlemesi:

### 2.1 Hiyerarşi (sol ağaç — sahiplik)


| db.txt sorgusu       | Tablo                    | Ne veriyor                                                             | Uygulamada karşılığı                                            |
| -------------------- | ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `project_group`      | `env.project_group`      | **Kök** gruplar (ACC, vb.)                                             | `ModuleNode.kind = 'project'` (üst grup)                        |
| `project`            | `env.project`            | `project_group_id` ile gruba bağlı; **pratikte jar / modül kapsayıcı** | `ModuleNode.kind = 'package'` veya `'project'` (adapter kararı) |
| `artifact`           | `env.artifact`           | Taranan **jar** dosyaları; `project_id` → project                      | Jar düğümü; `kind = 'package'`                                  |
| `java_class`         | `env.java_class`         | Sınıflar; `artifact_id` → jar                                          | Ağaçta genelde **gösterilmez** (çok fazla); arama / drill-down  |
| `java_method`        | `env.java_method`        | Tüm metodlar; `class_id` → class                                       | `ModuleNode.kind = 'method'` veya call-graph düğümü             |
| `service_definition` | `env.service_definition` | **Ana servis kaydı** — SET’te servis olarak işaretlenen                | `Service` + pivot düğüm; onay birimi                            |


**Önemli:** `service_definition` doğrudan `project_id` taşımaz. Projeye bağlantı **metod → class → artifact → project** zinciriyle kurulur:

```sql
SELECT sd.id, sd.service_name, p.project_name, pg.project_group_name
FROM env.service_definition sd
JOIN env.java_method jm ON jm.service_definition_id = sd.id
JOIN env.java_class jc ON jc.id = jm.class_id
JOIN env.artifact a ON a.id = jc.artifact_id
JOIN env.project p ON p.id = a.project_id
JOIN env.project_group pg ON pg.id = p.project_group_id
WHERE sd.status = 1
LIMIT 10;
```

Bir servisin birden fazla jar/proje yolu olabilir; adapter **tek “birincil” project/package** seçmeli veya rozet ile göstermeli.

### 2.2 Servis ↔ metod ilişkisi


| db.txt                                                | Anlam                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `java_method` (tümü)                                  | Call-graph düğümleri (~224k)                                                                                  |
| `java_method WHERE service_definition_id IS NOT NULL` | **Servis entry metodu** (~12k); servis tanımına bağlı yüzey                                                   |
| `service_definition`                                  | `service_name` (unique), `method_name`, `package_name`, `class_name`, `service_description`, `service_params` |


**Kural:** Onay ve etki özeti **servis** (`service_definition.id`) bazında; metod değişikliği üst servise yazılır ([new.md §1](./new.md)).

### 2.3 Çağrı grafi (call-graph)


| Tablo           | Ne veriyor                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| `env.call_edge` | `caller_id` / `callee_id` → `java_method.id`; `invoke_type`, `line_number` |


Uygulama mock’undaki `callEdges[]` buradan üretilir. Cross-service çağrı: caller ve callee metodlarının `service_definition_id` farklıysa servis seviyesine rollup.

### 2.4 Servis dışı ilişkiler ([new.md §3](./new.md))


| db.txt            | Tablo                 | Ne veriyor                                                 |
| ----------------- | --------------------- | ---------------------------------------------------------- |
| `screen`          | `env.screen`          | UI sayfaları / EMBL; `page_type` → page, region            |
| `screen_service`  | `env.screen_service`  | `screen_oid` + `service_oid` → `**service_definition.id**` |
| `process`         | `env.process`         | İş süreçleri (e-proc / BPM genişlemesi bekleniyor)         |
| `process_service` | `env.process_service` | Process ↔ servis ( `service_definition` )                  |


Bunlar **onay kapısına değil**; keşif / “veri & arayüz etkisi” katmanı.

### 2.5 db.txt’de olmayan ama DB’de olan tablolar


| Tablo                                                                 | Rol                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `call_edge`                                                           | Metod call-graph (kritik)                                                                        |
| `service_owner`                                                       | IT / iş sahibi (owner rozeti — `service_definition` ile join kuralı ingest sırasında netleşecek) |
| `service_process`, `screen_process`, `process_group`, `process_owner` | Süreç / sahiplik genişlemesi                                                                     |


---

## 3. Uygulamanın bugün beklediği API vs DB


| API / tip                           | Mock kaynak            | Inventory DB kaynağı                                                   |
| ----------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `GET /api/modules`                  | `moduleTree`           | `project_group` → `project` → `artifact` → (lazy) `service_definition` |
| `GET /api/services`                 | `services`             | `env.service_definition` (`status = 1`)                                |
| `GET /api/services/:id`             | `services[id]`         | `service_definition` + owner + counts                                  |
| `GET /api/services/:id/affected`    | `affectsEdges`         | `call_edge` + servis rollup (aşağıda)                                  |
| `GET /api/services/:id/impact`      | BFS on affects         | Aynı rollup + hop BFS                                                  |
| `GET /api/methods`, callers/callees | `methods`, `callEdges` | `java_method`, `call_edge`                                             |
| `GET /api/dwh/*`                    | Postgres `stage`       | **Değişmez** — ayrı pool                                               |


---

## 4. Sol ağaç — önerilen yapı

DB gerçeği + [new.md §1.1](./new.md) kuralları:

### 4.1 Sahiplik ağacı (lazy)

```
project_group          [kind: project]     ← db.txt “Root”
  └─ project           [kind: package]   ← db.txt “Project = jar kapsayıcı”
       └─ artifact     [kind: package]   ← jar (name, path)
            └─ (lazy)  servisler         ← package_name / artifact eşlemesi ile
                 └─ (lazy) entry method ← service_definition_id dolu java_method
```

**Neden lazy:** 37.850 servis + 223.654 metod — ağacın tamamını açmak UI’ı öldürür. Proje/jar düğümü expand edilince SQL ile servis listesi çekilir.

### 4.2 Düz arama görünümü

- Arama: `service_name`, `package_name`, `method name` üzerinde (`GET /api/services?q=`, `GET /api/methods?q=`).
- Servis ve metod **aynı listede** rozet ile ([new.md §1](./new.md)).

### 4.3 Ağaçta OLMAYACAKLAR


| İlişki                        | Nerede                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| `call_edge` (metod → metod)   | Harita / metod paneli                                      |
| Metod → başka servis (remote) | Harita komşusu; **child değil**                            |
| `screen` / `process`          | **Sonraki faz** ([§7](#7-faz-planı)); şimdilik kapsam dışı |


### 4.4 `ModuleNode` id üretimi (taslak)

```text
project_group  → pg-{id}
project        → proj-{id}
artifact       → art-{id}
service        → sd-{service_definition.id}
method         → jm-{java_method.id}
```

UI’daki mevcut `ModuleNode` tipi (`web/src/types.ts`) aynı kalır; sadece kaynak değişir.

### 4.5 Servis olmayan metodlar (`service_definition_id IS NULL`)

DB’de ~223k metod var; yalnızca ~12k’si bir `service_definition`’a bağlı (entry / servis yüzeyi). Geri kalanı internal helper, DAO, mapper vb.


| Görünüm                   | Servis olmayan metod                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Sahiplik ağacı (lazy)** | Jar altında servislerle **kardeş listelenmez**. Ağaç: group → project → jar → **servis** → (opsiyonel) entry metod. |
| **Düz arama**             | Servislerle **aynı seviyede** aranabilir; rozet `[Servis]` / `[Metod]`. `GET /api/methods?q=` tüm metodları döner.  |
| **Harita / call-graph**   | `call_edge` ile caller/callee; servis pivot seçilince metod drill-down.                                             |
| **Onay**                  | Yalnızca **servis** (`service_definition.id`); metod değişikliği üst servise yazılır ([new.md §1](./new.md)).       |


**Kural:** “Metod ve servis aynı seviyede” ifadesi **arama modu** içindir; 211k metodu jar altına açmak ağacı kullanılamaz yapar.

### 4.6 Çoklu jar yolu — kurallar ve risk

Bir servisin koda göre birden fazla `(project → artifact)` yolu olabilir (farklı class/artifact üzerinden). Yanlış ele alınırsa:


| Risk                                    | Sonuç                                                  |
| --------------------------------------- | ------------------------------------------------------ |
| Sessiz “birincil jar”                   | Kullanıcı servisi yanlış jar altında arar, “yok” sanır |
| Aynı servisi iki jar altında listelemek | Duplicate pivot, harita/liste tutarsızlığı             |
| Jar filtresi + graph                    | Ağaçta görünmez ama haritada var → güven kırılır       |


**Önerilen kurallar (uygulama):**

1. **Ağaç:** Her servis **tek canonical düğüm** — entry metodun bağlı olduğu jar (en küçük `artifact.id` tie-break). Rozet: `+N jar` varsa.
2. **Detay / API:** `GET /api/services/:id/locations` → servisin geçtiği tüm `(project_group, project, artifact)` yolları.
3. **Arama:** Jar filtresinden bağımsız; `service_name` / `package_name` ile bulunur.
4. **Harita / etki / onay:** Yalnızca `service_definition.id` — jar konumundan **bağımsız**.
5. **Asla:** Aynı `sd-{id}`’yi ağaçta iki farklı child yapma.

**Mevcut dump notu (2026-09-01):** Entry metod zinciri üzerinden ölçüldüğünde çoklu jar servis sayısı **0** (12.116 servis, hepsi tek jar). Kurallar yine geçerli — ileride tarama veya farklı join kuralı değişebilir.

---

## 5. Kenarlar — mock’tan DB’ye

### 5.1 `callEdges` (metod)

```sql
SELECT caller_id, callee_id
FROM env.call_edge;
```

API: `MethodRef.id` = `jm-{id}`; caller/callee listeleri seçili metod etrafında **limit + depth** ile.

### 5.2 `affectsEdges` (servis) — rollup

Mock kuralı: `affectsEdges[calleeServiceId]` = callee servisini **çağıran** servisler (değişince etkilenenler).

DB’den türetim (mantık):

```sql
-- Örnek: cross-service call → caller servisi, callee servisini etkiler
SELECT DISTINCT
  sd_callee.id AS callee_service_id,
  sd_caller.id AS caller_service_id
FROM env.call_edge ce
JOIN env.java_method jm_caller ON jm_caller.id = ce.caller_id
JOIN env.java_method jm_callee ON jm_callee.id = ce.callee_id
JOIN env.service_definition sd_caller ON sd_caller.id = jm_caller.service_definition_id
JOIN env.service_definition sd_callee ON sd_callee.id = jm_callee.service_definition_id
WHERE sd_caller.id <> sd_callee.id
  AND sd_caller.status = 1 AND sd_callee.status = 1;
```

`service_definition_id` NULL olan metod çağrıları rollup’a dahil edilmez veya “internal” sayılır — ingest’te metrik çıkar.

### 5.3 Ekran / process (sonraki faz — şimdilik yok)

`screen`, `screen_service`, `process`, `process_service` tabloları [new.md §3](./new.md) kapsamında; **F1/F2’de kullanılmayacak**.

```sql
-- İleride (referans)
SELECT s.name AS screen, sd.service_name
FROM env.screen_service ss
JOIN env.screen s ON s.oid = ss.screen_oid
JOIN env.service_definition sd ON sd.id = ss.service_oid;
```

Madde 3 UI’sına; onay listesine **girmez**.

---

## 6. Entegrasyon adımları (kod)

### Adım 1 — Ortam değişkenleri

`server/.env` (DWH’den **ayrı** database adı):

```env
# Mevcut DWH
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=
PGSCHEMA=stage

# Inventory katalog (yeni)
INVENTORY_PGHOST=127.0.0.1
INVENTORY_PGPORT=5432
INVENTORY_PGDATABASE=inventory_db
INVENTORY_PGUSER=postgres
INVENTORY_PGPASSWORD=
INVENTORY_PGSCHEMA=env
```

`server/.env.example` dosyasına aynı anahtarları ekle.

### Adım 2 — Server katmanı (DWH deseni)

```
server/src/inventory/
  db.ts              ← ayrı pg.Pool (INVENTORY_* env)
  types.ts
  serviceService.ts  ← service_definition CRUD/read
  methodService.ts   ← java_method, call_edge
  treeService.ts     ← /api/modules lazy ağaç
  graphService.ts    ← affects rollup, impact BFS
  routes.ts          ← /api/* inventory swap (screenService.ts sonraki faz)
```

Başlangıç: `**CATALOG_SOURCE=mock|inventory**` env ile mock fallback; inventory hazır olunca `inventory`.

### Adım 3 — Route geçişi

`server/src/index.ts`:

1. `CATALOG_SOURCE=inventory` iken `GET /api/modules`, `/api/services`, `/api/methods`, impact uçları inventory servislerinden.
2. Change request / inbox / notes mock owner ile kalabilir (Faz 1); owner eşlemesi `service_owner` ile sonra.

### Adım 4 — Web tarafı

Web **değişmeden** kalabilir (`web/src/api/client.ts` aynı path’ler). Sadece:

- Çok büyük ağaç → lazy expand endpoint: `GET /api/modules/:nodeId/children`
- Arama zorunlu hale gelir (37k servis)

### Adım 5 — Performans


| Risk               | Önlem                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| 484k call_edge     | Servis pivot etrafında sınırlı BFS; materialized view veya cache tablosu |
| 37k servis listesi | Sayfalama + `q` filtresi; ağaçta lazy                                    |
| Impact graph       | Mevcut `IMPACT_VIEW` node bütçesi (48 advanced) aynı                     |


### Adım 6 — Doğrulama checklist

- [ ] `GET /api/health` + inventory ping (`SELECT 1 FROM env.service_definition LIMIT 1`)
- [ ] `/api/modules` → en az bir `project_group` child’ı
- [ ] Expand jar → servis listesi dönüyor
- [ ] Servis seç → harita / tablo doluyor
- [ ] Metod callers/callees → `call_edge` ile uyumlu
- [ ] `checkCallGraphConsistency` benzeri kontrol inventory verisiyle
- [ ] DWH sekmesi hâlâ `stage` şemasından çalışıyor (karışmıyor)

---

## 7. Faz planı


| Faz    | Kapsam                                                                                   | Çıktı                                          |
| ------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **F1** | Inventory pool + lazy ağaç (group → project → jar → servis) + arama + servis detayı      | Sol panel mock yerine DB                       |
| **F2** | `call_edge` → metod callers/callees + servis rollup → **harita / Tablo / Servis İşlevi** | Etki grafiği mock kapanır                      |
| **F3** | `screen_service`, `process_service`                                                      | [new.md §3](./new.md) — **bilinçli ertelendi** |
| **F4** | Owner (`service_owner`), change request gerçek owner                                     | Onay akışı                                     |


**Şu anki hedef:** F1 + F2 — yalnızca **servis, metod, codebase (jar/class) hiyerarşisi** ve mevcut Servis yüzeyi (harita, ilişki tablosu, metod graph). Process/screen yok.

---

## 10. Başlangıç — ne yapmalıyız, ne lazım?

### 10.1 Sizden gereken (bir kez)


| #   | Gerek                                                                                                              | Durum                     |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 1   | `inventory_db` restore, `env` şeması görünür                                                                       | ✅ (sorgular çalışıyor)    |
| 2   | `server/.env` içinde `INVENTORY_*` değişkenleri (§6 Adım 1)                                                        | Kod öncesi sizin makinede |
| 3   | Postgres’in agent oturumundan erişilebilir olması (`psql -U postgres -d inventory_db`)                             | Geliştirme sırasında      |
| 4   | **Ertelenen:** screen/process, owner eşlemesi, canonical jar iş kuralı onayı (şimdilik otomatik tie-break yeterli) | —                         |


Başka dump, VPN veya ek doküman **gerekmez** — şema ve sayılar DB’den çıkarılabilir.

### 10.2 Agent / geliştirme tarafı (otomatik)

Evet — **veritabanını kendim sorgulayarak** adapter ve SQL’leri yazacağım:

- Tablo/kolon doğrulama (`\d env.*`, row count)
- Hiyerarşi join’lerini test etme (group → jar → servis)
- `call_edge` rollup ve cross-service istatistik
- Canonical jar / edge case ölçümü
- API yanıtlarının mock tipleriyle uyumu

pgAdmin ekranını göremem; terminalden `psql` yeterli (şu an erişim var).

### 10.3 Kod sırası (F1 → F2)

```
1. server/.env.example  → INVENTORY_* anahtarları
2. server/src/inventory/db.ts
3. treeService.ts       → GET /api/modules (+ /children lazy)
4. serviceService.ts    → GET /api/services, /api/services/:id
5. methodService.ts     → GET /api/methods, callers/callees
6. graphService.ts      → affected, impact, method impact-graph
7. index.ts             → CATALOG_SOURCE=mock|inventory
8. web (minimal)        → lazy tree expand endpoint’i tüket (gerekirse)
9. CATALOG_SOURCE=inventory ile uçtan uca test
```

**DWH (`stage`) ve Servis katalog (`env`) ayrı pool — karışmaz.**

### 10.4 F1 bitti sayılır when

- [ ] Sol ağaç: group → project → jar expand; jar altında servis listesi
- [ ] Arama: servis + metod (rozet)
- [ ] Servis seçilince mevcut detay başlıkları doluyor
- [ ] Mock kapatılınca DWH sekmesi hâlâ çalışıyor

### 10.5 F2 bitti sayılır when

- [ ] Harita / Tablo / metod graph inventory `call_edge` + rollup ile doluyor
- [ ] Onay listesi (hop-1) rollup’tan geliyor
- [ ] `checkCallGraphConsistency` benzeri kontrol geçiyor

### 10.6 Bilinçli kapsam dışı (şimdilik)

- `screen`, `screen_service`, `process`, `process_service`
- `service_owner` → gerçek owner / inbox
- Hub cluster düğümleri (F2.5), semantic zoom, edge bundling, Cmd+K
- Dış import pipeline (DB zaten restore edildi)

**Not:** Servis rollup MV + bellek Map **F2’nin parçası** (§11.6); “F2 sonrası” değil.

---

## 8. Sık sorular

**Sadece `public` görüyorum, tablo yok.**  
Restore başarısız veya PG sürüm uyumsuz. `env` şemasına bak; Restore log’unda hata var mı kontrol et.

`**service_definition` ile `java_method` farkı?**  
Servis = iş birimi / onay. Metod = bytecode düğümü. Bir servise birden çok metod; entry metodlar `service_definition_id IS NOT NULL`.

**Project ile package_name neden farklı?**  
Project = repo/jar organizasyonu; `package_name` = Java paket adı. Ağaçta ikisi birlikte gösterilir; eşleme artifact/class zinciri veya package prefix ile.

**Mock ne zaman kapanır?**  
F2 tamamlanıp checklist geçince `CATALOG_SOURCE=inventory` varsayılan yapılır.

---

## 9. Referans sorgular (geliştirme)

```sql
-- Aktif servis sayısı
SELECT COUNT(*) FROM env.service_definition WHERE status = 1;

-- Entry metodlu servisler
SELECT COUNT(*) FROM env.java_method WHERE service_definition_id IS NOT NULL;

-- Bir servisin ekranları (madde 3)
SELECT s.name, s.page_type
FROM env.screen_service ss
JOIN env.screen s ON s.oid = ss.screen_oid
WHERE ss.service_oid = :service_definition_id;

-- Servis başına komşu sayısı (rollup önizleme)
SELECT sd_callee.service_name, COUNT(DISTINCT sd_caller.id) AS caller_services
FROM env.call_edge ce
JOIN env.java_method mc ON mc.id = ce.caller_id
JOIN env.java_method md ON md.id = ce.callee_id
JOIN env.service_definition sd_caller ON sd_caller.id = mc.service_definition_id
JOIN env.service_definition sd_callee ON sd_callee.id = md.service_definition_id
WHERE sd_caller.id <> sd_callee.id
GROUP BY sd_callee.id, sd_callee.service_name
ORDER BY 2 DESC
LIMIT 20;
```

---

## 11. Edge case’ler ve harita

Kod öncesi DB ölçümleri (2026-09-01, `inventory_db`) ve uygulama önerileri. **Screen/process bu bölümde yok.**

### 11.1 Ölçüm özeti


| Metrik                             | Değer     | Not                                 |
| ---------------------------------- | --------- | ----------------------------------- |
| Aktif servis                       | 37.850    | `service_definition.status = 1`     |
| Cross-service incoming olan servis | 3.215     | Servis haritasında anlamlı komşuluk |
| Hop-1 incoming **max**             | **249**   | `PROPOSAL_MAIN_GET`                 |
| Hop-1 incoming p90 / p99           | 5 / ~25   | Çoğu pivot sorunsuz                 |
| Cross-service outgoing max         | 36        | Upstream tarafı daha sakin          |
| Entry metodu olmayan servis        | 25.734    | Ağaç konumu zayıf — §4.5            |
| Metod in-degree max (callers)      | **7.534** | Metod haritası (çağıranlar yönü)    |
| Metod in-degree p99                | 32        |                                     |
| Metod out-degree max (callees)     | 1.287     | “Kimi çağırıyor” görünümü ayrı      |


Hub test pivot’ları (harita smoke): `PROPOSAL_MAIN_GET` (249), `CCS_COLLATERAL_HISTORY_CREATE` (140), izole bir servis, medyan komşulu servis.

### 11.2 Servis haritası — hub servis (249 komşu) önerisi

**Sorun:** Mevcut bütçe `maxNodesAdvanced = 48`. Pivot’ta 249 hop-1 downstream varken tam katman eklenemez; mock’taki “150 hop-1 → 0 düğüm” senaryosu burada **gerçek** (249).

**Öneri (katmanlı, mevcut yapıyı bozmadan):**

1. **Kısmi hop-1 admission (F2):** Bütçe yetmese bile hop-1’den **ilk K düğüm** (ör. 12–16) göster; geri kalanı **+N chip** (haritada LTR/radial’deki mevcut `+N` pattern ile aynı dil).
2. **Sıralama kuralı:** Alfabetik veya `service_name` (deterministik); ileride “owner / kritiklik” eklenebilir.
3. **Banner (truncated):**
  *“249 servis doğrudan etkilenir; haritada 16 gösteriliyor. Tam liste: Tablo sekmesi.”*
4. **Tablo sekmesi:** Hop-1 **tam liste** (sayfalı) — harita kırpılsa da onay/keşif listesi eksik kalmasın.
5. **+N tıklama:** Tablo sekmesine geç veya filtreli liste aç (pivot korunur).
6. **Hop 2+:** Yalnızca bütçe yeterse; hub’da genelde hop-1 bile dolu — bu beklenen.

**Yapı devam eder:** `buildImpactGraph` + `truncated` + pivot; ek iş **kısmi admission + mesaj + Tablo sync**.

### 11.3 Metod haritası — sorun ve öneri

**Sorun:** `buildMethodImpactGraph` merkez metod **değişince etkilenen çağıranları** (caller) BFS ile dolaşır (`callersIndex` — mock ile aynı mantık). Bir metoda **7.534 caller** bağlanabiliyor (p99: 32). Bütçe 48 → hub metodlarda kesilir.

Ayrıca **callee** (metodun çağırdıkları, max 1.287) farklı yön — “kimi çağırıyor” paneli / callee listesi; servis **etki haritası** değil.


| Yön                      | DB (`call_edge`)                              | Metod haritası              |
| ------------------------ | --------------------------------------------- | --------------------------- |
| Etkilenenler (değişince) | caller → callee çağrısı; **caller etkilenir** | BFS **callers** üzerinde    |
| Bağımlılıklar            | callee                                        | Callee listesi / ayrı keşif |


**Öneri:**

1. Servis haritası ile **aynı bütçe** (48) + **aynı +N / banner** dili.
2. Metod pivot’ta **caller** yönü varsayılan; callee keşfi ayrı sekme veya sınırlı liste (max 50).
3. Hub metod smoke: in-degree p99 üzerinde bir metod + izole metod.

### 11.4 İzole servisler (~34k)

Cross-service rollup kenarı **olmayan** servisler (veya yalnızca internal çağrı):


| Yüzey                    | Davranış                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Harita**               | Yalnızca pivot düğümü; kenar yok                                                                           |
| **Tablo (etkilenenler)** | Boş liste — hata değil                                                                                     |
| **Mesaj**                | *“Bu servise bağlı cross-service etki kaydı yok. Internal metod çağrıları metod haritasında görülebilir.”* |
| **Onay**                 | Hop-1 boş → mevcut “etkilenen yok” kuralı                                                                  |


Internal-only etki servis haritasında **görünmez**; metod seviyesinde `call_edge` ile kalır.

### 11.5 `affectsEdges` yönü — DB ile uygulama aynı mı?

**Farklı değil; mapping doğru kurulursa aynı.** Karışan şey genelde “çağrı yönü” ile “etki yönü”.

**Veritabanı (`call_edge`):**

```text
caller metod  ──çağırır──►  callee metod
```

**İş kuralı (mock ile aynı):** *Callee tarafındaki servis değişince, caller tarafındaki servis etkilenir.*

```text
affectsEdges[callee_servis_id]  +=  caller_servis_id
```

**Mock (`data.ts`):**

```text
affectsEdges[değişen_servis] = [etkilenen_servis_1, …]
getDownstreamIds(id) → affectsEdges[id]   // “değişince etkilenenler”
```

**Harita (`buildImpactGraph`):** Merkez = değişen servis; hop-1 = `affectsEdges[merkez]`; ok merkez → etkilenen.

**Yanlış rollup (yapma):** `affectsEdges[caller] += callee` — bu “caller değişince callee etkilenir” olur; hem DB çağrı yönünün tersi hem onay mantığının tersi; harita tamamen yanlış görünür.

**Özet:** DB **caller→callee** çağrı kaydeder; uygulama **callee değişince caller etkilenir** diye rollup eder. Yönler zıt değil, **etki yönü çağrının tersi** — bilinçli eşleme.

Rollup SQL (doğru yön):

```sql
SELECT DISTINCT
  sd_callee.id AS callee_service_id,
  sd_caller.id AS caller_service_id
FROM env.call_edge ce
JOIN env.java_method jm_caller ON jm_caller.id = ce.caller_id
JOIN env.java_method jm_callee ON jm_callee.id = ce.callee_id
JOIN env.service_definition sd_caller ON sd_caller.id = jm_caller.service_definition_id
JOIN env.service_definition sd_callee ON sd_callee.id = jm_callee.service_definition_id
WHERE sd_caller.id <> sd_callee.id
  AND sd_caller.status = 1 AND sd_callee.status = 1;
```

→ Uygulama: `affects[callee_service_id].push(caller_service_id)`.

### 11.6 Rollup cache — güncel öneri (F2)

484k `call_edge` → ~11k cross-service servis çifti; 37k servis için **her HTTP isteğinde** rollup yapmak gereksiz.

**Önerilen yıntem (2026, bu proje ölçeği):**


| Katman               | Ne                                                                                       | Neden                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **1. PostgreSQL MV** | `env.mv_service_affects (callee_id, caller_id)` + index `(callee_id)`                    | Rollup SQL bir kez; import sonrası `REFRESH MATERIALIZED VIEW CONCURRENTLY`     |
| **2. API bellek**    | Sunucu açılışında MV → `Map<serviceId, string[]>`                                        | O(1) `getDownstreamIds`; ~3k hub × ortalama düşük derece — RAM ihmal edilebilir |
| **3. Refresh**       | Yeni dump / ingest sonrası manuel veya cron; `POST /api/admin/refresh-catalog` (ileride) | Statik katalog; real-time gerekmez                                              |
| **4. Metod graph**   | Ayrı MV veya sınırlı `callersIndex` lazy load                                            | 484k kenarın tamamını belleğe almak şart değil; pivot etrafında sorgu           |


**Bu aşamada gereksiz:** Redis, streaming graph DB, her istekte ham `call_edge` JOIN.

**Import akışı:**

```text
pg_restore → REFRESH MV → API restart (veya Map hot-reload) → smoke hub pivot’lar
```

Metod callers için: pivot başına `SELECT caller_id FROM call_edge WHERE callee_id = $1 LIMIT 500` + truncate, veya önceden sadece `service_definition_id IS NOT NULL` metodlar için indeksli caller listesi.

### 11.7 Sol ağaç — “Servis olmayan metodları göster” filtresi

Artifact expand altında servis + metod karışmasın diye (§4.5 ile uyumlu):

**Varsayılan (checkbox kapalı):**

```text
CCSProposal.jar
  ├─ [Servis] PRO_FIA_COMMON_...
  └─ … (sayfalı, limit 100)
```

**Checkbox açık** — sol panel veya jar toolbar: `☐ Servis dışı metodları göster`

```text
CCSProposal.jar
  ├─ Servisler (1693) → sayfalı
  └─ Diğer metodlar (4821) → yalnız filtre açıkken, sayfalı limit 50–100
```


| Kural             |                                              |
| ----------------- | -------------------------------------------- |
| İki **ayrı blok** | Servis / metod karışmaz                      |
| Rozet             | `[Servis]` / `[Metod]`                       |
| Varsayılan kapalı | Jar başına binlerce metod                    |
| Harita            | Etkilenmez; metod seçilince metod graph      |
| Faz               | F1.5 veya F2 (F1 önce yalnız servis listesi) |


### 11.8 F2 checklist’e ek

- [ ] `affectsEdges` rollup yönü doğrulandı (§11.5 SQL)
- [ ] MV + bellek Map veya eşdeğeri
- [ ] Hub pivot: `PROPOSAL_MAIN_GET` — kısmi hop-1 + banner + Tablo tam liste
- [ ] İzole servis empty state (§11.4)
- [ ] Metod hub — caller yönü truncate + mesaj
- [ ] Smoke: medyan komşulu servis

### 11.9 Çok bağlantılı merkez düğüm — öneri süzgeci

Aşağıdaki liste, dokümana eklenen genel graph-UX önerilerinin **bu projeye uygun olanları** ile ertelenenleri ayırır. Mevcut kod zaten **LTR + radial** kullanıyor; force-directed yok.

| Öneri | Karar | Faz | Gerekçe |
| ----- | ----- | --- | ------- |
| **Kısmi hop-1 + tek `+N` chip + banner + Tablo tam liste** | ✅ Al | **F2** | §11.2; düşük maliyet, mevcut `ImpactMap` collapsed pattern ile uyumlu |
| **Sert render/BFS bütçesi (48 düğüm)** | ✅ Al | **F2** | `IMPACT_VIEW` zaten var; cluster düğümü = 1 düğüm sayılır |
| **Arama birincil, harita bağlam** | ✅ Al | **F1** | 37k servis; boot’ta `searchServices('')` kaldırılacak, ağaç lazy |
| **Hiyerarşik / radial-tree, cascade radial’de kapalı** | ✅ Al | **Mevcut** | Zaten böyle; force-directed eklenmez |
| **Aggregate-first (cluster: proje/jar, “Ödeme (23)”)** | ✅ Al | **F2.5** | §11.2’deki çoklu bubble fikrinin olgun hali; hop-1 only, tıklayınca expand veya Tablo filtresi |
| **Breadcrumb (pivot → cluster → servis)** | ✅ Al | **F2.5** | Cluster drill-down ile birlikte |
| **Semantic zoom / etiket gizleme (>40 görünür düğüm)** | ⏸ Sonra | **F3 UI** | Radial label yoğunluğu için polish; F2 blocker değil |
| **Sektör bazlı radial (360° / kategori)** | ⏸ Sonra | **F2.5** | Cluster node ile birlikte; fizik motoru gerekmez |
| **Edge bundling** | ❌ Ertele | — | Radial cascade zaten gizli; hop-1 hub’da tek spoke yeterli |
| **Cmd+K command palette** | ❌ Ertele | F4+ | Sol arama + proje filtresi F1–F2 için yeterli |

**Uygulama sırası (hub UX):**

1. **F2:** DB rollup + kısmi admission + banner + Tablo sync (§11.2).
2. **F2.5:** Proje/jar cluster düğümleri (hop-1 only; hop-2+ LTR/Tablo).
3. **F3 polish:** Semantic zoom, cluster breadcrumb iyileştirmesi.

---

## 12. Uygulama sırası (yapmaya başlarken)

Mock’u **tek seferde silmiyoruz**. `CATALOG_SOURCE=mock|inventory` ile paralel geliştirme; F2 checklist geçince varsayılan `inventory`.

### 12.1 Mock ne zaman, nasıl kapanır?

| Aşama | `CATALOG_SOURCE` | Veri kaynağı |
| ----- | ---------------- | ------------ |
| Geliştirme başı | `mock` (varsayılan) | `data.ts`, `methods.ts` |
| F1 bitti | `inventory` test | Ağaç + arama + servis detay → DB; harita hâlâ mock veya boş rollup |
| F2 bitti | `inventory` varsayılan | Tüm katalog + etki uçları DB; mock dosyalar repo’da kalabilir (fallback / test) |
| F4+ | mock isteğe bağlı | Owner / CR gerçek eşleme |

**Evet — yaparken DB’den okuyup mock’un yerine koyacağız:** Her API uç noktası için `server/src/inventory/*` servisi yazılır; `index.ts` env’e göre mock veya inventory çağırır. Web aynı `/api/*` path’lerini kullanır.

### 12.2 İş sırası (önerilen)

```
Sprint 0 — Hazırlık (½ gün)
  □ server/.env.example → INVENTORY_*
  □ server/src/inventory/db.ts (ayrı pool, health ping)
  □ CATALOG_SOURCE switch iskeleti (index.ts)

Sprint 1 — F1: Katalog iskeleti (mock hâlâ harita için)
  □ treeService → GET /api/modules (kök: project_group)
  □ GET /api/modules/:nodeId/children (lazy expand)
  □ serviceService → GET /api/services?q= (sayfalı, min 2 karakter veya limit)
  □ GET /api/services/:id (affectedCount rollup’tan veya 0)
  □ Web: lazy tree expand; boot’ta boş arama yok
  □ Smoke: group → jar → servis; arama bir servis buluyor

Sprint 2 — F2 çekirdek: Graf verisi
  □ MV env.mv_service_affects + startup Map
  □ graphService → getDownstreamIds / getUpstreamIds / buildImpactGraph
  □ methodService → callers/callees (limit), searchMethods
  □ index.ts: affected, neighbors, impact, methods uçları inventory’den
  □ Smoke: PROPOSAL_MAIN_GET hop-1 sayısı; izole servis; rollup yön testi

Sprint 3 — F2 UX: Hub + empty state
  □ buildImpactGraph: kısmi hop-1 admission (12–16 + truncated mesaj)
  □ Banner metni API’den (truncated + totalHop1)
  □ Tablo: neighbors tam liste (249 satır OK; gerekirse sayfalama)
  □ İzole servis empty state (§11.4)
  □ Metod graph truncate + mesaj
  □ checkCallGraphConsistency inventory ile

Sprint 4 — F1.5 (opsiyonel, F2 sonrası)
  □ Jar altında “Servis dışı metodları göster” checkbox (§11.7)
  □ GET /api/services/:id/locations (çoklu jar rozeti)

Sprint 5 — F2.5 (opsiyonel)
  □ Hop-1 cluster düğümleri (proje/jar aggregate)
  □ +N tıklama → Tablo filtresi

F3+ — Bilinçli ertelenen
  □ screen / process (§7)
  □ service_owner → owner / inbox (F4)
  □ Semantic zoom polish
```

### 12.3 Faz “bitti” kriterleri (kısa)

| Faz | Bitti sayılır |
| --- | ------------- |
| **F1** | Lazy ağaç + arama + servis detay `CATALOG_SOURCE=inventory` ile çalışır; DWH etkilenmez |
| **F2** | Harita / Tablo / onay hop-1 inventory rollup; hub smoke geçer |
| **F2.5** | Hub’da cluster + breadcrumb (isteğe bağlı) |

---

## 13. Kurguda eksik / netleştirilecek noktalar

Doküman ve DB ölçümlerine göre kod öncesi açık kalanlar:

| # | Konu | Risk | Önerilen çözüm | Faz |
| - | ---- | ---- | -------------- | --- |
| 1 | **25.734 servisin entry metodu yok** | Ağaçta jar altında bulunamaz | Canonical yol: `package_name` → artifact eşlemesi veya “Konumsuz servisler” kök düğümü; arama her zaman bulur | F1 |
| 2 | **Boot `searchServices('')`** | 37k servis tek istekte | Kaldır; arama min karakter veya sayfalı autocomplete | F1 |
| 3 | **Lazy tree web tarafı** | `App.tsx` tüm ağacı eager yükler | `/children` + expand handler | F1 |
| 4 | **Servis id formatı** | Mock string id vs `sd-{numeric}` | Adapter hep `sd-{service_definition.id}`; UI mock id’ye bağlı değil | F1 |
| 5 | **Owner / onay / notlar** | `service_owner` henüz yok | Mock owner veya boş owner; CR/inbox mock kalır | F4 |
| 6 | **`affectedCount` / `dependsOnCount`** | Mock’ta statik | Rollup Map’ten runtime hesap | F2 |
| 7 | **Hub: server truncated vs UI +N** | Server hop-1’i tamamen keserse harita boş | Server kısmi admission dönsün; UI mevcut collapsed pattern | F2 |
| 8 | **Health check** | Inventory down fark edilmez | `GET /api/health` inventory ping (CATALOG_SOURCE=inventory iken) | F1 |
| 9 | **Entry metodu olmayan servis — harita** | Cross-service kenarı olabilir ama ağaçta yok | Harita/Tablo `service_definition.id` ile çalışır; arama ile pivot | F1 |
| 10 | **Import / MV refresh** | Dump sonrası stale rollup | `REFRESH MATERIALIZED VIEW` + API restart dokümante | F2 |

**Kurgu tamam sayılır** — F1/F2 için bloklayıcı eksik yok; yukarıdakiler implementasyon sırasında kapatılacak net maddeler.

**Bilinçli dışarıda (şimdilik):** screen/process, gerçek owner, otomatik ingest pipeline, Redis/graph DB, force-directed layout, edge bundling.