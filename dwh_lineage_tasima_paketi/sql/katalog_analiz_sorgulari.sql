-- ====================================================================
-- katalog_analiz_sorgulari.sql
-- KATALOG_* tabloları üzerinde sık kullanılacak 5 analiz sorgusu.
-- Her birinde ':tablo_adi' / ':kolon_adi' yazan yerleri kendi
-- aradığınız isimle değiştirin.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1) "Bu tabloyu değiştirirsem ne bozulur?" -- ileriye doğru etki analizi
-- --------------------------------------------------------------------
WITH RECURSIVE ileri (seviye, kaynak_tid, hedef_tid) AS (
    SELECT 1, sk.kaynak_table_id, us.hedef_table_id
    FROM stage.katalog_statement_kaynak sk
    JOIN stage.katalog_unit_statement us ON us.statement_id = sk.statement_id
    JOIN stage.katalog_tablo t ON t.table_id = sk.kaynak_table_id
    WHERE t.tablo_adi = 'E_ORDER_PAYMENTS'          -- <-- buraya tablo adını yazın
    UNION ALL
    SELECT i.seviye + 1, sk.kaynak_table_id, us.hedef_table_id
    FROM stage.katalog_statement_kaynak sk
    JOIN stage.katalog_unit_statement us ON us.statement_id = sk.statement_id
    JOIN ileri i ON sk.kaynak_table_id = i.hedef_tid
    WHERE i.seviye < 10                              -- döngü/aşırı derinlik koruması
)
SELECT DISTINCT i.seviye, t.tablo_adi AS etkilenen_tablo
FROM ileri i JOIN stage.katalog_tablo t ON t.table_id = i.hedef_tid
ORDER BY i.seviye;


-- --------------------------------------------------------------------
-- 2) "Bu tablo nereden besleniyor?" -- geriye doğru lineage
-- --------------------------------------------------------------------
WITH RECURSIVE geri (seviye, hedef_tid, kaynak_tid) AS (
    SELECT 1, us.hedef_table_id, sk.kaynak_table_id
    FROM stage.katalog_unit_statement us
    JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
    JOIN stage.katalog_tablo t ON t.table_id = us.hedef_table_id
    WHERE t.tablo_adi = 'ORDER_PAYMENTS'             -- <-- buraya tablo adını yazın
    UNION ALL
    SELECT g.seviye + 1, us.hedef_table_id, sk.kaynak_table_id
    FROM stage.katalog_unit_statement us
    JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
    JOIN geri g ON us.hedef_table_id = g.kaynak_tid
    WHERE g.seviye < 10
)
SELECT DISTINCT g.seviye, t.tablo_adi AS kaynak_tablo
FROM geri g JOIN stage.katalog_tablo t ON t.table_id = g.kaynak_tid
ORDER BY g.seviye, kaynak_tablo;


-- --------------------------------------------------------------------
-- 3) En çok tekrar kullanılan (fan-out) tablolar -- sistem büyüyünce
--    "kritik/çok bağımlı tablo" ve "muhtemelen redundant kullanım"
--    sinyali verir.
-- --------------------------------------------------------------------
SELECT t.tablo_adi, COUNT(DISTINCT sk.statement_id) AS kac_farkli_statement_te_kaynak
FROM stage.katalog_statement_kaynak sk
JOIN stage.katalog_tablo t ON t.table_id = sk.kaynak_table_id
GROUP BY t.tablo_adi
ORDER BY kac_farkli_statement_te_kaynak DESC, t.tablo_adi;


-- --------------------------------------------------------------------
-- 4) Bir kolon adı sistemde nerelerde geçiyor? (arama)
--    "Bu alan zaten var mı" sorusunun temel sorgusu.
-- --------------------------------------------------------------------
SELECT t.tablo_adi, k.kolon_adi
FROM stage.katalog_kolon k
JOIN stage.katalog_tablo t ON t.table_id = k.table_id
WHERE k.kolon_adi ILIKE '%customer_protocol_date%'  -- <-- aranan kolon adı
ORDER BY t.tablo_adi;


