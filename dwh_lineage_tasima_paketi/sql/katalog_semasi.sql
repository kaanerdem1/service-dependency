-- ====================================================================
-- katalog_semasi.sql
-- STAGE şeması altında KATALOG_* tablolarını oluşturur (PostgreSQL)
-- Görseldeki "Katalog tabloları ve ilişkileri (1/2)" şemasının birebir
-- karşılığıdır.
--
-- Çalıştırma sırası önemli: KATALOG_TABLO ve KATALOG_UNIT önce gelir
-- (başka hiçbir tabloya bağımlı değiller), sonra onlara FK veren
-- tablolar sırayla oluşturulur.
-- ====================================================================

CREATE SCHEMA IF NOT EXISTS stage;

-- --------------------------------------------------------------------
-- 1) KATALOG_TABLO -- her fiziksel tablo/datamart bir satır
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_tablo (
    table_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_adi  VARCHAR(128),
    tablo_adi   VARCHAR(128) NOT NULL,
    katman      VARCHAR(32),   -- ör: KAYNAK / EX / TR / AMBAR
    CONSTRAINT uq_katalog_tablo UNIQUE (schema_adi, tablo_adi)
);

-- --------------------------------------------------------------------
-- 2) KATALOG_KOLON -- her kolon bir satır, tablosuna bağlı
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_kolon (
    column_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_id    INTEGER NOT NULL REFERENCES stage.katalog_tablo (table_id),
    kolon_adi   VARCHAR(128) NOT NULL,
    kolon_sira  INTEGER,
    veri_tipi   VARCHAR(64),   -- ör. VARCHAR2(30), NUMBER, DATE -- statik ayrıştırmadan
                               -- ÇIKARILAMAZ, gerçek Oracle'dan (ALL_TAB_COLUMNS) ya da
                               -- elle doldurulmadıysa NULL kalır
    CONSTRAINT uq_katalog_kolon UNIQUE (table_id, kolon_adi)
);
CREATE INDEX ix_katalog_kolon_table_id ON stage.katalog_kolon (table_id);

-- --------------------------------------------------------------------
-- 3) KATALOG_UNIT -- her paket/prosedür bir satır
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_unit (
    unit_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner          VARCHAR(128),
    paket_adi      VARCHAR(128),
    procedure_adi  VARCHAR(128)
);

-- --------------------------------------------------------------------
-- 4) KATALOG_UNIT_STATEMENT -- her yazma cümlesi (INSERT/UPDATE/...) bir satır
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_unit_statement (
    statement_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id         INTEGER NOT NULL REFERENCES stage.katalog_unit (unit_id),
    hedef_table_id  INTEGER REFERENCES stage.katalog_tablo (table_id),
    dml_tipi        VARCHAR(16) NOT NULL
                    CHECK (dml_tipi IN ('INSERT', 'UPDATE', 'MERGE', 'DELETE', 'TRUNCATE')),
    satir_no        INTEGER,
    sql_metni       TEXT   -- ağaçta bir tabloya gelindiğinde ilgili SQL'i göstermek için
);
CREATE INDEX ix_katalog_unit_statement_unit_id ON stage.katalog_unit_statement (unit_id);
CREATE INDEX ix_katalog_unit_statement_hedef ON stage.katalog_unit_statement (hedef_table_id);

-- --------------------------------------------------------------------
-- 5) KATALOG_STATEMENT_KAYNAK -- bir cümlenin okuduğu tablolar (1-N).
--     PRIMARY KEY YOK (bilerek) -- alt_sorgu_id nullable olabildiği ve
--     aynı fiziksel tablo aynı statement içinde birden fazla alias'la /
--     birden fazla subquery seviyesinde ayrı ayrı geçebildiği için katı
--     bir tekillik varsayımı artık doğru değil.
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_statement_kaynak (
    statement_id     INTEGER NOT NULL REFERENCES stage.katalog_unit_statement (statement_id),
    kaynak_table_id  INTEGER NOT NULL REFERENCES stage.katalog_tablo (table_id),
    alt_sorgu_id     INTEGER   -- NULL = alt sorgu bilgisi olmayan eski bir yazımdan geldi
);
CREATE INDEX ix_katalog_statement_kaynak_stmt ON stage.katalog_statement_kaynak (statement_id);
CREATE INDEX ix_katalog_statement_kaynak_tablo ON stage.katalog_statement_kaynak (kaynak_table_id);

