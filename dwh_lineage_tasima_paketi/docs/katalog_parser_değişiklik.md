**Kısa Özet**
Şu an yaptığımız şey şu: parser’lar artık sadece “hangi tablo hangi tabloyu besliyor” bilgisini değil, mümkün olduğunca “hangi kolon hangi kolonu besliyor” ve “hangi kolon JOIN/WHERE/CASE/GROUP gibi koşullarda etkili oluyor” bilgisini de katalogluyor.

Yani uygulamadaki kolon etki analizi için altyapıyı güçlendirdik.

**`katalog_parser.py`**
[katalog_parser.py](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:201>) ETL/procedure tarafını analiz ediyor.

Başlıca değişiklikler:

1. **PL/SQL değişkenlerini ayırıyoruz**
   [plsql_degiskenlerini_cikar](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:201>) ile procedure parametreleri ve declaration içindeki değişkenleri çıkarıyoruz.

   Böylece `PDATE`, `AYBASI`, `ONCEKIAYSONU`, `vdate` gibi şeyleri “kolon belirsizliği” sanmıyoruz. Bunlar tablo kolonu değil, procedure değişkeni olabilir.

2. **Alt sorgu / inline view kolonlarını gerçek kaynağına indiriyoruz**
   [_derived_kolon_kaynaklari](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:436>) ve [_kolon_kaynagini_coz](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:644>) ile şu tarz yapıları çözüyoruz:

   ```sql
   SELECT TT.CITY_NAME
   FROM (
     SELECT C.CITY_NAME AS CITY_NAME
     FROM CITY C
   ) TT
   ```

   Burada artık `TT.CITY_NAME` kaynağı olarak `CITY.CITY_NAME` bulunabiliyor.

3. **`SELECT *` sarmalayıcılarını daha iyi yakalıyoruz**
   [_star_kaynaklarini_bul](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:500>) ile `SELECT * FROM (...)` veya tek tablodan gelen `*` durumlarını taşıyoruz. Bu özellikle ara SELECT’lerin sadece kolonları yukarı aktardığı SQL’lerde işe yarıyor.

4. **Sabit kolonları belirsiz saymıyoruz**
   [_select_cikti_kolon_haritasi](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:711>) içinde `NULL AS X`, `'ABC' AS X`, PL/SQL değişkeninden gelen değerler gibi fiziksel kaynak kolonu olmayan ifadeler artık CSV’ye belirsiz olarak düşmüyor.

5. **CASE WHEN içindeki değer kolonu ile koşul kolonunu ayırıyoruz**
   [_deger_kolonlarini_bul](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:546>) önemli bir düzeltme.

   Örneğin:

   ```sql
   CASE WHEN A.AS_OF_DATE = PDATE
        THEN A.BAKIYE
        ELSE 0
   END
   ```

   Burada hedef kolonun asıl değeri `A.BAKIYE`’den geliyor. `AS_OF_DATE` sadece koşul. Eskiden ikisi de lineage kaynağı gibi karışabiliyordu. Şimdi:
   - `BAKIYE` kolon lineage
   - `AS_OF_DATE` koşul/join/filter kullanımı

   olarak daha doğru ayrılıyor.

6. **JOIN / WHERE / GROUP / CASE etkilerini ayrıca kaydediyoruz**
   [_kolon_kullanimlarini_cikar](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:904>) ile kolonun direkt hedef kolona yazılmadığı ama sorgu sonucunu etkilediği yerleri çıkarıyoruz.

   Bunlar `stage.katalog_kolon_kullanim` tablosuna yazılıyor:
   - `JOIN_ON`
   - `WHERE`
   - `GROUP_BY`
   - `ORDER_BY`
   - `HAVING`
   - `CASE_WHEN`
   - `MERGE_ON`

   Bu, “kolon değişirse sadece onu kullanan hedef kolonlar değil, filtre/join üzerinden etkilenen tablolar da görülebilsin” altyapısı.

7. **Alias’sız kolonları katalog metadata ile çözmeye çalışıyoruz**
   [resolve_ambiguous_kaynak](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:1422>) şunu yapıyor:

   Bir sorguda kolon şöyle yazılmışsa:

   ```sql
   SELECT CUSTOMER_CODE
   FROM A, B
   ```

   ve alias yoksa, parser önce `stage.katalog_kolon` tablosuna bakıyor. Eğer `CUSTOMER_CODE` aday kaynak tablolar içinde sadece bir tabloda varsa, onu çözüyor. Birden fazla tabloda varsa belirsiz bırakıyor.

8. **Parser tekrar çalıştırılabilir hale geldi**
   [delete_existing_unit](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/katalog_parser.py:1439>) aynı procedure daha önce yazıldıysa eski kayıtları siliyor, sonra yeniden yazıyor. Böylece her çalıştırmada duplicate kayıt oluşmuyor.

**`rapor_parser.py`**
[rapor_parser.py](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/rapor_parser.py:176>) rapor SQL’lerini analiz ediyor ama sıfırdan ayrı bir motor yazmıyor. Rapor SQL’ini sahte bir `INSERT INTO __RAPOR_HEDEF__ SELECT ...` gibi sarıp `katalog_parser.py` içindeki ana analiz motorunu kullanıyor.

Başlıca değişiklikler:

1. **Rapor SQL’i temizleniyor**
   [rapor_sqlini_oku](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/rapor_parser.py:146>) ile sondaki `/`, `;` ve Metis prompt placeholder’ları temizleniyor.

   Örneğin `[?ABC...?]` gibi runtime prompt alanları `:METIS_PROMPT` haline getiriliyor. Amaç SQL’in parse edilebilir olması.

