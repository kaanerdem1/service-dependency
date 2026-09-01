"""
rapor_parser.py
----------------
Bir klasördeki rapor SQL dosyalarını (genelde düz SELECT -- METİS, PowerBI
gibi bir rapor aracının ürettiği sorgu) okuyup RAPOR KATALOĞU'na yazar:
hangi DWH tablolarını kaynak olarak kullanıyor, her çıktı kolonu hangi
kaynak tablo.kolon'dan geliyor (düz kopya mı türetilmiş mi).

Mevcut katalog_parser.py'nin kolon-lineage motorunu (analyze_statement)
SIFIRDAN YAZMADAN, aynen kullanır -- rapor SQL'ini "INSERT INTO
__RAPOR_HEDEF__ <rapor_sql>" şeklinde sentetik bir hedefle sarmalayıp
aynı, zaten sertleştirilmiş fonksiyona verir. Bu sayede:
  - subquery/UNION/alias çözümleme,
  - DIREKT_KOPYA vs TURETILMIS ayrımı,
  - kaynak tablo çıkarımı,
ETL tarafındaki ile TAMAMEN AYNI, test edilmiş mantıkla çalışır.

Çalıştırma:  python rapor_parser.py
Beklenti: bu script ile aynı klasörün altındaki "raporlar/" alt klasöründe
bir veya daha fazla .sql dosyası -- her dosya BİR rapor, rapor adı dosya
adından (uzantısız) alınır. Bu ayrı klasör, ETL dosyalarıyla (.txt) ve
katalog_semasi.sql gibi yardımcı dosyalarla karışmasın diye bilinçli bir
tercih -- klasör yoksa script ilk çalıştırmada kendisi oluşturur.
"""

import glob
import os
import re
import sys

import psycopg2
from sqlglot import exp

# katalog_parser.py'deki (zaten test edilmiş) fonksiyonları aynen kullan
from katalog_parser import (
    analyze_statement,
    get_or_create_table,
    get_or_create_column,
)

# ------------------------------------------------------------------
# BURAYI DOLDURUN (aynı katalog_parser.py'deki gibi)
# ------------------------------------------------------------------
PG_HOST = "localhost"
PG_PORT = 5432
PG_DBNAME = "postgres"
PG_USER = "postgres"
PG_PASSWORD = "12345Cs*"
# ------------------------------------------------------------------

RAPOR_HEDEF_PLACEHOLDER = "__RAPOR_HEDEF__"