-- --------------------------------------------------------------------
-- 5b) KATALOG_STATEMENT_ALT_SORGU -- bir cümlenin subquery ağacı.
--     Her satır, o statement içindeki BİR subquery seviyesini temsil
--     eder (ana sorgu dahil, seviye=0). ust_alt_sorgu_id kendine referans
--     verir -- bu sayede iç içe subquery'ler gerçek bir ağaç olarak
--     saklanır, tek bir düz "seviye" sayısına indirgenmez.
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_statement_alt_sorgu (
    alt_sorgu_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    statement_id      INTEGER NOT NULL REFERENCES stage.katalog_unit_statement (statement_id),
    ust_alt_sorgu_id  INTEGER REFERENCES stage.katalog_statement_alt_sorgu (alt_sorgu_id),
    seviye            INTEGER NOT NULL,
    alias             VARCHAR(128),
    tip               VARCHAR(32) NOT NULL
                      CHECK (tip IN ('ANA_SORGU', 'FROM_ALT_SORGU', 'WHERE_ALT_SORGU', 'CTE', 'UNION_DALI', 'TABLO_FONKSIYONU'))
);
CREATE INDEX ix_katalog_statement_alt_sorgu_stmt ON stage.katalog_statement_alt_sorgu (statement_id);
CREATE INDEX ix_katalog_statement_alt_sorgu_ust ON stage.katalog_statement_alt_sorgu (ust_alt_sorgu_id);

ALTER TABLE stage.katalog_statement_kaynak
    ADD CONSTRAINT fk_katalog_statement_kaynak_alt_sorgu
    FOREIGN KEY (alt_sorgu_id) REFERENCES stage.katalog_statement_alt_sorgu (alt_sorgu_id);

-- --------------------------------------------------------------------
-- 6) KATALOG_KOLON_LINEAGE -- kolon-seviyesi eşleşme
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_kolon_lineage (
    lineage_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    statement_id      INTEGER NOT NULL REFERENCES stage.katalog_unit_statement (statement_id),
    kaynak_column_id  INTEGER NOT NULL REFERENCES stage.katalog_kolon (column_id),
    hedef_column_id   INTEGER NOT NULL REFERENCES stage.katalog_kolon (column_id),
    donusum_tipi      VARCHAR(16) CHECK (donusum_tipi IN ('DIREKT_KOPYA', 'TURETILMIS')),
    guven_seviyesi    VARCHAR(16) NOT NULL DEFAULT 'KESIN'
                      CHECK (guven_seviyesi IN ('KESIN', 'TAHMIN'))
    -- KESIN  = hedef kolon adı SQL'de açık yazılıydı ya da known_table_columns'tan geldi
    -- TAHMIN = hedef kolon adı, kolon listesi olmayan bir INSERT'te SELECT
    --          alias'larından tahmin edildi (infer_column_alias) -- Oracle
    --          pozisyona göre eşleşir, bu yüzden bu KESIN değildir
);
CREATE INDEX ix_katalog_kolon_lineage_statement ON stage.katalog_kolon_lineage (statement_id);
CREATE INDEX ix_katalog_kolon_lineage_kaynak ON stage.katalog_kolon_lineage (kaynak_column_id);
CREATE INDEX ix_katalog_kolon_lineage_hedef ON stage.katalog_kolon_lineage (hedef_column_id);

-- ====================================================================
-- Doğrulama: 6 tablonun da oluştuğunu göster
-- --------------------------------------------------------------------
-- RAPOR KATALOĞU -- ETL tarafının (yukarıdaki tablolar) "aynası", ama
-- hedefi bir tablo değil, bir raporun kendi çıktı kolonları. Bir raporun
-- SQL'i (genelde düz SELECT) ayrıştırılıp hangi DWH tablolarını/
-- kolonlarını kullandığı buraya yazılır -- "bu tabloyu değiştirirsem
-- hangi raporlar etkilenir" ve "bu alan zaten bir raporda var mı"
-- sorularına cevap vermek için.
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_rapor (
    rapor_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rapor_adi       VARCHAR(255) NOT NULL,
    dosya_adi       VARCHAR(255),
    sql_metni       TEXT,
    eklenme_tarihi  TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_katalog_rapor_adi UNIQUE (rapor_adi)
);

