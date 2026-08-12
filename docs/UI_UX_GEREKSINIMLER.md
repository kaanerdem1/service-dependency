# Service Dependency — UI / UX Gereksinimleri

> Amaç: `ServiceDependency.md` içindeki ürün omurgası + referanslar yeterli değil; **iyi bir arayüz deneyimi** için somutlaştırılması gereken kararlar ve yüzeyler.
> İlgili: [`ServiceDependency.md`](./ServiceDependency.md)
> Tarih: 2026-08-12

---

## 0. Özet

Ürün omurgası kilitli:

```
Sol modül ağacı → etkilenen servisler (liste/grafik) → değişiklik talebi → owner flag → gate
```

**UI dili:** “etkilenen servisler” = seçili servis değişince ucu dokunan servisler (teknik: onu kullanan / bağımlı olan inbound consumers). “Caller” ürün metninde kullanılmaz.

Bu doküman feature listesini tekrar etmez. Eksik olan: **ekran envanteri, roller, akış kenarları, bildirim yüzeyi, boş/yükleme halleri, UI contract, kopya, görsel brief, prototip**.

**Önerilen sıra:** rol matrisi → ekran envanteri → 3 kritik akış → mock API → boş/yükleme kuralları → prototip.

---

## 1. Ekran envanteri

Tek ASCII wireframe yetmez. Aşağıdaki yüzeyler ayrı tanımlanmalı.


| # | Yüzey | Birincil soru | MVP |
|---|--------|---------------|-----|
| E.1 | **Katalog** — sol ağaç + sağ etkilenenler | “Bu değişirse kim etkilenir?” | P0 |
| E.2 | **Değişiklik talebi oluştur** | “Ne / neden değişiyor? Kim etkileniyor?” | P0 |
| E.3 | **Owner onay inbox’u** | “Benden ne bekleniyor?” | P0 |
| E.4 | **Talep detayı + flag’ler** | “Durum ne? Kim onayladı / red etti?” | P0 |
| E.5 | **Gate durumu** | “Neden bloklu? Ne eksik?” | P0 |
| E.6 | **Yeni servis ekleme talebi** | “Etkilenen listesi yokken onay kimden?” | P0 |
| E.7 | **Grafik (ego-network)** | Aynı etkilenenler, görsel | P0 (toggle) |
| E.8 | Arama / filtre sonuçları | Binlerce serviste bul | P1 |


### Navigasyon notu

- Katalog = günlük çalışma yüzeyi.
- Inbox / talepler = onay ürün katmanı; dependency haritasının **üstünde**.
- Gate mesajı hem talep detayında hem (gerekirse) servis kartında görünmeli.

---

## 2. Kullanıcı rolleri + yetki

Dokümanda “yetkili kişi” var; **rol matrisi** yok. UI (buton, disabled, empty state) bundan doğar.


| Rol | Ne yapar | Ne yapamaz |
|-----|----------|------------|
| **Requester** (değiştiren / talep açan) | Talep açar; ne/neden yazar; durumu izler | Başkasının flag’ini değiştiremez; gate’i bypass edemez |
| **Owner** (etkilenen servis sorumlusu) | Kendi servisi için 🟢 kabul / 🔴 red / 🟡 düzenlemede atar; not ekler | Başka servisin flag’ini atamaz; talebi tek başına kapatamaz |
| **Viewer** (salt okuma) | Ağaç + etkilenenler + talep özeti görür | Talep açamaz / flag atamaz |
| **Admin** (opsiyonel, sonra) | Owner ataması, acil override politikası | — (MVP’de yok varsayılabilir) |


### Açık kararlar (yazılmalı)

- Owner bir kişi mi, ekip mi, birden fazla kişi mi?
- Birden fazla owner varsa gate: **hepsi 🟢** mi, **en az biri 🟢** mi?
- Owner tanımsız servis: talep açılamaz mı, “unassigned” kuyruğuna mı düşer?
- “Yetkili kişi” katalogda nasıl seçilir / doğrulanır?

---

## 3. Akış senaryoları

### 3.1 Happy path — mevcut servis değişikliği

