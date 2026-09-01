-- ============================================================================
-- Katalog şemasındaki TÜM tabloları temizler (veriyi siler, tablo yapısına
-- dokunmaz). Tek TRUNCATE ifadesinde birlikte listelendikleri için, aradaki
-- yabancı anahtar (FK) ilişkilerine rağmen sıra sorunu yaşanmaz.
--
--   RESTART IDENTITY : otomatik artan ID'leri (table_id, column_id, rapor_id
--                       vb.) sıfırdan başlatır -- temiz bir yeniden test için.
--   CASCADE           : bu tablolara bağımlı BAŞKA bir tablo olsaydı (şu an
--                       yok) onu da otomatik temizlerdi -- güvenlik amaçlı.
-- ============================================================================

TRUNCATE TABLE
    stage.katalog_unit,
    stage.katalog_unit_statement,
    stage.katalog_statement_kaynak,
    stage.katalog_tablo,
    stage.katalog_kolon_lineage,
    stage.katalog_kolon,
    stage.katalog_statement_alt_sorgu,
    stage.katalog_rapor,
    stage.katalog_rapor_kaynak,
    stage.katalog_rapor_kolon_lineage,
    stage.katalog_kolon_kullanim
RESTART IDENTITY CASCADE;
