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

### 1.1 Dış katalog importu (servis / metod / hiyerarşi)

**Beklenen:** Dışarıdan bir veritabanı importu gelecek — servisler, metodlar, aralarındaki hiyerarşi ve (muhtemelen) çağrı / etki kenarları. Amaç: bugünkü mock katalogun (`server/src/data.ts`, `methods.ts`, `web/src/mock/*`) yerine **doğrudan bu kaynağı beslemek**.

**Entegrasyon yaklaşımı:**

- UI zaten `/api/*` üzerinden okuyor; mock yerine import DB’ye bağlanan bir **read-only servis katmanı** yeterli (DWH `server/src/dwh/*` ile aynı desen).
- Mock dosyaları hemen silmek zorunda değiliz; import gelene kadar fallback, gelince **tek kaynak = import DB** kuralına geçilir.
- Sol ağaç (`moduleTree`), servis listesi, `affectsEdges`, `callEdges` — hepsi import şemasından üretilen **API cevabı** olmalı; ağaç şeklini UI’da sabitlemeyelim.

**Import gelince yapılacak inceleme (ağaç kararı buradan):**

Import şeması gelmeden “metod her zaman servisin altında mı?”, “metodun altında servis var mı?” gibi kuralları **koda gömmeyelim**. Dosya / tablo seti geldiğinde:

1. **Varlık türleri** — Kayıtlar gerçekten `service` / `method` ayrımı mı taşıyor, yoksa tek tip düğüm + rol etiketi mi?
2. **Parent ilişkisi** — `parent_id` sahiplik mi (proje → paket → servis → metod), yoksa çağrı mı (A, B’yi çağırır)? İkisi aynı kolonda karışıyorsa ingest’te ayır.
3. **Aynı seviye vs iç içe** — Hangi düğümler kardeş, hangileri child? Dış kaynak “metod servis gibi” yüzey mi veriyor (facade / entry point)?
4. **Kenar tabloları** — Servis↔servis (`affectsEdges`) ile metod↔metod (`callEdges`) ayrı mı; cross-service method call nasıl kodlanmış?

**Sol ağaç kuralı (ön inceleme sonrası netleşecek):**

| İlişki | Sol ağaçta child olarak mı? | Not |
| ------ | ----------------------------- | --- |
| Sahiplik (kod nerede yaşar) | Evet — import parent’ına göre | proje → paket → servis → metod varsayılan |
| Servis + metod aynı seviye | Evet — düz liste / arama görünümü | Import düzleştirilmiş liste veriyorsa rozet yeterli |
| Metod → metod (call chain) | Hayır — katalog child değil | Harita / metod drill-down |
| Metod → servis (remote call) | Hayır — katalog child değil | Kenar / komşu; “metodun altında servis” sahiplik hatası sayılır |

Import yapısı farklı bir hiyerarşi dayatırsa (ör. metod üst node, altında başka metodlar ama servis yok): **importu olduğu gibi yansıt**, ardından ürün kurallarına (onay = servis, pivot tipi, rozet) uyarlayan ince bir **adapter** yaz; UI’yı tek bir ağaç formuna kilitleme.

**Kontrol listesi (import sonrası):**

- [ ] `/api/modules` import hiyerarşisini döndürüyor
- [ ] `/api/services`, `/api/methods`, etki uçları import kenarlarıyla uyumlu
- [ ] Sol ağaç: gerçek parent yapısı + tip rozeti; düz arama görünümü bozulmuyor
- [ ] Mock kapatıldığında tüm Servis yüzeyi (harita, tablo, CR, snapshot) çalışıyor
- [ ] `call-graph` / `affectsEdges` tutarlılık kontrolü import verisiyle geçiyor

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

**"Nasıl yapılabilir:**

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

### 4.1 Yan panel (sheet) — Inbox

**Karar (kodlanacak):** Masthead’deki **Gelen kutusu** tıklanınca liste ortadan modal olarak değil, **sağdan kayan sheet** olarak açılsın.

**Bugün:** `InboxPanel.tsx` → `MotionModalBackdrop` + ortalanmış `modal wide`. Talebe tıklanınca inbox kapanır, `RequestDetailModal` ayrı modal açılır (`App.tsx`: `returnToInbox` / `backToInbox`).

**Hedef akış:**