1. Requester ağaçtan servisi seçer → etkilenen servisleri görür.
2. “Değişiklik talebi aç” → ne / neden + otomatik etkilenen owner listesi.
3. Owner’lar bilgilendirilir → inbox’tan talep detayına gelir.
4. Her owner flag atar (🟢 kabul / 🔴 red / 🟡 düzenlemede). ⬜ görülmedi varsayılan kalabilir.
5. Hepsi 🟢 → **onay açılır** → değişiklik yapılabilir.

### 3.2 Kenar: 🔴 red

- Talep durumu: **onay kapalı** (bloklu).
- **Red gerekçesi zorunlu** — requester bunu **not** olarak görür (kim reddetti + neden).
- Herhangi bir 🔴 varken onay **kesin kapalı**.

**“Sadece reddeden owner’a yeniden sor” ne demekti / neden iptal?**

Eski açık soru şuydu: revize sonrası yalnızca 🔴 atan owner’a mı tekrar gidelim?
**Karar: hayır.** Revize edilirse talep **güncel etkilenen listedeki tüm owner’lara** yeniden gider; hepsi yeniden flag’ler; **hepsi 🟢** olunca onay açılır. Tek owner’a kısmi yeniden sorma yok.

**Revize + dinamik etkilenen listesi (UI karşılığı şart)**

Revize = ne/neden (ve gerekirse kapsam) değişir → etkilenen küme **yeniden hesaplanır** (algoritma / ingest; UI sonucu gösterir):

| Diff | Anlam | UI |
|------|--------|-----|
| Kaldı | Hâlâ etkileniyor | Yeniden ⬜; tekrar bildirim + onay ister |
| Çıktı | Artık etkilenmiyor | Listeden düşer; eski flag arşiv/görünmez |
| Eklendi | Yeni etkilenen | ⬜ ile eklenir; bildirim |

- Revize ekranında diff özeti: `+3 yeni · −2 çıktı · 5 aynı — tümünden yeniden onay`.
- Algoritma emin değilse bile UI: “etkilenenler güncellendi” + diff; boş/eksik için uyar.
- Onay hesabı **yalnızca güncel liste** üzerinden.

### 3.3 Kenar: iki türlü “beklet”

| Flag | Anlam | Kim atar |
|------|--------|----------|
| 🟡 **Beklet — düzenleme** | Owner kendi tarafında düzenleme yapıyor | Owner bilinçli seçer |
| ⬜ **Beklet — görülmedi / yanıt yok** | Talep henüz görülmedi veya yanıtlanmadı | Sistem varsayılanı |

- İkisi de onayı **açık tutmaz** (sadece tüm 🟢 ile açılır).
- ⬜ için: timeout / hatırlatma (ör. 3 gün nudge) adayı.
- UI’da karışmasın: aynı “beklet” ailesi, **farklı etiket + ikon/renk**.

**Bildirim kuralı:** Herhangi bir **flag geçişinde** requester bilgilendirilir (sadece 🟡↔⬜ veya 🟡→🟢 değil). Ör. ⬜→🟢, 🟢→🔴, 🔴→🟡, 🟡→🟢… Inbox / aktivite akışı.

### 3.4 Kenar: yeni servis ekleme

- Etkilenen listesi boş olabilir; nasıl üretilir?
  - Aday: “bu servise bağlanacak / bağlanması planlanan” beyanı
  - Aday: aynı paket/modül owner’ları
  - Aday: platform / mimari owner
- Onay kuralı aynı: tanımlı etkilenenlerin hepsi 🟢.

### 3.5 Kenar: owner yok / veri eksik

- Owner’sız etkilenen satırı nasıl gösterilir?
- Etki listesinde “sorumlu atanmamış” → talep açılsın mı?
- **Not: öğrenilmeli** — gerçek katalog / sahiplik verisi gelince netleşir; UI şimdiden “Owner atanmamış” halini gösterecek şekilde tasarlanır.

### 3.6 Belirsiz / düşük güven bağımlılık — ne demek?

Katalog bazen **kesin** “A, B’yi kullanıyor” diyemez; örn. yansıma, dinamik URL, conf’tan gelen isim. Buna **düşük güven / belirsiz bağımlılık** denir (“belki etkilenir”).

