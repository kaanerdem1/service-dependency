# Ürün fikirleri — katalog genişlemesi

> Tarih: 2026-08-26  
> İlgili: [README](./README.md), [PRODUCT.md](./PRODUCT.md)

Burada toplanan fikirler henüz kodda yok; ürün yol haritası için notlar.

---

## 1. Modül ağacında metod her zaman servisin altında olmak zorunda değil

**Ne istiyoruz:** Sol ağaçta metodlar bazen servisin altında, bazen servisle aynı hizada listelenebilsin. Bir metod “ayrı bir servis gibi” davranabilir de davranmayabilir de — katalog esnek olsun.

**Nasıl yapılabilir:**

- **İki görünüm:** *Paket görünümü* (proje → paket → servis → metod) ve *Düz liste* (servis ve metod yan yana, arama ile bulunur).
- **Tip etiketi:** Her satırda “servis” veya “metod” rozeti olsun; karışıklık olmasın.
- **Seçince ne olur:** Metod seçilince metod haritası, servis seçilince servis haritası açılsın; ekran bunu kullanıcıya söylesin.
- **Veri tarafı:** Katalog kaydında tür (`service` / `method`) ve isteğe bağlı “hangi servise bağlı” bilgisi yeterli; metod paketsiz de gelebilir.
- **Onay:** Metod ayrı onay gerektirmiyorsa onay yine servis bazında kalır; metod değişikliği o servisin talebine yazılır.

---



## 2. İlişkiler ekranı katman katman tablo olabilir

**Ne istiyoruz:** İlişkiler sekmesinde servisler düz liste yerine “1. katman, 2. katman…” diye gruplanmış tabloda görünsün.

**Nasıl yapılabilir:**

- **Sütunlar:** Servis adı · Kim kimi çağırıyor · Katman (1 / 2 / 3) · Sorumlu · Onay durumu · Proje.
- **Gruplama:** Önce doğrudan etkilenenler (1. katman), sonra dolaylılar; 1. katman satırları onay bekleyenler için belirgin olsun.
- **Filtre:** Sadece 1. katman / tüm katmanlar / seçili proje — haritadaki proje filtresiyle aynı mantık.
- **Snapshot ile uyum:** Tablodaki gruplar, snapshot JSON’daki `hop1`, `deeper`, `upstream` alanlarıyla aynı anlama gelsin.
- **Dışa aktarma:** Tablo CSV olarak indirilebilsin; talep ekinde “etkilenenler listesi” olarak kullanılsın.

---



## 3. Servis dışı ilişkiler: ekran ve rapor

**Ne istiyoruz:** Sadece “servis A, servis B’yi çağırır” değil; “servis X şu ekranı kullanır”, “şu raporu besler” gibi bağlar da görünsün.

**Nasıl yapılabilir:**

- **Bağlantı türleri:** Servis–servis, servis–ekran, servis–rapor, servis–tablo vb. Haritada renk veya çizgi tipi farklı olsun.
- **Onay sınırı:** Onay listesine yalnızca servis–servis (ağaç) bağları girsin; ekran/rapor bilgi amaçlı veya ayrı “veri/ekran etkisi” checklist’inde dursun.
- **Tablo:** İlişkiler ekranında tür sütunu (ekran, rapor ikonu); filtre: “sadece servisler” / “veri ve arayüz”.
- **Talep formu:** “Veri etkisi” sekmesinde hangi rapor/ekran etkilenebilir; snapshot’ta da kayıtlı kalsın.
- **İleride:** Veri kataloğu ile aynı id’ler — “Bu servisi değiştirince hangi dashboard bozulur?” sorusu tek yerden cevaplansın.

---



## 4. Yeni servis açma — ana sayfadan başlasın

**Ne istiyoruz:** Kullanıcı henüz katalogda olmayan bir servis eklemek istediğinde karşılama ekranından veya üst menüden başlasın; ad, kod konumu, çağıracağı servis/metodlar, ne iş yaptığı ve kimi etkileyebileceğini yazsın.

**Nasıl yapılabilir:**

- **Giriş:** Karşılama ekranı + “Yeni servis” butonu (mevcut `new_service` talep tipinin genişletilmiş hali).
- **Adımlar:**
  1. Kimlik — ad, proje, paket, repodaki yolu
  2. Bağımlılıklar — hangi servis/metodları çağıracak (liste + sistem önerisi)
  3. İşlev — kısa özet ve detaylı açıklama
  4. Potansiyel etki — kullanıcı tahmini + sistemin önerdiği liste
  5. Önizleme — küçük harita: yeni düğüm + çizilecek oklar
