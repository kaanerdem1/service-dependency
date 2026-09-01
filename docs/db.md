# Inventory DB — katalog rehberi

> Kaynak notlar: `/Users/kaanerdem/Desktop/db/db.txt`  
> İlgili: [new.md §1.1](./new.md), [README](./README.md)

**inventory_db** (`env` şeması) statik servis / metod / call-graph kataloğu. DWH (`stage.katalog_*`) ayrı veritabanı / şema; karışmaz.

F1 + F2 uygulandı: `CATALOG_SOURCE=inventory` iken ağaç, arama, harita, Tablo ve metod graph bu DB’den okunur. Mock (`server/src/data.ts`) fallback olarak durur.

---

## 0. Özet

| Soru | Cevap |
| ---- | ----- |
| Bu DB ne? | Retechfin inventory taraması: servis, metod, call-graph, ekran, process |
| DWH ile aynı mı? | Hayır. Servis yüzeyi `env`; DWH `stage` |
| Dump | `inventory_db_export` — PG **18.4** custom dump (PG 17 restore etmez) |
| Restore sonrası | `inventory_db`, şema **`env`** |
| Uygulama katmanı | `server/src/inventory/*` (ayrı `INVENTORY_*` pool) |

---

## 1. Dump’ı açma (pgAdmin)

1. PostgreSQL **18**’e bağlan.
2. Create Database → `inventory_db`.
3. Restore → Format: **Custom or tar** → `inventory_db_export`.
4. Schemas → **env** → Tables (`public` boş kalabilir).
5. Doğrulama:

```sql
SELECT COUNT(*) FROM env.service_definition WHERE status = 1;
SELECT COUNT(*) FROM env.call_edge;
```

Beklenen mertebe: ~37k aktif servis, ~484k `call_edge`, ~224k `java_method`.

---

## 2. Tablolar

### 2.1 Hiyerarşi (sahiplik)

| Tablo | Ne | UI |
| ----- | -- | -- |
| `project_group` | Kök gruplar (CCS, ACC, …) | Ağaç: **Grup** (`pg-{id}`) |
| `project` | Gruba bağlı; pratikte jar kapsayıcı | Ağaçta **gösterilmez** (grup → jar) |
| `artifact` | Taranan **jar** | Ağaç: **Jar** (`art-{id}`) |
| `java_class` | Sınıf; `artifact_id` → jar | Ağaçta yok; join için |
| `java_method` | Metod; `class_id` → class | Servis altı entry metod / call-graph (`jm-{id}`) |
| `service_definition` | İş servisi (`status = 1`) | Pivot / onay birimi (`sd-{id}`) |

**Önemli:** `service_definition` üzerinde `project_id` yok. Jar yolu:

```text
java_method.service_definition_id → java_class → artifact → project → project_group
```

```sql
SELECT sd.id, sd.service_name, a.name AS jar, p.project_name, pg.project_group_name
FROM env.service_definition sd
JOIN env.java_method jm ON jm.service_definition_id = sd.id
JOIN env.java_class jc ON jc.id = jm.class_id
JOIN env.artifact a ON a.id = jc.artifact_id
JOIN env.project p ON p.id = a.project_id
JOIN env.project_group pg ON pg.id = p.project_group_id
WHERE sd.status = 1
LIMIT 10;
```

Yedek (daha zayıf): `service_definition.class_name` / `package_name` → `java_class.fqcn`. Boot’ta kullanılmıyor (ağır).

### 2.2 Servis ↔ metod

| Kayıt | Anlam |
| ----- | ----- |
| `java_method` (tümü) | ~224k call-graph düğümü |
| `java_method.service_definition_id IS NOT NULL` | Entry metod (~12k) |
| `service_definition` | `service_name`, `method_name`, `package_name`, `class_name`, … |

Onay ve etki özeti **servis** (`service_definition.id`) bazında.

### 2.3 Call-graph

`env.call_edge`: `caller_id` / `callee_id` → `java_method.id`.

Cross-service: caller ve callee metodlarının `service_definition_id` farklıysa servis rollup’ına girer. `service_definition_id` NULL çağrılar rollup’a girmez (internal).

### 2.4 Ekran / process (kullanılmıyor)

`screen`, `screen_service`, `process`, `process_service` — keşif katmanı, onay kapısı değil. **F3.**