| | Kesin | Belirsiz |
|--|--------|----------|
| Anlam | Kanıtlı etki | Şüpheli / kısmi kanıt |
| UI (ileride) | Normal etkilenen satırı | “Belirsiz” rozeti |
| Onay | Zorunlu | Henüz karar yok |

**MVP:** Ana omurga kesin etkilenenler. Bu madde P2 / öğrenilmeli; şimdilik ürünü bloke etmez.

> Bu senaryolar prototipte tıklanarak doğrulanmalı; sadece madde listesi yetmez.

---

## 4. Bildirim + aksiyon yüzeyi

“Bilgilendirme alacak” ürün kuralı; **nereden okuyup flag atacağı** UX’tir.


| Kanal | MVP adayı | Not |
|-------|-----------|-----|
| In-app **inbox** | Evet (**kilit**) | Owner birincil aksiyon; model onaylandı |
| Deep link (mail / Slack) | Evet (P0 veya P1) | Direkt talep detayına |
| Sadece e-posta gövdesinde onay | Hayır | Ürün parçalı kalır |


### Owner’ın 10 saniyelik yolu

```
Bildirim / inbox → talep özeti (ne/neden + benim servisim) → flag at → (opsiyonel not) → bitti
```

- Inbox’ta: bekleyen / yanıtladığım / tümü filtreleri.
- Badge: bekleyen onay sayısı.

---

## 5. Bilgi yoğunluğu, boş ve yükleme halleri

Ölçek varsayımı: binlerce servis / metod. Full-mesh yok; ego-network + lazy.

### Sol ağaç

- Lazy expand (project → jar/package → service).
- Sticky seçili servis.
- Filtre / arama: eşleşmeyen dallar soluk veya gizlenir.
- Çok uzun isimler: truncate + tooltip.

### Etkilenen servisler listesi


| Durum | UI |
|-------|-----|
| Yükleniyor | Skeleton / satır placeholder |
| Boş | “Bu değişiklikten etkilenen servis yok” + kısa açıklama |
| Hata | Yeniden dene |
| Owner yok | Rozet yerine “Owner atanmamış” |
| Çok kayıt | Sayfalama veya “ilk N + ara” |


### Grafik (H1 inspect — pivot)

**Nerede?** Aynı sağ panel / **Harita** sekmesinde (ayrı tarayıcı penceresi şart değil). İsteğe bağlı “genişlet” ile daha büyük alan; odak bozulmasın diye varsayılan = sekme içi.

**Hop / N önerisi (deneyimi bozmadan):**

| Parametre | Öneri | Gerekçe |
|-----------|--------|---------|
| Varsayılan hop | **1** (2 katman: merkez + etkilenenler) | Datadog inspect; onay listesiyle birebir |
| İleri gitme | Komşu düğüme **tıkla → o merkez olur** | Derinlik navigasyonla |
| Geri | **Geri / ileri** geçmiş | Codebase turu |
| Soft max düğüm (N) | **~40** rahat; **~60** üst soft limit | Üstünde filtre / liste |
| Çok etkilenen | Zoom + pan + scroll | Full codebase asla |

Katalog ne kadar büyük olursa olsun harita **yalnızca seçili odaktan** çizer.

#### 3 katman sorusu: merkez → etkilenenler → onlardan etkilenenler

Yani ekranda **2 hop** birden (3 görsel katman).

| Ortalama 1. hop derece | 2. hop kabaca düğüm | 3 katman bir anda? |
|------------------------|---------------------|--------------------|
| ~10 | ~1 + 10 + ~80 ≈ **90** | Zorlar; zoom yetmez |
| ~15 | ~1 + 15 + ~150 ≈ **165** | Net bozar |
| ~25+ | **200–600+** | Kullanılmaz |

**Karar (görünüm):** **Dinamik hop** — düğüm bütçesi yettiği sürece 2–3 hop çiz (dolaylı zincir gözle yakalansın). Taşınca kısalt + pivot.

**Karar (onay):** Hop ne olursa olsun onay listesi **yalnız hop 1**. Görünen dolaylı ≠ otomatik onay.

- Soft bütçe: Basit ~28 / Gelişmiş ~48 düğüm; max hop 3.
- Hop 2+ görsel olarak soluk / kesik kenar; “dolaylı” etiketi.
- Pivot + geri stack keşif için durur.

