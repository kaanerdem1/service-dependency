# Referans özellik adayları — sonraya bırakılanlar

Yapılanlar bu listeden çıkarıldı. Aşağıdakiler bilinçli olarak **ertelendi**.

Kaynaklar: Datadog, Backstage, New Relic, Dynatrace, CodeQL, Sourcegraph, JetBrains, Manta/Atlan, OpsLevel/Cortex.

---

## Açık (sıradaki — ertelenmedi)

17. [ ] **Metod seviyesi etki → onay listesi**  
    Harita / blast var; değişiklik talebi ve gate henüz metod blast’ına bağlı değil.

---

## Sonraya bırakılanlar

### Katalog paneli

14. [ ] **Gate progress şeridi** — “2/4 onay · 1 beklet”  
15. [ ] **Deep link:** inbox → talep (`T-123`)  
10. [ ] **On-call / Slack / repo deep link** (OpsLevel)

### Kalite kapısı

5. [ ] **Scorecard** (Backstage / Cortex) — owner var mı, bağımlılık beyanı eksik mi  
    *Sahipsiz servis beklenmiyor; sahiplik modeli gelince yeniden bakılacak.*
19. [ ] **Scorecard / eksik sahiplik uyarısı** — onay açmadan önce  
    *5 ile aynı gerekçe.*
20. [ ] **Uyum PR linki** (sarı flag sonrası) — bkz. `ONAY_ZINCIRI_SENARYOLAR.md` K2/K6

### Kenar semantiği *(APM tipi; framework call-graph önce)*

8. [ ] **Kenar tipi:** `http` / `queue` / `db`  
18. [ ] **Kenar tipi + veri etkisi** — değişiklik formuyla birleşir *(8’e bağlı)*

---

## Bilerek yapılmayacak (şimdi)

3. [-] Ego-network’te sol/sağ yön (New Relic)  
16. [-] Çift yön görünüm (haritada)  
21. [-] Runtime kenar animasyonu / tam APM map  
22. [-] Tüm org grafını bir anda çizmek

---

## Gerçek veri gelince — uyum notu

**Not (2026-08-13):** `owner.team` / “ekip” mantığı büyük ihtimalle **kalmayacak**. Blast özeti, yetki ve filtre gerçek sahiplik modeline göre yeniden uyarlanacak.

| Kavram (şimdilik mock) | Alan | Örnek |
|------------------------|------|--------|
| **Proje** | `projectId` | Commerce / Platform / Data |
| **Ekip** *(muhtemelen kalkacak)* | `owner.team` | Payments, Orders, … |
| **Paket** | `packageId` | com.example.payments |

---

## Yüksek sayılı bağlılığa sahip servisler için

1 merkeze **20–30 hop-1 komşu** (ve üzeri) denk gelince soldan-sağa harita “hepsini kolonda çiz” diye ölçeklenmez; **hepsini göstermemek** üzerine ölçeklenir. Hop-1 onay listesi haritadan ayrı kalır: 30 kişilik onay ≠ 30 kutu.

### Mevcut dili bozmadan

- **Ego + örneklem:** hop 1’de 5–8 “önemli” (owner çeşitliliği, kenar sayısı, aynı proje) + `+22 daha`. Tıkla → liste/panel; haritayı 30 kutuyla doldurma.
- **Grupla, tek tek değil:** 30 servis → 4–6 küme (proje / paket / ekip). Haritada kutu = küme; açınca üyeler. 30 düğüm → 5 düğüm.
- **Harita keşif, liste iş:** “kim onaylar?” = kaydırılabilir liste + arama. Harita = yayılma hissi + 2. katman.
- **Pivot:** 30’u bir anda değil; bir komşuya tıkla, o merkez olsun (zaten var).

20–30 hop-1: küme / `+N` / liste — LTR kalabilir.  
100+ hop-1 veya 3 hop’ta yüzlerce: harita özet (blast: N servis, M proje); çizim yok. Pivot + filtre zorunlu.  
Method seviyesi: bir servisin 20–30 metodu ayrı overlay; 30×30 call-graph’ı servis haritasına bindirmeyin.

### Alternatif düzenler (dinamik)

Hepsi BFS yerine başka algoritma değil; **başka layout**. Hop / onay kuralı aynı kalır.

| Yaklaşım | Ne zaman işe yarar | Risk |
|----------|--------------------|------|
| **Yelpaze / radial** (merkez ortada, hop 1 halka) | 20–30 hop-1 tek bakışta | LTR + “etki sağa akar” dilini bozar (#3 bilinçli elendi) |
| **Focus + context** (seçili büyük, diğerleri halkada küçük) | Hover’da netlik | Cascade okları yine kalabalık |
| **Sadece hop-1 halkası, hop-2 isteğe** | 30 doğrudan + dolaylı ayrı | 2. katmanı gizlerseniz keşif zayıflar |
| **Mini-map + detay** | Çok hop açıkken | 30 hop-1’de şart değil |
| **Semantic zoom** | Yakın: isim; uzak: küme | Uygulama maliyeti yüksek |
| **Force-directed** | Organik görünüm | Katman/onay okunmaz; kaçının |

20–30 için radial güzel vitrin, ürün omurgası için şart değil. Asıl kazanç **küme + collapsed + liste**. Hop-1 sayısı > 12 ise isteğe bağlı radial veya “komşular çekmecesi”; varsayılan LTR kalsın.
