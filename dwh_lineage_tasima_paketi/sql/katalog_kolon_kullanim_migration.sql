-- Mevcut katalog veritabanını silmeden kolon koşul/join/filter kullanım
-- kayıtları için gereken tabloyu ekler.

CREATE TABLE IF NOT EXISTS stage.katalog_kolon_kullanim (
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

CREATE INDEX IF NOT EXISTS ix_katalog_kolon_kullanim_statement ON stage.katalog_kolon_kullanim (statement_id);
CREATE INDEX IF NOT EXISTS ix_katalog_kolon_kullanim_rapor ON stage.katalog_kolon_kullanim (rapor_id);
CREATE INDEX IF NOT EXISTS ix_katalog_kolon_kullanim_kaynak ON stage.katalog_kolon_kullanim (kaynak_column_id);
CREATE INDEX IF NOT EXISTS ix_katalog_kolon_kullanim_hedef ON stage.katalog_kolon_kullanim (hedef_table_id);