Özet: 3 katman ürün fikri doğru; **tamamı aynı anda** yüksek derecede zorlar. Toggle + lazy dal veya pivot kullan.

#### Pivot navigasyonu (kilit)

- Komşu düğüme tıklanınca o servis **yeni merkez** olur (1-hop yeniden çizilir).
- Geçiş **akıcı animasyon** ile (merkez kayması / fade); ani jump yok.
- **Geri:** hemen önceki pivota dön (stack). “Nereden geldiysen oraya” — rastgele önceki seçim değil, **history**.
- **İleri:** geri alındıktan sonra tekrar ileri (tarayıcı history gibi).
- Breadcrumb örn. `PaymentService → OrderService → …` (stack’teki merkezler); tıklanınca o pivota atla.

```
[Seç A] → tıkla B (merkez=B, geri→A) → tıkla C (merkez=C, geri→B)
Geri → merkez=B · Geri → merkez=A
```

Varsayılan derinlik hâlâ 1 hop; 3 katmanı bir anda çizmek yerine **pivot ile gez**.

#### Pivot ile senkron detay yüzeyi (kilit)

Harita merkez değiştikçe yanında (veya altta) **dinamik detay** güncellenir — dialog / yan panel / frame; aynı veri bağlanır.

| Alan | İçerik (ör.) |
|------|----------------|
| Header | Servis adı · owner · etkilenen N |
| Etkilenenler | O anki merkeze göre liste (harita ile aynı) |
| Onay / talepler | Bu servisle ilgili açık talepler (varsa) |
| Aksiyon | Değişiklik talebi aç, vb. |

- Pivot değişince panel **yeniden fetch / bind** (skeleton kısa).
- Panel kapanık olsa bile sonraki açılışta güncel pivotu gösterir.
- Liste satırına tıklamak da aynı pivota alabilir (harita ↔ liste ↔ panel tek seçim modeli).


### Talep / onay

| Durum | UI |
|-------|-----|
| Bekleyen flag’ler | `3/7 kabul · 1 red · 1 düzenlemede · 2 görülmedi` |
| Onay kapalı | Neden bloklu açıkça |
| Onay açık | Net CTA / “onaylandı — değişiklik yapılabilir” |


---

## 6. UI contract (mock API şeması)

UI mock ile ilerleyecekse ekranlar bu tiplere bağlanmalı. İsimler taslak.


```ts
type Owner = {
  id: string
  name: string
  team?: string
}

type Service = {
  id: string
  name: string
  projectId: string
  packageId: string // jar/package
  owner?: Owner
  affectedCount: number // UI: etkilenen servis sayısı (değişince etki yarıçapı)
  outboundCount?: number // opsiyonel: bu servisin çağırdıkları (bağımlılık; onay omurgası değil)
}

// UI dili: etkilenen servis. Teknik: seçili servisi kullanan / bağımlı olan (inbound consumer).
type AffectedService = {
  service: Service
  edgeType?: "calls" | "http" | "queue" // P2
  confidence?: "high" | "low"
}

type FlagStatus =
  | "accepted" // 🟢 kabul
  | "rejected" // 🔴 red
  | "hold_editing" // 🟡 beklet — düzenleme yapılıyor
  | "unseen" // ⬜ beklet — yanıt verilmedi / görülmedi

type ChangeRequest = {
  id: string
  targetServiceId: string
  kind: "change" | "new_service"
  summary: string // ne değişiyor
  rationale: string // neden
  requestedBy?: {
    // form: hangi ekip / departman / kişi — alanlar kısmen opsiyonel
    team?: string
    department?: string
    personId?: string
    personName?: string
  }
  requesterId: string
  impacted: { serviceId: string; ownerId?: string; flag: FlagStatus; note?: string }[] // red notu zorunlu
  gateOpen: boolean // derived: all accepted — UI: Onay açık/kapalı
  createdAt: string
  updatedAt: string
}

type ModuleNode = {
  id: string
  kind: "project" | "package" | "service"
  name: string
  children?: ModuleNode[] // lazy: yoksa ayrıca fetch
}
```


### Endpoint taslağı (mock)