-- --------------------------------------------------------------------
-- 5) Bir kolonun tam kaynağı -- 10 adıma kadar geriye, recursive
--    (tablo + kolon adının İKİSİNİ birden verin: aynı kolon adı birden
--    fazla tabloda geçebilir, ikisi olmadan başlangıç belirsiz kalır)
-- --------------------------------------------------------------------
WITH RECURSIVE kolon_geri (seviye, hedef_cid, kaynak_cid, donusum_tipi, guven_seviyesi) AS (
    SELECT 1, l.hedef_column_id, l.kaynak_column_id, l.donusum_tipi, l.guven_seviyesi
    FROM stage.katalog_kolon_lineage l
    JOIN stage.katalog_kolon hk ON hk.column_id = l.hedef_column_id
    JOIN stage.katalog_tablo ht ON ht.table_id = hk.table_id
    WHERE ht.tablo_adi = 'ORDER_PAYMENTS'            -- <-- başlangıç tablosu
      AND hk.kolon_adi = 'payment_amount'            -- <-- başlangıç kolonu
    UNION ALL
    SELECT g.seviye + 1, l.hedef_column_id, l.kaynak_column_id, l.donusum_tipi, l.guven_seviyesi
    FROM stage.katalog_kolon_lineage l
    JOIN kolon_geri g ON l.hedef_column_id = g.kaynak_cid
    WHERE g.seviye < 10                              -- döngü/aşırı derinlik koruması
)
SELECT
    g.seviye,
    t.tablo_adi || '.' || k.kolon_adi AS kaynak_kolon,
    g.donusum_tipi,
    g.guven_seviyesi
FROM kolon_geri g
JOIN stage.katalog_kolon k ON k.column_id = g.kaynak_cid
JOIN stage.katalog_tablo t ON t.table_id = k.table_id
ORDER BY g.seviye;


-- ====================================================================
-- REHABİLİTASYON ANALİZLERİ
-- Mail'de sorulan "nerelerde tekrarlı iş yapmışız, bakım yükü yaratmışız,
-- merge/split imkanı var" sorularına doğrudan cevap veren sorgular.
-- ====================================================================

-- --------------------------------------------------------------------
-- 8) Tablo benzeşme oranı -- "bu raporun benzeştiği başka rapor var mı,
--    ne kadar örtüşüyor?" sorusunun tablo-seviyesi karşılığı.
--    Kolon adlarına bakarak Jaccard benzeşme yüzdesi hesaplar.
--    NOT: Bu SADECE literal isim eşleşmesine bakar -- IDV_FLAG ile
--    INDIVISUAL_FLAG gibi farklı isimli ama aynı anlama gelen kolonları
--    yakalamaz (bunun için iş sözlüğü/senonim katmanı gerekir).
-- --------------------------------------------------------------------
WITH kolon_kumeleri AS (
    SELECT table_id, array_agg(DISTINCT UPPER(kolon_adi)) AS kolonlar
    FROM stage.katalog_kolon GROUP BY table_id
),
karsilastirma AS (
    SELECT
        ta.tablo_adi AS tablo_a, tb.tablo_adi AS tablo_b,
        (SELECT COUNT(*) FROM (SELECT UNNEST(ka.kolonlar) INTERSECT SELECT UNNEST(kb.kolonlar)) x) AS ortak,
        (SELECT COUNT(*) FROM (SELECT UNNEST(ka.kolonlar) UNION SELECT UNNEST(kb.kolonlar)) y) AS birlesim
    FROM kolon_kumeleri ka
    JOIN kolon_kumeleri kb ON ka.table_id < kb.table_id
    JOIN stage.katalog_tablo ta ON ta.table_id = ka.table_id
    JOIN stage.katalog_tablo tb ON tb.table_id = kb.table_id
)
SELECT tablo_a, tablo_b, ortak AS ortak_kolon, birlesim AS toplam_farkli_kolon,
       ROUND(100.0 * ortak / NULLIF(birlesim, 0), 1) AS benzesme_yuzde
