-- ============================================================================
-- Oracle CONNECT BY sorgunuzun PostgreSQL (WITH RECURSIVE) karşılığı.
-- Bizim şemamıza göre iki fark var, aşağıda işaretlendi:
--
--   1) Tablo/kolon adları: bizde "stage.katalog_tablo" / "stage.katalog_kolon" /
--      "stage.katalog_kolon_lineage" (RAS_KATALOG_* değil).
--   2) DONUSUM_IFADESI (dönüşüm ifadesinin kendisi) bizim
--      katalog_kolon_lineage'de YOK -- sadece DONUSUM_TIPI (DIREKT_KOPYA/
--      TURETILMIS) tutuluyor, gerçek SQL ifadesini saklamıyoruz. Bu yüzden
--      "conv_statement" satırı bu sorguda YOK. İsterseniz kaynak statement'ın
--      TAM SQL'ini (guven_seviyesi ile) eklemek için en alttaki NOT'a bakın.
--
-- Mantık birebir aynı: START WITH/CONNECT BY yerine WITH RECURSIVE, PRIOR
-- yerine bir önceki satırın kaynak_column_id'sini bir sonraki adımın
-- hedef_column_id'siyle eşleştiren JOIN, CONNECT_BY_ISLEAF yerine "bu
-- kaynak_column_id başka hiçbir yerde hedef_column_id olarak geçmiyor mu"
-- (yani daha derine inilemiyor mu) kontrolü, NOCYCLE yerine path_ids
-- dizisiyle döngü koruması.
-- ============================================================================

WITH RECURSIVE lineage_tree AS (
    -- seviye 1: START WITH karşılığı -- aranan hedef tablo/kolon için
    -- doğrudan (bir adım geriye) kaynaklar
    SELECT
        tt.schema_adi AS datamart_schema,
        tt.tablo_adi  AS datamart_table,
        tc.kolon_adi  AS datamart_column,
        st.schema_adi AS source_schema,
        st.tablo_adi  AS source_table,
        sc.kolon_adi  AS source_column,
        cl.kaynak_column_id,
        cl.donusum_tipi AS conv_type,
        1 AS lineage_level,
        ARRAY[cl.hedef_column_id, cl.kaynak_column_id] AS path_ids,   -- döngü koruması (NOCYCLE karşılığı)
        (COALESCE(st.schema_adi || '.', '') || st.tablo_adi || '.' || sc.kolon_adi)::text AS lineage_path
    FROM stage.katalog_kolon_lineage cl
    JOIN stage.katalog_kolon sc ON sc.column_id = cl.kaynak_column_id
    JOIN stage.katalog_tablo st ON st.table_id = sc.table_id
    JOIN stage.katalog_kolon tc ON tc.column_id = cl.hedef_column_id
    JOIN stage.katalog_tablo tt ON tt.table_id = tc.table_id
    WHERE tt.schema_adi = 'SUMMARY_PROD'      -- << START WITH target_schema = ...
      AND tt.tablo_adi  = 'RSK_RISK'          -- << START WITH target_table  = ...

    UNION ALL

    -- sonraki seviyeler: bir önceki adımın KAYNAK kolonu, şimdi HEDEF olarak
    -- aranıyor (PRIOR kaynak_column_id = hedef_column_id karşılığı)
    SELECT
        lt.datamart_schema,
        lt.datamart_table,
        lt.datamart_column,
        st2.schema_adi,
        st2.tablo_adi,
        sc2.kolon_adi,
        cl2.kaynak_column_id,
        cl2.donusum_tipi,
        lt.lineage_level + 1,
        lt.path_ids || cl2.kaynak_column_id,
        lt.lineage_path || ' <-- ' || COALESCE(st2.schema_adi || '.', '') || st2.tablo_adi || '.' || sc2.kolon_adi
    FROM lineage_tree lt
    JOIN stage.katalog_kolon_lineage cl2 ON cl2.hedef_column_id = lt.kaynak_column_id
    JOIN stage.katalog_kolon sc2 ON sc2.column_id = cl2.kaynak_column_id
    JOIN stage.katalog_tablo st2 ON st2.table_id = sc2.table_id
    WHERE lt.lineage_level < 20                              -- güvenlik sınırı (sonsuz derinliğe karşı)
      AND NOT (cl2.kaynak_column_id = ANY(lt.path_ids))       -- NOCYCLE: aynı kolona geri dönmüşse dur
)
SELECT
    datamart_schema,
    datamart_table,
    datamart_column,
    source_schema AS original_source_schema,
    source_table  AS original_source_table,
    source_column AS original_source_column,
    lineage_level,
    lineage_path
FROM (
    SELECT DISTINCT
        datamart_schema, datamart_table, datamart_column,
        source_schema, source_table, source_column,
        kaynak_column_id, lineage_level, lineage_path
    FROM lineage_tree lt
    WHERE NOT EXISTS (   -- CONNECT_BY_ISLEAF = 1 karşılığı: bu kaynak, başka hiçbir
                          -- kayıtta hedef olarak geçmiyor -- yani gerçek orijinal kaynak
        SELECT 1 FROM stage.katalog_kolon_lineage cl3
        WHERE cl3.hedef_column_id = lt.kaynak_column_id
    )
) sonuc
WHERE datamart_column = 'RISK_WEIGHT'          -- << en dıştaki WHERE datamart_column = ...
ORDER BY
    datamart_column,
    original_source_schema,
    original_source_table,
    original_source_column;

-- ============================================================================
-- NOT: kaynak statement'ın TAM SQL'ini de görmek isterseniz (DONUSUM_IFADESI'nin
-- kısmi bir karşılığı), lineage_tree'nin seviye-1 adımına şunu eklemeniz
-- yeterli -- statement_id üzerinden katalog_unit_statement.sql_metni'ne
-- JOIN olur (bu, o SATIR'ın kaynaklandığı statement'ın TAMAMIdır, o tek
-- kolonun izole ifadesi değildir -- Oracle'daki DONUSUM_IFADESI'nin tam
-- karşılığı bizde tutulmuyor):
--
--   , us.sql_metni AS kaynak_statement_sql
--   ...
--   JOIN stage.katalog_unit_statement us ON us.statement_id = cl.statement_id
-- ============================================================================