| İş | Örnek |
|----|--------|
| Ağaç | `GET /modules?parentId=` |
| Servis detay | `GET /services/:id` |
| Etkilenenler | `GET /services/:id/affected` |
| Talep oluştur | `POST /change-requests` |
| Inbox | `GET /me/approvals?status=` |
| Flag at | `PATCH /change-requests/:id/flags/:serviceId` |


Liste ↔ grafik **aynı** `AffectedService[]` verisini kullanır.

---

## 7. Mikro kopya + durum dili

### Flag (ürünle uyumlu)

İki ayrı “beklet” var; UI’da karıştırılmamalı.


| Flag | Kod | Anlam | Kısa UI metni | Onay |
|------|-----|--------|----------------|------|
| 🟢 | `accepted` | Kabul | “Kabul” / “Onaylandı” | İlerletir |
| 🔴 | `rejected` | Red — bloklar | “Red” | Bloklar |
| 🟡 | `hold_editing` | Beklet — **düzenleme yapılıyor** | “Düzenlemede” | Bloklar (henüz hazır değil) |
| ⬜ | `unseen` | Beklet — **yanıt verilmedi / görülmedi** | “Görülmedi” / “Yanıt yok” | Bloklar (aksiyon yok) |


- 🟡 = owner bilinçli seçim (“kendi servisimi ayarlıyorum”).
- ⬜ = varsayılan / henüz etkileşim yok (inbox’ta okunmamış da olabilir).
- Owner aksiyon seti: 🟢 kabul · 🔴 red · 🟡 düzenlemede (⬜’yi bilinçli “görülmedi”ye geri çekmek genelde gerekmez).

### Onay durumu örnekleri (eski “gate” dili)

UI metni: **Onay kapalı / Onay açık** (gate teknik terim kalabilir, kullanıcıya gösterilmez).

- Kapalı: `Onay kapalı — 5/8 kabul, 1 red, 1 düzenlemede, 1 görülmedi`
- Red var: `Onay kapalı — en az bir red var; değişiklik yapılamaz`
- Sadece beklet: `Onay kapalı — kabul eksik (düzenlemede / görülmedi)`
- Açık: `Onay açık — tüm etkilenenler kabul etti`

### Talep formu

| Alan | Zorunlu? | Not |
|------|----------|-----|
| **Ne değişiyor?** | Evet | Kısa özet |
| **Neden?** | Evet | Gerekçe |
| **Hangi kişi?** | **Evet** | Talep sahibi her zaman belli olmalı. Oturumdan otomatik doldurulur ve gösterilir; boş bırakılamaz. (Eski “opsiyonel” notu yanlış anlaşılmıştı: kişi kimliği zorunlu; alan gizlenmez, otomatik gelir.) |
| **Hangi ekip?** | Opsiyonel | Organizasyon bağlamı |
| **Hangi departman?** | Opsiyonel | Organizasyon bağlamı |
| Risk / tarih / PR-ticket linki | Opsiyonel | İleride |

Etkilenen owner listesi formda otomatik gelir (etkilenen servislerden). Revize’de liste dinamik diff ile güncellenir (§3.2).

### Etkilenen satırı (öneri)

```
AffectedService · Team X · Owner Adı
```

---

## 8. Görsel karar (design brief)

Referanslar (Datadog / Backstage / JetBrains) = **davranış + tipografi yumuşaklığı**, piksel klonu değil.

### 8.1 Yoğunluk — karar

**Son kullanıcı odaklı, kolay anlaşılır / kolay kullanılır dashboard.**

- IDE kadar sıkışık dense tool değil.
- Özet kartlar + net CTA + okunaklı listeler.
- İlk bakışta: “ne bekliyor / onay açık mı kapalı mı / kimi seçtim”.
- **Teknik güç gizlenmez:** isteyene net ve ulaşılır; ilk bakışta boğmasın.
- **Toggle (kilit):** örn. `Basit | Gelişmiş` (veya “Teknik detay”).
  - **Basit:** özet KPI, etkilenen listesi, onay durumu, birincil CTA.
  - **Gelişmiş:** H1 harita kontrolleri (hop toggle, zoom), paket yolu, edge/güven detayı, ham sayılar.
  - Tercih oturumda hatırlanır; varsayılan = Basit.