```
[Gelen kutusu] → sağ sheet (~420px) — liste
[Talep satırı] → aynı sheet içinde detay (slide / genişleme); inbox kapanmasın
[Geri]         → liste görünümü
[Esc / backdrop] → sheet kapanır; harita / seçili servis arkada kalır
```

**Gerekçe:**

1. **Bağlam kaybı azalır** — Harita ve seçili servis görünür kalır; “onay ver, haritaya bak” akışı bozulmaz.
2. **Masthead konumu** — “Gelen kutusu” sağ üstte; sheet’in sağdan gelmesi doğal (Gmail / Linear / Notion tarzı).
3. **İkincil panel** — Inbox tam ekran modal kadar bloklayıcı olmamalı; kısa onay görevi.
4. **İç navigasyon** — Liste ↔ detay aynı shell’de; mevcut “inbox kapat → modal aç → geri dön” yerine `view: 'list' | 'detail'` state yeterli.

**Teknik notlar:**

- Paylaşılacak primitive: `web/src/motion/MotionSideSheet.tsx` (backdrop + `x: 100% → 0`, `motion/react`; yeni npm paketi gerekmez).
- `MotionSheet.tsx` yalnızca yükseklik animasyonu yapıyor; slide-over ayrı bileşen.
- Talep detayı: `RequestDetailModal` içeriği sheet’in detail görünümüne taşınabilir veya aynı shell’i paylaşır.

### 4.2 Yan panel (sheet) — Yeni servis sihirbazı

**Karar (kodlanacak):** `NewServiceRequestModal.tsx` ortadan modal değil; Inbox ile **benzer pattern, daha geniş** sağ sheet.