FROM karsilastirma
WHERE ortak > 0
ORDER BY benzesme_yuzde DESC
LIMIT 20;


-- --------------------------------------------------------------------
-- 9) Karmaşıklık / bakım riski -- en çok kaynak tabloya bağımlı
--    statement'lar. Çok kaynaklı bir statement, hem anlaması hem
--    değiştirmesi en riskli olandır -- "split" adayı.
-- --------------------------------------------------------------------
SELECT u.paket_adi, t.tablo_adi AS hedef, COUNT(sk.kaynak_table_id) AS kaynak_tablo_sayisi
FROM stage.katalog_unit_statement us
JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
JOIN stage.katalog_tablo t ON t.table_id = us.hedef_table_id
LEFT JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
GROUP BY u.paket_adi, t.tablo_adi
ORDER BY kaynak_tablo_sayisi DESC;


-- --------------------------------------------------------------------
-- 10) Dönüşüm yoğunluğu -- bir tabloya yazılan kolonların ne kadarı
--     düz kopya, ne kadarı hesaplama/iş mantığı içeriyor. Yüksek oran,
--     "bu tabloyu başka bir kaynağa yönlendirmek sandığımızdan zor
--     olabilir" sinyali -- rehabilitasyon planlarken risk göstergesi.
-- --------------------------------------------------------------------
SELECT t.tablo_adi,
       COUNT(*) FILTER (WHERE l.donusum_tipi = 'TURETILMIS') AS turetilmis,
       COUNT(*) AS toplam,
       ROUND(100.0 * COUNT(*) FILTER (WHERE l.donusum_tipi = 'TURETILMIS') / COUNT(*), 1) AS turetilmis_yuzde
FROM stage.katalog_kolon_lineage l
JOIN stage.katalog_kolon hk ON hk.column_id = l.hedef_column_id
JOIN stage.katalog_tablo t ON t.table_id = hk.table_id
GROUP BY t.tablo_adi
ORDER BY turetilmis_yuzde DESC;

-- --------------------------------------------------------------------
-- 6) Genel özet -- kaç tablo, kaç kolon, kaç lineage kaydı var
-- --------------------------------------------------------------------
SELECT 'katalog_tablo' AS tablo, COUNT(*) FROM stage.katalog_tablo
UNION ALL SELECT 'katalog_kolon', COUNT(*) FROM stage.katalog_kolon
UNION ALL SELECT 'katalog_unit', COUNT(*) FROM stage.katalog_unit
UNION ALL SELECT 'katalog_unit_statement', COUNT(*) FROM stage.katalog_unit_statement
UNION ALL SELECT 'katalog_statement_kaynak', COUNT(*) FROM stage.katalog_statement_kaynak
UNION ALL SELECT 'katalog_kolon_lineage', COUNT(*) FROM stage.katalog_kolon_lineage;