### 8.2 Birincil yüzey — öneri (seçim için)

Eski taslak (sol ağaç + sağ liste) işe yarar ama dashboard hedefiyle **daha şık / daha ürün gibi** alternatif:

**Öneri A — “Catalog shell + soft dashboard” (tercih adayı)**

```
┌──────────────────────────────────────────────────────────────┐
│  Üst şerit: Arama · Bekleyen onaylarım (N) · Taleplerim      │
├──────────────┬───────────────────────────────────────────────┤
│ Modül ağacı  │  Servis header (ad · owner · etkilenen N)     │
│ (dar, soft)  │  [Özet]  [Etkilenenler]  [Harita]  [Talepler] │
│              │                                               │
│              │  Özet sekmesi: küçük KPI + son talepler       │
│              │  Etkilenenler: rahat satırlar + owner rozeti │
│              │  Harita: seçilen moda göre (§8.3)             │
└──────────────┴───────────────────────────────────────────────┘
```

- Üstte **kişiye özel** dashboard sinyali (inbox badge).
- Ortada Backstage tarzı **entity header + sekmeler** (tek servise odak).
- Sol ağaç kalır ama dar / soft; birincil hikâye sağda.

**Öneri B — Klasik split (daha teknik)**  
Sol ağaç + sağ etkilenenler (mevcut wireframe). Hızlı MVP; dashboard hissi zayıf.

**Öneri C — Harita-öncelikli**
**Elendi.** Full/öncelikli harita büyük kapsamda yetmez; ürün modeli “önce servis seç → sonra H1” (§8.3).

**Büyük sol ağaç:** A tek başına yetmeyebilir → ağaç **lazy + sanallaştırma + güçlü arama**; gerekirse arama/liste birincil, ağaç ikincil.

> **Deneme sırası:** önce **A**, yetmezse / kötü gelirse **B**; hangisi daha iyi olursa ona devam. **C yok.**

### 8.3 Harita — seçenekler + uygun sayı aralıkları

Büyük veri varsayımı: **asla full-mesh**. Sayılar pratik UX heuristic’i (ekranda okunabilirlik); kesin mühendislik limiti değil.

**Okuma anahtarı**

| Terim | Anlam |
|--------|--------|
| Katalog | Sistemdeki toplam servis sayısı |
| Derece | Seçili servisin doğrudan **etkilenen** servis sayısı |
| Ekranda düğüm | O an çizilen node sayısı |


#### Modele göre uygun ortalamalar


| # | Model | Katalog (toplam servis) | Tipik derece (etkilenen/servis) | Ekranda düğüm (rahat) | Bozulmaya başlar | En uygun olduğu yer |
|---|--------|-------------------------|------------------------------|------------------------|------------------|---------------------|
| **H1** | Inspect / ego-network | 200 – **5.000+** (katalog boyutu sorun değil; seçime bağlı) | **5 – 40** | **6 – 40** (1 merkez + etkilenenler) | Derece **>~60–80**; etiketler çakışır | Tek servis etkisi / onay öncesi “kim bağlı?” |
| **H2** | Collapsed path | 500 – **10.000+** | Path üzerindeki ara hop **3 – 15** | **8 – 25** görünür (ara adımlar collapse) | Collapse’sız **>~30 hop düğümü**; filtre yoksa karmaşık | “A → … → Z” etki yolu; blast radius path |
| **H3** | Team / paket cluster | **1.000 – 20.000+** | Cluster başına **10 – 80** servis | **15 – 50 cluster** (içleri kapalı) | Cluster sayısı **>~80–100** veya tek cluster **>~200** açık | Büyük org’da üst bakış; ekip/modül gruplama |
| **H4** | Liste + mini-harita | Her ölçek; özellikle **500+** | Liste: **1 – 200+** (sayfalı); mini: **5 – 25** | Liste sınırsız (sayfa); mini **≤25** | Mini’yi büyütürsen H1/H5’e dönüşür ve bozulur | Dashboard MVP; büyük derece + okunaklılık |
| **H5** | Radial / hive | 100 – **2.000** (katalog yine sorun değil) | **4 – 24** | **5 – 25** | Derece **>~30–40**; halka okunmaz | Az komşulu “şık” vitrin; demo / küçük ego |