- **Onay:** Yeni serviste “etkilenen” olmayabilir; ama **çağıracağı** servislerin sahipleri bilgilendirilsin (“yeni tüketici geliyor”).
- **Snapshot:** Talep açılışında kayıt alınsın; kullanıcının yazdığı bağımlılıklar ile katalog ingest sonrası gerçek durum karşılaştırılabilsin (ileride).
- **Katalog:** Onaydan sonra servis önce “beklemede”, kod tarandıktan sonra “aktif” olsun.

---



## Ortak ihtiyaçlar (dört fikir için de geçerli)


| Konu                           | Ne lazım                                                             | Neden                                                                  |
| ------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Tek katalog modeli**         | Servis, metod, ekran, rapor aynı şemada                              | Ağaç, harita ve tablo aynı veriden beslensin                           |
| **Ekranlar birbirini tutsun**  | Harita, İlişkiler tablosu ve snapshot aynı kurallarla hesaplansın    | “Listede var haritada yok” güveni kırılmasın                           |
| **Bağlantı türü**              | Çağrı, okuma, ekranda gösterme vb. ayrı etiketlensin                 | Onay, keşif ve veri etkisi karışmasın                                  |
| **Yazdığın vs gerçek**         | Talepte yazılan bağımlılık ≠ kod taraması → uyarı                    | Yeni servis ve “potansiyel etki” iddiaları doğrulansın                 |
| **Kime gidecek**               | Her kayıtta sorumlu; inbox kuralı bağlantı tipine göre               | Yeni servis: çağırdıklarının sahibi; değişiklik: etkilenenlerin sahibi |
| **Snapshot genişlemesi**       | Etki listesi + kullanıcının beyan ettiği bağımlılıklar + ekran/rapor | Olay sonrası: “ne dedi, ne gördü, katalog ne diyordu”                  |
| **Filtreler senkron**          | Proje filtresi ve katman ayarı harita ile tabloda aynı               | Aynı anda okunabilir olsun                                             |
| **Metod ↔ servis tutarlılığı** | Kod taraması ile servis grafiği çelişmesin diye kontrol              | Metod ağaçta farklı dursa bile onay doğru kalsın                       |
| **Yeni servis UX**             | Harita olmadan form odaklı akış                                      | Katalogda henüz yoksa harita anlamsız                                  |
| **Geçmişi tekrar gösterme**    | Snapshot’tan o anki tablo/harita (ileride)                           | Onay anı yeniden izlenebilsin                                          |


---

## 5. Henüz modellemedik — öneriler

Dört ana fikir **ne gösterileceğini** iyi tanımlıyor. Aşağıdakiler henüz kodda veya kararda yok; dört madde birlikte düşünülünce öne çıkan boşluklar.

### 5.1 Katalog yaşam döngüsü

Dört fikir ekleme ve görüntülemeye odaklı; servisin **sonradan** hali net değil.

| Öneri | Neden |
|-------|--------|
| **Emeklilik / dondurma** | Servis kapatılınca ağaçta ne olur? Etkilenenler listesi? |
| **Taslak → aktif → arşiv** | Madde 4 “beklemede → aktif” diyor; geri alma, red, yeniden açma tanımlı değil |
| **Katalog tazeliği** | Son tarama ne zaman? “Bu liste 3 gün eski” uyarısı |
| **Çift kayıt kontrolü** | Yeni servis sihirbazında aynı isim/paket zaten varsa ne olur? |

### 5.2 Etki yönü ve tutarlılık

Madde 2 tablo, madde 3 ekran/rapor, madde 1 metod — farklı kenar türleri getiriyor; ortak kural henüz yok.

- **Caller mı callee mi?** Tablodaki “kim kimi çağırıyor” ile onay listesindeki “etkilenen” aynı yön mü?
- **Upstream** (snapshot’ta var) İlişkiler tablosunda nerede durur?
- **Yan bağ** haritada var; tabloda ve onayda yok — bilinçli mi, eksik mi?

Netleşmeden madde 2 + 3 birleşince “listede var, onayda yok” güveni kırılır.

### 5.3 Onay politikası (dört fikrin kesişimi)

`Henüz karar verilmedi` bölümündeki sorulara ek:

| Öneri | Bağlantı |
|-------|----------|
| **Süre / escalation** | 48 saat cevap yoksa ne? Kim devralır? |
| **Veto vs düzenlemede** | Red edince talep kapanır mı, revize döngüsü var mı? |
| **Acil / incident modu** | Normal CR dışında hızlı yol; snapshot yine alınır mı? |
| **Toplu onay** | 15 servis etkilenince owner hepsini tek ekranda mı görür? |
| **Yeni servis: tüketici bildirimi** | Madde 4 — bilgilendirme mi, onay mı? Model A/B ile uyumlu mu? |

