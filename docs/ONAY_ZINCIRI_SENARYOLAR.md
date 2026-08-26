# Onay zinciri — örnek senaryolar

> Örnek: `BillingService` değişince hem `FinanceBatchJob` hem `ReportingService` etkilenir; `ReportingService` değişirse yine `FinanceBatchJob` etkilenir.  
> Soru: Tek talepte FinanceBatch’e **iki kez mi** onay gider, yoksa **her değişiklik ayrı talep** mi açılır?  
> İlgili: [ServiceDependency](./ServiceDependency.md), [UI/UX](./UI_UX_GEREKSINIMLER.md)  
> Tarih: 2026-08-12

---

## 0. Örnek grafik (mock ile uyumlu)

```
BillingService ──etki──► FinanceBatchJob     (doğrudan, hop 1)
       │
       └──etki──► ReportingService           (doğrudan, hop 1)
                         │
                         └──etki──► FinanceBatchJob   (dolaylı, hop 2)
```

Owner’lar farklı varsayalım:

| Servis | Owner (ör.) |
|--------|-------------|
| BillingService | Ayşe (Payments) — **requester** |
| ReportingService | Zeynep (Platform) |
| FinanceBatchJob | Zeynep veya ayrı biri — aşağıda “Fin Owner” |

---

## 1. İki ürün modeli (seçim gerekir)

### Model A — Tek talep, yalnız 1. katman (MVP önerisi)

- Billing değişikliği talebi açılınca **yalnızca doğrudan etkilenenler** onaylar: Reporting + FinanceBatch.
- FinanceBatch’e **bir** bildirim gider (Billing → FinanceBatch bağı).
- Reporting “ben de kodumu güncellemem lazım” derse: **ayrı değişiklik talebi** açar; o talepte FinanceBatch yine **bir kez** onaylar.
- Her talep kendi 1. katman listesiyle sınırlı kalır; zincir bilinçli olarak parçalanır.

### Model B — Tek talepte tüm katmanlar

- Billing talebi açılınca sistem 1. + 2. katmanı (veya daha fazlasını) toplar.
- FinanceBatch hem 1. hem 2. katmanda görünür → **aynı servis iki kez sayılabilir**.
- Tek talepte herkes onaylar; Reporting’in kendi değişikliği bu talebin içinde mi yoksa yan etki mi belirsizleşir.

**Kısa cevap:** MVP için **Model A** daha sade: FinanceBatch’e talep başına **bir** istek. Reporting ayrıca değişecekse **yeni talep**. Model B’de çift sayımı önlemek için ek kurallar gerekir.

---

## 2. Model A akışı (bu örnekte)

1. Ayşe: Billing değişikliği talebi.
2. Onay listesi (1 hop): Reporting (Zeynep), FinanceBatch (Fin Owner) — **2 satır, FinanceBatch bir kez**.
3. İkisi 🟢 → **Onay açık** → Billing deploy edilebilir.
4. Zeynep kendi servisini uyarlamak zorunda kalırsa: **Reporting değişiklik talebi** açar.
5. O talepte etkilenen: FinanceBatch — **yeni 1 onay**.
6. FinanceBatch 🟢 → Reporting değişikliği onaylanır.

Böylece FinanceBatch iki **farklı talepte** (Billing CR, Reporting CR) onaylayabilir; bu “aynı talepte 2 istek” değildir, **iki ayrı değişiklik**tir.

---

## 3. Kötü senaryolar ve olası çözümler

### K1 — Aynı owner’a çift bildirim (Model B veya hatalı transitive)

**Ne olur:** FinanceBatch hem Billing’in doğrudan etkileneni hem Reporting üzerinden dolaylı; tek CR’de 2 flag / 2 mail.

**Risk:** Yorgunluk, çelişkili flag (birinde 🟢 birinde 🔴), gate hesabı bozulur.

**Çözümler:**

- Etkilenen kümede **serviceId dedupe** (tek satır).
- Satırda gerekçe: `neden: doğrudan Billing + dolaylı Reporting yolu` (bilgi, ikinci flag değil).
- MVP’de Model A → sorun doğmaz.

---

### K2 — “Reporting kabul etti ama kendi değişikliğini yapmadı”

**Ne olur:** Reporting 🟢 der (Billing OK), sonra kendi kodunu hiç uyarlamaz; runtime’da kırılır.

**Risk:** Onay ≠ uyum taahhüdü.

**Çözümler:**

- 🟡 **Düzenlemede** = “kendi tarafımı ayarlayacağım”; 🟢 = “Billing değişikliği bana zarar vermez / hazırım”.
- 🟢 şartına opsiyonel: “uyum PR linki” (P1).
- Reporting gerçekten değişecekse **ayrı CR zorunlu** politikası (dokümantasyon + UI uyarısı: “Sadece onay, değişiklik değil”).

---

### K3 — Sıra / deadlock

**Ne olur:** Billing, Reporting onayı bekliyor; Reporting “önce FinanceBatch’e kendi CR’mi bitireyim” diyor; FinanceBatch “Billing CR’si bitsin” diyor.

**Risk:** Karşılıklı bekleme.

**Çözümler:**

