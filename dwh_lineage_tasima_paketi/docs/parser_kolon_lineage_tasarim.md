# Parser ve Kolon Bazlı Lineage Tasarımı

Bu doküman, DWH Analyzer içindeki parser mimarisinin nasıl tasarlandığını,
hangi PL/SQL/SQL script türlerini yakaladığını, kolon-kolon ilişkisini nasıl
çıkardığını, kolon bazlı etki analizinin neden önemli olduğunu ve bilinen
riskleri anlatır.

Ana dosyalar:

- `katalog_parser.py`: ETL / PL/SQL procedure ve package body dosyalarını kataloglar.
- `rapor_parser.py`: rapor SQL dosyalarını kataloglar.
- `katalog_semasi.sql`: PostgreSQL `stage` şemasındaki katalog tablolarını tanımlar.
- `lineage_app.py`: kataloglanan veriyi görselleştirir ve kolon etki API'lerini sunar.
- `katalog_belirsiz_kolonlar.csv`: ETL tarafında çözülemeyen kolonları raporlar.
- `rapor_belirsiz_kolonlar.csv`: rapor tarafında çözülemeyen kolonları raporlar.

## 1. Büyük Resim

Sistemin amacı sadece "hangi tablo hangi tabloyu besliyor" bilgisini çıkarmak
değildir. Asıl hedef üç seviyeli bir katalog üretmektir:

1. Tablo seviyesi lineage
2. Alt sorgu / SQL yapısı lineage
3. Kolon seviyesi lineage ve kolon kullanım etkisi

Bu ayrım önemlidir çünkü bir DWH değişikliğinde tablo seviyesinde etki görmek
çoğu zaman yetersizdir. Örneğin bir tabloda 300 kolon varsa ve sadece
`CUSTOMER_SEGMENT_CODE` değişiyorsa, bütün tabloyu kullanan tüm süreçleri
etkilenmiş kabul etmek çok gürültülü olur. Kolon bazlı lineage sayesinde şu
sorulara daha net cevap verilir:

- Bu kolon hangi hedef tablo kolonlarını besliyor?
- Bu kolon raporlarda hangi çıktı alanlarına gidiyor?
- Bu kolon değer olarak yazılmasa bile `WHERE`, `JOIN`, `CASE WHEN` veya
  `MERGE ON` üzerinden satır seçimini etkiliyor mu?
- Etki doğrudan kopya mı, yoksa türetilmiş/hesaplanmış bir ifade üzerinden mi?
- Bu bağlantı kesin mi, yoksa alias/metadata nedeniyle tahmin mi?

Bu yüzden kolon bazlı analiz, DWH değişikliklerinde blast radius'u daraltmak,
test kapsamını doğru belirlemek, rapor kırılmalarını önden görmek ve veri
sahipliği tartışmalarını somut SQL kanıtına bağlamak için kritik bir özelliktir.

## 2. Katalog Veri Modeli

Parser sonuçları PostgreSQL `stage` şemasındaki katalog tablolarına yazılır.
En kritik tablolar şunlardır:

| Tablo | Amaç |
| --- | --- |
| `stage.katalog_tablo` | Fiziksel tablo / kaynak / DWH tablosu kaydı |
| `stage.katalog_kolon` | Tablo kolonları |
| `stage.katalog_unit` | Procedure, function veya package içindeki birim |
| `stage.katalog_unit_statement` | Her DML statement kaydı |
| `stage.katalog_statement_kaynak` | Statement'ın okuduğu kaynak tablolar |
| `stage.katalog_statement_alt_sorgu` | Statement içindeki ana sorgu, CTE, UNION, subquery ağacı |
| `stage.katalog_kolon_lineage` | Kaynak kolon -> hedef kolon değer akışı |
| `stage.katalog_kolon_kullanim` | JOIN/WHERE/CASE/GROUP gibi değer akışı dışı kolon etkileri |
| `stage.katalog_rapor` | Rapor tanımı |
| `stage.katalog_rapor_kaynak` | Raporun kullandığı kaynak tablolar |
| `stage.katalog_rapor_kolon_lineage` | DWH kolon -> rapor çıktı kolonu ilişkisi |

En önemli ilişki şudur:

```text
stage.katalog_kolon_lineage
  kaynak_column_id -> stage.katalog_kolon.column_id
  hedef_column_id  -> stage.katalog_kolon.column_id
```

Bu tablo, kolon etki analizinin ana grafıdır. Uygulama bir kolondan başlar,
bu kolonun `kaynak_column_id` olduğu satırları bulur ve hedef kolonlara doğru
ilerler.

## 3. Parser'ın İşlediği Kaynak Script Türleri