def rapor_sqlini_oku(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        metin = f.read()
    # sondaki ';' veya '/' (Oracle script sonlandiricilari) varsa temizle --
    # INSERT sarmalamasi icin duz bir SELECT govdesi gerekiyor
    metin = metin.strip()
    if metin.endswith("/"):
        metin = metin[:-1].strip()
    if metin.endswith(";"):
        metin = metin[:-1].strip()

    # METİS RAPOR ARACINA ÖZGÜ: "[?<hash>?]" veya "[?<hash>[?" şeklinde bir
    # PROMPT (çalışma zamanında kullanıcının seçtiği bir değerle -- tarih,
    # kod vb. -- değiştirilen) yer tutucusu kullanıyor; kapanışı iki farklı
    # şekilde görülebiliyor (gerçek örneklerde ikisi de çıktı). Bazen
    # hemen ardından "=> Metis tarih promptu" gibi, '--' OLMADAN yazılmış
    # bir açıklama da geliyor -- o da geçerli SQL değil, aynı adımda
    # temizleniyor. Amacımız lineage (hangi tablo/kolon kullanılıyor)
    # çıkarmak; gerçek çalışma zamanı değeri önemli değil, sadece SQL'in
    # ayrıştırılabilir olması yeterli.
    #
    # GÜVENLİ: '=>' kısmı YALNIZCA hemen bir METİS prompt imzasından
    # ([?<en az 16 hex karakter>) sonra geliyorsa temizlenir -- ETL
    # SQL'lerinde sık görülen "FONKSIYON(parametre => deger)" gibi normal
    # isimli-parametre kullanımlarına DOKUNMAZ (test edildi).
    metin = re.sub(r"\[\?[A-Fa-f0-9]{16,}[\]\?\[]*(?:\s*=>[^\n]*)?", ":METIS_PROMPT", metin)

    return metin


def rapor_analiz_et(rapor_sql: str) -> dict:
    """Rapor SQL'ini, mevcut analyze_statement motorunu kullanarak analiz
    eder. Sentetik INSERT sarmalamasi sayesinde kolon-lineage cikarimi
    (ETL'deki 'SELECT alias'larindan tahmin' yolu) otomatik devreye girer.
    CTE (WITH) adlarini gercek tablo sanma hatasini burada FİLTRELER --
    ana motoru (katalog_parser.py) hic degistirmeden."""
    sarmalanmis = f"INSERT INTO {RAPOR_HEDEF_PLACEHOLDER}\n{rapor_sql}"
    stmt = {"dml_tipi": "INSERT", "sql_metni": sarmalanmis, "satir_no": 1}
    sonuc = analyze_statement(stmt)

    if sonuc.get("parse_hatasi"):
        return {"hata": sonuc["parse_hatasi"], "kaynak_tablolar": [], "kolon_lineage": []}

    # CTE (WITH ... AS (...)) adlarini gercek tablo listesinden cikar --
    # bunlar fiziksel tablo degil, sorgu icinde tanimlanmis gecici isimler
    try:
        import sqlglot
        parsed = sqlglot.parse_one(sarmalanmis, dialect="oracle")
        cte_adlari = {c.alias.upper() for c in parsed.find_all(exp.CTE) if c.alias}
    except Exception:
        cte_adlari = set()

    kaynak_tablolar = [k for k in sonuc.get("kaynak_tablolar", []) if k["tablo"] not in cte_adlari]
    kolon_lineage = []
    for kl in sonuc.get("kolon_lineage", []):
        kaynak_kolonlar = [k for k in kl["kaynak_kolonlar"] if k["tablo"] not in cte_adlari]
        if not kaynak_kolonlar:
            continue  # kaynagi sadece bir CTE'ydi, gercek tabloya inemedik -- atla
        kolon_lineage.append({**kl, "kaynak_kolonlar": kaynak_kolonlar})

    return {"hata": None, "kaynak_tablolar": kaynak_tablolar, "kolon_lineage": kolon_lineage}


def delete_existing_rapor(cursor, rapor_adi: str) -> bool:
    """Aynı isimde rapor zaten varsa, yeniden yazmadan önce siler --
    böylece script birden fazla kez çalıştırılabilir (idempotent)."""
    cursor.execute("SELECT rapor_id FROM stage.katalog_rapor WHERE rapor_adi = %s", (rapor_adi,))
    row = cursor.fetchone()
    if not row:
        return False
    rapor_id = row[0]
    cursor.execute("DELETE FROM stage.katalog_rapor_kolon_lineage WHERE rapor_id = %s", (rapor_id,))
    cursor.execute("DELETE FROM stage.katalog_rapor_kaynak WHERE rapor_id = %s", (rapor_id,))
    cursor.execute("DELETE FROM stage.katalog_rapor WHERE rapor_id = %s", (rapor_id,))
    return True


def rapor_katalogla(cursor, rapor_adi: str, dosya_adi: str, rapor_sql: str, analiz: dict) -> int:
    silindi = delete_existing_rapor(cursor, rapor_adi)

    cursor.execute(
        "INSERT INTO stage.katalog_rapor (rapor_adi, dosya_adi, sql_metni) VALUES (%s, %s, %s) RETURNING rapor_id",
        (rapor_adi, dosya_adi, rapor_sql),
    )
    rapor_id = cursor.fetchone()[0]

    kaynak_table_id_haritasi = {}  # tablo_adi -> table_id (bu rapor icinde tekrar sorgulamamak icin)
    for k in analiz["kaynak_tablolar"]:
        table_id = get_or_create_table(cursor, k["schema"], k["tablo"])
        kaynak_table_id_haritasi[k["tablo"]] = table_id
        cursor.execute(
            "INSERT INTO stage.katalog_rapor_kaynak (rapor_id, kaynak_table_id) VALUES (%s, %s)",
            (rapor_id, table_id),
        )

    for kl in analiz["kolon_lineage"]:
        # bir hedef kolon birden fazla kaynak kolona bakiyorsa (ör. CASE WHEN
        # birden fazla kolon kullaniyorsa) HER biri icin ayri satir yaziyoruz
        for kk in kl["kaynak_kolonlar"]:
            if kk["tablo"] is None:
                # kolon tablo onekli DEGIL (ör. duz "PAYMENT_AMOUNT") ve o
                # SELECT'te birden fazla tablo oldugu icin hangisine ait
                # oldugu belirlenemedi -- ETL tarafindaki "kolon kaynagi
                # belirsiz kaldi" durumunun aynisi. NULL tablo_adi ile
                # katalog_tablo'ya yazmak yerine bu SATIRI ATLIYORUZ.
                print(f"    !! kaynak belirsiz kaldı: {kl['hedef_kolon']} <- {kk['kolon']} "
                      f"(bu SELECT'te birden fazla tablo var, kolon tablo önekli değil -- atlandı)")
                continue
            table_id = kaynak_table_id_haritasi.get(kk["tablo"])
            if table_id is None:
                table_id = get_or_create_table(cursor, None, kk["tablo"])
                kaynak_table_id_haritasi[kk["tablo"]] = table_id
            column_id = get_or_create_column(cursor, table_id, kk["kolon"])
            cursor.execute(
                """
                INSERT INTO stage.katalog_rapor_kolon_lineage
                    (rapor_id, rapor_kolon_adi, kaynak_column_id, donusum_tipi, guven_seviyesi)
                VALUES (%s, %s, %s, %s, 'TAHMIN')
                """,
                (rapor_id, kl["hedef_kolon"], column_id, kl["donusum_tipi"]),
            )

    print(f"  {'yeniden yazildi' if silindi else 'yazildi'}: rapor_id={rapor_id}  "
          f"({len(analiz['kaynak_tablolar'])} kaynak tablo, {len(analiz['kolon_lineage'])} kolon)")
    return rapor_id


def main():
    # ETL dosyalari (katalog_parser.py'nin .txt'leri) ve semadaki yardimci
    # .sql dosyalariyla (katalog_semasi.sql vb.) KARISMASIN diye rapor
    # SQL'leri script'in kendi klasorunde DEGIL, ayri bir "raporlar/" alt
    # klasorunde aranir. Klasor yoksa olusturup kullaniciyi yonlendiririz --
    # isim bazli bir "kara liste" (ornek: "katalog_semasi.sql'i atla")
    # kirilgan olurdu, yeni bir yardimci .sql dosyasi eklendiginde yanlislikla
    # rapor sanilabilirdi; ayri klasor bu riski tamamen ortadan kaldirir.
    script_klasoru = os.path.dirname(os.path.abspath(__file__))
    rapor_klasoru = os.path.join(script_klasoru, "raporlar")

    if not os.path.isdir(rapor_klasoru):
        os.makedirs(rapor_klasoru, exist_ok=True)
        print(f"'{rapor_klasoru}' klasoru olusturuldu -- rapor .sql dosyalarinizi buraya koyup "
              f"tekrar calistirin (her dosya BIR rapor, dosya adi = rapor adi).")
        return

    dosyalar = sorted(glob.glob(os.path.join(rapor_klasoru, "*.sql")))

    if not dosyalar:
        print(f"'{rapor_klasoru}' klasorunde islenecek rapor .sql dosyasi bulunamadi.")
        return

    print(f"{len(dosyalar)} rapor dosyasi bulundu: {', '.join(os.path.basename(d) for d in dosyalar)}")

    print("PostgreSQL'e baglaniliyor...")
    conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_DBNAME,
                             user=PG_USER, password=PG_PASSWORD, client_encoding="UTF8")
    cursor = conn.cursor()
    print("Baglanti basarili.")

    for path in dosyalar:
        dosya_adi = os.path.basename(path)
        rapor_adi = os.path.splitext(dosya_adi)[0]
        print(f"--- {dosya_adi} isleniyor (rapor: {rapor_adi}) ---")
        try:
            rapor_sql = rapor_sqlini_oku(path)
            analiz = rapor_analiz_et(rapor_sql)
            if analiz["hata"]:
                print(f"  !! ayristirma hatasi, atlandi: {analiz['hata']}")
                continue
            if not analiz["kaynak_tablolar"]:
                print(f"  !! uyari: hic kaynak tablo bulunamadi (yine de kaydediliyor)")
            rapor_katalogla(cursor, rapor_adi, dosya_adi, rapor_sql, analiz)
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"  !! HATA, bu dosya atlandi: {e}")

    cursor.close()
    conn.close()
    print("Tamamlandi.")


if __name__ == "__main__":
    main()