- Model A + net kural: **önce üst CR’nin 1-hop onayları**; uyum CR’leri **sonra** (veya paralel ama gate’ler bağımsız).
- 🟡 ile “beklet / kendi işim var” + SLA nudge.
- Admin/policy: stale CR iptal / yeniden aç (sonra).

---

### K4 — Stale etki listesi (revize)

**Ne olur:** Billing CR açılırken Reporting etkileniyor; revize sonrası Reporting düşer ama FinanceBatch kalır (veya tersi). FinanceBatch eski 🟢’si geçersiz kalabilir.

**Risk:** Eski onayla deploy.

**Çözümler:**

- Revize → etkilenen **diff** + **tüm güncel listeye yeniden ⬜** (zaten UI_UX §3.2).
- “Çıkan” servislerin flag’i arşiv; “aynı kalanlar” da yeniden onay (sıkı) *veya* içerik hash’i değişmediyse 🟢 korunur (gevşek) — **karar verilmeli**. Öneri: MVP’de **hepsi yeniden**.

---

### K5 — Aynı kişi birden fazla şapka

**Ne olur:** Zeynep hem Reporting hem FinanceBatch owner.

**Risk:** Tek kişi iki satırda onaylar; “iki bağımsız kontrol” illüzyonu.

**Çözümler:**

- UI’da birleştir: `Zeynep · Reporting + FinanceBatch` tek aksiyon / iki checkbox.
- Audit’te iki entity ayrı kalsın, UX’te tek kart.

---

### K6 — Sessiz hop 2 kırılması (Model A yan etkisi)

**Ne olur:** Billing CR’de yalnız 1 hop onaylanır; Reporting 🟢 verir ama kendi CR’sini hiç açmaz; FinanceBatch hop 2’de hiç sorulmaz (Reporting değişmediği için). Sorun yok gibi — ta ki Reporting sonra sessizce değişsin.

**Risk:** İkinci CR atlanır.

**Çözümler:**

- 🟡 düzenlemede iken sistem “uyum CR’si aç” CTA göstersin.
- CI/policy: Reporting’de Billing’e bağlı breaking change PR’ı varsa **açık CR şart**.
- Opsiyonel “izlenen dolaylı etkiler” paneli (bilgi amaçlı, onay zorunlu değil) — P1.

---

### K7 — Onay fırtınası (çok hop açılırsa)

**Ne olur:** Model B + yüksek derece → onlarca owner, haftalarca kapalı onay.

**Risk:** Ürün kullanılmaz; bypass baskısı.

**Çözümler:**

- Sert: yalnız 1 hop (Model A).
- Yumuşak: hop 2 sadece **bilgi**; onay zorunlu değil.
- Risk skoruna göre hop (breaking = 1 hop zorunlu + bilgilendirme listesi).

---

### K8 — Çelişkili ardışık talepler

**Ne olur:** Billing CR’de FinanceBatch 🟢; hemen ardından Reporting CR’de FinanceBatch 🔴.

**Risk:** Billing deploy oldu, Reporting bloğu; sistem tutarsız.

**Çözümler:**

- Deploy sırası / feature flag.
- Reporting CR red gerekçesi Billing CR aktivitesine linklensin.
- “Bağlı açık CR’ler” paneli (Billing ↔ Reporting ilişkisi).

---

## 4. Önerilen karar (taslak)

| Konu | Karar |
|------|--------|
| Tek talep kapsamı | **1 hop** doğrudan etkilenenler |
| FinanceBatch bu örnekte | Billing CR’de **1** onay; Reporting ayrıca değişirse **ayrı CR’de 1** onay |
| Transitive (hop 2+) | Onay zorunlu değil; isteğe bağlı “bilgi / uyarı” listesi |
| Reporting uyumu | Ayrı talep; 🟢 ≠ otomatik uyum CR |
| Dedupe | Her CR içinde `serviceId` tekil |
| Revize | Güncel listeye göre yeniden onay |

---

## 5. UI’da gösterilmesi gerekenler (bu senaryo için)

- Etki listesi: “doğrudan” rozeti; dolaylı varsa ayrı “bilgi” sekmesi (opsiyonel).
- Owner satırı: “Bu talepte senden 1 onay isteniyor” (çift satır yok).
- Reporting 🟡/🟢 sonrası banner: “Kendi değişikliğin için yeni talep aç.”
- FinanceBatch inbox: iki farklı CR kartı (Billing #12, Reporting #15) — karışmasın.

---

## 6. Açık sorular

- Revize sonrası “aynı kalan” etkilenenlerin 🟢’si korunur mu? (öneri: hayır, MVP)
- Hop 2 bilgi listesi MVP’ye girer mi?
- Aynı owner çok servis: tek kart mı, çok satır mı?


---

## 7. Görünüm notu (dinamik hop)

1 hop’luk onay listesinde bile FinanceBatch’in Reporting üzerinden de etkilendiği **gözden kaçabilir**. Bu yüzden:

- **Harita / etki yolu:** sayı taşmıyorsa **2–3 hop dinamik çiz** (bilgi / farkındalık).
- **Onay listesi:** hâlâ yalnız hop 1; dolaylı düğümler onay satırı üretmez.
- Amaç: zinciri gözle yakalamak; onay fırtınası yaratmamak.