### 3.1. ETL / PL/SQL Dosyaları

`katalog_parser.py`, çalışma klasöründeki `*.txt` dosyalarını tarar.
`ReadMe.txt` gibi hariç tutulan dosyalar `HARIC_TUTULACAKLAR` listesinden
elenir.

Yakalanan dosya/birim türleri:

- Tekil `CREATE OR REPLACE PROCEDURE ...`
- Package body içindeki `PROCEDURE ... IS/AS`
- Package body içindeki `FUNCTION ... RETURN ... IS/AS`
- Procedure adı dosya adından override edilebilen düz PL/SQL gövdeleri

Dosya içinde statement ayırma, noktalı virgüle göre yapılır; fakat string,
line comment ve block comment içindeki noktalı virgüller statement sonu
sayılmaz.

### 3.2. Yakalanan DML Türleri

ETL parser şu DML başlangıçlarını yakalar:

- `INSERT`
- `UPDATE`
- `MERGE`
- `DELETE`

Ayrıca özel bir dinamik SQL kalıbı yakalanır:

```sql
EXECUTE IMMEDIATE 'truncate table SCHEMA.TABLE'
```

Bu kalıp `TRUNCATE` olarak kataloglanır.

Önemli sınır: genel `EXECUTE IMMEDIATE` içindeki dinamik `INSERT`, `MERGE`,
`UPDATE`, `DELETE` ifadeleri şu an tam parse edilmez. Sadece yukarıdaki
`truncate table` kalıbı özel olarak regex ile yakalanır.

### 3.3. Rapor SQL Dosyaları

`rapor_parser.py`, `raporlar/` klasöründeki `*.sql` dosyalarını işler.
Her dosya bir rapor kabul edilir; rapor adı dosya adından gelir.

Rapor SQL'leri genellikle düz `SELECT` olduğu için doğrudan ETL statement'ı
gibi hedef tablo taşımaz. Bu yüzden rapor parser şu adaptörü kullanır:

```sql
INSERT INTO __RAPOR_HEDEF__
<rapor_select_sql>
```

Bu sahte sarmalama sayesinde ETL tarafında zaten sertleştirilmiş
`analyze_statement` motoru raporlara da uygulanır. Rapor kolonları hedef tablo
kolonu değil, `stage.katalog_rapor_kolon_lineage.rapor_kolon_adi` olarak
kataloglanır.

Rapor parser ayrıca şunları temizler:

- Sondaki `/`
- Sondaki `;`
- Metis prompt placeholder'ları: `[?<hash>?]` benzeri ifadeler

Metis promptları `:METIS_PROMPT` haline getirilir. Amaç SQL'i çalıştırmak
değil, parse edilebilir hale getirmektir.

## 4. Statement Ayrıştırma Akışı

ETL tarafındaki temel akış:

1. Dosya okunur.
2. Procedure/function/package parçalarına ayrılır.
3. DML statement'lar çıkarılır.
4. Her statement `sqlglot` ile Oracle dialect'inde parse edilir.
5. Hedef tablo bulunur.
6. Kaynak tablolar bulunur.
7. Alt sorgu ağacı çıkarılır.
8. Kolon lineage çıkarılır.
9. Koşul/join/filter kolon kullanımları çıkarılır.
10. Sonuç katalog tablolarına yazılır.

Parser `DIALECT = "oracle"` kullanır. Bu önemlidir çünkü kaynak scriptler
Oracle PL/SQL ve Oracle SQL sözdizimine yakındır.

## 5. Hedef Tablo ve Kaynak Tablo Çıkarımı

Statement parse edildikten sonra hedef tablo şu şekilde bulunur:

- `INSERT`: `INSERT INTO <hedef>`
- `UPDATE`: `UPDATE <hedef>`
- `DELETE`: `DELETE FROM <hedef>`
- `MERGE`: `MERGE INTO <hedef>`
- `TRUNCATE`: regex ile yakalanan hedef

Kaynak tablolar için parse tree içindeki tüm `exp.Table` düğümleri dolaşılır.
Hedef tablo ile aynı tablo kaynak listesinden çıkarılır. Kalanlar statement'ın
okuduğu tablolar kabul edilir.

Tablo adında DB link varsa ayrıştırılır:

```sql
SOURCE_TABLE@LINK
```

DB link içeren tablo genelde dış kaynak kabul edilir ve katman tahmininde
`KAYNAK` olarak işaretlenebilir.

## 6. Katman Tahmini

`katman_tahmin_et` tablo adından ETL katmanını tahmin eder.

Tipik heuristikler:

- Adında `EX` deseni varsa `EX`
- Adında `TR` deseni varsa `TR`
- DB link varsa veya dış kaynak gibi görünüyorsa `KAYNAK`
- Hiçbirine girmeyenler son aşamada `LD`

`finalize_katmanlar` bütün dosyalar işlendikten sonra çalışır. Bu geciktirme
bilinçlidir: henüz işlenmemiş bir dosyada kaynak olarak görülecek tabloyu erken
`LD` diye kilitlememek için katman tamamlama döngünün sonunda yapılır.

## 7. Alt Sorgu Ağacı

Parser sadece düz kaynak tablo listesi çıkarmaz. `INSERT` ve `MERGE` gibi doğal
bir SELECT/USING gövdesi olan statement'larda subquery yapısını da kataloglar.

`stage.katalog_statement_alt_sorgu` şu tipleri tutar:

- `ANA_SORGU`
- `FROM_ALT_SORGU`
- `WHERE_ALT_SORGU`
- `CTE`
- `UNION_DALI`
- `TABLO_FONKSIYONU`

Bu ağaç lineage uygulamasında "alt sorgu" düğümlerinin gösterilebilmesini sağlar.
Özellikle büyük SQL'lerde "bu kaynak doğrudan mı geliyor, yoksa iç sorgunun
içinden mi geliyor?" ayrımı için önemlidir.

UPDATE/DELETE için subquery ağacı kurulmaz; çünkü bu statement'larda SET,
WHERE ve farklı alt select kökleri tek doğal SELECT gövdesi altında birleşmez.
Buna rağmen kaynak tablolar düz kaynak listesiyle kaybolmadan kataloglanır.

## 8. Kolon Lineage Çıkarma Mantığı

Kolon lineage'in ana sorusu şudur:

```text
Hedef tablo kolonuna yazılan değer hangi kaynak tablo kolonundan geliyor?
```

Ana hedef `INSERT INTO hedef_tablo (...) SELECT ...` kalıbıdır.

Örnek:

```sql
INSERT INTO TARGET_TABLE (A, B, C)
SELECT
  S.X,
  S.Y + S.Z,
  CASE WHEN S.STATUS = 'A' THEN S.AMOUNT ELSE 0 END
FROM SOURCE_TABLE S
```

Parser şu sonucu üretir:

```text
SOURCE_TABLE.X      -> TARGET_TABLE.A   DIREKT_KOPYA
SOURCE_TABLE.Y      -> TARGET_TABLE.B   TURETILMIS
SOURCE_TABLE.Z      -> TARGET_TABLE.B   TURETILMIS
SOURCE_TABLE.AMOUNT -> TARGET_TABLE.C   TURETILMIS
```

`STATUS` burada doğrudan değer kaynağı değildir; koşul etkisidir. Bu yüzden
`katalog_kolon_lineage` yerine `katalog_kolon_kullanim` içinde `CASE_WHEN`
olarak tutulur.

### 8.1. Hedef Kolonlar Nasıl Bulunur?

Hedef kolon listesi üç yoldan bulunabilir:

1. SQL içinde açık kolon listesi:

   ```sql
   INSERT INTO T (COL1, COL2) SELECT ...
   ```

   Bu en güvenilir yoldur.

2. `known_table_columns` metadata'sı:

   Kolon listesi SQL'de yoksa, bazı tablolar için dışarıdan bilinen kolon
   listesi kullanılabilir.

3. SELECT alias'larından tahmin:

   ```sql
   INSERT INTO T
   SELECT A AS COL1, B AS COL2 FROM S
   ```

   Burada hedef kolon adı SELECT alias'larından tahmin edilir. Oracle gerçekte
   pozisyona göre insert yaptığı için bu `TAHMIN` güven seviyesidir.

### 8.2. Pozisyon Bazlı Eşleme

Oracle `INSERT INTO T (A, B, C) SELECT X, Y, Z` yapısında hedef kolonlar SELECT
ifade sırasıyla eşleşir.

Parser da aynı kuralı izler:

```text
A <- X
B <- Y
C <- Z
```

Hedef kolon sayısı ile SELECT ifade sayısı uyuşmuyorsa ilgili dal güvenlik
amacıyla atlanır.

### 8.3. UNION / UNION ALL

UNION içeren INSERT'lerde her SELECT dalı ayrı ele alınır. Hedef kolon listesi
aynı kalır, her dalın ifade listesi hedef pozisyonlara göre eşlenir.

Örnek:

```sql
INSERT INTO T (A, B)
SELECT X, Y FROM S1
UNION ALL
SELECT M, N FROM S2
```

Sonuç:

```text
S1.X -> T.A
S1.Y -> T.B
S2.M -> T.A
S2.N -> T.B
```

Literal/sabit değer döndüren UNION dalları gerçek kaynak kolon üretmiyorsa
kolon lineage satırı yazılmaz.

### 8.4. Direkt Kopya ve Türetilmiş Ayrımı

Eğer SELECT ifadesi doğrudan bir kolon ise:

```sql
S.COL1
```

`DIREKT_KOPYA` yazılır.

Eğer ifade hesap, fonksiyon, concat, CASE, NVL, aritmetik vb. içeriyorsa:

```sql
S.COL1 + S.COL2
NVL(S.COL1, 0)
CASE WHEN ... THEN S.COL1 END
```

`TURETILMIS` yazılır.

Bir hedef kolon birden fazla kaynak kolona bağlı olabilir. Bu durumda her
kaynak kolon için ayrı lineage satırı oluşur.

## 9. Kaynak Kolon Çözümleme

Kolon adı bulmak tek başına yeterli değildir; bu kolonun hangi tablodan geldiği
de bilinmelidir.

Parser şu sırayla çözüm yapar:

### 9.1. Alias'lı Kolonlar

```sql
SELECT C.CUSTOMER_ID
FROM FC_CUSTOMER C
```

`C` alias'ı `FC_CUSTOMER` tablosuna bağlı olduğu için bağlantı kesin kabul edilir.

### 9.2. Derived Table / Inline View

```sql
SELECT X.CUSTOMER_ID
FROM (
  SELECT C.CUSTOMER_ID AS CUSTOMER_ID
  FROM FC_CUSTOMER C
) X
```

Parser inline view'in çıktı kolon haritasını kurar. `X.CUSTOMER_ID`, iç sorgudaki
`FC_CUSTOMER.CUSTOMER_ID` kaynağına indirgenir.

### 9.3. CTE

CTE'ler de scope yapısı içinde izlenebildiği ölçüde alt sorgu / kaynak haritasına
dahil edilir. Rapor parser tarafında CTE adları fiziksel tablo listesinden
ayıklanır; çünkü `WITH X AS (...)` içindeki `X` gerçek tablo değildir.

### 9.4. SELECT *

`SELECT *` çok riskli bir kalıptır. Parser yine de bazı güvenli durumları
taşımaya çalışır:

- Tek fiziksel kaynaktan gelen `*`
- Derived table içindeki `SELECT *` sarmalayıcıları
- Alias'lı `T.*` kalıpları

Ama `SELECT *` çok kaynaklı join içinde kullanılıyorsa kolon-kolon eşleşmesi
metadata olmadan tam güvenli değildir.

### 9.5. Alias'sız Kolonlar

Örnek:

```sql
SELECT CUSTOMER_CODE
FROM A, B
```

Burada kolonun `A` mı `B` mi olduğu SQL metninden kesin çıkmaz. Parser şu
stratejiyi kullanır:

1. Eğer tek kaynak tablo varsa kolon o tabloya bağlanabilir.
2. Birden çok aday tablo varsa `stage.katalog_kolon` metadata'sına bakılır.
3. Kolon aday tablolar içinde yalnızca bir tabloda varsa çözülür.
4. Birden fazla tabloda varsa veya hiç bulunamazsa belirsiz bırakılır.

Bu belirsizler `katalog_belirsiz_kolonlar.csv` içine yazılır. Bu tasarım
bilinçlidir: emin olunmayan yerde yanlış lineage üretmektense eksikliği görünür
kılmak tercih edilir.

## 10. PL/SQL Değişkenleri

PL/SQL procedure parametreleri ve declaration bölümündeki değişkenler çıkarılır.

Örnek değişkenler:

- `PDATE`
- `AYBASI`
- `ONCEKIAYSONU`
- `VDATE`

Bu isimler SQL içinde kolon gibi görünebilir:

```sql
WHERE AS_OF_DATE = PDATE
```

Parser bunları tablo kolonu sanmamak için PL/SQL değişken listesini kullanır.
Ancak önemli bir nüans var: Bir isim tablo kolonu olabilecek şekilde
çözülebiliyorsa sadece "değişken listesinde var" diye aceleyle elenmez.
Değişken bilgisi özellikle çözülemeyen alias'sız isimleri belirsizlikten
ayıklamak için kullanılır.

## 11. Değer Lineage ve Koşul Etkisi Ayrımı

Bu parser'ın en önemli tasarım kararlarından biri şudur:

```text
Bir kolon hedef değeri üretmek için mi kullanılıyor,
yoksa hangi satırın/koşulun geçerli olacağını mı belirliyor?
```

Örnek:

```sql
CASE
  WHEN A.AS_OF_DATE = PDATE THEN A.BAKIYE
  ELSE 0
END AS TUTAR
```

Burada:

- `A.BAKIYE` hedef değer kaynağıdır.
- `A.AS_OF_DATE` koşul etkisidir.
- `PDATE` PL/SQL değişkenidir, fiziksel kaynak kolon değildir.

Bu yüzden:

```text
A.BAKIYE     -> hedef.TUTAR   katalog_kolon_lineage
A.AS_OF_DATE -> satır seçimi  katalog_kolon_kullanim / CASE_WHEN
```

Bu ayrım yapılmazsa kolon bazlı analiz yanıltıcı olur. `AS_OF_DATE` değer olarak
hedef kolona yazılmıyor olabilir, ama verinin hangi satırdan geleceğini
belirlediği için etki analizinde görünmelidir.

## 12. Katalog Kolon Kullanımı

`stage.katalog_kolon_kullanim`, direkt değer akışı olmayan ama sonucu etkileyen
kolonları tutar.

Yakalanan kullanım tipleri:

- `JOIN_ON`
- `WHERE`
- `CASE_WHEN`
- `MERGE_ON`
- `GROUP_BY`
- `HAVING`
- `ORDER_BY`

Bu kayıtlar şu soruya cevap verir:

```text
Bu kolon hedef kolona yazılmıyor olabilir ama sorgu sonucunu etkiliyor mu?
```

Örnek:

```sql
INSERT INTO TARGET (CUSTOMER_ID)
SELECT C.CUSTOMER_ID
FROM CUSTOMER C
JOIN SEGMENT S ON S.SEGMENT_ID = C.SEGMENT_ID
WHERE C.STATUS = 'A'
```

Lineage:

```text
C.CUSTOMER_ID -> TARGET.CUSTOMER_ID
```

Kullanım etkisi:

```text
S.SEGMENT_ID  JOIN_ON
C.SEGMENT_ID  JOIN_ON
C.STATUS      WHERE
```

Bu bilgi, "STATUS değişirse hangi tablolar/raporlar etkilenir?" sorusunda
doğrudan kolon değeri akışından farklı ama yine de kritik bir etkidir.

## 13. Rapor Parser Tasarımı

Rapor parser ayrı bir kolon lineage motoru yazmaz. Bunun yerine rapor SQL'ini
sentetik bir INSERT gibi sarmalayarak ETL parser'ın `analyze_statement`
fonksiyonunu kullanır.

Bu tasarımın avantajları:

- ETL ve rapor tarafında aynı kaynak kolon çözümleme mantığı kullanılır.
- UNION, derived table, alias, direkt/türetilmiş ayrımı iki tarafta tutarlı olur.
- Parser davranışı tek yerde sertleştirilir.

Rapor tarafındaki farklar:

- Hedef fiziksel tablo yoktur.
- Hedef kolonlar SELECT alias'larından gelir.
- Bu yüzden rapor kolon lineage kayıtları çoğunlukla `TAHMIN` güven seviyesindedir.
- Raporlarda alias'sız kolon için kontrollü "ana kaynak tahmini" vardır.

### 13.1. Rapor Ana Kaynak Tahmini

Rapor SQL'lerinde sık görülen desen:

```sql
FROM PROD_FACT_TABLE F
JOIN DM_ORGANIZATION O ON ...
JOIN BOLGELER B ON ...
```

Rapor çıktılarının çoğu ana fact tablodan gelir, dimension/lookup tablolar
genellikle açıklama, filtre veya organizasyon bilgisi sağlar.

Bu yüzden rapor parser:

1. Kaynaklar içinde tek gerçek ana aday varsa onu seçer.
2. `DM_`, `DIM_`, `BOLGELER`, `ORGANIZATION` gibi kaynakları lookup kabul eder.
3. Alias'sız kolon çözülemiyorsa ve tek ana kaynak varsa kolonu bu ana kaynağa
   bağlar.

Bu kural ETL parser'a eklenmemiştir; çünkü ETL tarafında fazla agresif olurdu.
Rapor tarafında pratik fayda için kontrollü şekilde kullanılır.

## 14. Kolon Etki API Mantığı

Ana uygulamadaki kolon etki ekranı `/api/kolon_etki` endpoint'iyle çalışır.

Girdi:

```text
table_id
kolon_adi
akis = lineage,turetilmis,kosul,rapor
```

Akış:

1. Başlangıç kolonunun `column_id` değeri bulunur.
2. `frontier` başlangıç kolonuyla başlar.
3. Döngüsel olarak:
   - `katalog_kolon_lineage` içinde `kaynak_column_id = frontier` aranır.
   - Bulunan `hedef_column_id` değerleri sonraki katman olur.
   - `katalog_kolon_kullanim` içinde koşul/join/filter etkileri aranır.
   - `katalog_rapor_kolon_lineage` içinde rapor çıktı etkileri aranır.
4. Görülen kolonlar tekrar gezilmez.
5. Her seviye için etkilenen kolonlar ve raporlar JSON olarak döner.

Bu aslında kolon grafı üzerinde ileri yönlü BFS'tir:

```text
başlangıç kolon
  -> doğrudan etkilediği hedef kolonlar
    -> onların etkilediği sonraki kolonlar
      -> ...
```

Frontend bu JSON'u kolon kartları ve kolonlar arası çizgiler halinde çizer.

## 15. UI'da Gösterilen Akış Tipleri

Kolon etki ekranında akışlar tiplerine göre ayrılır:

| Akış | Kaynak tablo |
| --- | --- |
| Direkt kolon akışı | `katalog_kolon_lineage.donusum_tipi = DIREKT_KOPYA` |
| Türetilmiş kolon akışı | `katalog_kolon_lineage.donusum_tipi = TURETILMIS` |
| Satır seçimi / koşul | `katalog_kolon_kullanim` |
| Rapor kolon akışı | `katalog_rapor_kolon_lineage` |

Kullanıcı bu akışları filtreleyebilir. Örneğin sadece direkt değer akışını veya
rapor etkisini görmek mümkündür.

## 16. Güven Seviyesi

Kolon ilişkilerinde iki güven seviyesi vardır:

- `KESIN`
- `TAHMIN`

`KESIN` kabul edilen durumlar:

- Hedef kolon listesi SQL'de açıkça yazılıdır.
- Kaynak kolon alias ile kesin tabloya bağlanmıştır.
- Alias'sız kolon metadata içinde tek aday tabloya düşmüştür.

`TAHMIN` kabul edilen durumlar:

- INSERT hedef kolon listesi yoktur ve hedef kolonlar SELECT alias'larından
  çıkarılmıştır.
- Derived table / alias'sız kaynak çözümünde tek kaynak gibi kontrollü fallback
  kullanılmıştır.
- Rapor kolonları SELECT alias'larından çıkarıldığı için rapor tarafında çoğu
  kolon lineage doğal olarak tahmindir.

Bu alan, kritik değişikliklerde hangi bağlantıların manuel teyit gerektirdiğini
göstermek için vardır.

## 17. İki Geçişli Kataloglama

`katalog_parser.py` ETL dosyalarını iki geçişte işler.

Birinci geçiş:

- Açıkça görülebilen tablolar ve kolonlar kataloglanır.
- Alias'lı kaynak kolonlar ve hedef kolonlar `katalog_kolon` sözlüğünü besler.

İkinci geçiş:

- Birinci geçişte oluşan kolon metadata'sı kullanılarak alias'sız kolonlar
  daha iyi çözülür.
- Hâlâ çözülemeyenler CSV'ye yazılır.

Bu tasarım, "önce sözlüğü oluştur, sonra belirsizleri bu sözlükle çöz" mantığıdır.
Tek geçişte alias'sız kolonları çözmek daha zayıf olurdu.

## 18. Belirsizlik CSV'leri

Parser emin olmadığı kolonları sessizce atmak yerine CSV'ye yazar.

ETL:

```text
katalog_belirsiz_kolonlar.csv
```

Rapor:

```text
rapor_belirsiz_kolonlar.csv
```

CSV alanları şunları içerir:

- kaynak türü
- package/procedure veya rapor adı
- satır no
- hedef tablo
- hedef kolon
- belirsiz kolon
- kullanım tipi
- aday tablolar
- SQL önizleme

Bu dosyalar parser iyileştirme listesi gibi düşünülmelidir. En değerli
iyileştirme kaynakları genelde buradadır.

## 19. Yakalanabilen SQL Kalıpları

Parser'ın güçlü olduğu kalıplar:

- `INSERT INTO hedef (kolonlar) SELECT ...`
- `INSERT INTO hedef SELECT ...` ve SELECT alias'larından hedef tahmini
- `INSERT ... SELECT ... UNION ALL SELECT ...`
- Parantez içine alınmış SELECT gövdeleri
- `FROM` içi inline view / derived table
- `WITH` / CTE yapıları
- `JOIN` ve `JOIN ON`
- `WHERE`
- `CASE WHEN`
- `GROUP BY`
- `HAVING`
- `ORDER BY`
- `MERGE INTO ... USING (...)`
- `MERGE ON`
- Çıplak tablo kullanan `MERGE ... USING tablo alias`
- `UPDATE` / `DELETE` için tablo seviyesi kaynak yakalama
- `EXECUTE IMMEDIATE 'truncate table ...'`
- `SELECT *` için kontrollü sarmalayıcı ve tek kaynak senaryoları
- DB linkli tablo adları
- Rapor SELECT SQL'leri
- Metis prompt placeholder içeren rapor SQL'leri

