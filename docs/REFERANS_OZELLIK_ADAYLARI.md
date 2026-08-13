# Referans özellik adayları

Deneme listesi: maddeleri ekleyip çıkararak ilerleyeceğiz.  
Kaynaklar: Datadog, Backstage, New Relic, Dynatrace, CodeQL, Sourcegraph, JetBrains, Manta/Atlan, OpsLevel/Cortex.

İşaret: `[ ]` yapılmadı · `[~]` denendi · `[x]` kaldı · `[-]` çıktı / bilinçli ertelendi

---

## Sıralama mantığı (neden bu sıra?)

1. **Çakışma riski** — mevcut LTR etki haritası / via-cascade / katman / proje filtresi bozulmasın  
2. **Bağımlılık** — önce veri/UI iskeleti, sonra ona oturan rozet/uyarı  
3. **Test kolaylığı** — küçük, tek ekranda doğrulanabilir parçalar önce; model değişimi sonra  
4. **Ürün değeri** — onay zinciri ve sahiplik, vitrin APM’den önce

Numara = eski referans kimliği (kaynak eşlemesi için). **Sprint sırası = aşağıdaki blok sırası.**

---

## Bitti / denendi

1. [~] **Upstream / Downstream iki kolon** (Datadog Catalog)
2. [~] **Collapsed path + kenar vurgusu** (Datadog Map) — katman aç/kapa, via/cascade, ego hover
11. [~] **Filtre:** proje — etki yolu / harita; ara yol + eşleşen
13. [~] **Path breadcrumb** — hover’da via zinciri
9. [~] **Blast radius özeti** — N servis · M ekip · P proje
4. [~] **Entity header + İlişkiler / Owner / Talepler sekmeleri** (Backstage)
6. [x] **Metod → çağıranlar ağacı** (+ lazy callers/callees)
7. [~] **Lazy drill-down** — bir hop
6b. [x] **Sol ağaç** Project→Package→Service→Method (lazy)
6c. [x] **Gelişmiş harita** “Bağlı metodları göster” (2–3 / +N)

---

## Sıradaki paket

### B — Katalog paneli *(14, 15, 10 sonraya)*

14. [ ] **Gate progress şeridi** — “2/4 onay · 1 beklet”  
    *Sonraya bırakıldı (geri alındı).*

15. [ ] **Deep link:** inbox → talep (`T-123`)  
    *Sonraya bırakıldı.*

10. [ ] **On-call / Slack / repo deep link** (OpsLevel)  
    *Sonraya bırakıldı.*

### C — Kalite kapısı *(5, 19, 20 sonraya)*

5. [ ] **Scorecard** (Backstage / Cortex) — owner var mı, bağımlılık beyanı eksik mi  
    *Sonraya: sahipsiz servis beklenmiyor; sahiplik kişi veya ekip olabilir (model sonra).*
19. [ ] **Scorecard / eksik sahiplik uyarısı** — onay açmadan önce  
    *Sonraya: aynı gerekçe — “owner yok” kapısı ürün varsayımına uymuyor.*
20. [ ] **Uyum PR linki** (sarı flag sonrası) — bkz. `ONAY_ZINCIRI_SENARYOLAR.md` K2/K6  
    *Sonraya bırakıldı.*

### D — Kenar semantiği *(8 + 18 sonraya — APM tipi; Java/framework call-graph önce)*

8. [ ] **Kenar tipi:** `http` / `queue` / `db`  
    *Sonraya: genel APM kenar tipleri; framework metod graı gelince yeniden değerlendir.*
18. [ ] **Kenar tipi + veri etkisi** — değişiklik formuyla birleşir  
    *Sonraya: 8’e bağlı.*

### E — Bilinçli seçim (mevcut harita ile çakışır)

3. [-] **Ego-network’te sol/sağ yön** (New Relic)  
16. [-] **Çift yön görünüm** (haritada)

### F — Metod / call-graph ← **şimdi: 17 entegrasyon**

6. [x] **Metod → çağıranlar ağacı** — DetailPanel **Metodlar**; bol mock  
7. [~] **Lazy drill-down call hierarchy** — bir hop callers/callees lazy  
17. [~] **Metod seviyesi etki analizi** — blast özeti var; onay listesine bağlı değil  

*Ölçek UX:* sol ağaç / arama → metod seçince **gelişmiş metod etki haritası** (katmanlı çağıran blast). Servis haritasında “Bağlı metodları göster” → yanında `N metod` rozeti, açılınca liste + dim. Basit etki yolu servis seviyesinde kaldı.

*Test:* `docs/METOD_TEST_SENARYOLARI.md` (§E/F) + `GET /api/meta/call-graph-consistency`

---

## Bilerek düşük öncelik

21. [-] Runtime kenar animasyonu / tam APM map  
22. [-] Tüm org grafını bir anda çizmek

---

## Önerilen sprint dilimleri

| Dilim | Maddeler | Test odağı |
|-------|----------|------------|
| Sprint 1 (bitti) | **13 → 9** | Path + blast özeti |
| Sprint 2 | **4** (bitti); **10 / 14 / 15** sonraya | Detay paneli |
| Sprint 3 | **5 + 19 → 20** hepsi sonraya | Scorecard / uyum PR |
| Sprint 4 | **8 → 18** sonraya | APM kenar tipi |
| Sprint 5 | **6 + 7** (bitti/~) → **17** onay bağlama | Metod kataloğu; `METOD_TEST_SENARYOLARI.md` |
| Yapma (şimdi) | **3, 16, 21, 22** | Harita dilini / ölçeği bozar |

---

## Gerçek veri gelince — uyum / test notu

**Not (2026-08-13):** `owner.team` / “ekip” mantığı büyük ihtimalle **kalmayacak**. Asıl codebase’e yakın sahiplik / domain modeli gelince blast özeti, yetki ve filtre buna **yeniden uyarlanacak**. Mock’taki Payments/Orders ekipleri geçici.

| Kavram (şimdilik mock) | Alan | Örnek |
|------------------------|------|--------|
| **Proje** | `projectId` | Commerce / Platform / Data |
| **Ekip** *(muhtemelen kalkacak)* | `owner.team` | Payments, Orders, … |
| **Paket** | `packageId` | com.example.payments |

Gerçek model gelince: blast “ekip” sayacı, domain yetkisi ve ilgili UI metinleri yeni şemaya göre düzenlenecek; mock varsayımlarına güvenilmeyecek.