Metod → onay listesi (referans backlog #17) madde 1 ile birlikte düşünülmeli.

### 5.4 Veri modeli detayı

Ortak tabloda “tek katalog şeması” deniyor; alan düzeyinde henüz yok:

- **Kararlı kimlik** — `serviceId` / `methodId` / `screenId` / `reportId` nasıl üretilir?
- **Kenar metadata** — güven skoru (statik analiz / elle / tahmin), son doğrulama tarihi
- **Sözleşme tipi** — HTTP, kuyruk, DB okuma, UI embed
- **Sahiplik** — ekran/rapor sahibi kim? (`owner.team` muhtemelen kalkacak)
- **Eşleme katmanı** — DWH katalogu ile alias / legacy isim (madde 3 “ileride” diyor, spec yok)

### 5.5 Ölçek ve performans

20–30 hop-1 için küme/`+N` kuralı bu doküman henüz almıyor:

- Düz ağaçta 500 metod → arama zorunlu mu, sanal liste mi?
- Katmanlı tabloda 100+ satır → sayfalama, CSV limiti
- Haritaya ekran/rapor kenarı eklenince görsel gürültü — hangi türler varsayılan gizli?

### 5.6 Kullanıcı akışları

| Öneri | Hangi madde |
|-------|-------------|
| **Taslak kaydet** (yarım kalmış yeni servis / CR) | 4 |
| **Kopyala / şablondan aç** (“PaymentService gibi yeni servis”) | 4 |
| **Karşılaştır** — talep anı vs şimdiki katalog vs kod taraması | 4, ortak “yazdığın vs gerçek” |
| **Deep link** — inbox → talep → servis → metod | 2, 4 |
| **Kişisel giriş** — “benden beklenen”, “izlediğim servisler” | 2, 4 |

### 5.7 Dış entegrasyon

Dört fikir şu an UI içinde kalıyor:

- **CI/CD hook** — merge öncesi “onay kapısı açık mı?” API
- **PR / Jira / Linear** — talep id’si dış sistemde
- **Ingest pipeline** — repo push → katalog güncelle → etki diff → owner bildirimi
- **Audit export** — compliance için snapshot + onay geçmişi paketi

### 5.8 Kalite ve güven

- **Breaking change sınıfı** — patch / minor / major; onay listesi buna göre genişler mi?
- **Test kanıtı** — “etkilenen servislerde smoke geçti” checklist’i
- **Yanlış pozitif / negatif** — kullanıcı kenarı “geçersiz” işaretleyebilir mi? Katalog geri beslemesi
- **Yetki** — viewer hangi projeyi görür; yeni servis hangi projeye eklenebilir

### 5.9 Snapshot genişlemesi (spec eksik)

Ortak tabloda geçiyor; madde 2–4 yeni yük getiriyor:

- Katmanlı tablonun **o anki filtre/sıralama** hali
- Yeni servis sihirbazında **kullanıcı beyanı vs sistem önerisi** ayrı alanlar
- Ekran/rapor kenarları snapshot’ta `impact` dışında mı duracak
- **Replay** — eski snapshot’tan tablo/haritayı yeniden çizme (ileride)

### 5.10 Dört fikirden önce netleştirilmeli

Implementasyondan önce en çok değer katan beş konu:

1. **Kenar türü + yön sözlüğü** — onay, tablo, harita, snapshot aynı dil
2. **Varlık yaşam döngüsü** — taslak → aktif → arşiv
3. **Yeni servis onay modeli** — tüketici bildirimi = onay mı?
4. **Yazdığın vs gerçek diff** — sihirbaz + ingest sonrası uyarı
5. **Ölçek kuralları** — 20+ komşu, düz liste, CSV

---

## Öncelik sırası (ilk adımlar)


| #   | Fikir                        | İlk iş                                                 |
| --- | ---------------------------- | ------------------------------------------------------ |
| 1   | Düz ağaç / metod aynı seviye | Ağaç filtresi + tip rozeti                             |
| 2   | Katmanlı İlişkiler tablosu   | Mevcut listeyi katman gruplu tabloya çevir             |
| 3   | Ekran / rapor bağları        | Bağlantı türü + tabloda tür sütunu (mock birkaç rapor) |
| 4   | Yeni servis sihirbazı        | Karşılama + adımlı form + mini önizleme                |

**§5.10 ile uyumlu:** Önce kenar sözlüğü + yaşam döngüsü + yeni servis onay modeli; sonra UI maddeleri.

---



## Henüz karar verilmedi

1. Metod ayrı onay task’ı mı açılır, yoksa her zaman üst servis mi?
2. Ekran/rapor ilişkisi onay kapısına girer mi, yoksa sadece bilgi mi?
3. “Potansiyel etki” kullanıcıdan zorunlu mu, sistem önerisi yeterli mi?
4. Metod sayısı çok artınca düz listede arama zorunlu mu?

New servis için öneri taslak :  [https://saasinterface.com/components/side-panel/](https://saasinterface.com/components/side-panel/)