## 20. Bilinen Sınırlar ve Riskler

### 20.1. Dinamik SQL

Genel dinamik SQL şu an parse edilmez:

```sql
EXECUTE IMMEDIATE 'insert into ... select ...'
```

Sadece özel truncate kalıbı yakalanır. String birleştirme ile oluşturulan SQL'ler
statik parser için doğal olarak risklidir.

### 20.2. UPDATE ve MERGE Kolon Atamaları

Parser tablo seviyesi kaynakları yakalar ve `MERGE_ON` gibi koşul etkilerini
kaydeder. Ancak kolon-kolon değer lineage motorunun ana güçlü yolu
`INSERT ... SELECT` kalıbıdır.

`UPDATE SET hedef_col = kaynak_col` veya `MERGE WHEN MATCHED THEN UPDATE SET ...`
gibi atamalarda kolon-level hedef eşlemesi INSERT kadar kapsamlı değildir.
Bu alan geliştirilecek doğal bir sonraki konudur.

### 20.3. Alias'sız Çok Kaynaklı SQL

Şu kalıp risklidir:

```sql
SELECT CUSTOMER_ID
FROM A, B
```

Kolon iki tabloda da varsa parser çözüm uydurmaz, belirsiz bırakır. Bu doğru
ama eksik lineage anlamına gelebilir.

### 20.4. SELECT *

`SELECT *`, özellikle çok kaynaklı joinlerde hedef kolon eşlemesini belirsiz
yapar. Metadata veya açık kolon listesi yoksa güvenilir kolon lineage üretmek
zordur.

### 20.5. Karmaşık Derived Table / CTE

Parser inline view çıktı kolonlarını fiziksel kaynaklara indirmeye çalışır.
Ancak çok iç içe CTE, UNION, fonksiyon, pivot/unpivot veya dinamik kolon adı
üreten yapılarda her zaman kesin kaynak bulunamayabilir.

### 20.6. PL/SQL Değişkenleri ve Fonksiyon Semantiği

PL/SQL değişkenleri fiziksel kaynak kolon değildir. Ancak bir fonksiyonun
iç mantığında başka tablo okuması varsa bu statik SQL üzerinden görünmeyebilir.

Örnek:

```sql
SELECT custom_lookup_function(A.CODE)
FROM T A
```

Parser `A.CODE` kolonunu görür, ama fonksiyonun içeride hangi tabloyu okuduğunu
fonksiyon gövdesi ayrıca analiz edilmedikçe bilemez.

### 20.7. Rapor Ana Kaynak Tahmini

Rapor tarafındaki "ana fact tablo + lookup/dimension" fallback'i pratiktir ama
evrensel SQL kuralı değildir.

Yanlış tahmin riski olan durumlar:

- Rapor birden fazla ana fact tabloyu birleştiriyorsa
- Lookup kabul edilen tablo aslında ana veri taşıyorsa
- Metadata eksikse
- Alias'sız kolon aslında CTE/inline view çıktısıysa ve gerçek kaynak izlenemiyorsa

Bu yüzden kritik raporlarda kolonların alias'lı yazılması en doğru çözümdür.

### 20.8. Metadata Eksikliği

Alias'sız kolon çözümü `stage.katalog_kolon` metadata'sına dayanır. Bu metadata
eksikse parser "tek aday var" sanabilir veya hiçbir adayı bulamayabilir.

Metadata kalitesi, kolon lineage kalitesini doğrudan etkiler.

## 21. İyi SQL Yazım Pratikleri

Parser'ın en doğru sonucu vermesi için öneriler:

1. INSERT hedef kolon listesini açık yazın.

   ```sql
   INSERT INTO TARGET (COL1, COL2)
   SELECT A.COL1, A.COL2
   FROM SOURCE A
   ```

2. Kaynak kolonları alias'lı yazın.

   ```sql
   SELECT C.CUSTOMER_ID
   FROM FC_CUSTOMER C
   ```

3. `SELECT *` kullanımından kaçının.

4. Derived table çıktılarında alias kullanın.

   ```sql
   SELECT X.CUSTOMER_ID
   FROM (
     SELECT C.CUSTOMER_ID AS CUSTOMER_ID
     FROM FC_CUSTOMER C
   ) X
   ```