### 2.5 Diğer

| Tablo | Rol |
| ----- | --- |
| `service_owner` | IT / iş sahibi — **F4**, join kuralı ingest’te netleşecek |
| `service_process`, `screen_process`, `process_group`, `process_owner` | Süreç / sahiplik |

---

## 3. API ↔ DB

| API | Kaynak |
| --- | ------ |
| `GET /api/modules` | `project_group` (kök) + `Konumsuz servisler` |
| `GET /api/modules/:id/children` | Grup → jar; jar → servis (ilk 100); konumsuz liste |
| `GET /api/services?q=` | `service_definition` (`service_name` / `package_name` / `class_name`) |
| `GET /api/services/:id` | Servis + konum (entry join) + rollup sayaçları |
| `GET /api/services/:id/locations` | Tüm jar yolları |
| `GET /api/services/:id/affected`, `/impact` | `call_edge` rollup + BFS |
| `GET /api/methods`, callers/callees | `java_method`, `call_edge` |
| `GET /api/dwh/*` | Postgres `stage` — **değişmez** |

Id: `pg-{id}`, `art-{id}`, `sd-{service_definition.id}`, `jm-{java_method.id}`.

---

## 4. Sol ağaç (uygulama)

```
Grup (project_group)
  └─ Jar (artifact)
       └─ Servis  → (chevron) entry metodlar
            └─ (checkbox) servis dışı metodlar — jar altında ayrı blok
Konumsuz servisler (N)
  └─ entry metodu olmayan aktif servisler (ilk 100)
```

Lazy: 37k servis + 224k metod tek seferde açılmaz.

**Ağaçta yok:** `call_edge`, remote servis child, `java_class`, `project` katmanı, screen/process.

**Arama:** servis + metod aynı listede rozetle. Konumsuz servis isimle bulunur.

**Çoklu jar:** dump’ta entry zinciriyle ölçülünce 0 (12.116 servis, tek jar). Kurallar: ağaçta tek canonical düğüm; `locations` tüm yollar; harita `sd-{id}` ile jar’dan bağımsız.

**Servis dışı metod:** `service_definition_id IS NULL`. Varsayılan kapalı; jar checkbox ile sayfalı (50).

---

## 5. Kenarlar

### 5.1 Metod

```sql
SELECT caller_id, callee_id FROM env.call_edge;
```

`MethodRef.id` = `jm-{id}`; pivot etrafında limit.

### 5.2 Servis rollup (`affectsEdges`)

Çağrı: `caller metod → callee metod`.  
Etki: **callee servisi değişince caller servisi etkilenir.**

```text
affectsEdges[callee_servis_id] += caller_servis_id
```

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

Yanlış: `affects[caller] += callee` — onay ve harita ters döner.

Açılışta bellek `Map`; dump sonrası `REFRESH MATERIALIZED VIEW` (varsa) + API restart.

### 5.3 Ekran / process — F3

```sql
SELECT s.name AS screen, sd.service_name
FROM env.screen_service ss
JOIN env.screen s ON s.oid = ss.screen_oid
JOIN env.service_definition sd ON sd.id = ss.service_oid;
```

---

## 6. Ortam

DWH ve inventory **ayrı** DB:

```env
PGDATABASE=postgres
PGSCHEMA=stage

CATALOG_SOURCE=inventory
INVENTORY_PGDATABASE=inventory_db
INVENTORY_PGSCHEMA=env
INVENTORY_PGHOST=127.0.0.1
INVENTORY_PGPORT=5432
INVENTORY_PGUSER=postgres
INVENTORY_PGPASSWORD=
```

`tsx watch` uzun ingest/katalog yükünde kilitlenebilir; `npm start` (`server/`) daha stabil.

---

## 7. Fazlar

| Faz | Kapsam | Durum |
| --- | ------ | ----- |
| **F1** | Inventory pool, lazy Grup→jar→servis, arama, detay | **Yapıldı** |
| **F2** | `call_edge` rollup, harita / Tablo / metod graph, hub +N / bubble | **Yapıldı** |
| **F2.5** | Hop-1 bubble (6+2 / kalabalık hub), radial | **Yapıldı** |
| **F3** | `screen_service`, `process_service`; semantic zoom | **Yapılmadı** |
| **F4** | `service_owner`, gerçek onay / inbox | **Yapılmadı** |

