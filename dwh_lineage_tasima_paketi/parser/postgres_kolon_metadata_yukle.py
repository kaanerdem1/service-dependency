"""
postgres_kolon_metadata_yukle.py
-------------------------------
Gerçek tablo/kolon yapısı PostgreSQL'e aktarılmışsa, PostgreSQL'in kendi
information_schema.columns bilgisinden okuyup stage.katalog_kolon tablosunu
doldurur.

Neden gerekli?
  SQL'de kolon alias'sız yazıldıysa ve SELECT'te birden fazla tablo varsa,
  parser kolonun hangi tabloya ait olduğunu ancak gerçek tablo kolon listesini
  biliyorsa güvenle çözebilir.

Tipik akış:
  1) python katalog_parser.py               # stage.katalog_tablo oluşsun
  2) python postgres_kolon_metadata_yukle.py # gerçek PG tablolarından kolonlar gelsin
  3) python katalog_parser.py               # alias'sız kolonlar daha iyi çözülsün
  4) python rapor_parser.py

İsteğe bağlı ortam değişkenleri:
  PG_SOURCE_SCHEMAS=ofsa_sb,olap,summary_prod
  PG_HOST, PG_PORT, PG_DBNAME, PG_USER, PG_PASSWORD
"""

import os

import psycopg2

from katalog_parser import get_or_create_table


PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_DBNAME = os.getenv("PG_DBNAME", "postgres")
PG_USER = os.getenv("PG_USER", "postgres")
PG_PASSWORD = os.getenv("PG_PASSWORD", "2003kaan2003")
PG_SOURCE_SCHEMAS = [s.strip() for s in os.getenv("PG_SOURCE_SCHEMAS", "").split(",") if s.strip()]
PG_SOURCE_SCHEMAS_UPPER = [s.upper() for s in PG_SOURCE_SCHEMAS]

HARIC_SEMALAR = {"stage", "pg_catalog", "information_schema"}
HARIC_SEMALAR_UPPER = {s.upper() for s in HARIC_SEMALAR}


def veri_tipi_formatla(row: dict) -> str:
    data_type = row["data_type"]
    char_len = row["character_maximum_length"]
    precision = row["numeric_precision"]
    scale = row["numeric_scale"]

    if data_type in {"character varying", "character", "varchar", "char"} and char_len:
        return f"{data_type.upper()}({char_len})"
    if data_type == "numeric":
        if precision is not None and scale is not None:
            return f"NUMERIC({precision},{scale})"
        if precision is not None:
            return f"NUMERIC({precision})"
    return data_type.upper()


def katalog_tablolari_getir(cur) -> list[tuple[int, str | None, str]]:
    cur.execute(
        """
        SELECT table_id, schema_adi, tablo_adi
        FROM stage.katalog_tablo
        ORDER BY tablo_adi, schema_adi NULLS LAST
        """
    )
    return [(r[0], r[1], r[2]) for r in cur.fetchall()]


def kaynak_kolonlari_getir(cur, tablo_adlari: list[str]) -> list[dict]:
    if not tablo_adlari:
        return []

    rows = []
    parca_boyutu = 900
    for i in range(0, len(tablo_adlari), parca_boyutu):
        parca = tablo_adlari[i:i + parca_boyutu]
        cur.execute(
            """
            SELECT table_schema, table_name, column_name, ordinal_position,
                   data_type, character_maximum_length, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE UPPER(table_name) = ANY(%s)
              AND UPPER(table_schema) <> ALL(%s)
              AND (%s::text[] = '{}'::text[] OR UPPER(table_schema) = ANY(%s))
            ORDER BY table_schema, table_name, ordinal_position
            """,
            ([t.upper() for t in parca], list(HARIC_SEMALAR_UPPER), PG_SOURCE_SCHEMAS_UPPER, PG_SOURCE_SCHEMAS_UPPER),
        )
        kolon_adlari = [d[0] for d in cur.description]
        for r in cur.fetchall():
            rows.append(dict(zip(kolon_adlari, r)))
    return rows


