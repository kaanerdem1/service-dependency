-- Süreç tablosu — PAR akışı (elle uygulanan sıra ile uyumlu).
-- Kolon anlamları: no = süreç no, name = .par dosya adı, description_tr = XML label, process_definition = XML.
--
-- UYARI: RENAME / yeni katalog import sonrası description_tr ve process_definition BOŞ kalır.
--         Türkçe isim + akış için her zaman ardından: npm run ingest:process-par
--
-- Ham katalog → PAR şeması (bir kez, dikkatli):
--   ALTER TABLE env.process RENAME COLUMN name TO no;
--   ALTER TABLE env.process RENAME COLUMN description_tr TO name;
--   (aşağıdaki ADD COLUMN satırları)

SET search_path TO env;

ALTER TABLE process ADD COLUMN IF NOT EXISTS description_tr character varying(800);
ALTER TABLE process ADD COLUMN IF NOT EXISTS process_definition text;
ALTER TABLE process ADD COLUMN IF NOT EXISTS process_type character varying(10);

UPDATE process SET process_type = 'BPM' WHERE process_type IS NULL;

-- XML + Türkçe label: server/scripts/ingest-process-par.mjs (PROCESS_PAR_ROOT=.../par)
