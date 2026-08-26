# Ürün fikirleri — katalog genişlemesi

> Tarih: 2026-08-26  
> İlgili: [README](./README.md), [ServiceDependency](./ServiceDependency.md), [UI/UX gereksinimleri](./UI_UX_GEREKSINIMLER.md), [Snapshot](./SNAPSHOT.md)

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

| Konu | Ne lazım | Neden |
|------|----------|--------|
| **Tek katalog modeli** | Servis, metod, ekran, rapor aynı şemada | Ağaç, harita ve tablo aynı veriden beslensin |
| **Ekranlar birbirini tutsun** | Harita, İlişkiler tablosu ve snapshot aynı kurallarla hesaplansın | “Listede var haritada yok” güveni kırılmasın |
| **Bağlantı türü** | Çağrı, okuma, ekranda gösterme vb. ayrı etiketlensin | Onay, keşif ve veri etkisi karışmasın |
| **Yazdığın vs gerçek** | Talepte yazılan bağımlılık ≠ kod taraması → uyarı | Yeni servis ve “potansiyel etki” iddiaları doğrulansın |
| **Kime gidecek** | Her kayıtta sorumlu; inbox kuralı bağlantı tipine göre | Yeni servis: çağırdıklarının sahibi; değişiklik: etkilenenlerin sahibi |
| **Snapshot genişlemesi** | Etki listesi + kullanıcının beyan ettiği bağımlılıklar + ekran/rapor | Olay sonrası: “ne dedi, ne gördü, katalog ne diyordu” |
| **Filtreler senkron** | Proje filtresi ve katman ayarı harita ile tabloda aynı | Aynı anda okunabilir olsun |
| **Metod ↔ servis tutarlılığı** | Kod taraması ile servis grafiği çelişmesin diye kontrol | Metod ağaçta farklı dursa bile onay doğru kalsın |
| **Yeni servis UX** | Harita olmadan form odaklı akış | Katalogda henüz yoksa harita anlamsız |
| **Geçmişi tekrar gösterme** | Snapshot’tan o anki tablo/harita (ileride) | Onay anı yeniden izlenebilsin |

---

## Öncelik sırası (ilk adımlar)

| # | Fikir | İlk iş |
|---|--------|--------|
| 1 | Düz ağaç / metod aynı seviye | Ağaç filtresi + tip rozeti |
| 2 | Katmanlı İlişkiler tablosu | Mevcut listeyi katman gruplu tabloya çevir |
| 3 | Ekran / rapor bağları | Bağlantı türü + tabloda tür sütunu (mock birkaç rapor) |
| 4 | Yeni servis sihirbazı | Karşılama + adımlı form + mini önizleme |

---

## Henüz karar verilmedi

1. Metod ayrı onay task’ı mı açılır, yoksa her zaman üst servis mi?
2. Ekran/rapor ilişkisi onay kapısına girer mi, yoksa sadece bilgi mi?
3. “Potansiyel etki” kullanıcıdan zorunlu mu, sistem önerisi yeterli mi?
4. Metod sayısı çok artınca düz listede arama zorunlu mu?