def metadata_teshis_yaz(cur, tablo_adlari: list[str]) -> None:
    cur.execute(
        """
        SELECT table_schema, COUNT(DISTINCT table_name) AS tablo_sayisi, COUNT(*) AS kolon_sayisi
        FROM information_schema.columns
        WHERE UPPER(table_schema) <> ALL(%s)
        GROUP BY table_schema
        ORDER BY table_schema
        """,
        (list(HARIC_SEMALAR_UPPER),),
    )
    semalar = cur.fetchall()
    if not semalar:
        print("  Teşhis: Bu PostgreSQL veritabanında stage dışı fiziksel tablo kolonu görünmüyor.")
        return

    print("  Teşhis: Bu DB'de görünen kaynak şemalar:")
    for schema, tablo_sayisi, kolon_sayisi in semalar[:12]:
        print(f"    - {schema}: {tablo_sayisi} tablo, {kolon_sayisi} kolon")

    cur.execute(
        """
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE UPPER(table_schema) <> ALL(%s)
          AND UPPER(table_name) = ANY(%s)
        GROUP BY table_schema, table_name
        ORDER BY table_schema, table_name
        LIMIT 10
        """,
        (list(HARIC_SEMALAR_UPPER), tablo_adlari),
    )
    eslesenler = cur.fetchall()
    if eslesenler:
        print("  Teşhis: Şema filtresi olmadan eşleşen örnek tablolar:")
        for schema, table in eslesenler:
            print(f"    - {schema}.{table}")
    else:
        print("  Teşhis: Katalog tablo adları ile information_schema.table_name arasında eşleşme yok.")
        cur.execute(
            """
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE UPPER(table_schema) <> ALL(%s)
              AND table_type = 'BASE TABLE'
            ORDER BY table_schema, table_name
            LIMIT 12
            """,
            (list(HARIC_SEMALAR_UPPER),),
        )
        kaynak_ornekleri = cur.fetchall()
        if kaynak_ornekleri:
            print("  Teşhis: PostgreSQL'de görünen örnek fiziksel tablolar:")
            for schema, table in kaynak_ornekleri:
                print(f"    - {schema}.{table}")
        print("  Teşhis: Katalogdaki örnek tablo adları:")
        for tablo in tablo_adlari[:12]:
            print(f"    - {tablo}")


def katalog_table_id_coz(cur, mevcut_harita, kaynak_schema: str, kaynak_tablo: str) -> int:
    schema_upper = kaynak_schema.upper()
    tablo_upper = kaynak_tablo.upper()

    exact = mevcut_harita.get((schema_upper, tablo_upper))
    if exact:
        return exact

    semasiz = mevcut_harita.get((None, tablo_upper))
    if semasiz:
        cur.execute(
            """
            UPDATE stage.katalog_tablo
            SET schema_adi = %s
            WHERE table_id = %s
              AND schema_adi IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM stage.katalog_tablo
                  WHERE UPPER(schema_adi) = UPPER(%s) AND UPPER(tablo_adi) = UPPER(%s)
              )
            """,
            (schema_upper, semasiz, schema_upper, tablo_upper),
        )
        mevcut_harita[(schema_upper, tablo_upper)] = semasiz
        return semasiz

    table_id = get_or_create_table(cur, schema_upper, tablo_upper)
    mevcut_harita[(schema_upper, tablo_upper)] = table_id
    return table_id


def kolon_upsert(cur, table_id: int, kolon_adi: str, kolon_sira: int, veri_tipi: str) -> None:
    kolon_upper = kolon_adi.upper()
    cur.execute(
        """
        INSERT INTO stage.katalog_kolon (table_id, kolon_adi, kolon_sira, veri_tipi)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (table_id, kolon_adi)
        DO UPDATE SET
            kolon_sira = EXCLUDED.kolon_sira,
            veri_tipi = EXCLUDED.veri_tipi
        """,
        (table_id, kolon_upper, kolon_sira, veri_tipi),
    )


def main() -> None:
    conn = psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_DBNAME,
        user=PG_USER, password=PG_PASSWORD, client_encoding="UTF8",
    )
    cur = conn.cursor()

    katalog_tablolari = katalog_tablolari_getir(cur)
    if not katalog_tablolari:
        cur.close()
        conn.close()
        raise SystemExit("stage.katalog_tablo boş. Önce python katalog_parser.py çalıştırın.")

    mevcut_harita = {
        ((schema.upper() if schema else None), tablo.upper()): table_id
        for table_id, schema, tablo in katalog_tablolari
    }
    tablo_adlari = sorted({tablo.upper() for _, _, tablo in katalog_tablolari})

    print(f"{len(tablo_adlari)} farklı katalog tablosu için PostgreSQL metadata aranacak.")
    if PG_SOURCE_SCHEMAS:
        print("Kaynak şema filtresi:", ", ".join(PG_SOURCE_SCHEMAS))

    kolon_rows = kaynak_kolonlari_getir(cur, tablo_adlari)
    print(f"PostgreSQL information_schema'dan {len(kolon_rows)} kolon satırı bulundu.")
    if not kolon_rows:
        metadata_teshis_yaz(cur, tablo_adlari)

    sayac = 0
    for r in kolon_rows:
        table_id = katalog_table_id_coz(cur, mevcut_harita, r["table_schema"], r["table_name"])
        kolon_upsert(cur, table_id, r["column_name"], r["ordinal_position"], veri_tipi_formatla(r))
        sayac += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"Bitti. {sayac} kolon stage.katalog_kolon içine yazıldı/güncellendi.")


if __name__ == "__main__":
    main()
