# Referans özellik adayları

Deneme listesi: maddeleri ekleyip çıkararak ilerleyeceğiz.  
Kaynaklar: Datadog, Backstage, New Relic, Dynatrace, CodeQL, Sourcegraph, JetBrains, Manta/Atlan, OpsLevel/Cortex.

---

## Güçlü adaylar (referanstan)

1. [~] **Upstream / Downstream iki kolon** (Datadog Catalog) — “Beni çağıranlar” vs “Benim çağırdıklarım”
2. [~] **Collapsed path + kenar vurgusu** (Datadog Map) — uzun zincende gürültüyü kes; onay yine 1. hop
3. **Ego-network’te sol/sağ yön** (New Relic) — merkez; solda tüketiciler, sağda bağımlılıklar
4. **Entity header + İlişkiler / Owner sekmeleri** (Backstage) — detay paneli katalog sayfası gibi
5. **Scorecard** (Backstage / Cortex) — owner var mı, bağımlılık beyanı eksik mi
6. **Metod → çağıranlar ağacı** (CodeQL / Sourcegraph) — “hangi metod kırılır?”
7. **Lazy drill-down call hierarchy** (JetBrains) — büyük codebase’de ağaç patlamaz
8. **Kenar tipi:** `http` / `queue` / `db` (Dynatrace Smartscape)
9. **Blast radius özeti + path breadcrumb** (Manta / Atlan) — “N servis · M ekip · kritik path”
10. **On-call / Slack / repo deep link** (OpsLevel) — owner’a ulaşma

---

## UI / UX kazanımları

11. [~] **Filtre:** proje (domain) — etki yolu / harita; ara yol korunur (Backstage / Datadog)
12. **Liste ↔ grafik senkron seçim** (Datadog inspect)
13. **Path breadcrumb:** örn. `Billing → Report → FinanceBatch` (CodeQL)
14. **Gate progress şeridi:** “2/4 onay · 1 beklet”
15. **Deep link:** inbox → talep (`T-123`)

---

## İşlevsellik (ürünü büyütür)

16. **Çift yön görünüm** (tüketiciler / bağımlılıklar) — net UX; 1 ile örtüşebilir
17. **Metod seviyesi etki analizi** — uzun vadeli farklılaşma
18. **Kenar tipi + veri etkisi** — değişiklik formuyla birleşir
19. **Scorecard / eksik sahiplik uyarısı** — onay zinciri kırılmadan önce
20. **Uyum PR linki** (sarı flag sonrası) — bkz. `ONAY_ZINCIRI_SENARYOLAR.md`

---

## Bilerek ertele (şimdilik listede tut, öncelik düşük)

21. Runtime kenar animasyonu / tam APM map (Datadog video) — vitrin; kaynak bizde statik katalog
22. Tüm org grafını bir anda çizmek — ölçek bozar; inspect / ego kalsın

---

## Deneme notları

- İşaret: `[ ]` yapılmadı · `[~]` denendi · `[x]` kaldı · `[-]` çıktı
- Önerilen ilk paket: **1 + 13 + 4**, sonra **6 / 17**