-- --------------------------------------------------------------------
-- 7) Tüm hedef/kaynak eşlemesi -- HER SATIRDA seviyesiyle birlikte.
--    Seviye 1 = zincirin son ucundaki tabloya (hiçbir yerde kaynak
--    olarak kullanılmayan tablo, örn. ORDER_PAYMENTS) yazan satırlar.
--    Seviye 2 = o satırların kaynağına yazan satırlar, vs.
--    Örnek: seviye 1 = ORDER_PAYMENTS <- T_ORDER_PAYMENTS_QA
--           seviye 2 = T_ORDER_PAYMENTS_QA <- E_ORDER_PAYMENTS
-- --------------------------------------------------------------------
WITH RECURSIVE seviyeli (seviye, lineage_id, hedef_cid, kaynak_cid) AS (
    -- kök: hedef kolonun tablosu hiçbir statement'ta kaynak olarak geçmiyor
    -- (yani zincirin en sonundaki, "yayınlanan" tablo)
    SELECT 1, l.lineage_id, l.hedef_column_id, l.kaynak_column_id
    FROM stage.katalog_kolon_lineage l
    JOIN stage.katalog_kolon hk ON hk.column_id = l.hedef_column_id
    WHERE hk.table_id NOT IN (
        SELECT kk.table_id FROM stage.katalog_kolon_lineage l2
        JOIN stage.katalog_kolon kk ON kk.column_id = l2.kaynak_column_id
    )
    UNION ALL
    SELECT s.seviye + 1, l.lineage_id, l.hedef_column_id, l.kaynak_column_id
    FROM stage.katalog_kolon_lineage l
    JOIN seviyeli s ON l.hedef_column_id = s.kaynak_cid
    WHERE s.seviye < 10                     -- döngü/aşırı derinlik koruması
)
SELECT
    s.seviye,
    ht.tablo_adi || '.' || hk.kolon_adi AS hedef,
    kt.tablo_adi || '.' || kk.kolon_adi AS kaynak,
    l.donusum_tipi,
    l.guven_seviyesi
FROM seviyeli s
JOIN stage.katalog_kolon_lineage l ON l.lineage_id = s.lineage_id
JOIN stage.katalog_kolon hk ON hk.column_id = s.hedef_cid
JOIN stage.katalog_tablo ht ON ht.table_id = hk.table_id
JOIN stage.katalog_kolon kk ON kk.column_id = s.kaynak_cid
JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
ORDER BY s.seviye, hedef;

-- Hangi tablolarda hâlâ TAHMIN edilmiş (teyit gereken) kolon var?
SELECT DISTINCT ht.tablo_adi
FROM stage.katalog_kolon_lineage l
JOIN stage.katalog_kolon hk ON hk.column_id = l.hedef_column_id
JOIN stage.katalog_tablo ht ON ht.table_id = hk.table_id
WHERE l.guven_seviyesi = 'TAHMIN'
ORDER BY ht.tablo_adi;

-------------------------------------------------------------------
--BU TABLONUN KAYNAKLARI NE DRILL DOWN
-------------------------------------------------------------------
WITH RECURSIVE geri AS
(
    -- ilk seviye
    SELECT
        1 AS seviye,
        us.hedef_table_id,
        sk.kaynak_table_id,
        us.hedef_table_id AS parent_table_id
    FROM stage.katalog_unit_statement us
    JOIN stage.katalog_statement_kaynak sk
      ON sk.statement_id = us.statement_id
    JOIN stage.katalog_tablo t
      ON t.table_id = us.hedef_table_id
    WHERE t.tablo_adi = 'ORDER_PAYMENTS'
    UNION ALL
    SELECT
        g.seviye + 1,
        us.hedef_table_id,
        sk.kaynak_table_id,
        g.kaynak_table_id
    FROM stage.katalog_unit_statement us
    JOIN stage.katalog_statement_kaynak sk
      ON sk.statement_id = us.statement_id
    JOIN geri g
      ON us.hedef_table_id = g.kaynak_table_id
    WHERE g.seviye < 20
)
SELECT DISTINCT
       g.seviye,
       pt.tablo_adi  AS bagli_oldugu_tablo,
       kt.tablo_adi  AS kaynak_tablo
FROM geri g
LEFT JOIN stage.katalog_tablo pt
       ON pt.table_id = g.parent_table_id
JOIN stage.katalog_tablo kt
       ON kt.table_id = g.kaynak_table_id
ORDER BY
       g.seviye,
       bagli_oldugu_tablo,
       kaynak_tablo;
-------------------------------------------------------------------	   
--TRUNCATE
-------------------------------------------------------------------
TRUNCATE stage.katalog_kolon_lineage, stage.katalog_statement_kaynak, 
stage.katalog_unit_statement, stage.katalog_kolon, stage.katalog_unit, stage.katalog_tablo RESTART IDENTITY CASCADE;