| | Inbox sheet | Yeni servis sheet |
| --- | --- | --- |
| Genişlik | ~400–480px | ~560–720px (isteğe bağlı resize) |
| Arkadaki içerik | Harita / pivot görünür kalsın | Servis seçili değilken zaten boş alan — sheet yeterli |
| Navigasyon | Liste ↔ talep detayı | 7 adım (Kimlik → … → Onay) — dikey **step tabs** |
| Form | Kısa (flag, not) | Uzun — alan grupları, inline validation |
| Referans | — | [saasinterface side-panel](https://saasinterface.com/components/side-panel/) · `ss.md` (coss sheet / form / tabs) |

**Gerekçe:**

1. Madde 4 ve ortak tablo (“Yeni servis UX: harita olmadan form odaklı”) — yan panel formu öne alır, tam ekran modal gerekmez.
2. 7 adımlı sihirbaz uzun süre açık kalır; harita önizlemesi (adım 5) sheet içinde veya arkada küçük preview olarak düşünülebilir.
3. Inbox ile aynı `MotionSideSheet` ailesi — tutarlı motion ve kapatma davranışı; genişlik `size="md" | "lg"` ile ayrılır.

**App entegrasyonu:** `NewServiceRequestModal` henüz `App.tsx`’e bağlı değil; sheet refactor ile birlikte masthead veya karşılama ekranından açılacak.

### 4.3 Modal kalsın (sheet değil)

| Yüzey | Neden modal |
| --- | --- |
| **Değişiklik talebi** (`ChangeRequestModal`) | Kısa, 3 sekme, “şimdi kaydet”; harita üstünde hızlı iş |
| Tek satırlık onay / hata / toast | Bloklamaya gerek yok |

**Uygulama sırası (kodlanacak):**

1. [ ] `MotionSideSheet` primitive
2. [ ] `InboxPanel` → sheet + liste/detay iç navigasyon
3. [ ] `NewServiceRequestModal` → geniş sheet + step tabs
4. [ ] `ChangeRequestModal` modal olarak kalır

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


| Öneri                      | Neden                                                                         |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Emeklilik / dondurma**   | Servis kapatılınca ağaçta ne olur? Etkilenenler listesi?                      |
| **Taslak → aktif → arşiv** | Madde 4 “beklemede → aktif” diyor; geri alma, red, yeniden açma tanımlı değil |
| **Katalog tazeliği**       | Son tarama ne zaman? “Bu liste 3 gün eski” uyarısı                            |
| **Çift kayıt kontrolü**    | Yeni servis sihirbazında aynı isim/paket zaten varsa ne olur?                 |




### 5.2 Etki yönü ve tutarlılık

Madde 2 tablo, madde 3 ekran/rapor, madde 1 metod — farklı kenar türleri getiriyor; ortak kural henüz yok.

- **Caller mı callee mi?** Tablodaki “kim kimi çağırıyor” ile onay listesindeki “etkilenen” aynı yön mü?
- **Upstream** (snapshot’ta var) İlişkiler tablosunda nerede durur?
- **Yan bağ** haritada var; tabloda ve onayda yok — bilinçli mi, eksik mi?

Netleşmeden madde 2 + 3 birleşince “listede var, onayda yok” güveni kırılır.

### 5.3 Onay politikası (dört fikrin kesişimi)

`Henüz karar verilmedi` bölümündeki sorulara ek:


| Öneri                               | Bağlantı                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| **Süre / escalation**               | 48 saat cevap yoksa ne? Kim devralır?                         |
| **Veto vs düzenlemede**             | Red edince talep kapanır mı, revize döngüsü var mı?           |
| **Acil / incident modu**            | Normal CR dışında hızlı yol; snapshot yine alınır mı?         |
| **Toplu onay**                      | 15 servis etkilenince owner hepsini tek ekranda mı görür?     |
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


| Öneri                                                          | Hangi madde                   |
| -------------------------------------------------------------- | ----------------------------- |
| **Taslak kaydet** (yarım kalmış yeni servis / CR)              | 4                             |
| **Kopyala / şablondan aç** (“PaymentService gibi yeni servis”) | 4                             |
| **Karşılaştır** — talep anı vs şimdiki katalog vs kod taraması | 4, ortak “yazdığın vs gerçek” |
| **Deep link** — inbox → talep → servis → metod                 | 2, 4                          |
| **Kişisel giriş** — “benden beklenen”, “izlediğim servisler”   | 2, 4                          |




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

**Gezinti özeti (Ziyaret yolu) daraltma — mevcut (Harita → Etki özeti):**

Uzun pivot geçmişinde panel taşmasını önlemek için hover sırasında ziyaret yolu geçici kapanır; ana etki yolu görünür kalır.


| Davranış         | Kural                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Ne zaman kapanır | Node hover + (ziyaret yolu ≥ 3 adım **veya** ana etki yolu ≥ 3 düğüm)                  |
| Animasyon        | Ziyaret yolu yukarı slide + height collapse; hover bitince aşağı slide ile geri açılır |
| Drawer scroll    | Panel üzerindeyken hover düşmez; scroll ana etki yolunu sıfırlamaz                     |
| Amaç             | Etki özeti grid’inde scroll ihtiyacını azaltmak; uzun via zincirini okunaklı tutmak    |


Snapshot tarafında henüz kayıt yok; ileride düşünülecekler:

- Daraltma anının snapshot’ta `ui.visitPathCollapsed: true/false` olarak saklanması
- Replay’de aynı hover olmadan “ziyaret yolu kapalı” görünümünün gösterilip gösterilmeyeceği
- Gezinti özeti ile ana etki yolunun snapshot JSON’da ayrı alanlar olarak tutulması (`visitPath`, `hoverViaPath`)



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

---



## 6. Motion & GSAP — animasyon önerileri

> **Not:** Repo zaten [Motion for React](https://motion.dev/docs/react) (`motion/react`, `web/src/motion/`) kullanıyor. GSAP aşağıdaki önerilerde özellikle **SVG/harita okları**, **ağır timeline** ve **scroll-scrub** senaryoları için; layout/list/modal tarafında Motion ile devam etmek daha tutarlı.



### 6.1 Madde 1 — Düz ağaç / metod aynı seviye


| Öneri                                          | Kütüphane | Ne işe yarar                                                                  | Link                                                                                                                                                                        |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Görünüm değişince satırların yumuşak kayması   | Motion    | Paket ↔ düz liste geçişinde `layout` + `AnimatePresence` (`mode="popLayout"`) | [Layout animations](https://motion.dev/docs/react-layout-animations) · [AnimatePresence](https://motion.dev/docs/react-animate-presence)                                    |
| Seçili satırın sağ panele “taşınması” hissi    | Motion    | Servis/metod seçiminde aynı `layoutId` ile shared layout                      | [Layout animations — shared](https://motion.dev/docs/react-layout-animations#shared-layout-animations) · [Örnek](https://motion.dev/examples/react-shared-layout-animation) |
| Düz listede arama sonuçlarının sırayla gelmesi | Motion    | `stagger()` + `variants` (`delayChildren`)                                    | [stagger](https://motion.dev/docs/stagger) · [Variants örnek](https://motion.dev/tutorials/react-variants)                                                                  |
| Tip rozeti (servis/metod) geçişi               | Motion    | `layoutId` veya küçük `layout` scale/opacity                                  | [motion component](https://motion.dev/docs/react-motion-component)                                                                                                          |
| İki farklı DOM ağacı arasında morph            | GSAP      | Paket hiyerarşisi ↔ düz liste: `Flip.getState()` → DOM değiş → `Flip.from()`  | [Flip](https://gsap.com/docs/v3/Plugins/Flip/) · [SVG genel](https://gsap.com/svg/)                                                                                         |
| İsteğe bağlı: sıralama / öncelik               | Motion    | Drag-to-reorder (admin/pin senaryosu)                                         | [Reorder](https://motion.dev/docs/react-reorder) · [Örnek](https://motion.dev/examples/react-reorder-items)                                                                 |




### 6.2 Madde 2 — Katmanlı İlişkiler tablosu


| Öneri                                               | Kütüphane | Ne işe yarar                                                  | Link                                                                                                                                    |
| --------------------------------------------------- | --------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Katman grupları açılınca satırların cascade gelmesi | Motion    | Parent `variants` + `stagger(0.05)`; 1. katman önce           | [Variants](https://motion.dev/docs/react-animation#variants) · [Transitions — delayChildren](https://motion.dev/docs/react-transitions) |
| Filtre değişince satır ekleme/çıkarma               | Motion    | `layout` satırlarda; grup başlığı `AutoHeight` (projede var)  | [LayoutGroup](https://motion.dev/docs/react-layout-animations)                                                                          |
| Uzun tabloda scroll ilerlemesi                      | Motion    | `useScroll` + satır/katman highlight (`scrollYProgress`)      | [useScroll](https://motion.dev/docs/react-use-scroll) · [Scroll animations](https://motion.dev/docs/react-scroll-animations)            |
| Viewport’a giren satırların toplu animasyonu        | GSAP      | `ScrollTrigger.batch()` — aynı anda görünen satırlara stagger | [ScrollTrigger — batch](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)                                                                |
| Katman expand/collapse                              | GSAP      | `Flip` ile grup açılışında satır pozisyon morph               | [Flip](https://gsap.com/docs/v3/Plugins/Flip/)                                                                                          |
| CSV export öncesi “katman vurgusu”                  | GSAP      | Kısa `timeline` + `addLabel("hop1")` ile 1. katman flash      | [Timeline labels](https://gsap.com/docs/v3/GSAP/Timeline/)                                                                              |




### 6.3 Madde 3 — Ekran / rapor kenarları


| Öneri                                   | Kütüphane | Ne işe yarar                                                           | Link                                                                     |
| --------------------------------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Yeni kenar tipi eklenince ok çizimi     | Motion    | SVG `pathLength: 0 → 1` (hafif kenar sayısı)                           | [motion component — SVG](https://motion.dev/docs/react-motion-component) |
| Filtre toggle: sadece servis / veri+UI  | Motion    | `AnimatePresence` ile kenar katmanları exit; `layout` ile düğüm reflow | [AnimatePresence](https://motion.dev/docs/react-animate-presence)        |
| Haritada okların progressive reveal     | GSAP      | `DrawSVG` — servis→ekran, servis→rapor farklı stroke                   | [DrawSVG](https://gsap.com/docs/v3/Plugins/DrawSVGPlugin/)               |
| Etki yolu üzerinde “akış” animasyonu    | GSAP      | `MotionPath` — seçili yol boyunca marker                               | [MotionPath](https://gsap.com/docs/v3/Plugins/MotionPathPlugin/)         |
| Kenar tipi değişimi (calls → UI embed)  | GSAP      | `MorphSVG` veya stroke renk tween (hafif)                              | [SVG plugins](https://gsap.com/svg/)                                     |
| Çok kenarlı grafikte scroll-scrub keşif | GSAP      | `ScrollTrigger` + `scrub` ile katman katman ok açılımı                 | [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)         |




### 6.4 Madde 4 — Yeni servis sihirbazı


| Öneri                                     | Kütüphane | Ne işe yarar                                                                | Link                                                                                                                                 |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| “Yeni servis” → side panel açılışı        | Motion    | Mevcut `MotionModal` / `layoutId` morph (saasinterface side-panel tarzı)    | [Shared layout](https://motion.dev/docs/react-layout-animations#shared-layout-animations) · projede `web/src/motion/MotionSheet.tsx` |
| Adımlar arası geçiş (1→5)                 | Motion    | `variants` + `custom` step index; `AnimatePresence` ile step panel          | [Variants — custom](https://motion.dev/docs/react-motion-component#custom)                                                           |
| Adım validasyonu sonrası sıralı animasyon | Motion    | `useAnimate` — async `[scope, step1], [fields, step2]` zinciri              | [useAnimate](https://motion.dev/docs/react-use-animate)                                                                              |
| Önizleme haritada yeni düğüm + ok ekleme  | Motion    | `layout` ile düğüm spawn; ok için `pathLength`                              | [Layout animation örnek](https://motion.dev/examples/react-layout-animation)                                                         |
| 5 adımlı wizard timeline                  | GSAP      | `timeline.addLabel("identity")` … `("preview")`; `tweenTo(label)`           | [Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)                                                                                  |
| Side panel’de wheel/swipe ile adım        | GSAP      | `Observer` — `onDown`/`onUp` → sonraki/önceki label                         | [Observer](https://gsap.com/docs/v3/Plugins/Observer/)                                                                               |
| Bağımlılık listesi → mini harita morph    | GSAP      | `Flip.getState()` form listesinden harita DOM’una                           | [Flip](https://gsap.com/docs/v3/Plugins/Flip/)                                                                                       |
| Adım göstergesi snap                      | GSAP      | `ScrollTrigger.snap: { snapTo: "labels" }` (tam sayfa sihirbaz alternatifi) | [ScrollTrigger — snap](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)                                                              |




### 6.5 Ortak (§5 + dört fikir)


| Öneri                         | Kütüphane | Ne işe yarar                                                          | Link                                                                 |
| ----------------------------- | --------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `prefers-reduced-motion`      | Motion    | Projede `useReducedMotion` — yeni yüzeylerde aynı kural               | [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion) |
| Global transition tutarlılığı | Motion    | `MotionConfig` — spring süreleri tek yerden                           | [MotionConfig](https://motion.dev/docs/react-motion-config)          |
| Snapshot replay (ileride)     | GSAP      | Duraklatılmış `timeline` — hop1 → hop2 → upstream sırayla oynat       | [Timeline controls](https://gsap.com/docs/v3/GSAP/Timeline/#methods) |
| Inbox / toplu onay kartları   | Motion    | `stagger` + `whileInView` veya liste `layout`                         | [whileInView](https://motion.dev/docs/react-animation#whileinview)   |
| Büyük liste performansı       | Motion    | `layout="position"` (tam layout yerine) — 500+ satır ağaç             | [Layout — position](https://motion.dev/docs/react-layout-animations) |
| Reduced motion alternatifi    | GSAP      | `gsap.matchMedia()` — `(prefers-reduced-motion: reduce)` → duration 0 | [matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia/)         |




### 6.6 Pratik ayrım (hangisini ne zaman)


| Senaryo                                           | Tercih                             | Gerekçe                                   |
| ------------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| Modal, sheet, tab, liste, layout reflow           | **Motion**                         | Zaten entegre; React declarative          |
| SVG ok çizimi, path üzerinde akış, ağır scrub     | **GSAP**                           | DrawSVG / MotionPath olgun                |
| DOM yapısı tamamen değişen görünüm (ağaç ↔ tablo) | **GSAP Flip** veya Motion `layout` | Flip büyük refactor; Motion küçük diff    |
| Wizard adım timeline + snap                       | **GSAP Timeline**                  | Label/snap kontrolü güçlü                 |
| Erişilebilirlik                                   | **İkisi de**                       | Animasyon kapalıyken anında durum; süre 0 |


**Başlangıç paketi (MVP animasyon):** Madde 1 → Motion `layout` + `stagger`; Madde 2 → Motion `variants`; Madde 3 → Motion `pathLength` (az kenar) veya GSAP DrawSVG (çok kenar); Madde 4 → Motion `useAnimate` adım geçişi + mevcut modal/sheet.