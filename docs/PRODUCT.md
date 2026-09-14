# Ürün — Service Dependency

> Çalıştırma ve mimari: [README](./README.md) · Veri / API: [db.md](./db.md) · Issue entegrasyonu: [entegrasyon.md](./entegrasyon.md)

**Statik katalog + etki analizi.** Değişiklik onayı, flag, inbox ve rol modeli **bu uygulamada değil** — intranet **issue management** aracında kalır. SD, issue’ya “bu servis değişirse kim etkilenir?” cevabını verir.

---

## 1. Ne yapıyoruz?

**Asıl soru:** Büyük bir codebase’de bir servis veya metod değişince, ucu hangi servislere (ve metodlara) dokunuyor?

```
Servis A
  └─ Metod X
       └─ Metod Y
            └─ (ileride) Tablo / API / Kuyruk
```

**Ürün özü:** Statik katalog + etki analizi. Runtime APM zorunlu değil.

**İki yüzey:**

| Yüzey | Odak |
|-------|------|
| **Servis kataloğu** | Servis ↔ servis bağımlılığı, harita, tablo, metod call-graph |
| **DWH kataloğu** | Tablo / kolon / prosedür lineage, etki yarıçapı |

Uzun vadede servis → metod → veri katmanı tek etki hikâyesinde birleşir.

---

## 2. Sınır: SD vs issue management

| SD (biz) | Issue management (intranet) |
|----------|----------------------------|
| Katalog gezinme, arama | Ticket / change kaydı |
| Etkilenen servis listesi (hop-1) | Onay, red, beklet, gate |
| Harita / tablo / metod call-graph | Inbox, bildirim, rol / yetki |
| Deep link veya embed (`?service=`) | Workflow, sahiplik, audit |

Issue kaydından SD’ye link veya gömülü sekme: [entegrasyon.md](./entegrasyon.md).

Standalone uygulamadaki **değişiklik talebi / inbox / flag** ekranları yalnızca erken POC mock’udur; ürün sınırı değildir, issue entegrasyonu gelince kapatılacak (`features.cr: false`).

---

## 3. Ürün omurgası

Sol **modül ağacı** (grup → jar → servis), sağ **seçili servis detayı**:

```
┌─────────────────────┬──────────────────────────────────────────┐
│ Modül ağacı         │  Servis · etkilenen N · konum (jar)     │
│ [ara ⌘K]            │  [Harita] [Tablo] [Servis işlevi] …      │
│ Favoriler · Akışlar │                                          │
│                     │  Harita: LTR / Radial · pivot · katman   │
│                     │  Tablo: L1→L2→L3 zincirleri             │
└─────────────────────┴──────────────────────────────────────────┘
```

---

## 4. Durum (bugün)

| Alan | Durum | Not |
|------|--------|-----|
| Modül ağacı (lazy) | ✅ | Inventory DB — ~37k servis |
| Arama (servis / metod) | ✅ | ⌘K komut paleti |
| Etkilenen servisler (hop-1 API) | ✅ | Issue’ya aktarılacak özet küme |
| Harita (LTR + Radial) | ✅ | Pivot, geri/ileri, katman aç/kapa |
| Tablo (etki zinciri) | ✅ | L1 satır → L2/L3/L4 kolonları |
| Metod call-graph | ✅ | Servis altında drill-down |
| Favoriler · iş akışları | ✅ | ⌃F / ⌃G — kişisel gezinme |
| Servis işlevi / ekran / process | ✅ kısmi | Özet + filtre; **process akış haritası** ayrıntı: [process-flow.md](./process-flow.md) |
| Process — tam akış haritası | ✅ | XML ingest, path focus, drawer, yol snapshot (PDF) |
| Process — akış rotası oluştur | ✅ | Adım adım seçim, kayıt (Kaydet / Farklı kaydet), rotalar paneli |
| DWH lineage sekmesi | ✅ | Ayrı `surface=dwh` |
| Inventory DB entegrasyonu | ✅ | Postgres (`env.*`) |
| Issue deep link / embed | ⏳ | F1: `?service=` — [entegrasyon.md](./entegrasyon.md) |
| Gerçek owner (F4) | ⏳ | `service_owner` + issue sahiplik alanları |
| Kenar tipi (`http` / `queue`) | ⏳ | P2 |

Test servisleri: repo kökünde `ss.md`.

---

## 5. Etki analizi kuralları

### Etkilenen servisler

- Birincil soru: **“Bu değişirse kim etkilenir?”** (bu servisi **çağıran** servisler).
- UI dili: **etkilenen servisler** — “caller” kullanıcıya gösterilmez.

### Hop-1 vs derin katman

| Katman | Ne | Kim kullanır |
|--------|-----|--------------|
| **Hop-1** (doğrudan) | Değişiklikten doğrudan etkilenen servisler | Issue tool — bilgilendirme / onay listesi kaynağı |
| **Hop 2–4** (dolaylı) | Zincir halinde dolaylı etki | SD harita / tablo — keşif ve etki yarıçapı |

Dolaylı görünen servis, issue tarafında otomatik onaya **eklenmez**; issue workflow’u hop-1 kümesiyle beslenir.

---

## 6. Harita ve tablo

### Harita

- **Asla full-mesh** — önce servis seç, sonra ego-network çiz.
- **LTR** ve **Radial**; aynı veri, pivot + geri/ileri.
- **Katman** aç/kapa ile 2–3 hop; bütçe dolunca kısalt + pivot.
- **Hub servisler** (ör. 249 doğrudan çağıran): haritada kısmi hop-1 + `+N`; tam liste **Tablo** sekmesinde.

### Tablo

- Her satır = bir **L1** (doğrudan çağıran).
- Yan kolonlar = **L2 → L3 → L4** zinciri.
- Satır tıklama = pivot (harita ile senkron).

### Ölçek

| Mod | Düğüm bütçesi (yaklaşık) | Max hop |
|-----|--------------------------|---------|
| Basit | ~28 | 3 |
| Gelişmiş | ~48 | 3 |

---

## 7. Bilinçli kapsam dışı

Bunlar **SD’de yapılmaz** — issue management’ta kalır veya oradan bağlanır:

- Onay flag’leri (kabul / red / beklet / gate)
- Inbox, talep CRUD, bildirim workflow’u
- Requester / owner / viewer rol matrisi
- Runtime APM, full-mesh harita
- Kenar tipi rozeti (P2)

Standalone’daki mock CR/inbox kodu (`changeRequests.ts`) geçici; F5’te kaldırılır veya issue API sync yazılır.

---

## 8. Nerede detay?

| Konu | Doküman / kod |
|------|----------------|
| API ↔ DB, ağaç, smoke | [db.md](./db.md) |
| Mimari, çalıştırma | [README](./README.md) |
| Issue link, embed, `CatalogWorkbench` | [entegrasyon.md](./entegrasyon.md) |
| Etki BFS | `server/src/impactGraph.ts` |
| Harita layout | `web/src/impact/mapLayout.ts`, `ImpactMap.tsx` |
| Process tam akış + rota | [process-flow.md](./process-flow.md) · `ProcessFlowMap.tsx`, `ProcessFlowRouteBuilder.tsx` |

---

*Son güncelleme: 2026-09-14 — Process akış rotası ve snapshot dokümantasyonu eklendi.*