#### Hızlı seçim (kendi ortalamana göre)

Önce iki sayıyı tahmin et:

1. **Ortalama etkilenen servis / seçili servis** (derece)
2. **Katalog büyüklüğü** (toplam servis)

| Senin tahminin | Seç |
|----------------|-----|
| Derece çoğu serviste **≤25**, şık grafik istiyorsun | **H5** veya **H1** |
| Derece **25–60**, katalog büyük | **H1** (limit + “listeye geç”) |
| Derece sık **>60** (çok etkilenen) | **H4** (liste asıl; mini ≤25) |
| Öncelik org / ekip haritası, binlerce servis | **H3** (+ tıklanınca H1) |
| Öncelik “şu path kimden kime” | **H2** (talep/etki ekranı) |
| Emin değilsin / MVP | **H4 → sonra H1** (en az pişmanlık) |


**Kombinasyon (sık kullanılan):**

- **H4 + H1:** Etkilenenler sekmesi = liste; Harita sekmesi = ego (derece >40 ise otomatik “ilk 40 + filtre”).
- **H3 + H1:** Üstte cluster; cluster/servis seçince inspect.
- **H2:** Ana harita değil; talep “etki yolu” paneli.

**Ölçek kuralları (ortak):**

- Varsayılan hop = 1 (doğrudan etkilenenler).
- Soft çizim limiti: H1/H5 ≈ **40**; H3 kapalı cluster ≈ **50**; aşınca uyarı + liste/filtre.
- Lazy: seçili servis → komşular on-demand.
- Animasyon P2 — [örnek video](https://docs.dd-static.net/images/tracing/visualization/services_map/servicemap-anim.mp4).

**Referans görseller**

| # | Linkler |
|---|---------|
| H1 | [Inspect](https://docs.dd-static.net/images/tracing/visualization/services_map/servicemap.6eb19f8710f9ba56d10c67e639e5ea96.png?auto=format&fit=max&w=850) · [Overview](https://docs.dd-static.net/images/tracing/visualization/services_map/service_map_overview_3.3b80f55bde2fa4baefdb2bdbdb92d7fb.png?auto=format&fit=max&w=850) · [Docs](https://docs.datadoghq.com/tracing/services/services_map/) |
| H2 | [Collapsed](https://docs.dd-static.net/images/tracing/visualization/services_map/service_map_collapsed.378cf9863db825f89c2c1951718ce83b.png?auto=format&fit=max&w=850) |
| H3 | [Network map (cluster fikri)](https://docs.datadoghq.com/network_monitoring/cloud_network_monitoring/network_map/) |
| H4 | Backstage deps listesi + küçük ego (davranış) |
| H5 | [New Relic service maps](https://docs.newrelic.com/docs/apm/apm-ui-pages/service-maps/introduction-service-maps/) |

**Seçim (kilit):** **H1 Inspect + pivot** (Datadog inspect referansı)

Katalog büyük olsa da sorun değil: **önce arama / liste / ağaçtan servis seçilir**, sonra yalnızca o servisin etkilenen komşuları çizilir. Tüm codebase tek seferde **gösterilmez**.

| Adım | Ne olur |
|------|---------|
| 1 | Arama veya listeden / ağaçtan servis seç |
| 2 | H1: dinamik hop (bütçe yetiyorsa 2–3); dolaylı zincir görünür |
| 3 | Komşuya tıkla → yeni merkez; grafik yeniden bütçelenir |
| 4 | Geri = geldiğin önceki pivot (history stack); ileri destekli |
| 4b | Yan panel / dialog / frame pivot ile **dinamik** güncellenir |
| Onay vs görünüm | Onay = hop 1; harita/etki yolu = dinamik hop |
| Çok düğüm | Soft N≈40–60; üstünde filtre veya eşlik eden liste — yine full map yok |

| Model | Durum |
|-------|--------|
| **H1** | **Birincil harita** |
| Liste (etkilenenler sekmesi) | H1 ile aynı veri; okuma / onay için eşlik eder |
| H2 / H3 / H4 mini / H5 | Zorunlu değil; H3 org vitrini ileride opsiyonel; H5 elendi |

Zoom/scroll: büyük komşu setinde **yeterli tamamlayıcı**; asıl ölçek çözümü “önce seç, 1-hop çiz, tıklayınca pivot”.

### 8.4 Tipografi — referanstan soft dil

Datadog / Backstage tarzı: **sade, soft hierarchy** — bağıran display font yok.


| Katman | Öneri | Referans hissi |
|--------|--------|----------------|
| UI / gövde | Nötr soft sans (ör. `IBM Plex Sans`, `Source Sans 3`, veya Backstage’e yakın sistem sans) | Backstage catalog: sakin başlık + body |
| İkincil metin | Düşük kontrast gri (`secondary`) | Datadog / Backstage muted labels |
| Servis / teknik ad | Aynı aile, biraz daha `medium` weight; gerekirse tabular | Catalog entity title |
| Kod / FQCN (nadir) | Mono sadece tooltip veya detay satırında | JetBrains hierarchy — abartma |


İlkeler:

- Tek font ailesi yeter; ikinci aile sadece mono detay.
- Başlıklar büyük ama soft (heavy black / serif hero yok).
- Flag ve gate rengi **metinden** taşır; tipografi bağırmaz.
- “AI purple / glow” yok; semantik renk sadece durum için.

### 8.5 Özet tablo


| Konu | Karar |
|------|--------|
| Yoğunluk | Dashboard önde; **Basit | Gelişmiş** toggle (teknik güç) |
| Birincil yüzey | **A dene → gerekirse B**; C elendi. Büyük ağaçta arama + lazy şart |
| Renk | Flag semantiği + owner rozeti; dekoratif efekt yok |
| Harita | **H1 + dinamik hop** (bütçe yetiyorsa 2–3); onay ayrı (hop 1); pivot + panel senkron |
| Tipografi | Referans ürünler gibi sade soft sans + muted secondary |
| Boş haller | Kısa metin + tek CTA |

---

## 9. Tıklanabilir prototip (koddan önce)

Amaç: “iyi UX”i ölçmek — feature checklist değil.


### Minimum gezilecek akışlar

1. Servis seç → etkilenenler → harita pivot (tıkla merkez değişsin, geri önceki pivota dönsün, panel güncellensin)
2. Talep aç → etkilenen listesi dolu → gönder
3. Owner inbox → flag; her flag geçişinde requester bilgilendirilir
4. Onay: hepsi 🟢 olunca açılır; 🔴 varken kapalı kalır; red gerekçesi requester’a not
5. Yeni servis talebi (etkilenen listesi boş / alternatif üretim)

### Çıktı

- Figma / FigJam veya düşük sadakat HTML prototype
- Bu dokümandaki açık kararlar (rol, red sonrası, owner çokluğu) prototip sırasında kilitlenir

---

## 10. MVP kabul kriterleri (UX)

- [ ] E.1–E.5 yüzeyleri ayrık ve gezilebilir
- [ ] Rol matrisi UI’da yansııyor (yetkisiz aksiyon gizli/disabled)
- [ ] Etkilenenler boş / yükleniyor / hata halleri tanımlı
- [ ] Onay kapalı/açık metni her zaman “neden” söylüyor
- [ ] Liste ve grafik aynı mock veriyi kullanıyor
- [ ] Pivot tıklanınca merkez değişir; geri önceki pivota döner; detay paneli senkron
- [ ] Owner 10 saniyelik onay yolunu inbox’tan tamamlayabiliyor
- [ ] Yeni servis akışı etkilenen listesi boşken de anlamlı

---

## 11. Bilinçli erteleme

- Metod seviyesi call-graph drill-down (P1)
- Kenar tipi `http` / `queue` (P2)
- Admin override / acil bypass politikası
- Runtime APM katmanı
- Full service map

---

## 12. ServiceDependency.md eşlemesi


| Bu doküman | Ana doküman |
|------------|-------------|
| Ekran envanteri | §7 wireframe genişletmesi |
| Roller / akışlar | §8 değişiklik talebi & gate |
| Contract | §8 veri/ingest + S.12 |
| Yoğunluk / dashboard / harita seçimi | Bu doküman §8 · ana doküman §7 wireframe |
| Referans davranış | §1–§5 (Datadog inspect, Backstage, Call Hierarchy) |