2. **CTE’ler gerçek tablo sanılmıyor**
   [rapor_analiz_et](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/rapor_parser.py:176>) içinde `WITH X AS (...)` ile tanımlanan geçici isimler fiziksel tablo listesinden ayıklanıyor.

3. **Raporlara özel ana kaynak tahmini eklendi**
   [rapor_ana_kaynak_tahmini](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/rapor_parser.py:81>) raporlar için kontrollü bir fallback.

   Raporlarda sık görülen desen şu:

   ```sql
   FROM PROD_ORG_PROFIT A
   JOIN DM_ORGANIZATION ORG ...
   ```

   Burada rapor kolonlarının çoğu ana fact tablodan gelir, `DM_ORGANIZATION` gibi tablolar lookup/dimension amaçlıdır. Alias’sız kolon çözülemezse ve kaynaklar içinde tek bir “ana tablo” kalıyorsa, kolon o ana tabloya bağlanıyor.

   Bu kuralı ETL parser’a koymadık, çünkü ETL tarafında fazla cesur olurdu. Rapor tarafında daha mantıklı.

4. **Rapor kolon lineage ve koşul kullanımları yazılıyor**
   [rapor_katalogla](</mnt/c/Users/Orkun/Desktop/katalog pg_v12/rapor_parser.py:234>) şu tablolara yazıyor:
   - `stage.katalog_rapor`
   - `stage.katalog_rapor_kaynak`
   - `stage.katalog_rapor_kolon_lineage`
   - `stage.katalog_kolon_kullanim`

   Yani raporda görünen kolonun hangi DWH tablo kolonundan geldiğini ve rapor SQL’indeki WHERE/JOIN gibi kolon etkilerini de katalogluyor.

**Sonuç**
ETL tarafında parser daha güvenli ve temkinli oldu. Belirsiz kalanları zorla uydurmuyor, CSV’ye bırakıyor.

Rapor tarafında ise daha pratik bir tahmin kuralı ekledik. Bu yüzden son çalıştırmanda rapor tarafında:

```text
alias'sız rapor lineage kolonu belirsiz: 0
alias'sız rapor koşul/join kolonu belirsiz: 0
```

seviyesine indik.

**Riskler ve Varsayımlar**
Bu sağlamlaştırmaların büyük kısmı başka tablolar eklendiğinde de güvenli çalışacak şekilde tasarlandı. Özellikle ETL tarafında parser genel olarak “emin değilsem uydurmuyorum” mantığıyla hareket ediyor. Alias varsa kesin bağlantıyı kullanıyor; alias yoksa ancak aday kaynak tablolar içinde kolon tek bir tabloda bulunuyorsa çözüyor. Çözemezse `katalog_belirsiz_kolonlar.csv` içine bırakıyor.

Güvenli kabul ettiğimiz kurallar:
- PL/SQL değişkenlerini kolon belirsizliği saymamak.
- `NULL AS X`, sabit string/sayı, prompt veya procedure değişkeni gibi fiziksel kaynak kolonu olmayan ifadeleri lineage kaynağı gibi yazmamak.
- `CASE WHEN` içinde değer üreten kolonla koşul/filter kolonunu ayırmak.
- `JOIN`, `WHERE`, `GROUP BY`, `CASE_WHEN` gibi alanları direkt lineage değil, ayrı kolon kullanımı/etki bilgisi olarak kaydetmek.
- Alt sorgu/inline view kolonlarını, kaynak açıkça izlenebiliyorsa gerçek tablo kolonuna indirmek.
- Alias'sız kolonları sadece metadata içinde tek bir aday tabloya düşüyorsa çözmek.

Dikkat edilmesi gereken ana risk `rapor_parser.py` tarafındaki rapora özel ana kaynak tahminidir. Raporlarda sık görülen “ana fact tablo + lookup/dimension tablo” deseninde, alias'sız kolon çözülemezse ve tek bir ana kaynak tablo seçilebiliyorsa kolon o ana tabloya bağlanır. Bu pratikte mevcut raporlarda belirsizliği sıfırladı; ancak tamamen evrensel bir SQL kuralı değildir.

Yanlış tahmin riski oluşabilecek durumlar:
- Rapor SQL'inde birden fazla gerçek ana/fact tablo varsa.
- `DM_`, `DIM_`, `BOLGELER`, `ORGANIZATION` gibi lookup kabul ettiğimiz tablo aslında ana veri taşıyorsa.
- Metadata eksik olduğu için kolon yalnızca bir tabloda varmış gibi görünüyorsa.
- Alias'sız kolon, SQL mantığında farklı bir inline view/CTE çıktısından geliyor ama parser bunu kesin izleyemiyorsa.
- Çok karmaşık `UNION`, `CTE`, `UNPIVOT` veya iç içe derived table yapılarında kolon ismi SQL tarafından üretildiği halde gerçek kaynak açık değilse.

Bu yüzden ETL tarafındaki kalan belirsizleri bilerek açık bırakıyoruz; fazla agresif tahmin yapmak hatalı lineage üretme riskini artırır. Rapor tarafındaki tahminler ise kullanım kolaylığı için kabul edildi ve zaten rapor kolon lineage satırları `TAHMIN` güven seviyesiyle yazılıyor. Kritik raporlarda en sağlam çözüm SQL içinde kolonları alias'lı yazmaktır:

```sql
SELECT A.ISKOLU
FROM PROD_ORG_PROFIT A
```

Bu hem parser için hem geliştirici için en net kaynak bilgisidir.

Özetle: `katalog_parser.py` kolon lineage motorunu sağlamlaştırıyor; `rapor_parser.py` bu motoru rapor SQL’lerine uygulayıp rapora özel ana kaynak tahminiyle eksikleri kapatıyor.