5. Rapor SQL'lerinde ana kaynak ve lookup tabloları alias'lı yazın.

6. Karmaşık CASE ifadelerinde değer üreten kolonları açık tutun.

7. Dinamik SQL kullanılıyorsa mümkünse oluşturulan SQL'i ayrı dosya olarak
   kataloglanabilir hale getirin.

## 22. Kolon Bazlı Analizin İş Değeri

Kolon bazlı analiz şu senaryolarda özellikle değerlidir:

### 22.1. Değişiklik Etki Analizi

Bir kaynak kolonun tipi, anlamı veya hesaplama yöntemi değiştiğinde hangi tablo
kolonları ve rapor alanları etkileniyor sorusu cevaplanır.

### 22.2. Test Kapsamı Belirleme

Tablo seviyesinde bakılırsa çok fazla test çıkar. Kolon seviyesinde sadece
gerçekten etkilenen hedef kolonlar ve raporlar seçilebilir.

### 22.3. Rapor Kırılma Riskini Görme

Kaynak kolon değişikliği doğrudan rapor kolonuna gidiyorsa rapor sahibi önceden
uyarılabilir.

### 22.4. Veri Kalitesi ve Mutabakat

Bir hedef kolondaki anomali geriye doğru hangi kaynak kolonlardan gelebilir
sorusu hızlıca araştırılır.

### 22.5. Governance ve Sahiplik

Bir kolonun hangi prosedür, hangi SQL ve hangi kaynak kolon üzerinden üretildiği
kanıtlanabilir.

### 22.6. Koşul Etkisi

Bir kolon hedef değere yazılmasa bile `WHERE` veya `JOIN` içinde kullanılıyorsa
sonucu değiştirebilir. Bu nedenle koşul etkisi, klasik lineage kadar önemlidir.

## 23. Uygulama Tarafında Kullanım

`lineage_app.py` içinde iki önemli endpoint vardır:

### 23.1. `/api/kolon_lineage`

Bir tablonun hedef kolonları için geriye doğru kaynak kolon listesini verir.

Bu daha çok "bu tablodaki kolonlar nereden geliyor?" sorusudur.

### 23.2. `/api/kolon_etki`

Bir başlangıç kolonundan ileri yönde giderek etkilediği hedef tablo kolonlarını,
rapor kolonlarını ve koşul etkilerini döner.

Bu daha çok "bu kolon değişirse nereler etkilenir?" sorusudur.

Frontend tarafında bu API sonucu kart/kolon grafına dönüştürülür. Kartlar tablo
ve raporları, satırlar kolonları, çizgiler ise kolon ilişkilerini temsil eder.

## 24. Geliştirme İçin Önerilen Sonraki Adımlar

1. `UPDATE SET` kolon lineage desteğini güçlendirmek.
2. `MERGE WHEN MATCHED UPDATE SET` ve `WHEN NOT MATCHED INSERT` kolon hedeflerini
   daha ayrıntılı çıkarmak.
3. Dynamic SQL için opsiyonel "loglanan/generated SQL" input desteği eklemek.
4. `SELECT *` çözümünde gerçek Oracle `ALL_TAB_COLUMNS` metadata'sını daha aktif
   kullanmak.
5. Belirsiz CSV'leri UI içinde incelenebilir hale getirmek.
6. Güven seviyesi `KESIN/TAHMIN` yanında belki `BELIRSIZ_ATLANDI` gibi ayrı bir
   raporlama metrik katmanı eklemek.
7. Parser için küçük fixture SQL setleriyle otomatik regresyon testleri yazmak.
8. Rapor ana kaynak tahmini için proje bazlı konfigürasyon eklemek.

## 25. Özet

Parser mimarisi temkinli tasarlanmıştır. Güvenilir olduğu yerde kolon-kolon
lineage üretir; emin olmadığı yerde yanlış bağlantı uydurmak yerine belirsizliği
CSV'ye bırakır.

En güçlü olduğu alan:

```text
INSERT INTO hedef (kolonlar)
SELECT kaynak ifadeleri
FROM kaynaklar
```

En kritik ayrım:

```text
Değer akışı      -> katalog_kolon_lineage
Koşul/satır etkisi -> katalog_kolon_kullanim
Rapor çıktı etkisi -> katalog_rapor_kolon_lineage
```

Bu üç katman birlikte çalıştığında uygulama sadece tablo lineage gösteren bir
araç olmaktan çıkar; kolon değişikliğinin operasyonel etkisini, rapor etkisini
ve SQL kanıtını birlikte sunan bir DWH etki analiz sistemine dönüşür.