---

## 8. Sık sorular

**Yalnız `public` görünüyor.** Restore veya PG sürümü; şema `env`.

**Servis vs metod.** Servis = iş / onay. Metod = bytecode. Entry = `java_method.service_definition_id IS NOT NULL`.

**Project vs `package_name`.** Project/jar organizasyonu; `package_name` Java paketi.

**Konumsuz.** `service_definition` var, hiçbir metod `service_definition_id` ile bakmıyor → jar join yok. Ağaçta ayrı kök; arama isimden bulur. Harita `sd-{id}` ile çalışır (kenar varsa).

---

## 9. Referans SQL

```sql
-- Aktif servis
SELECT COUNT(*) FROM env.service_definition WHERE status = 1;

-- Entry metod
SELECT COUNT(*) FROM env.java_method WHERE service_definition_id IS NOT NULL;

-- Konumsuz (ağaç sayacı ile aynı)
SELECT COUNT(*) AS konumsuz
FROM env.service_definition sd
WHERE sd.status = 1
  AND NOT EXISTS (
    SELECT 1 FROM env.java_method jm
    WHERE jm.service_definition_id = sd.id
  );

SELECT sd.id, sd.service_name
FROM env.service_definition sd
WHERE sd.status = 1
  AND NOT EXISTS (
    SELECT 1 FROM env.java_method jm
    WHERE jm.service_definition_id = sd.id
  )
ORDER BY sd.service_name
LIMIT 100;

-- Konumlu (karşılaştırma)
SELECT COUNT(DISTINCT sd.id) AS konumlu
FROM env.service_definition sd
JOIN env.java_method jm ON jm.service_definition_id = sd.id
WHERE sd.status = 1;

-- Hop-1 yoğunluğu
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

-- Ekranlar (F3)
SELECT s.name, s.page_type
FROM env.screen_service ss
JOIN env.screen s ON s.oid = ss.screen_oid
WHERE ss.service_oid = :service_definition_id;
```

---

## 10. Ölçümler (2026-09-01 dump)

| Metrik | Değer |
| ------ | ----- |
| Aktif servis | 37.850 |
| Cross-service incoming olan | 3.215 |
| Hop-1 incoming max | **249** (`PROPOSAL_MAIN_GET`, `sd-37504`) |
| Hop-1 p90 / p99 | 5 / ~25 |
| Cross-service outgoing max | 36 |
| Entry metodu olmayan | **25.734** |
| Metod in-degree max | 7.534 |
| Metod in-degree p99 | 32 |
| Metod out-degree max | 1.287 |

Smoke: `PROPOSAL_MAIN_GET` (249), `ss.md` hop-1 seti (3/5/7/10/15/20), izole servis.

**İzole servis:** haritada yalnız pivot; Tablo boş — hata değil. Internal çağrı metod haritasında.

**Hub UX (yapıldı):** kısmi hop-1 + bubble (`+N servis`) + banner + Tablo tam liste. Radial: hop halkaları ayrı yarıçap; 9–40 komşu → 6 servis + 2 bubble.

---

## 11. Bilinçli dışarıda

Screen/process UI, gerçek owner, otomatik ingest, Redis/graph DB, force-directed, edge bundling, Cmd+K.

---

## 12. Sıradaki işler

Kod tarafı F1/F2/F2.5 kapandı. Kalanlar:

### 1. DB — entry metod bağını netleştirmek

~25.734 aktif serviste `java_method.service_definition_id` boş. Jar / grup / kapsam filtresi bu yüzden kurulamıyor (filtre `unknown` veya liste dışı).

Ingest tarafında her iş servisi için en az bir entry metod FK’si beklenir. Uygulama yedek `class_name` eşlemesini boot’ta çalıştırmıyor.

İletilecek SQL: §9 konumsuz sorguları.

### 2. Jar / konumsuz sayfalama

Jar altı servis ve `Konumsuz servisler` ilk **100**; servis dışı metod ~50. Devamı yok. Offset / “daha fazla” eklenebilir.

### 3. F3 / F4

| | |
| --- | --- |
| **F3** | `screen_service` / `process_service` keşif yüzeyi; radial semantic zoom |
| **F4** | `service_owner` → gerçek owner, CR / inbox |

Onay birimi servis id kalır; F3 onay listesine girmez.