CREATE TABLE stage.katalog_rapor_kaynak (
    rapor_id        INTEGER NOT NULL REFERENCES stage.katalog_rapor (rapor_id),
    kaynak_table_id INTEGER NOT NULL REFERENCES stage.katalog_tablo (table_id)
);
CREATE INDEX ix_katalog_rapor_kaynak_rapor ON stage.katalog_rapor_kaynak (rapor_id);
CREATE INDEX ix_katalog_rapor_kaynak_tablo ON stage.katalog_rapor_kaynak (kaynak_table_id);

CREATE TABLE stage.katalog_rapor_kolon_lineage (
    lineage_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rapor_id         INTEGER NOT NULL REFERENCES stage.katalog_rapor (rapor_id),
    rapor_kolon_adi  VARCHAR(128) NOT NULL,
    kaynak_column_id INTEGER REFERENCES stage.katalog_kolon (column_id),
    donusum_tipi     VARCHAR(16) CHECK (donusum_tipi IN ('DIREKT_KOPYA', 'TURETILMIS')),
    guven_seviyesi   VARCHAR(16) CHECK (guven_seviyesi IN ('KESIN', 'TAHMIN')) DEFAULT 'TAHMIN'
    -- raporlarda guven_seviyesi hemen hemen HER ZAMAN 'TAHMIN' olacak --
    -- rapor SQL'inde "INSERT INTO x (kolon_listesi)" gibi acik bir hedef
    -- kolon listesi olmadigi icin, kolon adlari hep SELECT alias'larindan
    -- cikariliyor (ETL'deki "SON CARE" yolu, raporlarda ANA yol)
);
CREATE INDEX ix_katalog_rapor_kolon_lineage_rapor ON stage.katalog_rapor_kolon_lineage (rapor_id);

-- --------------------------------------------------------------------
-- 9) KATALOG_KOLON_KULLANIM -- değer akışı olmayan kolon kullanımları
-- --------------------------------------------------------------------
CREATE TABLE stage.katalog_kolon_kullanim (
    kullanim_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    statement_id     INTEGER REFERENCES stage.katalog_unit_statement (statement_id),
    rapor_id         INTEGER REFERENCES stage.katalog_rapor (rapor_id),
    kaynak_column_id INTEGER NOT NULL REFERENCES stage.katalog_kolon (column_id),
    hedef_table_id   INTEGER REFERENCES stage.katalog_tablo (table_id),
    kullanim_tipi    VARCHAR(24) NOT NULL
                     CHECK (kullanim_tipi IN ('JOIN_ON', 'WHERE', 'CASE_WHEN', 'MERGE_ON', 'GROUP_BY', 'HAVING', 'ORDER_BY')),
    ifade_metni      TEXT,
    guven_seviyesi   VARCHAR(16) NOT NULL DEFAULT 'KESIN'
                     CHECK (guven_seviyesi IN ('KESIN', 'TAHMIN')),
    CONSTRAINT ck_katalog_kolon_kullanim_sahip
        CHECK (
            (statement_id IS NOT NULL AND rapor_id IS NULL) OR
            (statement_id IS NULL AND rapor_id IS NOT NULL)
        )
);
CREATE INDEX ix_katalog_kolon_kullanim_statement ON stage.katalog_kolon_kullanim (statement_id);
CREATE INDEX ix_katalog_kolon_kullanim_rapor ON stage.katalog_kolon_kullanim (rapor_id);
CREATE INDEX ix_katalog_kolon_kullanim_kaynak ON stage.katalog_kolon_kullanim (kaynak_column_id);
CREATE INDEX ix_katalog_kolon_kullanim_hedef ON stage.katalog_kolon_kullanim (hedef_table_id);

-- ====================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'stage'
ORDER BY table_name;
