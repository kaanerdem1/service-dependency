"""
lineage_app.py
--------------
Tıkladıkça aşağı doğru açılan (lazy-load) ağaç yapısında lineage görüntüleyici.

Önceki sürümden fark: tüm zinciri tek seferde (recursive SQL ile) çekip
göstermek yerine, kullanıcı bir düğüme tıkladığında SADECE o düğümün
1 adım kaynaklarını çeker. Bunun 2 faydası var:
  1) Döngüsel veride (ör. SM_GL_ASSET <-> GL_ASSET_ROUNDLANAN) asla
     patlamaz -- kullanıcı ne kadar tıklarsa o kadar derine iner.
  2) Bir düğüm kendi atalarından biriyle aynıysa (gerçek döngü), bunu
     "🔁 döngü" etiketiyle işaretleyip daha fazla açılmasını engeller.

Çalıştırma:  python lineage_app.py
Sonra tarayıcıda:  http://localhost:5000
"""

from flask import Flask, request, jsonify, Response, redirect
import psycopg2
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import build_scope, ScopeType

# ------------------------------------------------------------------
# BURAYI DOLDURUN (PostgreSQL kurarken belirlediğiniz şifre)
# ------------------------------------------------------------------
PG_HOST = "localhost"
PG_PORT = 5432
PG_DBNAME = "postgres"
PG_USER = "postgres"
PG_PASSWORD = "2003kaan2003"
# ------------------------------------------------------------------

app = Flask(__name__)

LOGO_SVG = """<svg class="logo-svg" width="42" height="42" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="9" fill="#141B47"/>
        <circle cx="20" cy="11" r="4.5" fill="#D98E04"/>
        <circle cx="10.5" cy="29" r="4" fill="#CADCFC"/>
        <circle cx="29.5" cy="29" r="4" fill="#CADCFC"/>
        <path d="M18.3 14.8 L11.8 25.2" stroke="#5B6B8C" stroke-width="1.8" fill="none"/>
        <path d="M21.7 14.8 L28.2 25.2" stroke="#5B6B8C" stroke-width="1.8" fill="none"/>
      </svg>"""


def ust_navigasyon_html(aktif: str) -> str:
    """İki sayfa arasında (Lineage Görüntüleyici / Alan Ara) geçiş için
    üst gezinme bağlantılarını üretir. aktif='lineage' ya da 'alan_ara'."""
    baglantilar = [("lineage", "/", "Lineage Görüntüleyici"), ("alan_ara", "/alan_ara", "Alan Ara")]
    parcalar = []
    for anahtar, url, etiket in baglantilar:
        sinif = "ust-nav-link aktif" if anahtar == aktif else "ust-nav-link"
        parcalar.append(f'<a class="{sinif}" href="{url}">{etiket}</a>')
    return '<nav class="ust-nav">' + "".join(parcalar) + "</nav>"


TIP_ETIKETLERI = {
    ScopeType.ROOT: "ANA SORGU",
    ScopeType.DERIVED_TABLE: "ALT SORGU (FROM içinde)",
    ScopeType.SUBQUERY: "ALT SORGU (WHERE/EXISTS içinde)",
    ScopeType.CTE: "CTE (WITH içinde)",
    ScopeType.UNION: "UNION dalı",
    ScopeType.UDTF: "TABLO FONKSİYONU",
}


def sql_yapisini_cikar(sql_metni: str) -> dict:
    """Bir SQL cümlesini (INSERT/UPDATE/MERGE/düz SELECT) alır, içindeki
    her subquery seviyesini (derinlik, tip, alias, o seviyede doğrudan
    geçen tablolar) bir liste olarak döner."""
    parsed = sqlglot.parse_one(sql_metni, dialect="oracle")

    # INSERT/UPDATE/MERGE ise SELECT govdesini al, degilse (duz SELECT) direkt kullan
    hedef_ifade = parsed
    if hasattr(parsed, "expression") and parsed.expression is not None:
        hedef_ifade = parsed.expression
    if not hasattr(hedef_ifade, "selects"):
        # gercek bir SELECT/Union degilse, analiz edilecek bir sey yok
        return {"seviyeler": []}

    root_scope = build_scope(hedef_ifade)
    if root_scope is None:
        return {"seviyeler": []}

    def derinlik(scope):
        d, s = 0, scope
        while s.parent is not None:
            d += 1
            s = s.parent
        return d

    sonuc = []
    for scope in root_scope.traverse():
        alias = None
        if scope.expression.parent is not None and hasattr(scope.expression.parent, "alias"):
            alias = scope.expression.parent.alias or None
        tablolar = sorted(set(s.name.upper() for s in scope.sources.values() if hasattr(s, "name")))
        sonuc.append({
            "seviye": derinlik(scope),
            "tip": TIP_ETIKETLERI.get(scope.scope_type, str(scope.scope_type)),
            "alias": alias,
            "tablolar": tablolar,
        })

    sonuc.sort(key=lambda x: x["seviye"])
    return {"seviyeler": sonuc}


@app.route("/api/yapi", methods=["POST"])
def api_yapi():
    veri = request.get_json(silent=True) or {}
    sql_metni = (veri.get("sql") or "").strip()
    if not sql_metni:
        return jsonify({"hata": "sql alanı boş olamaz"}), 400
    try:
        sonuc = sql_yapisini_cikar(sql_metni)
    except Exception as e:
        return jsonify({"hata": f"Ayrıştırma hatası: {e}"}), 400
    return jsonify(sonuc)


def get_connection():
    return psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_DBNAME,
                             user=PG_USER, password=PG_PASSWORD, client_encoding="UTF8")


def alt_sorgu_dolu_haritasi(cur) -> dict:
    """Tüm katalog_statement_alt_sorgu ağacını belleğe çekip, hangi
    alt_sorgu_id'lerin (kendisi YA DA herhangi bir alt-alt_sorgusu) en az
    1 kaynak tablosuna sahip olduğunu hesaplar. Boş dalları (image 2'deki
    'tablo bulunamadı' durumu) budayabilmek için kullanılır.
    {alt_sorgu_id: bool} döner."""
    cur.execute("SELECT alt_sorgu_id, ust_alt_sorgu_id FROM stage.katalog_statement_alt_sorgu")
    kenarlar = cur.fetchall()
    cur.execute("SELECT DISTINCT alt_sorgu_id FROM stage.katalog_statement_kaynak WHERE alt_sorgu_id IS NOT NULL")
    kendi_dolu = {r[0] for r in cur.fetchall()}

    cocuklar = {}
    for cid, ust_id in kenarlar:
        if ust_id is not None:
            cocuklar.setdefault(ust_id, []).append(cid)

    hafiza = {}

    def dolu_mu(aid):
        if aid in hafiza:
            return hafiza[aid]
        hafiza[aid] = False  # döngü koruması (olmaması gerekir ama garanti olsun)
        sonuc = aid in kendi_dolu or any(dolu_mu(c) for c in cocuklar.get(aid, []))
        hafiza[aid] = sonuc
        return sonuc

    return {aid: dolu_mu(aid) for aid, _ in kenarlar}


MAKS_IC_ICE_DERINLIK = 15  # alt sorgu icinde alt sorgu... -- pathological derinlige karsi guvenlik siniri

# --- /api/tam_agac icin sunucu-tarafi ozyinelemeli agac hesaplama ---
# ONEMLI: bu fonksiyonlar /api/cocuklar VE /api/alt_sorgu ile TAMAMEN AYNI
# SQL sorgularini kullanir, ama HER SEFERINDE yeni bir HTTP istegi/DB
# baglantisi acmak yerine, TEK bir connection/cursor'i tekrar tekrar
# kullanarak (Python dongusu icinde) calisir. Boylece "diyagram" ozelligi
# artik istemciden yuzlerce ayri HTTP istegi atmak yerine TEK bir istekte
# tum agaci alabiliyor -- gercek bir vakada bu, agac derinse (cok seviyeli
# zincir) HTTP gidis-donus gecikmesini N kat azaltiyor.
TAM_AGAC_MAKS_DERINLIK = 25
TAM_AGAC_MAKS_TOPLAM = 900


def _cocuklar_getir_dahili(cur, table_id: int, dolu_harita: dict) -> dict:
    cur.execute(
        """
        SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
               ARRAY_AGG(DISTINCT us.statement_id ORDER BY us.statement_id) AS statement_ids
        FROM stage.katalog_unit_statement us
        JOIN stage.katalog_statement_alt_sorgu als
             ON als.statement_id = us.statement_id AND als.ust_alt_sorgu_id IS NULL
        JOIN stage.katalog_statement_kaynak sk ON sk.alt_sorgu_id = als.alt_sorgu_id
        JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
        WHERE us.hedef_table_id = %s
        GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
        ORDER BY kt.tablo_adi
        """,
        (table_id,),
    )
    direkt_rows = cur.fetchall()

    cur.execute(
        """
        SELECT DISTINCT cocuk.alt_sorgu_id, cocuk.alias, cocuk.tip
        FROM stage.katalog_unit_statement us
        JOIN stage.katalog_statement_alt_sorgu root_als
             ON root_als.statement_id = us.statement_id AND root_als.ust_alt_sorgu_id IS NULL
        JOIN stage.katalog_statement_alt_sorgu cocuk ON cocuk.ust_alt_sorgu_id = root_als.alt_sorgu_id
        WHERE us.hedef_table_id = %s
        ORDER BY cocuk.alt_sorgu_id
        """,
        (table_id,),
    )
    alt_sorgu_rows = cur.fetchall()

    alt_sorgu_gruplari = [
        {"alt_sorgu_id": r[0], "alias": r[1], "tip": r[2]}
        for r in alt_sorgu_rows if dolu_harita.get(r[0], False)
    ]
    return {
        "direkt_tablolar": [
            {"table_id": r[0], "schema_adi": r[1], "tablo_adi": r[2], "katman": r[3],
             "baglanti": _baglanti_olustur(table_id, r[0], r[4])}
            for r in direkt_rows
        ],
        "alt_sorgu_gruplari": alt_sorgu_gruplari,
    }


def _alt_sorgu_getir_dahili(cur, alt_sorgu_id: int, dolu_harita: dict) -> dict:
    cur.execute(
        """
        SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
               ARRAY_AGG(DISTINCT sk.statement_id ORDER BY sk.statement_id) AS statement_ids
        FROM stage.katalog_statement_kaynak sk
        JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
        WHERE sk.alt_sorgu_id = %s
        GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
        ORDER BY kt.tablo_adi
        """,
        (alt_sorgu_id,),
    )
    direkt_rows = cur.fetchall()

    cur.execute(
        """
        SELECT alt_sorgu_id, alias, tip
        FROM stage.katalog_statement_alt_sorgu
        WHERE ust_alt_sorgu_id = %s
        ORDER BY alt_sorgu_id
        """,
        (alt_sorgu_id,),
    )
    alt_sorgu_rows = cur.fetchall()

    alt_sorgu_gruplari = [
        {"alt_sorgu_id": r[0], "alias": r[1], "tip": r[2]}
        for r in alt_sorgu_rows if dolu_harita.get(r[0], False)
    ]
    return {
        "direkt_tablolar": [
            {"table_id": r[0], "schema_adi": r[1], "tablo_adi": r[2], "katman": r[3],
             "statement_ids": list(r[4] or [])}
            for r in direkt_rows
        ],
        "alt_sorgu_gruplari": alt_sorgu_gruplari,
    }


def _basit_cocuklar_getir_dahili(cur, table_id: int) -> dict:
    cur.execute(
        """
        SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
               ARRAY_AGG(DISTINCT us.statement_id ORDER BY us.statement_id) AS statement_ids
        FROM stage.katalog_unit_statement us
        JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
        JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
        WHERE us.hedef_table_id = %s
        GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
        ORDER BY kt.tablo_adi
        """,
        (table_id,),
    )
    return {"direkt_tablolar": [
        {"table_id": r[0], "schema_adi": r[1], "tablo_adi": r[2], "katman": r[3],
         "baglanti": _baglanti_olustur(table_id, r[0], r[4])}
        for r in cur.fetchall()
    ]}


ALT_SORGU_ETIKET_PY = {
    "FROM_ALT_SORGU": "alt sorgu", "WHERE_ALT_SORGU": "alt sorgu", "CTE": "CTE",
    "UNION_DALI": "UNION dalı", "TABLO_FONKSIYONU": "tablo fonksiyonu",
}


def _alt_sorgu_etiketi(tip, alias=None):
    etiket = ALT_SORGU_ETIKET_PY.get(tip, "alt sorgu")
    return etiket


KATMAN_ETIKET_PY = {"LD": "🗄 LD", "TR": "🔄 TR", "EX": "📥 EX", "KAYNAK": "🌐 KAYNAK"}


def _katmana_gore_grupla(tablo_dugumleri: list) -> list:
    """DOĞRUDAN tablo çocuklarını (aynı seviyedeki kardeşleri) katmanlarına
    (LD/TR/EX/KAYNAK) göre gruplar -- 'alt sorgu' grubuyla AYNI görsel dilde
    katlanabilir bir sarmalayıcı döner. Sadece BİRDEN FAZLA farklı katman
    varsa gruplar -- hepsi tek katmandaysa (ör. hepsi LD) gruplamanın hiçbir
    faydası olmaz, gereksiz bir katman eklemiş oluruz."""
    if len(tablo_dugumleri) <= 1:
        return tablo_dugumleri
    gruplar: dict[str, list] = {}
    sira = []
    for node in tablo_dugumleri:
        k = node.get("katman") or "?"
        if k not in gruplar:
            gruplar[k] = []
            sira.append(k)
        gruplar[k].append(node)
    if len(sira) <= 1:
        return tablo_dugumleri
    sonuc = []
    for k in sira:
        uyeler = gruplar[k]
        sonuc.append({
            "etiket": f"{KATMAN_ETIKET_PY.get(k, '❔ Diğer')} ({len(uyeler)})",
            "tip": "katman_grubu",
            "katman": k,
            "cocuklar": uyeler,
        })
    return sonuc


def _baglanti_olustur(hedef_table_id, kaynak_table_id, statement_ids):
    return {
        "tip": "statement",
        "hedef_table_id": hedef_table_id,
        "kaynak_table_id": kaynak_table_id,
        "statement_ids": [int(sid) for sid in (statement_ids or []) if sid is not None],
    }


def _tam_alt_sorgu_getir(cur, dolu_harita, alt_sorgu_id, alias, tip, atalar_yolu, derinlik, durum):
    etiket = _alt_sorgu_etiketi(tip, alias)
    if alt_sorgu_id in durum["alt_sorgu_yolu"]:
        return {"etiket": etiket + " 🔁", "tip": "dongu", "alt_sorgu_id": alt_sorgu_id, "cocuklar": []}
    if derinlik >= TAM_AGAC_MAKS_DERINLIK or durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
        durum["kesildi"] = True
        return {"etiket": etiket + " (…)", "tip": "altsorgu", "alt_sorgu_id": alt_sorgu_id, "cocuklar": []}

    veri = durum["alt_sorgu_onbellek"].get(alt_sorgu_id)
    if veri is None:
        durum["sayac"] += 1
        veri = _alt_sorgu_getir_dahili(cur, alt_sorgu_id, dolu_harita)
        durum["alt_sorgu_onbellek"][alt_sorgu_id] = veri

    durum["alt_sorgu_yolu"].add(alt_sorgu_id)
    alt_cocuklar = []
    for a in veri["alt_sorgu_gruplari"]:
        if durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
            durum["kesildi"] = True
            break
        alt_cocuklar.append(_tam_alt_sorgu_getir(cur, dolu_harita, a["alt_sorgu_id"], a["alias"], a["tip"], atalar_yolu, derinlik + 1, durum))
    tablo_cocuklari = []
    for c in veri["direkt_tablolar"]:
        if durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
            durum["kesildi"] = True
            break
        hedef_table_id = atalar_yolu[-1] if atalar_yolu else None
        baglanti = c.get("baglanti") or _baglanti_olustur(hedef_table_id, c["table_id"], c.get("statement_ids"))
        tablo_cocuklari.append(_tam_agac_getir(cur, dolu_harita, c["table_id"], c["tablo_adi"], atalar_yolu, derinlik + 1, durum, c.get("katman"), c.get("schema_adi"), baglanti))
    durum["alt_sorgu_yolu"].discard(alt_sorgu_id)
    return {"etiket": etiket, "tip": "altsorgu", "alt_sorgu_id": alt_sorgu_id, "cocuklar": alt_cocuklar + _katmana_gore_grupla(tablo_cocuklari)}


def _tam_agac_getir(cur, dolu_harita, table_id, tablo_adi, atalar_yolu, derinlik, durum, katman=None, schema_adi=None, baglanti=None):
    if table_id in atalar_yolu:
        return {"etiket": tablo_adi, "tip": "dongu", "table_id": table_id, "schema_adi": schema_adi,
                "katman": katman, "baglanti": baglanti, "cocuklar": []}
    if table_id in durum["genel_ziyaret"]:
        return {"etiket": tablo_adi + " 🔗", "tip": "referans", "table_id": table_id, "schema_adi": schema_adi,
                "katman": katman, "baglanti": baglanti, "cocuklar": []}
    if derinlik >= TAM_AGAC_MAKS_DERINLIK or durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
        durum["kesildi"] = True
        return {"etiket": tablo_adi + " (…devamı var)", "tip": "tablo", "table_id": table_id, "schema_adi": schema_adi,
                "katman": katman, "baglanti": baglanti, "cocuklar": []}
    durum["genel_ziyaret"].add(table_id)

    veri = durum["cocuklar_onbellek"].get(table_id)
    if veri is None:
        durum["sayac"] += 1
        veri = _cocuklar_getir_dahili(cur, table_id, dolu_harita)
        durum["cocuklar_onbellek"][table_id] = veri

    yeni_yol = atalar_yolu + [table_id]
    alt_cocuklar = []
    for a in veri["alt_sorgu_gruplari"]:
        if durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
            durum["kesildi"] = True
            break
        alt_cocuklar.append(_tam_alt_sorgu_getir(cur, dolu_harita, a["alt_sorgu_id"], a["alias"], a["tip"], yeni_yol, derinlik + 1, durum))
    tablo_cocuklari = []
    for c in veri["direkt_tablolar"]:
        if durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
            durum["kesildi"] = True
            break
        tablo_cocuklari.append(_tam_agac_getir(cur, dolu_harita, c["table_id"], c["tablo_adi"], yeni_yol, derinlik + 1, durum, c.get("katman"), c.get("schema_adi"), c.get("baglanti")))
    return {"etiket": tablo_adi, "tip": "tablo", "table_id": table_id, "schema_adi": schema_adi,
            "katman": katman, "baglanti": baglanti, "cocuklar": alt_cocuklar + _katmana_gore_grupla(tablo_cocuklari)}


@app.route("/api/tam_agac")
def api_tam_agac():
    """Verilen table_id'nin TÜM kaynak ağacını -- elle genişletmeye ya da
    yüzlerce ayrı HTTP isteğine gerek KALMADAN -- TEK bir istekte,
    sunucu tarafında (aynı DB bağlantısıyla, HTTP gidiş-dönüşü olmadan)
    özyinelemeli olarak hesaplayıp döner. Diyagram özelliği için."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT tablo_adi, katman, schema_adi FROM stage.katalog_tablo WHERE table_id = %s", (table_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"hata": "tablo bulunamadı"}), 404
        tablo_adi, kok_katman, kok_schema = row

        dolu_harita = alt_sorgu_dolu_haritasi(cur)
        durum = {"sayac": 0, "kesildi": False, "genel_ziyaret": set(),
                  "alt_sorgu_yolu": set(), "cocuklar_onbellek": {}, "alt_sorgu_onbellek": {}}
        model = _tam_agac_getir(cur, dolu_harita, table_id, tablo_adi, [], 0, durum, kok_katman, kok_schema)
        model["tip"] = "kok"
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({"model": model, "kesildi": durum["kesildi"], "sayac": durum["sayac"]})


@app.route("/api/rapor_tam_agac")
def api_rapor_tam_agac():
    """RAPOR modu icin: /api/tam_agac'in ayni mantigi ama kok bir RAPOR --
    raporun DOGRUDAN kaynak tablolarinin HER BIRI icin ayri ayri
    _tam_agac_getir cagirmak yerine, TUM dallar AYNI paylasilan 'durum'
    (onbellek + genel-ziyaret-edildi) ile hesaplanir -- boylece iki farkli
    kaynak tablo ayni ust-tabloyu paylasiyorsa, o da (Tablo modundaki gibi)
    dogru sekilde tek seferde genisletilip sonrasinda referans dugumu
    olarak gosterilir."""
    try:
        rapor_id = int(request.args.get("rapor_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir rapor_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT rapor_adi FROM stage.katalog_rapor WHERE rapor_id = %s", (rapor_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"hata": "rapor bulunamadı"}), 404
        rapor_adi = row[0]

        cur.execute(
            """
            SELECT DISTINCT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
            FROM stage.katalog_rapor_kaynak rk
            JOIN stage.katalog_tablo kt ON kt.table_id = rk.kaynak_table_id
            WHERE rk.rapor_id = %s
            ORDER BY kt.tablo_adi
            """,
            (rapor_id,),
        )
        kaynak_tablolar = cur.fetchall()

        dolu_harita = alt_sorgu_dolu_haritasi(cur)
        durum = {"sayac": 0, "kesildi": False, "genel_ziyaret": set(),
                  "alt_sorgu_yolu": set(), "cocuklar_onbellek": {}, "alt_sorgu_onbellek": {}}
        cocuklar = [
            _tam_agac_getir(
                cur, dolu_harita, tid, tadi, [], 0, durum, katman, schema,
                {"tip": "rapor_sql", "rapor_id": rapor_id, "kaynak_table_id": tid}
            )
            for tid, schema, tadi, katman in kaynak_tablolar
        ]
        cocuklar = _katmana_gore_grupla(cocuklar)
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    model = {"etiket": "📄 " + rapor_adi, "tip": "kok", "rapor_id": rapor_id, "cocuklar": cocuklar}
    return jsonify({"model": model, "kesildi": durum["kesildi"], "sayac": durum["sayac"]})


def _kaynak_ozeti(kaynak_ifadesi, dialect: str, girinti: int, derinlik: int = 0) -> str:
    """FROM/JOIN'deki bir kaynağı özetler -- düz tabloysa olduğu gibi,
    subquery (derived table) ise İÇİNİ de özyinelemeli olarak, bir kademe
    daha girintili şekilde sadeleştirir. derinlik MAKS_IC_ICE_DERINLIK'i
    aşarsa (gerçek üretim SQL'lerinde görülebilen çok katmanlı iç içe
    subquery'lere karşı) özyinelemeyi durdurup ham SQL'e düşer -- RecursionError
    yerine güvenli bir sonuç döner."""
    if kaynak_ifadesi is None:
        return ""
    if isinstance(kaynak_ifadesi, exp.Subquery):
        if derinlik >= MAKS_IC_ICE_DERINLIK:
            return kaynak_ifadesi.sql(dialect=dialect)
        alias = kaynak_ifadesi.alias
        bosluk = "  " * girinti
        ic_ozet = _govde_ozeti(kaynak_ifadesi.this, dialect, girinti + 1, derinlik + 1)
        return "(\n" + ic_ozet + "\n" + bosluk + ")" + (f" {alias}" if alias else "")
    return kaynak_ifadesi.sql(dialect=dialect)


def _select_ozeti(select_node, dialect: str, girinti: int, derinlik: int = 0) -> str:
    """Tek bir SELECT gövdesini (UNION olmadan) ÇOK SATIRLI, girintili bir
    özete çevirir -- kolon/ifade listesi sayıya indirgenir, her JOIN kendi
    satırında, WHERE'in her AND/OR koşulu kendi satırında -- HİÇBİR YER
    KIRPILMAZ (yalnızca kolon/ifade listeleri sayıya indirgenir)."""
    bosluk = "  " * girinti
    if isinstance(select_node, exp.Union):
        # _govde_ozeti zaten UNION'i duzgun isliyor -- oraya devret
        return _govde_ozeti(select_node, dialect, girinti, derinlik)
    if not isinstance(select_node, exp.Select):
        # TABAN DURUM: ne Select ne Union (ör. "MERGE ... USING ciplak_tablo"
        # gibi bir durumda burasi duz bir Table olabilir). ESKIDEN burada
        # _govde_ozeti'ye GERI donuluyordu -- ama _govde_ozeti de Union
        # degilse aynen buraya donuyordu, derinlik hic artmadan SONSUZ bir
        # ping-pong olusturuyordu (gercek bir MERGE...USING tablo_adi
        # vakasinda RecursionError olarak yakalandi). Artik DOGRUDAN ham
        # SQL'e dusuyoruz -- guvenli taban durum.
        return select_node.sql(dialect=dialect)
    satirlar = [f"{bosluk}SELECT ...{len(select_node.expressions)} ifade..."]
    from_ifade = select_node.args.get("from_")
    if from_ifade:
        satirlar.append(f"{bosluk}FROM {_kaynak_ozeti(from_ifade.this, dialect, girinti, derinlik)}")
    for j in select_node.args.get("joins", []):
        etiket = " ".join(filter(None, [j.side, j.kind]))
        onek = f"{etiket} " if etiket else ""
        satirlar.append(f"{bosluk}{onek}JOIN {_kaynak_ozeti(j.this, dialect, girinti, derinlik)}")
    where_ifade = select_node.args.get("where")
    if where_ifade:
        # pretty=True zaten AND/OR'lari kendi satirina bolup girintiliyor --
        # bizim eklememiz gereken sadece kendi girinti seviyemiz
        where_metin = where_ifade.this.sql(dialect=dialect, pretty=True)
        where_satirlari = where_metin.split("\n")
        satirlar.append(f"{bosluk}WHERE {where_satirlari[0]}")
        for ekstra in where_satirlari[1:]:
            satirlar.append(f"{bosluk}  {ekstra}")
    return "\n".join(satirlar)


def _govde_ozeti(govde, dialect: str, girinti: int, derinlik: int = 0) -> str:
    """govde bir Select ya da Union olabilir -- UNION ise dallarına ayırıp
    HER BİRİNİ (kendisi de iç içe Select/Union olsa bile) özyinelemeli,
    aynı girinti seviyesinde özetler. UNION dallarını ayırma İŞLEMİ KASITLI
    OLARAK DÖNGÜSEL (özyinelemeli değil) -- gerçek üretim SQL'lerinde
    onlarca/yüzlerce 'UNION ALL' dalı olabiliyor, bu da özyinelemeli
    ayrıştırmada RecursionError'a yol açıyordu (gerçek bir vakada
    yakalandı: 'maximum recursion depth exceeded')."""
    # "INSERT INTO x (kolonlar) (SELECT ...)" gibi PARANTEZE ALINMIŞ bir
    # SELECT, sqlglot'ta dogrudan exp.Select DEGIL, onu SARAN bir
    # exp.Subquery olarak gelir -- gercek govde'ye inmek icin bir kat
    # soymamiz gerekiyor (gercek bir vakada bu sarmalanma fark edilmeyip
    # tum SELECT'in ham haliyle dusmesine -- yani hic sadelesmemesine --
    # yol aciyordu).
    if isinstance(govde, exp.Subquery):
        return _govde_ozeti(govde.this, dialect, girinti, derinlik)
    if isinstance(govde, exp.Union):
        # DONGUSEL ayirma (recursion DEGIL) -- Union agaci genelde sola
        # yaslanir: ((a UNION b) UNION c) UNION d ... -- node.this'i bir
        # while dongusuyle takip ederek, en ici -> en dısı sirada bir liste
        # olusturuyoruz, sonra ters cevirip doğal (yukaridan asagiya) sirayi
        # elde ediyoruz.
        dallar = []
        node = govde
        while isinstance(node, exp.Union):
            birlesim = "UNION ALL" if node.args.get("distinct") is False else "UNION"
            dallar.append((birlesim, node.expression))
            node = node.this
        dallar.append((None, node))
        dallar.reverse()

        bosluk = "  " * girinti
        parcalar = []
        for birlesim, dal in dallar:
            if birlesim:
                parcalar.append(f"{bosluk}{birlesim}")
            if derinlik >= MAKS_IC_ICE_DERINLIK:
                parcalar.append(dal.sql(dialect=dialect))
            else:
                parcalar.append(_govde_ozeti(dal, dialect, girinti, derinlik))
        return "\n".join(parcalar)
    return _select_ozeti(govde, dialect, girinti, derinlik)


def sql_sade_gorunum(sql_metni: str) -> str | None:
    """Bir statement'ı (INSERT/MERGE) 'Sade Görünüm' için özetler: uzun
    kolon/ifade listeleri '...N kolon/ifade...' şeklinde sayıya indirgenir,
    FROM/JOIN/WHERE/UNION İSKELETİ (iç içe subquery'ler dahil, özyinelemeli
    ve girintili olarak) OLDUĞU GİBİ, HİÇ KIRPILMADAN korunur. Türetilmiş
    kolon olup olmamasına bakmaz -- her zaman güvenlidir, çünkü hiçbir
    yerde '*' gibi semantik bir eşitlik iddia etmez, sadece görünüm
    sadeleştirir. UPDATE/DELETE/TRUNCATE ya da parse edilemeyen bir
    statement'sa None döner -- çağıran taraf o zaman tam metni göstermeye
    devam eder. Beklenmeyen bir hata olursa (gerçek üretim SQL'i çok çeşitli
    olabiliyor) sunucu konsoluna YAZDIRIR -- sessizce yutmak yerine, hangi
    statement'ın neden başarısız olduğunu görebilelim diye."""
    try:
        parsed = sqlglot.parse_one(sql_metni, dialect="oracle")
    except Exception as e:
        print(f"  !! sql_sade_gorunum: PARSE hatasi -- {type(e).__name__}: {e}")
        return None

    if isinstance(parsed, exp.Insert):
        hedef = parsed.this
        if isinstance(hedef, exp.Schema):
            hedef_metin = f"INSERT INTO {hedef.this.sql(dialect='oracle')} ( ...{len(hedef.expressions)} kolon... )"
        else:
            hedef_metin = f"INSERT INTO {hedef.sql(dialect='oracle')}"
        govde = parsed.expression
    elif isinstance(parsed, exp.Merge):
        hedef_metin = f"MERGE INTO {parsed.this.sql(dialect='oracle')}"
        using_ifade = parsed.args.get("using")
        govde = using_ifade.this if isinstance(using_ifade, exp.Subquery) else using_ifade
    else:
        return None

    if govde is None or not hasattr(govde, "selects"):
        return None
    try:
        return hedef_metin + "\n" + _govde_ozeti(govde, "oracle", 0)
    except Exception as e:
        print(f"  !! sql_sade_gorunum: OZETLEME hatasi -- {type(e).__name__}: {e}")
        return None


def _statement_detayi_olustur(cur, statement_id, paket_adi, procedure_adi, dml_tipi, satir_no, sql_metni, rol, iliskili_tam_ad):
    """Bir statement satırı için ortak alanları (kaynaklar, sadeleştirme)
    hesaplar. rol='yazan' -> bu statement table_id'yi DOLDURUYOR.
    rol='kullanilan' -> bu statement table_id'yi KAYNAK olarak okuyor,
    iliskili_tam_ad o statement'ın gerçek hedefinin adı."""
    cur.execute(
        """
        SELECT DISTINCT kt.schema_adi, kt.tablo_adi
        FROM stage.katalog_statement_kaynak sk
        JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
        WHERE sk.statement_id = %s
        ORDER BY kt.tablo_adi
        """,
        (statement_id,),
    )
    kaynaklar = [(f"{s}.{t}" if s else t) for s, t in cur.fetchall()]

    sql_sade = sql_sade_gorunum(sql_metni) if sql_metni else None

    return {
        "statement_id": statement_id, "paket_adi": paket_adi, "procedure_adi": procedure_adi,
        "dml_tipi": dml_tipi, "satir_no": satir_no, "sql_metni": sql_metni, "sql_sade": sql_sade,
        "kaynaklar": kaynaklar,
        "rol": rol, "iliskili_tam_ad": iliskili_tam_ad,
    }


@app.route("/api/tablo_detay")
def api_tablo_detay():
    """Inspector Panel için: verilen table_id ile ilgili TÜM statement'ları
    döner -- iki grupta: (1) bu tabloyu DOLDURAN statement'lar (hedef
    olduğu yerler) ve (2) bu tablonun KAYNAK olarak KULLANILDIĞI
    statement'lar (başka bir tabloyu doldururken bunu okuyanlar). Salt
    kaynak olan (hiç doldurulmayan, ör. dış/lookup) tablolarda birinci
    grup boş olabilir -- bu normal, ikinci grup yine de dolu gelir."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT tablo_adi, schema_adi FROM stage.katalog_tablo WHERE table_id = %s", (table_id,))
        tablo_row = cur.fetchone()
        if not tablo_row:
            cur.close()
            conn.close()
            return jsonify({"hata": "tablo bulunamadı"}), 404

        entries = []

        # 1) bu tabloyu DOLDURAN statement'lar
        cur.execute(
            """
            SELECT us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no, us.sql_metni
            FROM stage.katalog_unit_statement us
            JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
            WHERE us.hedef_table_id = %s
            ORDER BY u.procedure_adi, us.satir_no
            """,
            (table_id,),
        )
        for r in cur.fetchall():
            entries.append(_statement_detayi_olustur(cur, r[0], r[1], r[2], r[3], r[4], r[5], "yazan", None))

        # 2) bu tablonun KAYNAK olarak kullanıldığı statement'lar
        cur.execute(
            """
            SELECT DISTINCT us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no, us.sql_metni,
                   ht.schema_adi, ht.tablo_adi
            FROM stage.katalog_unit_statement us
            JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
            JOIN stage.katalog_tablo ht ON ht.table_id = us.hedef_table_id
            JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
            WHERE sk.kaynak_table_id = %s
            ORDER BY u.procedure_adi, us.satir_no
            """,
            (table_id,),
        )
        for r in cur.fetchall():
            hedef_tam_ad = f"{r[6]}.{r[7]}" if r[6] else r[7]
            entries.append(_statement_detayi_olustur(cur, r[0], r[1], r[2], r[3], r[4], r[5], "kullanilan", hedef_tam_ad))

        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({
        "tablo_adi": tablo_row[0], "schema_adi": tablo_row[1], "entries": entries,
    })


@app.route("/api/sql_goster")
def api_sql_goster():
    """Verilen (hedef_table_id, kaynak_table_id) çifti için, o kaynağı
    okuyan statement(lar)ın SQL metnini döner -- ağaçta bir tablonun üzerine
    gelindiğinde gösterilir. Birden fazla statement/prosedür aynı çifti
    üretiyorsa hepsi listelenir. Her statement için ayrıca O STATEMENT'IN
    TÜM kaynaklarının listesi de döner (sadece üzerine gelinen tablo değil)."""
    try:
        hedef_id = int(request.args.get("hedef_id", ""))
        kaynak_id = int(request.args.get("kaynak_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli hedef_id ve kaynak_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi,
                   us.satir_no, us.sql_metni, ht.schema_adi, ht.tablo_adi
            FROM stage.katalog_unit_statement us
            JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
            JOIN stage.katalog_tablo ht ON ht.table_id = us.hedef_table_id
            JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
            WHERE us.hedef_table_id = %s AND sk.kaynak_table_id = %s
            ORDER BY u.procedure_adi, us.satir_no
            """,
            (hedef_id, kaynak_id),
        )
        rows = cur.fetchall()

        sonuclar = []
        for r in rows:
            statement_id = r[0]
            cur.execute(
                """
                SELECT DISTINCT kt.schema_adi, kt.tablo_adi
                FROM stage.katalog_statement_kaynak sk
                JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
                WHERE sk.statement_id = %s
                ORDER BY kt.tablo_adi
                """,
                (statement_id,),
            )
            kaynak_rows = cur.fetchall()
            kaynaklar = [(f"{s}.{t}" if s else t) for s, t in kaynak_rows]

            sql_metni = r[5]
            sql_sade = sql_sade_gorunum(sql_metni) if sql_metni else None

            sonuclar.append({
                "statement_id": statement_id,
                "paket_adi": r[1], "procedure_adi": r[2], "dml_tipi": r[3],
                "satir_no": r[4], "sql_metni": sql_metni, "sql_sade": sql_sade,
                "hedef_tam_adi": (f"{r[6]}.{r[7]}" if r[6] else r[7]),
                "kaynaklar": kaynaklar,
            })
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({"sonuclar": sonuclar})


@app.route("/api/sql_statementler")
def api_sql_statementler():
    """Diagramdaki tekil bağlantı kanıtı için: statement_id listesi verilince
    sadece o statement'ların SQL metinlerini, mevcut SQL popup formatında
    döner. Tablo çiftiyle arama yapmadığı için aynı iki tablo başka bir yerde
    tekrar ilişkilenmişse yanlış SQL'leri karıştırmaz."""
    ids_ham = (request.args.get("ids") or "").strip()
    try:
        statement_ids = [int(x) for x in ids_ham.split(",") if x.strip()]
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli statement id listesi gerekli"}), 400
    statement_ids = sorted(set(statement_ids))[:50]
    if not statement_ids:
        return jsonify({"hata": "en az bir statement id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi,
                   us.satir_no, us.sql_metni, ht.schema_adi, ht.tablo_adi
            FROM stage.katalog_unit_statement us
            JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
            LEFT JOIN stage.katalog_tablo ht ON ht.table_id = us.hedef_table_id
            WHERE us.statement_id = ANY(%s)
            ORDER BY u.procedure_adi, us.satir_no, us.statement_id
            """,
            (statement_ids,),
        )
        rows = cur.fetchall()

        sonuclar = []
        for r in rows:
            statement_id = r[0]
            cur.execute(
                """
                SELECT DISTINCT kt.schema_adi, kt.tablo_adi
                FROM stage.katalog_statement_kaynak sk
                JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
                WHERE sk.statement_id = %s
                ORDER BY kt.tablo_adi
                """,
                (statement_id,),
            )
            kaynaklar = [(f"{s}.{t}" if s else t) for s, t in cur.fetchall()]
            sql_metni = r[5]
            sonuclar.append({
                "statement_id": statement_id,
                "paket_adi": r[1],
                "procedure_adi": r[2],
                "dml_tipi": r[3],
                "satir_no": r[4],
                "sql_metni": sql_metni,
                "sql_sade": sql_sade_gorunum(sql_metni) if sql_metni else None,
                "hedef_tam_adi": (f"{r[6]}.{r[7]}" if r[6] and r[7] else (r[7] or "")),
                "kaynaklar": kaynaklar,
            })
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({"sonuclar": sonuclar})


@app.route("/api/rapor_sql_goster")
def api_rapor_sql_goster():
    """Rapor diyagramında tablo -> rapor bağlantısına tıklanınca, ilgili
    rapor SQL'ini mevcut SQL popup formatına uyarlanmış halde döner."""
    try:
        rapor_id = int(request.args.get("rapor_id", ""))
        kaynak_id = int(request.args.get("kaynak_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli rapor_id ve kaynak_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT rapor_adi, sql_metni, dosya_adi FROM stage.katalog_rapor WHERE rapor_id = %s", (rapor_id,))
        rapor_row = cur.fetchone()
        if not rapor_row:
            cur.close()
            conn.close()
            return jsonify({"hata": "rapor bulunamadı"}), 404

        cur.execute(
            """
            SELECT 1
            FROM stage.katalog_rapor_kaynak
            WHERE rapor_id = %s AND kaynak_table_id = %s
            LIMIT 1
            """,
            (rapor_id, kaynak_id),
        )
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"hata": "bu rapor-kaynak tablo bağlantısı bulunamadı"}), 404

        cur.execute(
            """
            SELECT DISTINCT kt.schema_adi, kt.tablo_adi
            FROM stage.katalog_rapor_kaynak rk
            JOIN stage.katalog_tablo kt ON kt.table_id = rk.kaynak_table_id
            WHERE rk.rapor_id = %s
            ORDER BY kt.tablo_adi
            """,
            (rapor_id,),
        )
        kaynaklar = [(f"{s}.{t}" if s else t) for s, t in cur.fetchall()]
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    rapor_adi, sql_metni, dosya_adi = rapor_row
    return jsonify({"sonuclar": [{
        "statement_id": None,
        "paket_adi": "RAPOR",
        "procedure_adi": rapor_adi,
        "dml_tipi": "SELECT",
        "satir_no": None,
        "sql_metni": sql_metni,
        "sql_sade": None,
        "hedef_tam_adi": "📄 " + rapor_adi,
        "kaynaklar": kaynaklar,
        "dosya_adi": dosya_adi,
    }]})


@app.route("/api/tablo")
def api_tablo():
    """Tablo adını table_id'ye çözer -- kök düğümü başlatmak için."""
    ad = request.args.get("ad", "").strip().upper()
    if not ad:
        return jsonify({"hata": "ad parametresi gerekli"}), 400
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT table_id, tablo_adi, katman, schema_adi FROM stage.katalog_tablo WHERE tablo_adi = %s LIMIT 1", (ad,))
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    if not row:
        return jsonify({"bulundu": False, "aranan": ad})
    return jsonify({"bulundu": True, "table_id": row[0], "tablo_adi": row[1], "katman": row[2], "schema_adi": row[3]})


@app.route("/api/rapor")
def api_rapor():
    """Rapor adını rapor_id'ye çözer -- RAPOR modunda kök düğümü başlatmak
    için. Tam eşleşme bulunamazsa, tek bir kısmi (ILIKE) eşleşme varsa onu
    kabul eder -- kullanıcı raporun tam dosya adını hatırlamayabilir."""
    ad = request.args.get("ad", "").strip()
    if not ad:
        return jsonify({"hata": "ad parametresi gerekli"}), 400
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT rapor_id, rapor_adi FROM stage.katalog_rapor WHERE rapor_adi = %s LIMIT 1", (ad,))
        row = cur.fetchone()
        if not row:
            cur.execute(
                "SELECT rapor_id, rapor_adi FROM stage.katalog_rapor WHERE rapor_adi ILIKE %s ORDER BY rapor_adi LIMIT 2",
                (f"%{ad}%",),
            )
            adaylar = cur.fetchall()
            if len(adaylar) == 1:
                row = adaylar[0]
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    if not row:
        return jsonify({"bulundu": False, "aranan": ad})
    return jsonify({"bulundu": True, "rapor_id": row[0], "rapor_adi": row[1]})


@app.route("/api/rapor_detay")
def api_rapor_detay():
    """Verilen rapor_id için: raporun kendisi (ad, sql önizlemesi) ve
    DOĞRUDAN kaynak olarak kullandığı tablolar (ağacın ilk seviyesi)."""
    try:
        rapor_id = int(request.args.get("rapor_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir rapor_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT rapor_adi, sql_metni, dosya_adi FROM stage.katalog_rapor WHERE rapor_id = %s", (rapor_id,))
        rapor_row = cur.fetchone()
        if not rapor_row:
            cur.close()
            conn.close()
            return jsonify({"hata": "rapor bulunamadı"}), 404

        cur.execute(
            """
            SELECT DISTINCT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
            FROM stage.katalog_rapor_kaynak rk
            JOIN stage.katalog_tablo kt ON kt.table_id = rk.kaynak_table_id
            WHERE rk.rapor_id = %s
            ORDER BY kt.tablo_adi
            """,
            (rapor_id,),
        )
        kaynak_tablolar = [{"table_id": r[0], "schema_adi": r[1], "tablo_adi": r[2], "katman": r[3]} for r in cur.fetchall()]
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({
        "rapor_adi": rapor_row[0], "sql_metni": rapor_row[1], "dosya_adi": rapor_row[2],
        "kaynak_tablolar": kaynak_tablolar,
    })


@app.route("/api/kolonlar")
def api_kolonlar():
    """Verilen table_id'nin kolon listesini (ad, sıra, varsa veri_tipi) döner."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT tablo_adi, schema_adi FROM stage.katalog_tablo WHERE table_id = %s", (table_id,))
        tablo_row = cur.fetchone()
        cur.execute(
            """
            SELECT kolon_adi, kolon_sira, veri_tipi
            FROM stage.katalog_kolon
            WHERE table_id = %s
            ORDER BY kolon_sira NULLS LAST, kolon_adi
            """,
            (table_id,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    if not tablo_row:
        return jsonify({"hata": "tablo bulunamadı"}), 404

    kolonlar = [{"kolon_adi": r[0], "kolon_sira": r[1], "veri_tipi": r[2]} for r in rows]
    return jsonify({
        "tablo_adi": tablo_row[0],
        "schema_adi": tablo_row[1],
        "kolonlar": kolonlar,
    })


@app.route("/api/kolon_soykutugu")
def api_kolon_soykutugu():
    """Verilen table_id + kolon_adi için, o kolonun ORİJİNAL kaynağına kadar
    -- kaç ETL adımından geçerse geçsin -- özyinelemeli olarak geriye gider.
    'Bu kolon en başta nereden geliyor' sorusuna cevap verir; katalog_kolon_
    lineage'i bir graf gibi (kaynak_column_id bir kaydın hedefiyse, aynı
    zamanda başka bir kaydın kaynağı olabilir) dolaşır. Döngü korumalı,
    20 seviyede sınırlı (güvenlik için)."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400
    kolon_adi = (request.args.get("kolon_adi") or "").strip()
    if not kolon_adi:
        return jsonify({"hata": "kolon_adi gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            WITH RECURSIVE soykutuk (kaynak_column_id, source_schema, source_table, source_column,
                                      donusum_tipi, seviye, yol, yol_metin) AS (
                SELECT
                    cl.kaynak_column_id, st.schema_adi, st.tablo_adi, sc.kolon_adi,
                    cl.donusum_tipi, 1,
                    ARRAY[cl.hedef_column_id, cl.kaynak_column_id],
                    (COALESCE(st.schema_adi || '.', '') || st.tablo_adi || '.' || sc.kolon_adi)::text
                FROM stage.katalog_kolon_lineage cl
                JOIN stage.katalog_kolon sc ON sc.column_id = cl.kaynak_column_id
                JOIN stage.katalog_tablo st ON st.table_id = sc.table_id
                JOIN stage.katalog_kolon tc ON tc.column_id = cl.hedef_column_id
                WHERE tc.table_id = %s AND tc.kolon_adi = %s
                UNION ALL
                SELECT
                    cl2.kaynak_column_id, st2.schema_adi, st2.tablo_adi, sc2.kolon_adi,
                    cl2.donusum_tipi, s.seviye + 1,
                    s.yol || cl2.kaynak_column_id,
                    s.yol_metin || ' ← ' || COALESCE(st2.schema_adi || '.', '') || st2.tablo_adi || '.' || sc2.kolon_adi
                FROM soykutuk s
                JOIN stage.katalog_kolon_lineage cl2 ON cl2.hedef_column_id = s.kaynak_column_id
                JOIN stage.katalog_kolon sc2 ON sc2.column_id = cl2.kaynak_column_id
                JOIN stage.katalog_tablo st2 ON st2.table_id = sc2.table_id
                WHERE s.seviye < 20 AND NOT (cl2.kaynak_column_id = ANY(s.yol))
            )
            SELECT DISTINCT seviye, source_schema, source_table, source_column, donusum_tipi, yol_metin,
                   NOT EXISTS (SELECT 1 FROM stage.katalog_kolon_lineage cl3 WHERE cl3.hedef_column_id = s.kaynak_column_id) AS orijinal_mi
            FROM soykutuk s
            ORDER BY seviye, source_table, source_column
            """,
            (table_id, kolon_adi),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    adimlar = [
        {"seviye": r[0], "kaynak_tam_ad": (f"{r[1]}.{r[2]}" if r[1] else r[2]),
         "kaynak_kolon": r[3], "donusum_tipi": r[4], "yol_metin": r[5], "orijinal_mi": r[6]}
        for r in rows
    ]
    return jsonify({"kolon_adi": kolon_adi, "adimlar": adimlar})


@app.route("/api/kolon_lineage")
def api_kolon_lineage():
    """Verilen table_id'nin HER kolonu için, hangi kaynak tablo/kolon(lar)dan
    geldiğini (doğrudan kopya mı türetilmiş mi, hangi prosedürden) döner.
    Bir hedef kolonun birden fazla kaynak satırı olabilir (ör. bir CASE
    WHEN ifadesi birden fazla kaynak kolona bakıyorsa, ya da tabloyu
    birden fazla statement dolduruyorsa)."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT tablo_adi, schema_adi FROM stage.katalog_tablo WHERE table_id = %s", (table_id,))
        tablo_row = cur.fetchone()
        if not tablo_row:
            cur.close()
            conn.close()
            return jsonify({"hata": "tablo bulunamadı"}), 404

        cur.execute(
            """
            SELECT hk.kolon_adi, hk.kolon_sira, kk.kolon_adi, kt.schema_adi, kt.tablo_adi,
                   kl.donusum_tipi, kl.guven_seviyesi, u.procedure_adi
            FROM stage.katalog_kolon_lineage kl
            JOIN stage.katalog_kolon hk ON hk.column_id = kl.hedef_column_id
            JOIN stage.katalog_kolon kk ON kk.column_id = kl.kaynak_column_id
            JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
            JOIN stage.katalog_unit_statement us ON us.statement_id = kl.statement_id
            JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
            WHERE hk.table_id = %s
            ORDER BY hk.kolon_sira NULLS LAST, hk.kolon_adi, kt.tablo_adi, kk.kolon_adi
            """,
            (table_id,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    # hedef kolon adina gore grupla
    gruplar = {}
    sira_haritasi = {}
    for hedef_kolon, kolon_sira, kaynak_kolon, s_schema, s_tablo, donusum_tipi, guven, procedure_adi in rows:
        gruplar.setdefault(hedef_kolon, []).append({
            "kaynak_tablo": (f"{s_schema}.{s_tablo}" if s_schema else s_tablo),
            "kaynak_kolon": kaynak_kolon,
            "donusum_tipi": donusum_tipi,
            "guven_seviyesi": guven,
            "procedure_adi": procedure_adi,
        })
        sira_haritasi.setdefault(hedef_kolon, kolon_sira)

    kolonlar = [
        {"hedef_kolon": ad, "kolon_sira": sira_haritasi[ad], "kaynaklar": kaynaklar}
        for ad, kaynaklar in gruplar.items()
    ]
    kolonlar.sort(key=lambda k: (k["kolon_sira"] is None, k["kolon_sira"], k["hedef_kolon"]))

    return jsonify({
        "tablo_adi": tablo_row[0], "schema_adi": tablo_row[1], "kolonlar": kolonlar,
    })


@app.route("/api/kolon_etki")
def api_kolon_etki():
    """Verilen table_id + kolon_adi için, bu kolonun AŞAĞI YÖNDE hangi
    tablo kolonlarını ve rapor kolonlarını etkilediğini döner. Tablo etki
    analizinin kolon seviyesindeki karşılığıdır. Seçili akış türlerine göre,
    başlangıç kolonundan ulaşılabilen tüm kolon katmanlarını dolaşır."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400
    kolon_adi = (request.args.get("kolon_adi") or "").strip()
    if not kolon_adi:
        return jsonify({"hata": "kolon_adi gerekli"}), 400
    gecerli_akislar = {"lineage", "turetilmis", "kosul", "rapor"}
    akis_raw = request.args.get("akis")
    if akis_raw is None:
        secili_akislar = set(gecerli_akislar)
    else:
        secili_akislar = {a.strip() for a in akis_raw.split(",") if a.strip() in gecerli_akislar}

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT kk.column_id, kk.kolon_adi, kk.veri_tipi, kt.schema_adi, kt.tablo_adi
            FROM stage.katalog_kolon kk
            JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
            WHERE kk.table_id = %s AND UPPER(kk.kolon_adi) = UPPER(%s)
            ORDER BY CASE WHEN kk.kolon_adi = %s THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (table_id, kolon_adi, kolon_adi),
        )
        baslangic = cur.fetchone()
        if not baslangic:
            cur.close()
            conn.close()
            return jsonify({"hata": "kolon bulunamadı"}), 404

        baslangic_column_id = baslangic[0]
        seviye_haritasi = {baslangic_column_id: 0}
        etkilenenler = []
        etkilenen_raporlar = []
        kosul_kullanimlari = []
        kosul_hedef_kolonlari = []
        gorulen_kolonlar = {baslangic_column_id}
        frontier = {baslangic_column_id}
        etki_katman_sayilari = {}
        gorulen_deger_kenarlari = set()
        gorulen_rapor_kenarlari = set()
        gorulen_kosul_kullanimlari = set()
        gorulen_kosul_hedefleri = set()
        kosul_kullanimlari_aktif = True

        def tam_ad(schema, ad):
            return f"{schema}.{ad}" if schema else ad

        katman = 0
        while frontier:
            katman += 1
            kaynak_column_idler = list(frontier)
            sonraki_frontier = set()
            katman_kolonlari = set()

            if "lineage" in secili_akislar or "turetilmis" in secili_akislar:
                cur.execute(
                    """
                    SELECT DISTINCT
                           cl.kaynak_column_id,
                           skt.schema_adi AS kaynak_schema, skt.tablo_adi AS kaynak_tablo, sk.kolon_adi AS kaynak_kolon,
                           hkt.table_id AS hedef_table_id, hkt.schema_adi AS hedef_schema, hkt.tablo_adi AS hedef_tablo,
                           hk.column_id AS hedef_column_id, hk.kolon_adi AS hedef_kolon, hk.veri_tipi AS hedef_veri_tipi,
                           cl.donusum_tipi, cl.guven_seviyesi,
                           us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no
                    FROM stage.katalog_kolon_lineage cl
                    JOIN stage.katalog_kolon sk ON sk.column_id = cl.kaynak_column_id
                    JOIN stage.katalog_tablo skt ON skt.table_id = sk.table_id
                    JOIN stage.katalog_kolon hk ON hk.column_id = cl.hedef_column_id
                    JOIN stage.katalog_tablo hkt ON hkt.table_id = hk.table_id
                    LEFT JOIN stage.katalog_unit_statement us ON us.statement_id = cl.statement_id
                    LEFT JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
                    WHERE cl.kaynak_column_id = ANY(%s)
                    ORDER BY hedef_tablo, hedef_kolon
                    """,
                    (kaynak_column_idler,),
                )
                for r in cur.fetchall():
                    turetilmis_mi = r[10] == "TURETILMIS"
                    akis_tipi = "turetilmis" if turetilmis_mi else "lineage"
                    if akis_tipi not in secili_akislar:
                        continue
                    kaynak_column_id, hedef_column_id = r[0], r[7]
                    anahtar = (kaynak_column_id, hedef_column_id, r[12], r[10])
                    if anahtar not in gorulen_deger_kenarlari:
                        gorulen_deger_kenarlari.add(anahtar)
                        etkilenenler.append({
                            "seviye": katman,
                            "kaynak_tam_ad": tam_ad(r[1], r[2]),
                            "kaynak_kolon": r[3],
                            "hedef_table_id": r[4],
                            "hedef_tam_ad": tam_ad(r[5], r[6]),
                            "hedef_column_id": hedef_column_id,
                            "hedef_kolon": r[8],
                            "hedef_veri_tipi": r[9],
                            "donusum_tipi": r[10],
                            "guven_seviyesi": r[11],
                            "statement_id": r[12],
                            "paket_adi": r[13],
                            "procedure_adi": r[14],
                            "dml_tipi": r[15],
                            "satir_no": r[16],
                        })
                    if hedef_column_id not in seviye_haritasi:
                        seviye_haritasi[hedef_column_id] = katman
                    katman_kolonlari.add(hedef_column_id)
                    if hedef_column_id not in gorulen_kolonlar:
                        sonraki_frontier.add(hedef_column_id)

            if "rapor" in secili_akislar:
                cur.execute(
                    """
                    SELECT DISTINCT r.rapor_adi, rkl.rapor_kolon_adi,
                           kt.schema_adi, kt.tablo_adi, kk.kolon_adi, kk.column_id, rkl.donusum_tipi
                    FROM stage.katalog_rapor_kolon_lineage rkl
                    JOIN stage.katalog_rapor r ON r.rapor_id = rkl.rapor_id
                    JOIN stage.katalog_kolon kk ON kk.column_id = rkl.kaynak_column_id
                    JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
                    WHERE rkl.kaynak_column_id = ANY(%s)
                    ORDER BY r.rapor_adi, rkl.rapor_kolon_adi
                    """,
                    (kaynak_column_idler,),
                )
                for r in cur.fetchall():
                    anahtar = (r[5], r[0], r[1])
                    if anahtar in gorulen_rapor_kenarlari:
                        continue
                    gorulen_rapor_kenarlari.add(anahtar)
                    kaynak_seviye = seviye_haritasi.get(r[5], katman - 1)
                    etkilenen_raporlar.append({
                        "seviye": kaynak_seviye,
                        "rapor_adi": r[0],
                        "rapor_kolon_adi": r[1],
                        "kaynak_tam_ad": tam_ad(r[2], r[3]),
                        "kaynak_kolon": r[4],
                        "donusum_tipi": r[6],
                    })

            try:
                if "kosul" not in secili_akislar:
                    raise StopIteration
                cur.execute(
                    """
                    SELECT DISTINCT
                           kku.kaynak_column_id,
                           kt.schema_adi, kt.tablo_adi, kk.kolon_adi, kk.veri_tipi,
                           kku.kullanim_tipi, kku.ifade_metni, kku.guven_seviyesi,
                           us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no,
                           ht.schema_adi AS hedef_schema, ht.tablo_adi AS hedef_tablo,
                           r.rapor_adi
                    FROM stage.katalog_kolon_kullanim kku
                    JOIN stage.katalog_kolon kk ON kk.column_id = kku.kaynak_column_id
                    JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
                    LEFT JOIN stage.katalog_unit_statement us ON us.statement_id = kku.statement_id
                    LEFT JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
                    LEFT JOIN stage.katalog_tablo ht ON ht.table_id = COALESCE(kku.hedef_table_id, us.hedef_table_id)
                    LEFT JOIN stage.katalog_rapor r ON r.rapor_id = kku.rapor_id
                    WHERE kku.kaynak_column_id = ANY(%s)
                    ORDER BY kku.kullanim_tipi, hedef_tablo, r.rapor_adi, kt.tablo_adi, kk.kolon_adi
                    """,
                    (kaynak_column_idler,),
                )
                for r in cur.fetchall():
                    kaynak_seviye = seviye_haritasi.get(r[0], katman - 1)
                    anahtar = (r[0], r[5], r[8], r[15], r[6])
                    if anahtar in gorulen_kosul_kullanimlari:
                        continue
                    gorulen_kosul_kullanimlari.add(anahtar)
                    kosul_kullanimlari.append({
                        "seviye": kaynak_seviye,
                        "kaynak_tam_ad": tam_ad(r[1], r[2]),
                        "kaynak_kolon": r[3],
                        "kaynak_veri_tipi": r[4],
                        "kullanim_tipi": r[5],
                        "ifade_metni": r[6],
                        "guven_seviyesi": r[7],
                        "statement_id": r[8],
                        "paket_adi": r[9],
                        "procedure_adi": r[10],
                        "dml_tipi": r[11],
                        "satir_no": r[12],
                        "hedef_tam_ad": tam_ad(r[13], r[14]) if r[14] else None,
                        "rapor_adi": r[15],
                        "tur": "rapor" if r[15] else "sorgu",
                    })

                cur.execute(
                    """
                    SELECT DISTINCT
                           kku.kaynak_column_id,
                           kt.schema_adi, kt.tablo_adi, kk.kolon_adi, kk.veri_tipi,
                           kku.kullanim_tipi, kku.ifade_metni, kku.guven_seviyesi,
                           us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no,
                           hkt.schema_adi AS hedef_schema, hkt.tablo_adi AS hedef_tablo,
                           hk.column_id AS hedef_column_id, hk.kolon_adi AS hedef_kolon, hk.veri_tipi AS hedef_veri_tipi
                    FROM stage.katalog_kolon_kullanim kku
                    JOIN stage.katalog_kolon kk ON kk.column_id = kku.kaynak_column_id
                    JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
                    JOIN stage.katalog_unit_statement us ON us.statement_id = kku.statement_id
                    JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
                    JOIN stage.katalog_kolon_lineage kl ON kl.statement_id = kku.statement_id
                    JOIN stage.katalog_kolon hk ON hk.column_id = kl.hedef_column_id
                    JOIN stage.katalog_tablo hkt ON hkt.table_id = hk.table_id
                    WHERE kku.statement_id IS NOT NULL
                          AND kku.kaynak_column_id = ANY(%s)
                    ORDER BY kku.kullanim_tipi, hedef_tablo, hedef_kolon
                    """,
                    (kaynak_column_idler,),
                )
                for r in cur.fetchall():
                    kaynak_seviye = seviye_haritasi.get(r[0], katman - 1)
                    hedef_column_id = r[15]
                    anahtar = (r[0], hedef_column_id, r[5], r[8])
                    if anahtar not in gorulen_kosul_hedefleri:
                        gorulen_kosul_hedefleri.add(anahtar)
                        kosul_hedef_kolonlari.append({
                            "seviye": kaynak_seviye,
                            "hedef_seviye": katman,
                            "kaynak_tam_ad": tam_ad(r[1], r[2]),
                            "kaynak_kolon": r[3],
                            "kaynak_veri_tipi": r[4],
                            "kullanim_tipi": r[5],
                            "ifade_metni": r[6],
                            "guven_seviyesi": r[7],
                            "statement_id": r[8],
                            "paket_adi": r[9],
                            "procedure_adi": r[10],
                            "dml_tipi": r[11],
                            "satir_no": r[12],
                            "hedef_tam_ad": tam_ad(r[13], r[14]),
                            "hedef_column_id": hedef_column_id,
                            "hedef_kolon": r[16],
                            "hedef_veri_tipi": r[17],
                            "etki_tipi": "SATIR_SECIMI",
                            "tur": "tablo",
                        })
                    if hedef_column_id not in seviye_haritasi:
                        seviye_haritasi[hedef_column_id] = katman
                    katman_kolonlari.add(hedef_column_id)
                    if hedef_column_id not in gorulen_kolonlar:
                        sonraki_frontier.add(hedef_column_id)

                cur.execute(
                    """
                    SELECT DISTINCT
                           kku.kaynak_column_id,
                           kt.schema_adi, kt.tablo_adi, kk.kolon_adi, kk.veri_tipi,
                           kku.kullanim_tipi, kku.ifade_metni, kku.guven_seviyesi,
                           r.rapor_adi, rkl.rapor_kolon_adi, rkl.donusum_tipi
                    FROM stage.katalog_kolon_kullanim kku
                    JOIN stage.katalog_kolon kk ON kk.column_id = kku.kaynak_column_id
                    JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
                    JOIN stage.katalog_rapor r ON r.rapor_id = kku.rapor_id
                    JOIN stage.katalog_rapor_kolon_lineage rkl ON rkl.rapor_id = kku.rapor_id
                    WHERE kku.rapor_id IS NOT NULL
                          AND kku.kaynak_column_id = ANY(%s)
                    ORDER BY kku.kullanim_tipi, r.rapor_adi, rkl.rapor_kolon_adi
                    """,
                    (kaynak_column_idler,),
                )
                for r in cur.fetchall():
                    kaynak_seviye = seviye_haritasi.get(r[0], katman - 1)
                    anahtar = (r[0], r[8], r[9], r[5])
                    if anahtar in gorulen_kosul_hedefleri:
                        continue
                    gorulen_kosul_hedefleri.add(anahtar)
                    kosul_hedef_kolonlari.append({
                        "seviye": kaynak_seviye,
                        "hedef_seviye": katman,
                        "kaynak_tam_ad": tam_ad(r[1], r[2]),
                        "kaynak_kolon": r[3],
                        "kaynak_veri_tipi": r[4],
                        "kullanim_tipi": r[5],
                        "ifade_metni": r[6],
                        "guven_seviyesi": r[7],
                        "rapor_adi": r[8],
                        "hedef_tam_ad": r[8],
                        "hedef_kolon": r[9],
                        "hedef_veri_tipi": None,
                        "donusum_tipi": r[10],
                        "etki_tipi": "SATIR_SECIMI",
                        "tur": "rapor",
                    })
            except StopIteration:
                pass
            except psycopg2.errors.UndefinedTable:
                conn.rollback()
                kosul_kullanimlari_aktif = False

            etki_katman_sayilari[str(katman)] = len(katman_kolonlari)
            gorulen_kolonlar.update(sonraki_frontier)
            frontier = sonraki_frontier
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({
        "baslangic": {
            "column_id": baslangic[0],
            "kolon_adi": baslangic[1],
            "veri_tipi": baslangic[2],
            "tam_tablo_adi": (f"{baslangic[3]}.{baslangic[4]}" if baslangic[3] else baslangic[4]),
        },
        "etkilenenler": etkilenenler,
        "etkilenen_raporlar": etkilenen_raporlar,
        "kosul_kullanimlari": kosul_kullanimlari,
        "kosul_hedef_kolonlari": kosul_hedef_kolonlari,
        "kosul_kullanimlari_aktif": kosul_kullanimlari_aktif,
        "sorgu_etki_katman_sayilari": etki_katman_sayilari,
    })


@app.route("/api/alan_ara")
def api_alan_ara():
    """Verilen anahtar kelime(leri) HEM DWH tablolarının kolonlarında HEM
    raporların çıktı kolonlarında arar -- 'bu alan zaten bir yerde var mı'
    sorusuna cevap verir. Rapor sonuçları, o kolonun ARKASINDAKİ gerçek
    kaynak tablo.kolon'u da gösterir. Virgülle ayrılmış birden fazla terim
    girilirse (ör. 'customer_code, bakiye') HER terim ayrı ayrı aranır,
    HERHANGİ birine uyan satır sonuçlarda görünür (VEYA mantığı)."""
    q_ham = (request.args.get("q") or "").strip()
    if not q_ham:
        return jsonify({"hata": "aranacak bir kelime girin"}), 400

    terimler = [t.strip() for t in q_ham.split(",") if t.strip()]
    if not terimler:
        return jsonify({"hata": "aranacak bir kelime girin"}), 400
    desenler = [f"%{t}%" for t in terimler]

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT kt.schema_adi, kt.tablo_adi, kk.kolon_adi, kk.veri_tipi
            FROM stage.katalog_kolon kk
            JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
            WHERE kk.kolon_adi ILIKE ANY(%s)
            ORDER BY kt.tablo_adi, kk.kolon_sira NULLS LAST, kk.kolon_adi
            LIMIT 200
            """,
            (desenler,),
        )
        tablo_sonuclari = [
            {"schema_adi": r[0], "tablo_adi": r[1], "kolon_adi": r[2], "veri_tipi": r[3]}
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT r.rapor_adi, rkl.rapor_kolon_adi, kt.schema_adi, kt.tablo_adi, kk.kolon_adi, rkl.donusum_tipi
            FROM stage.katalog_rapor_kolon_lineage rkl
            JOIN stage.katalog_rapor r ON r.rapor_id = rkl.rapor_id
            JOIN stage.katalog_kolon kk ON kk.column_id = rkl.kaynak_column_id
            JOIN stage.katalog_tablo kt ON kt.table_id = kk.table_id
            WHERE rkl.rapor_kolon_adi ILIKE ANY(%s)
            ORDER BY r.rapor_adi, rkl.rapor_kolon_adi
            LIMIT 200
            """,
            (desenler,),
        )
        rapor_sonuclari = [
            {"rapor_adi": r[0], "rapor_kolon_adi": r[1],
             "kaynak_tam_ad": (f"{r[2]}.{r[3]}" if r[2] else r[3]), "kaynak_kolon": r[4],
             "donusum_tipi": r[5]}
            for r in cur.fetchall()
        ]

        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({"q": q_ham, "terimler": terimler, "tablo_sonuclari": tablo_sonuclari, "rapor_sonuclari": rapor_sonuclari})


@app.route("/api/etki")
def api_etki():
    """Verilen table_id'nin AŞAĞI YÖNDE etkilediği tabloları (bu tabloyu
    kaynak olarak kullanan statement'ların hedefleri, seviye seviye, döngü
    korumalı) döner. 'Bu tabloyu değiştirirsem hangi tablolar etkilenir'
    sorusuna cevap verir -- lineage ağacının TERSİ yönde."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT tablo_adi, schema_adi FROM stage.katalog_tablo WHERE table_id = %s", (table_id,))
        tablo_row = cur.fetchone()
        if not tablo_row:
            cur.close()
            conn.close()
            return jsonify({"hata": "tablo bulunamadı"}), 404

        cur.execute(
            """
            WITH RECURSIVE etki (seviye, kaynak_table_id, hedef_table_id, statement_id, yol) AS (
                SELECT 1, sk.kaynak_table_id, us.hedef_table_id, us.statement_id,
                       ARRAY[%s, us.hedef_table_id]
                FROM stage.katalog_statement_kaynak sk
                JOIN stage.katalog_unit_statement us ON us.statement_id = sk.statement_id
                WHERE sk.kaynak_table_id = %s AND us.hedef_table_id IS NOT NULL
                UNION ALL
                SELECT e.seviye + 1, sk.kaynak_table_id, us.hedef_table_id, us.statement_id,
                       e.yol || us.hedef_table_id
                FROM etki e
                JOIN stage.katalog_statement_kaynak sk ON sk.kaynak_table_id = e.hedef_table_id
                JOIN stage.katalog_unit_statement us ON us.statement_id = sk.statement_id
                WHERE e.seviye < 10 AND us.hedef_table_id IS NOT NULL
                      AND NOT (us.hedef_table_id = ANY(e.yol))
            )
            SELECT DISTINCT
                   e.seviye,
                   kt.table_id AS hedef_table_id, kt.schema_adi AS hedef_schema, kt.tablo_adi AS hedef_tablo,
                   ks.table_id AS kaynak_table_id, ks.schema_adi AS kaynak_schema, ks.tablo_adi AS kaynak_tablo,
                   us.statement_id, u.paket_adi, u.procedure_adi, us.dml_tipi, us.satir_no, us.sql_metni
            FROM etki e
            JOIN stage.katalog_tablo kt ON kt.table_id = e.hedef_table_id
            JOIN stage.katalog_tablo ks ON ks.table_id = e.kaynak_table_id
            JOIN stage.katalog_unit_statement us ON us.statement_id = e.statement_id
            JOIN stage.katalog_unit u ON u.unit_id = us.unit_id
            ORDER BY e.seviye, kt.tablo_adi, u.procedure_adi, us.satir_no
            """,
            (table_id, table_id),
        )
        rows = cur.fetchall()

        # Bu tabloyu VEYA aşağı yönde etkilenen herhangi bir tabloyu KAYNAK
        # olarak kullanan raporlar -- raporlar zaten "zincirin sonu" (başka
        # bir şeyi beslemiyorlar), bu yüzden recursive değil, tek ek sorgu.
        tum_etkilenen_table_idler = list({table_id} | {r[1] for r in rows})
        cur.execute(
            """
            SELECT DISTINCT r.rapor_adi, kt.tablo_adi
            FROM stage.katalog_rapor_kaynak rk
            JOIN stage.katalog_rapor r ON r.rapor_id = rk.rapor_id
            JOIN stage.katalog_tablo kt ON kt.table_id = rk.kaynak_table_id
            WHERE rk.kaynak_table_id = ANY(%s)
            ORDER BY r.rapor_adi
            """,
            (tum_etkilenen_table_idler,),
        )
        rapor_rows = cur.fetchall()

        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    etkilenenler = []
    for r in rows:
        sql_metni = r[12]
        etkilenenler.append({
            "seviye": r[0],
            "table_id": r[1],
            "schema_adi": r[2],
            "tablo_adi": r[3],
            "kaynak_table_id": r[4],
            "kaynak_schema_adi": r[5],
            "kaynak_tablo_adi": r[6],
            "statement_id": r[7],
            "paket_adi": r[8],
            "procedure_adi": r[9],
            "dml_tipi": r[10],
            "satir_no": r[11],
            "sql_metni": sql_metni,
            "sql_sade": sql_sade_gorunum(sql_metni) if sql_metni else None,
        })
    etkilenen_raporlar = [{"rapor_adi": r[0], "tablo_adi": r[1]} for r in rapor_rows]
    return jsonify({
        "tablo_adi": tablo_row[0], "schema_adi": tablo_row[1], "etkilenenler": etkilenenler,
        "etkilenen_raporlar": etkilenen_raporlar,
    })


@app.route("/api/cocuklar")
def api_cocuklar():
    """Verilen table_id'ye yazan TÜM statement'ların kaynaklarını döner.
    ?basit=1  -> subquery ayrımı yapmadan tekilleştirilmiş düz liste.
    ?basit=0  -> (varsayılan) KÖK (seviye 0) seviyesindeki doğrudan
                 tablolar + alt sorgu grupları (boş dallar budanmış)."""
    try:
        table_id = int(request.args.get("table_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir table_id gerekli"}), 400
    basit = request.args.get("basit", "0") == "1"

    try:
        conn = get_connection()
        cur = conn.cursor()

        if basit:
            cur.execute(
                """
                SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
                       ARRAY_AGG(DISTINCT us.statement_id ORDER BY us.statement_id) AS statement_ids
                FROM stage.katalog_unit_statement us
                JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
                JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
                WHERE us.hedef_table_id = %s
                GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
                ORDER BY kt.tablo_adi
                """,
                (table_id,),
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
            return jsonify({"tablolar": [
                {"table_id": r[0], "schema_adi": r[1], "tablo_adi": r[2], "katman": r[3],
                 "baglanti": _baglanti_olustur(table_id, r[0], r[4])}
                for r in rows
            ]})

        cur.execute(
            """
            SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
                   ARRAY_AGG(DISTINCT us.statement_id ORDER BY us.statement_id) AS statement_ids
            FROM stage.katalog_unit_statement us
            JOIN stage.katalog_statement_alt_sorgu als
                 ON als.statement_id = us.statement_id AND als.ust_alt_sorgu_id IS NULL
            JOIN stage.katalog_statement_kaynak sk ON sk.alt_sorgu_id = als.alt_sorgu_id
            JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
            WHERE us.hedef_table_id = %s
            GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
            ORDER BY kt.tablo_adi
            """,
            (table_id,),
        )
        direkt_rows = cur.fetchall()
        direkt_isimler = {r[2] for r in direkt_rows}

        cur.execute(
            """
            SELECT DISTINCT cocuk.alt_sorgu_id, cocuk.alias, cocuk.tip
            FROM stage.katalog_unit_statement us
            JOIN stage.katalog_statement_alt_sorgu root_als
                 ON root_als.statement_id = us.statement_id AND root_als.ust_alt_sorgu_id IS NULL
            JOIN stage.katalog_statement_alt_sorgu cocuk ON cocuk.ust_alt_sorgu_id = root_als.alt_sorgu_id
            WHERE us.hedef_table_id = %s
            ORDER BY cocuk.alt_sorgu_id
            """,
            (table_id,),
        )
        alt_sorgu_rows = cur.fetchall()
        dolu_harita = alt_sorgu_dolu_haritasi(cur)
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    # boş dalları buda: hem gerçekten hiçbir yerde tablo yoksa hem de
    # zaten "doğrudan" listede aynı isim varsa tekrar gösterme
    alt_sorgu_gruplari = [
        {"alt_sorgu_id": r[0], "alias": r[1], "tip": r[2]}
        for r in alt_sorgu_rows if dolu_harita.get(r[0], False)
    ]

    return jsonify({
        "direkt_tablolar": [
            {"table_id": r[0], "schema_adi": r[1], "tablo_adi": r[2], "katman": r[3],
             "baglanti": _baglanti_olustur(table_id, r[0], r[4])}
            for r in direkt_rows
        ],
        "alt_sorgu_gruplari": alt_sorgu_gruplari,
    })


@app.route("/api/alt_sorgu")
def api_alt_sorgu():
    """Verilen alt_sorgu_id'nin İÇİNDEKİ tabloları ve varsa İÇ İÇE (nested)
    alt sorgu gruplarını döner (boş dallar budanmış). exclude parametresiyle
    (virgülle ayrılmış tablo adları) üst seviyede zaten gösterilmiş
    tablolar tekrar listelenmez."""
    try:
        alt_sorgu_id = int(request.args.get("alt_sorgu_id", ""))
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli bir alt_sorgu_id gerekli"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman,
                   ARRAY_AGG(DISTINCT sk.statement_id ORDER BY sk.statement_id) AS statement_ids
            FROM stage.katalog_statement_kaynak sk
            JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
            WHERE sk.alt_sorgu_id = %s
            GROUP BY kt.table_id, kt.schema_adi, kt.tablo_adi, kt.katman
            ORDER BY kt.tablo_adi
            """,
            (alt_sorgu_id,),
        )
        direkt_rows = cur.fetchall()

        cur.execute(
            """
            SELECT alt_sorgu_id, alias, tip
            FROM stage.katalog_statement_alt_sorgu
            WHERE ust_alt_sorgu_id = %s
            ORDER BY alt_sorgu_id
            """,
            (alt_sorgu_id,),
        )
        alt_sorgu_rows = cur.fetchall()
        dolu_harita = alt_sorgu_dolu_haritasi(cur)
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    alt_sorgu_gruplari = [
        {"alt_sorgu_id": r[0], "alias": r[1], "tip": r[2]}
        for r in alt_sorgu_rows if dolu_harita.get(r[0], False)
    ]

    return jsonify({
        "direkt_tablolar": [
            {"table_id": r[0], "schema_adi": r[1], "tablo_adi": r[2], "katman": r[3],
             "statement_ids": list(r[4] or [])}
            for r in direkt_rows
        ],
        "alt_sorgu_gruplari": alt_sorgu_gruplari,
    })


@app.route("/api/agac_ara")
def api_agac_ara():
    """Sol ağaçta henüz açılmamış dallar dahil, verilen kökten aşağı doğru
    tablo adı arar ve bulunan tablolara giden açılabilir path'leri döner.
    Frontend bu path'leri sırayla açarak kullanıcıyı sonuca götürür."""
    q = (request.args.get("q") or "").strip().upper()
    basit = request.args.get("basit", "0") == "1"
    if len(q) < 2:
        return jsonify({"sonuclar": [], "kesildi": False})

    table_id_raw = request.args.get("table_id")
    rapor_id_raw = request.args.get("rapor_id")
    try:
        table_id = int(table_id_raw) if table_id_raw else None
        rapor_id = int(rapor_id_raw) if rapor_id_raw else None
    except (TypeError, ValueError):
        return jsonify({"hata": "geçerli table_id veya rapor_id gerekli"}), 400
    if table_id is None and rapor_id is None:
        return jsonify({"hata": "table_id veya rapor_id gerekli"}), 400

    maks_derinlik = 25
    maks_dugum = 900
    maks_sonuc = 30
    sonuclar = []
    durum = {"sayac": 0, "kesildi": False}

    def tablo_step(tid, tablo_adi, katman=None):
        return {"tip": "tablo", "table_id": tid, "tablo_adi": tablo_adi, "katman": katman}

    def alt_step(alt_sorgu_id, alias, tip):
        return {"tip": "altsorgu", "alt_sorgu_id": alt_sorgu_id, "alias": alias, "alt_tip": tip}

    def eslesiyor_mu(tablo_adi):
        return q in (tablo_adi or "").upper()

    def sonuc_ekle(path):
        son = next((p for p in reversed(path) if p.get("tip") == "tablo"), None)
        if not son:
            return
        sonuclar.append({"tablo_adi": son["tablo_adi"], "table_id": son["table_id"], "path": path})

    def limit_doldu_mu():
        if len(sonuclar) >= maks_sonuc or durum["sayac"] >= maks_dugum:
            durum["kesildi"] = True
            return True
        return False

    def tablo_ara(cur, tid, tablo_adi, katman, path, tablo_yolu, alt_yolu, derinlik, dolu_harita):
        if limit_doldu_mu() or derinlik > maks_derinlik:
            durum["kesildi"] = True
            return
        durum["sayac"] += 1
        yeni_path = path + [tablo_step(tid, tablo_adi, katman)]
        if eslesiyor_mu(tablo_adi):
            sonuc_ekle(yeni_path)
            if limit_doldu_mu():
                return
        if tid in tablo_yolu:
            return
        yeni_tablo_yolu = tablo_yolu | {tid}

        if basit:
            veri = _basit_cocuklar_getir_dahili(cur, tid)
            for c in veri["direkt_tablolar"]:
                tablo_ara(cur, c["table_id"], c["tablo_adi"], c.get("katman"), yeni_path, yeni_tablo_yolu, alt_yolu, derinlik + 1, dolu_harita)
                if limit_doldu_mu():
                    return
        else:
            veri = _cocuklar_getir_dahili(cur, tid, dolu_harita)
            for a in veri["alt_sorgu_gruplari"]:
                alt_ara(cur, a["alt_sorgu_id"], a.get("alias"), a.get("tip"), yeni_path, yeni_tablo_yolu, alt_yolu, derinlik + 1, dolu_harita)
                if limit_doldu_mu():
                    return
            for c in veri["direkt_tablolar"]:
                tablo_ara(cur, c["table_id"], c["tablo_adi"], c.get("katman"), yeni_path, yeni_tablo_yolu, alt_yolu, derinlik + 1, dolu_harita)
                if limit_doldu_mu():
                    return

    def alt_ara(cur, alt_sorgu_id, alias, tip, path, tablo_yolu, alt_yolu, derinlik, dolu_harita):
        if limit_doldu_mu() or derinlik > maks_derinlik or alt_sorgu_id in alt_yolu:
            return
        durum["sayac"] += 1
        yeni_path = path + [alt_step(alt_sorgu_id, alias, tip)]
        yeni_alt_yolu = alt_yolu | {alt_sorgu_id}
        veri = _alt_sorgu_getir_dahili(cur, alt_sorgu_id, dolu_harita)
        for a in veri["alt_sorgu_gruplari"]:
            alt_ara(cur, a["alt_sorgu_id"], a.get("alias"), a.get("tip"), yeni_path, tablo_yolu, yeni_alt_yolu, derinlik + 1, dolu_harita)
            if limit_doldu_mu():
                return
        for c in veri["direkt_tablolar"]:
            tablo_ara(cur, c["table_id"], c["tablo_adi"], c.get("katman"), yeni_path, tablo_yolu, yeni_alt_yolu, derinlik + 1, dolu_harita)
            if limit_doldu_mu():
                return

    try:
        conn = get_connection()
        cur = conn.cursor()
        dolu_harita = alt_sorgu_dolu_haritasi(cur) if not basit else {}

        if table_id is not None:
            cur.execute("SELECT tablo_adi, katman FROM stage.katalog_tablo WHERE table_id = %s", (table_id,))
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return jsonify({"hata": "tablo bulunamadı"}), 404
            tablo_ara(cur, table_id, row[0], row[1], [], set(), set(), 0, dolu_harita)
        else:
            cur.execute("SELECT rapor_adi FROM stage.katalog_rapor WHERE rapor_id = %s", (rapor_id,))
            rapor_row = cur.fetchone()
            if not rapor_row:
                cur.close()
                conn.close()
                return jsonify({"hata": "rapor bulunamadı"}), 404
            rapor_path = [{"tip": "rapor", "rapor_id": rapor_id, "rapor_adi": rapor_row[0]}]
            cur.execute(
                """
                SELECT DISTINCT kt.table_id, kt.tablo_adi, kt.katman
                FROM stage.katalog_rapor_kaynak rk
                JOIN stage.katalog_tablo kt ON kt.table_id = rk.kaynak_table_id
                WHERE rk.rapor_id = %s
                ORDER BY kt.tablo_adi
                """,
                (rapor_id,),
            )
            for tid, tablo_adi, katman in cur.fetchall():
                tablo_ara(cur, tid, tablo_adi, katman, rapor_path, set(), set(), 0, dolu_harita)
                if limit_doldu_mu():
                    break
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    return jsonify({"sonuclar": sonuclar, "kesildi": durum["kesildi"]})


HTML_SAYFA = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Katalog Lineage Görüntüleyici</title>
<style>
  :root {
    --navy: #1D8A5C; --navy-dark: #0F2A20; --ice: #E3F3EA; --slate: #6B7280;
    --amber: #C99A44; --coral: #C17B89; --teal: #1D8A5C; --lightbg: #F4F2EC; --text: #14171A;
  }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; background: #F4F2EC; margin: 0; padding: 0; color: var(--text); }
  .uygulama { max-width: 1600px; margin: 0 auto; padding: 20px 24px 32px 24px; }

  .ust-cubuk { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;
               padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid #E0E4F0; }
  .logo-alan { display: flex; align-items: center; gap: 12px; }
  .logo-svg { flex: none; }
  .uygulama-adi { font-size: 21px; font-weight: 700; color: var(--navy-dark); letter-spacing: 0.3px; }
  .uygulama-alt-yazi { font-size: 12px; color: var(--slate); margin-top: 1px; }

  .mod-toggle { display: flex; background: white; border-radius: 999px; overflow: hidden; padding: 3px;
                box-shadow: 0 2px 8px rgba(15,42,32,0.06); }
  .mod-buton { padding: 8px 22px; font-size: 13px; font-weight: 700; letter-spacing: 0.3px; border: none;
               border-radius: 999px; background: transparent; color: var(--slate); cursor: pointer; }
  .mod-buton.aktif { background: var(--navy-dark); color: white; }
  .mod-buton:not(.aktif):hover { color: var(--navy-dark); }

  .kriter-paneli { display: flex; align-items: center; justify-content: flex-end; gap: 12px;
                    padding: 12px 0; margin-bottom: 16px; }
  .kriter-etiket { font-size: 12px; font-weight: 700; color: var(--amber); letter-spacing: 0.5px; }
  #kriterInput { width: 300px; padding: 10px 18px; font-size: 14px; border: 1px solid #E4E7EC; border-radius: 999px;
                 background: white; }
  #kriterAraButon { padding: 10px 24px; font-size: 14px; background: var(--navy-dark); color: white; border: none;
                     border-radius: 999px; cursor: pointer; font-weight: 700; }
  #kriterAraButon:hover { background: #081A13; }

  .aciklama { color: var(--slate); font-size: 12.5px; margin-bottom: 14px; }
  .agac-ust-secenekler { display: flex; align-items: center; justify-content: space-between; gap: 10px;
                          margin-bottom: 10px; }
  .basit-secenek { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--slate);
                    cursor: pointer; user-select: none; }
  .basit-secenek input { cursor: pointer; }
  .diyagram-btn { font-size: 11.5px; font-weight: 800; color: #E8ECFB; background: var(--navy-dark);
                   border: 1px solid rgba(201,154,68,0.72); border-radius: 999px; padding: 6px 13px;
                   cursor: pointer; white-space: nowrap; box-shadow: inset 3px 0 0 var(--amber),
                   0 7px 16px rgba(5,30,21,0.12); }
  .diyagram-btn:hover { background: #081A13; border-color: var(--amber); }

  .diyagram-modal-arkaplan { display: none; position: fixed; inset: 0; background: rgba(10,20,16,0.55);
                              z-index: 1000; align-items: center; justify-content: center; }
  .diyagram-modal-arkaplan.acik { display: flex; }
  .diyagram-modal-kutu { background: white; border-radius: 18px; width: 92vw; height: 88vh;
                          display: flex; flex-direction: column; overflow: hidden;
                          box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
  .diyagram-modal-baslik { display: flex; align-items: center; justify-content: space-between;
                            padding: 14px 20px; border-bottom: 1px solid #ECEFF4; }
  .diyagram-modal-baslik span { font-size: 15px; font-weight: 700; color: var(--navy-dark); }
  .diyagram-filtre-satiri { display: flex; align-items: center; gap: 12px; padding: 10px 20px;
                             border-bottom: 1px solid #ECEFF4; background: var(--lightbg); flex-wrap: wrap; }
  .diyagram-filtre-baslik { font-size: 12px; font-weight: 700; color: var(--slate); }
  .diyagram-filtre-secenek { display: flex; align-items: center; gap: 5px; font-size: 12.5px;
                              font-weight: 600; color: var(--text); cursor: pointer; user-select: none; }
  .diyagram-filtre-secenek input { cursor: pointer; }
  .diyagram-filtre-ozet { font-size: 11px; color: var(--slate); font-style: italic; line-height: 1.25; }
  .diyagram-filtre-ayrac { width: 1px; height: 16px; background: #D8DCE6; }
  .diyagram-gorunum-secici { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px;
                              border: 1px solid #D8DCE6; background: rgba(255,255,255,0.72); }
  .diyagram-gorunum-btn { border: 0; border-radius: 999px; padding: 5px 11px; background: transparent;
                          color: var(--slate); cursor: pointer; font-size: 11.5px; font-weight: 800; }
  .diyagram-gorunum-btn:hover { background: var(--ice); color: var(--navy-dark); }
  .diyagram-gorunum-btn.aktif { background: var(--navy-dark); color: white; }
  .diyagram-arama-input { width: 210px; height: 28px; padding: 5px 10px; font-size: 12px;
                          border: 1px solid #D8DCE6; border-radius: 999px; background: white;
                          color: var(--navy-dark); outline: none; }
  .diyagram-arama-input:focus { border-color: var(--amber); box-shadow: 0 0 0 3px rgba(201,154,68,0.14); }
  .diyagram-arama-sayac { min-width: 32px; font-size: 11px; font-weight: 800; color: #8A6A1F; }
  .diyagram-arama-btn { flex: none; width: 26px; height: 26px; display: inline-flex; align-items: center;
                        justify-content: center; border: 1px solid #D8DCE6; border-radius: 999px;
                        background: rgba(255,255,255,0.78); color: var(--navy-dark); cursor: pointer;
                        font-size: 12px; font-weight: 900; }
  .diyagram-arama-btn:hover:not(:disabled) { background: var(--amber); border-color: var(--amber); color: white; }
  .diyagram-arama-btn:disabled { opacity: 0.38; cursor: default; }
  .diyagram-dugum-arama-eslesme { transform: scale(1.16); transform-box: fill-box; transform-origin: center;
                                  filter: drop-shadow(0 5px 8px rgba(201,154,68,0.38)); }
  .diyagram-dugum-arama-eslesme .diyagram-dugum-kutu { fill: #FFE7A6 !important; stroke: #C9822B !important;
                                                       stroke-width: 2.8 !important; }
  .diyagram-dugum-arama-eslesme text { fill: #14171A !important; font-weight: 900 !important; }
  .diyagram-dugum-arama-aktif { transform: scale(1.28); transform-box: fill-box; transform-origin: center;
                                filter: drop-shadow(0 7px 12px rgba(15,42,32,0.34)); }
  .diyagram-dugum-arama-aktif .diyagram-dugum-kutu { fill: #FFF1BF !important; stroke: #0F2A20 !important;
                                                     stroke-width: 3.2 !important; }
  .diyagram-radial-svg .diyagram-dugum-grup:hover .diyagram-dugum-kutu { stroke-width: 2.6;
                                                                         filter: drop-shadow(0 5px 8px rgba(15,42,32,0.18)); }
  .diyagram-legend { display: inline-flex; align-items: center; gap: 9px; padding: 4px 8px;
                     margin-left: auto;
                     border: 1px solid #D8DCE6; border-radius: 999px; background: rgba(255,255,255,0.62);
                     color: var(--slate); font-size: 10.5px; font-weight: 700; }
  .diyagram-legend-item { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .diyagram-legend-dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block;
                         border: 1.5px solid #C9A961; background: white; }
  .diyagram-legend-dot.dongu { border-color: #C17B89; background: #FBEAEE; }
  .diyagram-legend-dot.referans { border-color: #C7CEDB; background: #F0F3FA; }
  .diyagram-legend-dot.alt { border-color: #E4C878; background: #FBF3E1; border-style: dashed; }
  .diyagram-legend-dot.ex { border-color: #2C8C6E; background: #E5F3EE; }
  .diyagram-legend-dot.tr { border-color: #5B7FD9; background: #EAEEFB; }
  .diyagram-legend-dot.ld { border-color: #ADB5C4; background: #F2F3F6; }
  .diyagram-legend-dot.kaynak { border-color: #8B5FBF; background: #F1EBF8; }
  .diyagram-modal-araclar { display: flex; gap: 8px; }
  .diyagram-arac-btn { font-size: 12px; font-weight: 600; color: var(--navy-dark); background: var(--lightbg);
                        border: 1px solid #E4E7EC; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
  .diyagram-arac-btn:hover { background: var(--ice); }
  .diyagram-arac-btn.diyagram-kapat { background: white; }
  .diyagram-calisma-alani { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .diyagram-gorunum-panel { position: absolute; top: 22px; left: 16px; z-index: 4; width: 112px;
                            display: flex; flex-direction: column; gap: 7px; padding: 11px 10px;
                            border: 1px solid rgba(15,42,32,0.14); border-radius: 14px;
                            background: rgba(255,255,255,0.94); box-shadow: 0 10px 24px rgba(15,42,32,0.12);
                            transition: width 0.14s ease, height 0.14s ease, padding 0.14s ease, box-shadow 0.14s ease; }
  .diyagram-panel-baslik { border: 0; padding: 0; background: transparent; width: 100%;
                           display: flex; align-items: center; justify-content: space-between; gap: 6px;
                           color: var(--navy-dark); cursor: pointer; font: inherit;
                           font-size: 12px; font-weight: 800; text-align: left; }
  .diyagram-panel-baslik::after { content: "▾"; color: var(--slate); font-size: 10px; }
  .diyagram-panel-kapali .diyagram-panel-baslik::after { content: "▸"; }
  .diyagram-gorunum-panel.diyagram-panel-kapali,
  .diyagram-katman-panel.diyagram-panel-kapali { width: 44px; height: 44px; min-height: 44px; padding: 0;
                                                  border-radius: 14px; overflow: hidden; }
  .diyagram-panel-kapali .diyagram-panel-baslik { width: 44px; height: 44px; justify-content: center;
                                                   gap: 0; font-size: 0; text-align: center; }
  .diyagram-panel-kapali .diyagram-panel-baslik:hover { background: var(--ice); }
  .diyagram-panel-kapali .diyagram-panel-baslik::before { display: block; color: var(--navy-dark);
                                                           font-size: 19px; font-weight: 900; line-height: 1; }
  .diyagram-panel-kapali .diyagram-panel-baslik::after { display: none; }
  .diyagram-panel-kapali .diyagram-panel-baslik[data-diyagram-panel-toggle="gorunum"]::before { content: "👁"; font-size: 17px; }
  .diyagram-panel-kapali .diyagram-panel-baslik[data-diyagram-panel-toggle="katman"]::before { content: "▤"; }
  .diyagram-panel-icerik { display: flex; flex-direction: column; gap: 7px; }
  .diyagram-panel-kapali .diyagram-panel-icerik { display: none; }
  .diyagram-gorunum-panel .diyagram-filtre-baslik { color: var(--navy-dark); margin-bottom: 1px; }
  .diyagram-gorunum-panel .diyagram-gorunum-secici { display: flex; flex-direction: column; gap: 5px;
                                                       padding: 0; border: 0; border-radius: 0; background: transparent; }
  .diyagram-gorunum-panel .diyagram-gorunum-btn { width: 100%; border-radius: 9px; padding: 7px 8px;
                                                   text-align: left; }
  .diyagram-yerlesim-bolumu { display: flex; flex-direction: column; gap: 5px; }
  .diyagram-yerlesim-bolumu.gizli { display: none; }
  .diyagram-gorunum-panel .diyagram-yerlesim-secici { display: flex; flex-direction: column; gap: 5px; }
  .diyagram-yerlesim-ayrac { height: 1px; margin: 3px 0; background: #E0E4F0; }
  .diyagram-yerlesim-btn { width: 100%; border: 0; border-radius: 9px; padding: 7px 8px;
                           background: transparent; color: var(--slate); cursor: pointer;
                           text-align: left; font-size: 11px; font-weight: 800; }
  .diyagram-yerlesim-btn:hover { background: var(--ice); color: var(--navy-dark); }
  .diyagram-yerlesim-btn.aktif { background: var(--navy-dark); color: white; }
  .diyagram-alt-nav-grup { position: absolute; left: 50%; bottom: 18px; z-index: 4;
                           transform: translateX(-50%); display: inline-flex; flex-direction: column;
                           align-items: center; gap: 4px; pointer-events: none; }
  .diyagram-alt-nav-satir { display: inline-flex; align-items: center; gap: 5px; padding: 4px;
                            border-radius: 999px; border: 1px solid rgba(15,42,32,0.16);
                            background: rgba(255,255,255,0.94); box-shadow: 0 10px 24px rgba(15,42,32,0.14);
                            pointer-events: auto; }
  .diyagram-zoom-btn { border: 0; border-radius: 999px; width: 31px; height: 31px; padding: 0;
                       display: inline-flex; align-items: center; justify-content: center;
                       background: transparent; color: var(--navy-dark); cursor: pointer;
                       font-size: 16px; font-weight: 900; line-height: 1; }
  .diyagram-zoom-btn:hover { background: var(--ice); }
  .diyagram-zoom-btn svg { width: 18px; height: 18px; display: block; }
  .diyagram-zoom-reset-btn { border: 1px solid rgba(15,42,32,0.14); border-radius: 999px;
                             min-width: 44px; height: 19px; padding: 0 8px;
                             background: rgba(255,255,255,0.90); color: var(--slate); cursor: pointer;
                             font-size: 9.5px; font-weight: 900; box-shadow: 0 6px 16px rgba(15,42,32,0.10);
                             pointer-events: auto; }
  .diyagram-zoom-reset-btn:hover { background: var(--ice); color: var(--navy-dark); }
  .diyagram-kok-nav-btn { width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
                          border: 1px solid rgba(201,154,68,0.62); border-radius: 999px;
                          background: var(--navy-dark); color: white; cursor: pointer;
                          box-shadow: inset 0 0 0 3px rgba(255,255,255,0.08), 0 8px 18px rgba(15,42,32,0.20); }
  .diyagram-kok-nav-btn:hover { background: #081A13; border-color: var(--amber); }
  .diyagram-kok-nav-btn svg { width: 22px; height: 22px; display: block; }
  .diyagram-katman-panel { position: absolute; top: 22px; right: 16px; z-index: 4; width: 142px;
                           display: flex; flex-direction: column; gap: 7px; padding: 11px 12px;
                           border: 1px solid rgba(15,42,32,0.14); border-radius: 14px;
                           background: rgba(255,255,255,0.94); box-shadow: 0 10px 24px rgba(15,42,32,0.12);
                           transition: width 0.14s ease, height 0.14s ease, padding 0.14s ease, box-shadow 0.14s ease; }
  .diyagram-katman-panel .diyagram-filtre-baslik { color: var(--navy-dark); margin-bottom: 2px; }
  .diyagram-katman-panel .diyagram-filtre-secenek { font-size: 12px; justify-content: space-between;
                                                     padding: 4px 0; color: var(--navy-dark); }
  .diyagram-katman-panel .diyagram-filtre-secenek input { order: 2; }
  .diyagram-katman-panel .diyagram-filtre-ozet { margin-top: 2px; }
  .diyagram-katman-ayrac { height: 1px; margin: 5px 0 2px 0; background: #E0E4F0; }
  .diyagram-alt-sorgusuz-secenek { font-weight: 800; }
  .diyagram-baglanti-ozet { display: none; position: absolute; right: 16px; bottom: 18px; z-index: 4;
                            width: clamp(300px, 27vw, 420px); max-height: min(520px, calc(100% - 132px));
                            overflow: auto; padding: 0; border: 1px solid rgba(15,42,32,0.14);
                            border-radius: 10px; background: rgba(255,255,255,0.97);
                            box-shadow: 0 18px 44px rgba(15,42,32,0.18); color: var(--text); }
  .diyagram-baglanti-ozet.acik { display: block; }
  .diyagram-baglanti-ozet.kucuk { width: min(320px, calc(100% - 32px)); max-height: none;
                                  overflow: hidden; cursor: pointer; }
  .diyagram-baglanti-ozet.kucuk:hover { border-color: rgba(15,42,32,0.24);
                                         box-shadow: 0 20px 48px rgba(15,42,32,0.22); }
  .diyagram-baglanti-ust { position: sticky; top: 0; z-index: 1;
                           display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
                           padding: 12px 13px 10px 13px; background: rgba(255,255,255,0.98);
                           border-bottom: 1px solid rgba(15,42,32,0.10); }
  .diyagram-baglanti-eyebrow { font-size: 9px; font-weight: 900; letter-spacing: 0.8px;
                               color: var(--slate); margin-bottom: 5px; }
  .diyagram-baglanti-baslik { font-size: 13px; font-weight: 900; color: var(--navy-dark);
                              overflow-wrap: anywhere; line-height: 1.25; }
  .diyagram-baglanti-kucult { flex: none; border: 1px solid rgba(15,42,32,0.12); width: 30px; height: 30px;
                              display: inline-flex; align-items: center; justify-content: center;
                              border-radius: 8px; background: white; color: var(--slate); cursor: pointer;
                              font-size: 12px; font-weight: 900; }
  .diyagram-baglanti-kucult:hover { background: var(--ice); color: var(--navy-dark); border-color: rgba(15,42,32,0.20); }
  .diyagram-baglanti-sayilar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 11px 13px;
                               border-bottom: 1px solid rgba(15,42,32,0.08); background: #FAFBFD; }
  .diyagram-baglanti-sayi { border-radius: 8px; padding: 8px 9px; background: white;
                            border: 1px solid rgba(15,42,32,0.10); }
  .diyagram-baglanti-sayi.kaynak { box-shadow: inset 3px 0 0 #1D8A5C; }
  .diyagram-baglanti-sayi.hedef { box-shadow: inset 3px 0 0 #C9822B; }
  .diyagram-baglanti-sayi-deger { font-size: 18px; font-weight: 900; line-height: 1; color: var(--navy-dark); }
  .diyagram-baglanti-sayi-etiket { font-size: 9.5px; font-weight: 850; color: var(--slate); margin-top: 4px; }
  .diyagram-baglanti-grup { padding: 11px 13px 12px 13px; border-top: 1px solid rgba(15,42,32,0.08); }
  .diyagram-baglanti-grup:first-of-type { border-top: 0; }
  .diyagram-baglanti-grup-baslik { display: flex; align-items: center; justify-content: space-between;
                                   gap: 8px; font-size: 10.5px; font-weight: 900; letter-spacing: 0.2px;
                                   margin-bottom: 8px; color: var(--navy-dark); }
  .diyagram-baglanti-grup-baslik::before { content: ""; width: 7px; height: 7px; border-radius: 999px; flex: none; }
  .diyagram-baglanti-grup-baslik.kaynak::before { background: #1D8A5C; }
  .diyagram-baglanti-grup-baslik.hedef::before { background: #C9822B; }
  .diyagram-baglanti-grup-baslik span:first-child { flex: 1; min-width: 0; }
  .diyagram-baglanti-adet { flex: none; color: var(--slate); font-size: 10px; font-weight: 900;
                            border: 1px solid rgba(15,42,32,0.10); border-radius: 999px;
                            padding: 2px 7px; background: #FAFBFD; }
  .diyagram-baglanti-liste { display: flex; flex-direction: column; gap: 6px; }
  .diyagram-baglanti-madde { font-size: 11.5px; font-weight: 760; color: var(--navy-dark);
                             background: white; border: 1px solid rgba(15,42,32,0.10);
                             border-radius: 7px; padding: 8px 9px; overflow-wrap: anywhere; line-height: 1.25; }
  .diyagram-baglanti-madde.sql-var { cursor: pointer; }
  .diyagram-baglanti-madde.sql-var:hover { background: #FAFBFD; border-color: rgba(201,154,68,0.60);
                                            box-shadow: inset 3px 0 0 var(--amber); }
  .diyagram-baglanti-madde-ust { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .diyagram-baglanti-madde-ad { min-width: 0; }
  .diyagram-baglanti-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
                            margin-top: 5px; color: var(--slate); font-size: 9.5px; font-weight: 800; }
  .diyagram-baglanti-rozet { flex: none; border-radius: 999px; padding: 2px 6px;
                             background: #F2F4F7; color: var(--slate); font-size: 8.5px; font-weight: 900; }
  .diyagram-baglanti-rozet.sql { color: #8A6A1F; background: #FFF4D7; border: 1px solid rgba(201,154,68,0.24); }
  .diyagram-baglanti-bos { font-size: 11.5px; color: var(--slate); padding: 8px 1px; }
  .diyagram-baglanti-ozet { scrollbar-width: thin; scrollbar-color: #B8C2CF transparent; }
  .diyagram-baglanti-ozet::-webkit-scrollbar { width: 10px; height: 10px; }
  .diyagram-baglanti-ozet::-webkit-scrollbar-track { background: transparent; }
  .diyagram-baglanti-ozet::-webkit-scrollbar-thumb { background: #B8C2CF; border: 3px solid rgba(255,255,255,0.97);
                                                       border-radius: 999px; }
  .diyagram-baglanti-ozet::-webkit-scrollbar-thumb:hover { background: #8996A8; }
  .diyagram-baglanti-ozet::-webkit-scrollbar-button,
  .diyagram-baglanti-ozet::-webkit-scrollbar-button:single-button,
  .diyagram-modal-govde::-webkit-scrollbar-button,
  .diyagram-modal-govde::-webkit-scrollbar-button:single-button { display: none; width: 0; height: 0; background: transparent; }
  @media (max-width: 760px) {
    .diyagram-baglanti-ozet { left: 12px; right: 12px; bottom: 78px; width: auto;
                              max-height: min(430px, calc(100% - 154px)); }
    .diyagram-baglanti-ozet.kucuk { width: auto; }
  }
  .diyagram-modal-govde { flex: 1; overflow: auto; background: repeating-linear-gradient(0deg, #FAFBFD, #FAFBFD 24px, #F3F5F9 24px, #F3F5F9 25px),
                                                     repeating-linear-gradient(90deg, transparent, transparent 24px, #F3F5F9 24px, #F3F5F9 25px);
                           width: 100%; height: 100%; padding: 30px; cursor: grab;
                           scrollbar-width: thin; scrollbar-color: #AEB9C8 rgba(255,255,255,0.34); }
  .diyagram-modal-govde::-webkit-scrollbar { width: 13px; height: 13px; }
  .diyagram-modal-govde::-webkit-scrollbar-track { background: rgba(255,255,255,0.40); border-radius: 999px; }
  .diyagram-modal-govde::-webkit-scrollbar-thumb { background: #AEB9C8; border: 3px solid #FAFBFD; border-radius: 999px; }
  .diyagram-modal-govde::-webkit-scrollbar-thumb:hover { background: #7F8EA3; }
  .diyagram-modal-govde::-webkit-scrollbar-corner { background: transparent; }
  .diyagram-modal-govde::-webkit-scrollbar-button { display: none; width: 0; height: 0; background: transparent; }
  .diyagram-modal-govde.diyagram-pan-aktif { cursor: grabbing; user-select: none; }
  .diyagram-modal-govde button,
  .diyagram-modal-govde input { cursor: auto; }
  .diyagram-seviye-overlay { display: none; position: absolute; left: 0; right: 0; top: 0; z-index: 3;
                              height: 38px; pointer-events: none;
                              background: linear-gradient(180deg, rgba(250,251,253,0.94), rgba(250,251,253,0.72) 68%, rgba(250,251,253,0)); }
  .diyagram-seviye-overlay.acik { display: block; }
  .diyagram-seviye-overlay-btn { position: absolute; top: 6px; width: var(--seviye-btn-w, 112px);
                                 height: var(--seviye-btn-h, 23px); transform: translateX(-50%);
                                 border: 1px solid #E6D4AA; border-radius: 999px; background: rgba(255,255,255,0.88);
                                 color: #8A6A1F; cursor: pointer; pointer-events: auto;
                                 font-size: var(--seviye-btn-font, 11px); font-weight: 850;
                                 white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                                 box-shadow: 0 5px 12px rgba(15,42,32,0.08); }
  .diyagram-seviye-overlay-btn:hover { background: #FFF0DA; border-color: #C99A44; }
  .diyagram-seviye-overlay-btn.aktif { background: #0F2A20; border-color: #C99A44; color: white; }
  .diyagram-genislet-overlay { display: none; position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .diyagram-genislet-overlay.acik { display: block; }
  .diyagram-genislet-kolon { position: absolute; top: 50%; transform: translateY(-50%);
                             display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
  .diyagram-genislet-kolon.sol { left: 12px; }
  .diyagram-genislet-kolon.sag { right: 12px; }
  .diyagram-genislet-btn { width: 42px; height: 54px;
                           border: 1px solid rgba(201,154,68,0.72); border-radius: 999px;
                           background: rgba(15,42,32,0.92); color: white; cursor: pointer; pointer-events: auto;
                           font-size: 22px; font-weight: 900; box-shadow: 0 13px 30px rgba(15,42,32,0.22); }
  .diyagram-genislet-btn.azalt { height: 38px; background: rgba(255,255,255,0.94); color: var(--navy-dark);
                                 border-color: rgba(15,42,32,0.18); font-size: 20px; }
  .diyagram-genislet-btn:hover { background: #081A13; border-color: #C99A44; }
  .diyagram-genislet-btn.azalt:hover { background: var(--ice); border-color: rgba(201,154,68,0.72); }
  .diyagram-yukleniyor { display: flex; align-items: center; justify-content: center; height: 100%;
                          font-size: 14px; color: var(--slate); }
  /* Dugume tiklayinca: secili dugume giren/cikan oklar farkli renkte akan-
     cizgi animasyonuyla vurgulanir, alakasiz olanlar soluklastirilir. */
  @keyframes diyagramAkis { to { stroke-dashoffset: -16; } }
  .diyagram-kenar-gelen { stroke: #1D8A5C !important; stroke-width: 2.4 !important; stroke-dasharray: 6 4;
                           animation: diyagramAkis 0.5s linear infinite; opacity: 1 !important; }
  .diyagram-kenar-giden { stroke: #C9822B !important; stroke-width: 2.4 !important; stroke-dasharray: 6 4;
                           animation: diyagramAkis 0.5s linear infinite; opacity: 1 !important; }
  .diyagram-kenar-soluk { opacity: 0.15; }
  .diyagram-dugum-soluk { opacity: 0.35; }
  .diyagram-dugum-secili { filter: drop-shadow(0 7px 13px rgba(15,42,32,0.34)); opacity: 1 !important; }
  .diyagram-dugum-secili .diyagram-dugum-kutu,
  .diyagram-dugum-secili-cerceve { stroke: #14171A !important; stroke-width: 3.1 !important; }
  .diyagram-dugum-gelen,
  .diyagram-dugum-giden { opacity: 1 !important; filter: drop-shadow(0 5px 9px rgba(15,42,32,0.18)); }
  .diyagram-dugum-gelen .diyagram-dugum-kutu { fill: #E5F3EE !important; stroke: #1D8A5C !important;
                                                stroke-width: 2.6 !important; }
  .diyagram-dugum-giden .diyagram-dugum-kutu { fill: #FFF0DA !important; stroke: #C9822B !important;
                                                stroke-width: 2.6 !important; }
  .diyagram-dugum-gelen text,
  .diyagram-dugum-giden text { fill: #14171A !important; font-weight: 800 !important; }
  .diyagram-seviye-btn { cursor: pointer; }
  .diyagram-seviye-btn rect { fill: rgba(255,255,255,0.74); stroke: #E6D4AA; stroke-width: 1.1; }
  .diyagram-seviye-btn text { fill: #8A6A1F; font-weight: 850; }
  .diyagram-seviye-btn:hover rect { fill: #FFF0DA; stroke: #C99A44; }
  .diyagram-seviye-btn.aktif rect { fill: #0F2A20; stroke: #C99A44; stroke-width: 1.6; }
  .diyagram-seviye-btn.aktif text { fill: #FFFFFF; }
  .diyagram-uyari { background: #FBEAEE; color: #A24D5E; border: 1px solid #E9BFC8; border-radius: 10px;
                     padding: 10px 14px; font-size: 12.5px; margin-bottom: 14px; }

  .genel-bilgi-seridi { display: block; background: transparent; padding: 2px 0 12px 0; margin-bottom: 16px;
                         border-bottom: 1px solid rgba(15,42,32,0.16); }
  .genel-bilgi-seridi.rapor-ozet-kompakt { padding: 3px 0 12px 0; margin-bottom: 14px;
                                            border-bottom-color: rgba(201,154,68,0.42); }
  .rapor-ozet-kompakt .gbs-baslik { font-size: 20px; margin-bottom: 0; letter-spacing: 0.1px;
                                    display: flex; align-items: center; gap: 9px; }
  .rapor-ozet-kompakt .gbs-baslik::before { content: "RAPOR"; font-size: 10px; font-weight: 900;
                                            letter-spacing: 0.8px; color: white; background: var(--navy-dark);
                                            border-left: 4px solid var(--amber); border-radius: 999px;
                                            padding: 4px 9px 4px 10px; flex: none; }
  .rapor-ozet-kompakt .gbs-satirlar { gap: 12px; font-size: 11.5px; }
  .rapor-ozet-kompakt .gbs-sql-onizleme { margin-top: 5px; padding: 3px 0 3px 10px; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gbs-baslik { font-size: 15px; font-weight: 800; color: var(--navy-dark); margin-bottom: 6px; }
  .gbs-satirlar { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12.5px; color: var(--slate); }
  .gbs-satirlar b { color: var(--text); }
  .gbs-bos { font-size: 13px; color: var(--slate); font-style: italic; padding: 2px 0; }
  .gbs-sql-onizleme { font-family: 'Consolas', monospace; font-size: 11px; color: var(--slate);
                       margin-top: 6px; padding: 4px 0 4px 10px; border-left: 3px solid rgba(201,154,68,0.55); }

  .ana-alan { display: flex; gap: 20px; align-items: flex-start; }
  .agac-panel { flex: none; width: var(--agac-panel-genislik, 560px); min-width: 360px;
                max-width: min(960px, calc(100vw - 430px)); transition: width 0.18s ease; }
  .ana-alan.agac-kapali .agac-panel { width: 48px; min-width: 48px; max-width: 48px; }
  .detay-panel-sarici { flex: 1; min-width: 0; }

  .agac-kutu { background: #FFF7EA; border: 1px solid #F1E0BF; border-radius: 18px; padding: 14px 42px 18px 10px;
               box-shadow: 0 4px 20px rgba(88,64,24,0.07);
               min-height: 400px; max-height: calc(100vh - 160px); overflow: hidden; position: sticky; top: 20px;
               display: flex; flex-direction: column; }
  .ana-alan.agac-kapali .agac-kutu { padding: 10px 7px; overflow: hidden; }
  .agac-arama { display: flex; align-items: center; gap: 6px; margin-bottom: 9px; padding-right: 2px; }
  #agacAramaInput { flex: 1; min-width: 0; height: 30px; padding: 6px 10px; font-size: 12px;
                    border: 1px solid #E5D0A5; border-radius: 999px; color: var(--navy-dark);
                    background: rgba(255,255,255,0.82); outline: none; }
  #agacAramaInput:focus { border-color: var(--amber); box-shadow: 0 0 0 3px rgba(201,154,68,0.16); }
  #agacAramaInput.agac-arama-yok { border-color: rgba(193,123,137,0.75); box-shadow: 0 0 0 3px rgba(193,123,137,0.12); }
  .agac-arama-sayac { flex: none; min-width: 38px; color: #8A6A1F; font-size: 11px; font-weight: 800; text-align: center; }
  .agac-arama-btn { flex: none; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
                    border: 1px solid #E5D0A5; border-radius: 999px; background: rgba(255,255,255,0.78);
                    color: var(--navy-dark); cursor: pointer; font-size: 12px; font-weight: 900; }
  .agac-arama-btn:hover:not(:disabled) { background: var(--amber); border-color: var(--amber); color: white; }
  .agac-arama-btn:disabled { opacity: 0.38; cursor: default; }
  .ana-alan.agac-kapali #agacAlani,
  .ana-alan.agac-kapali .agac-arama,
  .ana-alan.agac-kapali .basit-secenek,
  .ana-alan.agac-kapali .diyagram-btn { display: none; }
  .ana-alan.agac-kapali .agac-ust-secenekler { justify-content: center; margin-bottom: 0; }
  .agac-daralt-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
                     width: 34px; height: 56px; display: inline-flex; align-items: center; justify-content: center;
                     border: 1px solid rgba(201,154,68,0.72); border-radius: 999px; background: var(--navy-dark);
                     color: #E8ECFB; cursor: pointer; font-size: 20px; font-weight: 800;
                     box-shadow: 0 10px 22px rgba(5,30,21,0.18); z-index: 5; }
  .agac-daralt-btn:hover { background: #081A13; border-color: var(--amber); }
  .ana-alan.agac-kapali .agac-daralt-btn { right: 7px; }
  .agac-resize-tutamac { position: absolute; top: 0; right: 0; bottom: 0; width: 10px;
                         cursor: col-resize; z-index: 4; border-radius: 0 18px 18px 0; }
  .agac-resize-tutamac::after { content: ""; position: absolute; top: 18px; bottom: 18px; right: 3px;
                                width: 2px; border-radius: 999px; background: rgba(201,154,68,0.0);
                                transition: background 0.12s ease; }
  .agac-resize-tutamac:hover::after,
  body.agac-resize-aktif .agac-resize-tutamac::after { background: rgba(201,154,68,0.65); }
  body.agac-resize-aktif { cursor: col-resize; user-select: none; }
  body.agac-resize-aktif .agac-panel { transition: none; }
  .ana-alan.agac-kapali .agac-resize-tutamac { display: none; }
  #agacAlani { min-height: 60px; overflow: auto; flex: 1; padding-right: 4px; }
  .hata-mesaj { text-align: center; color: var(--coral); padding: 20px; }
  .bilgi-mesaj { text-align: center; color: var(--slate); padding: 20px; font-size: 13px; }

  ul.agac { list-style: none; margin: 0; padding-left: 0; }
  ul.agac ul.agac { padding-left: 22px; border-left: 1px dashed #D5D9E6; margin-left: 9px; }

  .dugum-satir { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 5px; cursor: pointer; user-select: none; }
  .dugum-satir:hover { background: var(--lightbg); }
  .dugum-satir.kok { cursor: default; }
  .dugum-satir.kok:hover { background: none; }

  .toggle-ikon { width: 16px; height: 16px; flex: none; display: flex; align-items: center; justify-content: center;
                 color: var(--slate); font-size: 10px; transition: transform 0.15s ease; }
  .toggle-ikon.acik { transform: rotate(90deg); }
  .toggle-bos { width: 16px; flex: none; }

  .altsorgu-satir { width: max-content; min-width: max-content; padding: 3px 6px 3px 3px; background: transparent;
                    border-left: 2px solid rgba(201,154,68,0.46); border-radius: 0 7px 7px 0; }
  .altsorgu-satir:hover { background: rgba(201,154,68,0.08); }
  .altsorgu-satir .toggle-ikon { color: #A97718; font-size: 9px; }
  .altsorgu-etiket { display: inline-flex; align-items: center; gap: 6px; flex: none;
                     min-width: max-content; white-space: nowrap;
                     font-size: 11.5px; font-weight: 700; color: #725116;
                     padding: 2px 8px; border-radius: 4px;
                     background: rgba(201,154,68,0.11); border: 1px solid rgba(201,154,68,0.24); }
  .altsorgu-etiket::before { content: "SQL"; flex: none; font-size: 8px; line-height: 1;
                             color: #8A6A1F; background: rgba(255,255,255,0.62);
                             border: 1px solid rgba(201,154,68,0.28); border-radius: 999px;
                             padding: 2px 5px; letter-spacing: 0.3px; }
  .altsorgu-ad { white-space: nowrap; }

  .tablo-adi { font-size: 13.5px; font-weight: 600; color: var(--navy-dark); padding: 3px 8px; border-radius: 4px; border: 1px solid transparent; cursor: pointer; }
  .tablo-adi:hover { background: var(--ice); }
  .tablo-adi-secili { background: var(--navy-dark) !important; color: #E8ECFB !important;
                      border-color: rgba(201,154,68,0.75) !important; box-shadow: inset 3px 0 0 var(--amber); }
  .agac-arama-eslesme { background: rgba(201,154,68,0.18) !important; border-color: rgba(201,154,68,0.62) !important; }
  .agac-arama-aktif { background: var(--amber) !important; color: white !important;
                      border-color: var(--amber) !important; box-shadow: 0 0 0 3px rgba(201,154,68,0.22); }
  .kok .tablo-adi { font-size: 16px; background: var(--navy-dark); color: white; padding: 7px 16px; border-radius: 999px; }
  .dongu .tablo-adi { color: var(--coral); background: #FBEAE6; border-color: #F0C4B8; cursor: default; }
  .dongu .tablo-adi:hover { background: #FBEAE6; }
  .yaprak .tablo-adi { border: 1px solid #E4E7F0; background: var(--lightbg); }

  /* KOLON modu agac dugumleri */
  .kok-kolon-etiket { font-size: 16px; font-weight: 700; background: var(--amber); color: white;
                       padding: 7px 16px; border-radius: 999px; }
  /* RAPOR modu agac kokü */
  .kok-rapor-etiket { font-size: 16px; font-weight: 700; background: var(--navy-dark); color: #E8ECFB;
                       padding: 7px 16px 7px 18px; border-radius: 999px; border: 1px solid rgba(201,154,68,0.62);
                       box-shadow: inset 4px 0 0 var(--amber); }
  .grup-etiket { font-size: 12.5px; font-weight: 700; color: var(--navy-dark); padding: 3px 10px; border-radius: 999px; }
  .grup-adet { font-size: 10px; color: var(--slate); font-weight: 400; margin-left: 4px; }
  .esleme-satir { display: flex; align-items: center; gap: 8px; padding: 3px 8px; }
  .esleme-tablo-kolon { font-size: 13px; font-weight: 600; color: var(--navy-dark); cursor: pointer;
                         padding: 3px 10px; border-radius: 999px; border: 1px solid transparent; }
  .esleme-tablo-kolon:hover { background: var(--ice); }
  .esleme-rapor { font-size: 13px; color: var(--text); }
  .esleme-rapor-kaynak { font-size: 11px; color: var(--slate); }
  .esleme-incele-btn { font-size: 10.5px; color: var(--teal, #1D8A5C); cursor: pointer; font-weight: 600;
                        white-space: nowrap; }
  .esleme-incele-btn:hover { text-decoration: underline; }

  .dongu-etiket { font-size: 10.5px; color: var(--coral); font-style: italic; }
  .yukleniyor-ikon { font-size: 11px; color: var(--slate); font-style: italic; padding-left: 4px; }
  .cocuk-yok { font-size: 11.5px; color: var(--slate); font-style: italic; padding: 3px 8px 3px 24px; }

  .yeni-pencere-btn { flex: none; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
                       border-radius: 4px; color: var(--slate); font-size: 13px; opacity: 0; transition: opacity 0.1s; }
  .dugum-satir:hover .yeni-pencere-btn { opacity: 1; }
  .yeni-pencere-btn:hover { background: var(--ice); color: var(--navy-dark); }
  .kok .yeni-pencere-btn { opacity: 0.7; }

  .sql-tooltip { display: none; position: fixed; z-index: 1000; max-width: 620px; max-height: 440px;
                 overflow-y: auto; background: var(--navy-dark); color: #E8ECFB; border-radius: 18px;
                 padding: 0; box-shadow: 0 8px 28px rgba(0,0,0,0.4);
                 scrollbar-width: thin; scrollbar-color: #050806 rgba(255,255,255,0.06); }
  .sql-tooltip-yukleniyor { font-size: 12.5px; color: #B7C0E0; font-style: italic; padding: 14px; }
  .sql-explorer-baslik { text-align: center; padding: 9px 14px; font-weight: 700; font-size: 12.5px;
                          letter-spacing: 3px; color: #E8ECFB; border-bottom: 1px solid rgba(255,255,255,0.15); }
  .sql-explorer-alan { padding: 10px 16px 4px 16px; }
  .sql-explorer-satir { font-size: 12px; margin-bottom: 5px; }
  .sql-explorer-etiket { color: var(--amber); }
  .sql-explorer-kaynaklar-baslik { color: var(--amber); font-size: 12px; margin: 8px 0 3px 0; }
  .sql-explorer-kaynak-madde { font-size: 12px; padding-left: 12px; margin-bottom: 3px; color: #D8DEEF; }
  .sql-explorer-ayrac { border: none; border-top: 1px solid rgba(255,255,255,0.15); margin: 10px 0 0 0; }
  .sql-explorer-govde-alan { padding: 10px 16px 14px 16px; }
  .sql-explorer-not { font-size: 10.5px; color: var(--slate); font-style: italic; margin-bottom: 6px; }
  .sql-tooltip-govde { font-family: 'Consolas', monospace; font-size: 13.5px; line-height: 1.65;
                        white-space: pre-wrap; word-break: break-word; margin: 0; color: #C9CEDB; }
  .sql-vurgu { background: #F5D90A; color: #141B47; font-weight: 700; border-radius: 2px; padding: 0 1px; }
  .sql-tok-kw { color: #7FB3E8; font-weight: 700; }
  .sql-tok-str { color: #CE9178; }
  .sql-tok-comment { color: #7A88A0; font-style: italic; }
  .sql-tok-num { color: #D19A66; }

  .kolon-ikon-btn { flex: none; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
                     border-radius: 4px; color: var(--slate); font-size: 13px; opacity: 0; transition: opacity 0.1s; }
  .dugum-satir:hover .kolon-ikon-btn { opacity: 1; }
  .kolon-ikon-btn:hover { background: var(--ice); color: var(--navy-dark); }
  .kolon-ikon-btn.aktif { opacity: 1; background: var(--amber); color: white; }

  .kolon-paneli { display: none; position: fixed; z-index: 1000; width: 320px; max-height: 70vh;
                  top: 90px; right: 20px;
                  overflow-y: auto; background: var(--navy-dark); color: #E8ECFB; border-radius: 18px;
                  box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
  .kolon-paneli-baslik { padding: 10px 14px; font-weight: 700; font-size: 12.5px; color: white;
                          border-bottom: 1px solid rgba(255,255,255,0.15); }
  .kolon-paneli-liste { padding: 6px 0; }
  .kolon-paneli-satir { display: flex; align-items: center; gap: 8px; padding: 4px 14px; font-size: 12px; }
  .kolon-paneli-sira { color: var(--slate); font-size: 10.5px; width: 22px; text-align: right; flex: none; }
  .kolon-paneli-ad { color: #E8ECFB; flex: 1; }
  .kolon-paneli-tip { color: var(--amber); font-size: 11px; flex: none; }
  .kolon-etki-hizli-btn { flex: none; border: 1px solid rgba(112,215,162,0.22); border-radius: 999px;
                          padding: 2px 7px; background: rgba(112,215,162,0.08); color: #70D7A2;
                          cursor: pointer; font-size: 9.5px; font-weight: 850; opacity: 0; }
  .kolon-paneli-satir:hover .kolon-etki-hizli-btn,
  .kolon-satir-vurgulu .kolon-etki-hizli-btn { opacity: 1; }
  .kolon-etki-hizli-btn:hover { background: rgba(112,215,162,0.18); }
  .kolon-paneli-bos { padding: 14px; font-size: 12px; color: #B7C0E0; font-style: italic; }
  .kolon-satir-vurgulu { background: rgba(245,217,10,0.12); border-radius: 6px; }

  .inspector-panel { display: block; width: 100%; min-height: 400px;
                      position: sticky; top: 20px;
                      overflow-y: auto; background: var(--navy-dark); color: #E8ECFB; border-radius: 18px;
                      box-shadow: 0 4px 20px rgba(15,42,32,0.08); }
  .inspector-bos-durum { display: flex; align-items: center; justify-content: center; height: 400px;
                          color: var(--slate); font-size: 13px; font-style: italic; }
  .inspector-baslik-satir { display: flex; align-items: center; justify-content: space-between;
                             padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.15); }
  .inspector-baslik-metin { font-weight: 700; font-size: 13px; color: white; }
  .inspector-kapat-btn { cursor: pointer; color: var(--slate); font-size: 14px; padding: 2px 6px; border-radius: 4px; }
  .inspector-kapat-btn:hover { background: rgba(255,255,255,0.1); color: white; }
  .inspector-sekme-bar { display: flex; border-bottom: 1px solid rgba(255,255,255,0.15); padding: 0 8px; }
  .inspector-sekme { padding: 8px 10px; font-size: 11.5px; color: var(--slate); cursor: pointer;
                      border-bottom: 2px solid transparent; white-space: nowrap; }
  .inspector-sekme:hover { color: #E8ECFB; }
  .inspector-sekme.aktif { color: var(--amber); border-bottom-color: var(--amber); font-weight: 700; }
  .inspector-sekme.devre-disi { color: #445; cursor: default; }
  .inspector-sekme.devre-disi:hover { color: #445; }
  .inspector-alt-sekme-bar { display: flex; gap: 6px; margin-bottom: 12px; }
  .inspector-alt-sekme { padding: 5px 12px; font-size: 11px; color: var(--slate); cursor: pointer;
                          border-radius: 14px; background: rgba(255,255,255,0.06); }
  .inspector-alt-sekme:hover { background: rgba(255,255,255,0.12); color: #E8ECFB; }
  .inspector-alt-sekme.aktif { background: var(--amber); color: white; font-weight: 700; }
  .inspector-icerik { padding: 12px 14px; }
  .inspector-bos { font-size: 12px; color: #B7C0E0; font-style: italic; }
  .inspector-genel-satir { font-size: 12.5px; margin-bottom: 6px; }
  .inspector-genel-alt-baslik { color: var(--amber); font-size: 12px; margin: 10px 0 4px 0; }
  .inspector-genel-liste-satir { font-size: 12px; padding-left: 6px; margin-bottom: 3px; color: #D8DEEF; }
  .inspector-genel-dml { color: var(--slate); font-size: 10.5px; }
  .inspector-sql-secici { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .inspector-sql-grup { margin-bottom: 4px; }
  .inspector-sql-grup-baslik { font-size: 10.5px; font-weight: 800; color: var(--amber);
                                margin: 9px 0 4px 0; letter-spacing: 0.2px; overflow-wrap: anywhere; }
  .inspector-sql-grup-baslik:first-child { margin-top: 0; }
  .inspector-sql-secenek { display: flex; align-items: center; justify-content: space-between; gap: 8px;
                            padding: 9px 10px; margin-bottom: 7px; font-size: 11.5px; cursor: pointer;
                            color: #D8DEEF; border: 1px solid rgba(201,154,68,0.20); border-radius: 10px;
                            background: rgba(201,154,68,0.045); overflow-wrap: anywhere; }
  .inspector-sql-secenek:hover { background: rgba(201,154,68,0.075); }
  .inspector-sql-secenek.aktif { border-left: 3px solid var(--amber); background: rgba(201,154,68,0.12);
                                  color: white; font-weight: 700; }
  .inspector-sql-secenek-metin { min-width: 0; }
  .inspector-sql-format-notu { font-size: 10px; color: #B7C0E0; margin: -1px 0 7px 0; }
  .inspector-sql-format-notu b { color: #D8DEEF; }
  .inspector-sql-format-notu .ok { color: var(--amber); font-weight: 900; margin: 0 5px; }
  .inspector-sql-alan { border-top: 1px solid rgba(255,255,255,0.12); padding-top: 10px; }
  .inspector-rol-yazan { font-size: 9px; font-weight: 700; color: #2C8C6E; background: rgba(44,140,110,0.15);
                          border-radius: 999px; padding: 2px 8px; margin-right: 2px; }
  .inspector-rol-kullanilan { font-size: 9px; font-weight: 700; color: var(--amber); background: rgba(201,154,68,0.15);
                               border-radius: 999px; padding: 2px 8px; margin-right: 2px; }
  .dml-badge { flex: none; font-size: 9px; font-weight: 800; border-radius: 999px; padding: 2px 7px; }
  .dml-insert { color: #70D7A2; background: rgba(44,140,110,0.18); }
  .dml-update { color: #86B7FF; background: rgba(91,127,217,0.20); }
  .dml-delete { color: #F0A1AE; background: rgba(193,123,137,0.20); }
  .dml-truncate { color: #F3BD5B; background: rgba(201,154,68,0.20); }
  .dml-merge { color: #CDB7FF; background: rgba(139,95,191,0.22); }
  .dml-diger { color: var(--amber); background: rgba(201,154,68,0.14); }
  .sorgu-satir-notu { font-size: 10.5px; color: var(--slate); margin-bottom: 8px; }
  .sorgu-satir-notu b { color: #D8DEEF; }
  .sorgu-ad-schema { color: #D8DEEF; font-weight: 800; }
  .sorgu-ad-ayrac { display: inline-block; height: 0.85em; border-left: 1px solid rgba(255,255,255,0.24);
                    margin: 0 6px; vertical-align: -0.1em; }
  .sorgu-ad-tablo { color: #E8ECFB; font-weight: 800; }
  .sorgu-kaynak-listesi { display: flex; flex-direction: column; gap: 7px; margin-bottom: 10px; }
  .sorgu-kaynak-satir { font-size: 11px; color: #C9CEDB; padding: 7px 9px; border-radius: 9px;
                        border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.03);
                        overflow-wrap: anywhere; }
  .sorgu-kaynak-detay { margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.10);
                        border-radius: 9px; background: rgba(255,255,255,0.025); overflow: hidden; }
  .sorgu-kaynak-detay summary { cursor: pointer; list-style: none; padding: 8px 9px;
                                color: var(--amber); font-size: 11px; font-weight: 800; }
  .sorgu-kaynak-detay summary::-webkit-details-marker { display: none; }
  .sorgu-kaynak-detay summary:hover { background: rgba(255,255,255,0.04); }
  .sorgu-kaynak-detay[open] summary { border-bottom: 1px solid rgba(255,255,255,0.10); }
  .sorgu-kaynak-detay .sorgu-kaynak-listesi { padding: 8px; margin-bottom: 0; }

  .sql-bolum-baslik { font-size: 10.5px; font-weight: 800; color: var(--amber); margin: 10px 0 6px 0; }
  .inspector-gorunum-secici { display: inline-flex; gap: 2px; margin: 0 0 8px 0; padding: 3px;
                              border: 1px solid rgba(255,255,255,0.12); border-radius: 999px;
                              background: rgba(255,255,255,0.035); }
  .inspector-gorunum-btn { padding: 5px 12px; font-size: 11px; color: var(--slate); cursor: pointer;
                            border-radius: 999px; }
  .inspector-gorunum-btn:hover { background: rgba(255,255,255,0.10); color: #E8ECFB; }
  .inspector-gorunum-btn.aktif { background: var(--amber); color: white; font-weight: 800; }

  .inspector-filtre { width: 100%; padding: 6px 10px; font-size: 12px; margin-bottom: 10px;
                       background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15);
                       border-radius: 5px; color: #E8ECFB; }
  .inspector-filtre::placeholder { color: var(--slate); }
  .cl-satir { padding: 6px 8px; border-radius: 5px; margin-bottom: 4px; background: rgba(255,255,255,0.03); }
  .cl-hedef-kolon { font-size: 12px; font-weight: 700; color: #E8ECFB; }
  .cl-hedef-kolon .inspector-genel-dml { margin-left: 4px; }
  .cl-kaynak-satir { font-size: 11px; color: #C9CEDB; padding: 2px 0 2px 14px; }
  .cl-donusum-direkt { font-size: 9px; font-weight: 700; color: #2C8C6E; background: rgba(44,140,110,0.15);
                        border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
  .cl-donusum-turetilmis { font-size: 9px; font-weight: 700; color: var(--coral); background: rgba(193,123,137,0.15);
                            border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
  .cl-tahmin { font-size: 9px; color: var(--slate); font-style: italic; margin-left: 4px; }
  .cl-ozet { font-size: 11px; color: var(--slate); margin-bottom: 10px; }

  .etki-seviye-baslik { font-size: 11px; font-weight: 700; color: var(--amber); margin: 12px 0 4px 0; }
  .etki-seviye-baslik:first-child { margin-top: 0; }
  .etki-satir { font-size: 12px; color: #D8DEEF; padding: 3px 0 3px 8px; }
  .etki-ust-ozet { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 10px; }
  .etki-ozet-kutu { border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; padding: 7px 8px;
                    background: rgba(255,255,255,0.035); }
  .etki-ozet-sayi { font-size: 15px; font-weight: 800; color: #E8ECFB; line-height: 1.1; }
  .etki-ozet-etiket { font-size: 9.5px; color: var(--slate); margin-top: 2px; }
  .etki-format-not { font-size: 10.5px; color: var(--slate); margin: -3px 0 10px 0; }
  .etki-format-not b { color: #D8DEEF; }
  .etki-format-not .ayrac { display: inline-block; height: 0.8em; border-left: 1px solid rgba(255,255,255,0.28);
                            margin: 0 6px; vertical-align: -0.1em; }
  .kolon-etki-kutusu { border: 1px solid rgba(44,140,110,0.24); border-radius: 12px; padding: 10px 11px;
                       margin-bottom: 14px; background: rgba(44,140,110,0.055); }
  .kolon-etki-baslik { font-size: 11px; font-weight: 900; color: #70D7A2; margin-bottom: 7px; }
  .kolon-etki-form { display: flex; gap: 7px; margin-bottom: 8px; }
  .kolon-etki-input { flex: 1; min-width: 0; height: 30px; padding: 6px 10px; font-size: 12px;
                      border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
                      background: rgba(255,255,255,0.06); color: #E8ECFB; outline: none; }
  .kolon-etki-input::placeholder { color: var(--slate); }
  .kolon-etki-input:focus { border-color: rgba(112,215,162,0.55); box-shadow: 0 0 0 3px rgba(112,215,162,0.10); }
  .kolon-etki-btn { flex: none; border: 0; border-radius: 8px; padding: 0 10px; min-width: 58px;
                    background: #2C8C6E; color: white; cursor: pointer; font-size: 11px; font-weight: 900; }
  .kolon-etki-btn:hover { background: #24795F; }
  .kolon-etki-kutusu .inspector-bos { padding: 4px 0 0 0; }
  .etki-tablo-grup { border: 1px solid rgba(201,154,68,0.20); border-radius: 10px; margin-bottom: 9px;
                      background: rgba(201,154,68,0.045); overflow: hidden; }
  .etki-tablo-grup[open] { border-left: 3px solid var(--amber); background: rgba(201,154,68,0.075); }
  .etki-tablo-grup summary { cursor: pointer; list-style: none; padding: 9px 10px; }
  .etki-tablo-grup summary::-webkit-details-marker { display: none; }
  .etki-tablo-grup summary:hover { background: rgba(255,255,255,0.04); }
  .etki-tablo-grup[open] summary { background: rgba(201,154,68,0.07); border-bottom: 1px solid rgba(201,154,68,0.18); }
  .etki-tablo-baslik { display: flex; align-items: center; justify-content: space-between; gap: 8px;
                        font-size: 12px; font-weight: 700; color: #E8ECFB; }
  .etki-tablo-ad { min-width: 0; overflow-wrap: anywhere; }
  .etki-ad-schema { color: #D8DEEF; font-weight: 800; }
  .etki-ad-ayrac { display: inline-block; height: 0.9em; border-left: 1px solid rgba(255,255,255,0.25);
                   margin: 0 6px; vertical-align: -0.12em; }
  .etki-ad-tablo { color: #E8ECFB; font-weight: 800; }
  .etki-tablo-ozet { flex: none; font-size: 9px; color: var(--amber); background: rgba(201,154,68,0.14);
                     border-radius: 999px; padding: 2px 7px; }
  .etki-tablo-alt { font-size: 10.5px; color: var(--slate); margin-top: 4px; overflow-wrap: anywhere; }
  .etki-tablo-detay { padding: 9px 9px 9px 9px; }
  .etki-kart { border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; padding: 9px 10px;
                margin-bottom: 8px; background: rgba(255,255,255,0.035); }
  .etki-kart.sql-modal-ac-btn { cursor: pointer; }
  .etki-kart.sql-modal-ac-btn:hover { border-color: rgba(201,154,68,0.36); background: rgba(201,154,68,0.065); }
  .etki-kart-baslik { display: flex; align-items: center; justify-content: space-between; gap: 8px;
                       font-size: 12px; font-weight: 700; color: #E8ECFB; margin-bottom: 6px; }
  .etki-kart-hedef { min-width: 0; overflow-wrap: anywhere; }
  .etki-kart-dml { flex: none; font-size: 9px; color: var(--amber); background: rgba(201,154,68,0.14);
                   border-radius: 999px; padding: 2px 7px; }
  .etki-akis { font-size: 11px; color: #C9CEDB; margin-bottom: 5px; overflow-wrap: anywhere; }
  .etki-akis .schema { color: #D8DEEF; font-size: 10px; font-weight: 800; }
  .etki-akis .ayrac { display: inline-block; height: 0.8em; border-left: 1px solid rgba(255,255,255,0.20);
                      margin: 0 5px; vertical-align: -0.1em; }
  .etki-io-satir { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 8px;
                   font-size: 11px; color: #C9CEDB; margin-bottom: 4px; overflow-wrap: anywhere; }
  .etki-io-etiket { color: var(--amber); font-weight: 700; }
  .etki-io-deger .schema { color: #D8DEEF; font-size: 10px; font-weight: 800; }
  .etki-io-deger .ayrac { display: inline-block; height: 0.8em; border-left: 1px solid rgba(255,255,255,0.20);
                          margin: 0 5px; vertical-align: -0.1em; }
  .etki-meta { font-size: 10.5px; color: var(--slate); margin-bottom: 6px; }
  .etki-rapor-kart { border: 1px solid rgba(193,123,137,0.22); border-radius: 9px; padding: 8px 10px;
                     margin-bottom: 7px; background: rgba(193,123,137,0.055); }
  .etki-rapor-ad { font-size: 11.5px; font-weight: 800; color: #E8ECFB; overflow-wrap: anywhere; }
  .etki-rapor-meta { font-size: 10px; color: var(--slate); margin-top: 3px; overflow-wrap: anywhere; }
  .etki-rapor-meta b { color: #D8DEEF; }
  .soykutuk-kutusu { border: 1px solid rgba(201,154,68,0.35); border-radius: 12px; padding: 10px 12px;
                      margin-bottom: 14px; background: rgba(201,154,68,0.05); }

  .sql-modal-arkaplan { display: none; position: fixed; inset: 0; z-index: 1200;
                        background: rgba(4,13,10,0.62); align-items: center; justify-content: center;
                        padding: 28px; }
  .sql-modal-arkaplan.acik { display: flex; }
  .sql-modal-kutu { width: min(1120px, 96vw); max-height: 88vh; display: flex; flex-direction: column;
                    background: var(--navy-dark); color: #E8ECFB; border: 1px solid rgba(201,154,68,0.30);
                    border-radius: 18px; box-shadow: 0 24px 70px rgba(0,0,0,0.42); overflow: hidden; }
  .sql-modal-baslik { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
                      padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.12); }
  .sql-modal-baslik-metin { min-width: 0; }
  .sql-modal-eyebrow { font-size: 10px; font-weight: 800; color: var(--amber); letter-spacing: 0.3px;
                       margin-bottom: 4px; }
  .sql-modal-title { font-size: 14px; font-weight: 800; color: white; overflow-wrap: anywhere; }
  .sql-modal-kapat { flex: none; border: 1px solid rgba(255,255,255,0.14); border-radius: 999px;
                     background: rgba(255,255,255,0.05); color: #E8ECFB; cursor: pointer;
                     width: 32px; height: 32px; font-size: 15px; font-weight: 800; }
  .sql-modal-kapat:hover { background: rgba(255,255,255,0.12); }
  .sql-modal-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 18px;
                    border-bottom: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.025); }
  .sql-modal-meta-kutu { font-size: 10.5px; color: #C9CEDB; border: 1px solid rgba(255,255,255,0.10);
                         border-radius: 999px; padding: 4px 9px; background: rgba(255,255,255,0.035); }
  .sql-modal-meta-kutu b { color: #E8ECFB; }
  .sql-modal-govde { padding: 14px 18px 18px 18px; overflow: auto;
                     scrollbar-width: thin; scrollbar-color: #050806 rgba(255,255,255,0.06); }
  .sql-modal-govde::-webkit-scrollbar,
  .sql-modal-sql::-webkit-scrollbar,
  .sql-tooltip::-webkit-scrollbar { width: 12px; height: 12px; }
  .sql-modal-govde::-webkit-scrollbar-track,
  .sql-modal-sql::-webkit-scrollbar-track,
  .sql-tooltip::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 999px; }
  .sql-modal-govde::-webkit-scrollbar-thumb,
  .sql-modal-sql::-webkit-scrollbar-thumb,
  .sql-tooltip::-webkit-scrollbar-thumb { background: #050806; border: 3px solid #0F2A20; border-radius: 999px; }
  .sql-modal-govde::-webkit-scrollbar-thumb:hover,
  .sql-modal-sql::-webkit-scrollbar-thumb:hover,
  .sql-tooltip::-webkit-scrollbar-thumb:hover { background: #000000; }
  .sql-modal-govde::-webkit-scrollbar-corner,
  .sql-modal-sql::-webkit-scrollbar-corner,
  .sql-tooltip::-webkit-scrollbar-corner { background: transparent; }
  .sql-modal-govde::-webkit-scrollbar-button,
  .sql-modal-sql::-webkit-scrollbar-button,
  .sql-tooltip::-webkit-scrollbar-button,
  .sql-modal-govde::-webkit-scrollbar-button:single-button,
  .sql-modal-sql::-webkit-scrollbar-button:single-button,
  .sql-tooltip::-webkit-scrollbar-button:single-button { display: none; width: 0; height: 0; background: transparent; }
  .sql-modal-akis { display: grid; grid-template-columns: minmax(180px, 240px) minmax(0, 1fr); gap: 7px 12px;
                    margin-bottom: 12px; font-size: 11px; color: #C9CEDB; }
  .sql-modal-akis-etiket { color: var(--amber); font-weight: 800; overflow-wrap: anywhere; }
  .sql-modal-akis-deger { overflow-wrap: anywhere; }
  .sql-modal-statement-secici { display: flex; flex-wrap: wrap; gap: 5px; }
  .sql-modal-statement-btn { border: 1px solid rgba(255,255,255,0.12); border-radius: 999px;
                              background: rgba(255,255,255,0.05); color: #C9CEDB; cursor: pointer;
                              padding: 4px 9px; font-size: 10.5px; font-weight: 800; }
  .sql-modal-statement-btn:hover { background: rgba(255,255,255,0.10); color: #E8ECFB; }
  .sql-modal-statement-btn.aktif { background: var(--amber); border-color: var(--amber); color: white; }
  .sql-modal-araclar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
                       margin-bottom: 10px; }
  .sql-modal-gorunum { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px;
                       border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.035); }
  .sql-modal-gorunum-btn { border: 0; border-radius: 999px; padding: 6px 12px; background: transparent;
                           color: var(--slate); cursor: pointer; font-size: 11px; font-weight: 700; }
  .sql-modal-gorunum-btn:hover { background: rgba(255,255,255,0.10); color: #E8ECFB; }
  .sql-modal-gorunum-btn.aktif { background: var(--amber); color: white; font-weight: 800; }
  .sql-modal-sql { margin: 0; max-height: 58vh; overflow: auto; border: 1px solid rgba(255,255,255,0.12);
                   border-radius: 12px; padding: 14px 16px; background: rgba(0,0,0,0.16);
                   scrollbar-width: thin; scrollbar-color: #050806 rgba(255,255,255,0.06); }
  body.sql-modal-acik { overflow: hidden; }
  body.kolon-etki-sayfasi { background: var(--navy-dark); }
  body.kolon-etki-sayfasi .uygulama { display: none; }
  .kolon-etki-sayfa { display: none; min-height: 100vh; background: var(--navy-dark); color: #E8ECFB;
                      padding: 18px 22px 24px 22px; }
  body.kolon-etki-sayfasi .kolon-etki-sayfa { display: flex; flex-direction: column; }
  .kolon-etki-sayfa-baslik { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
                             padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.12); }
  .kolon-etki-sayfa-eyebrow { font-size: 10px; font-weight: 900; color: #70D7A2; letter-spacing: 0.35px;
                              margin-bottom: 5px; }
  .kolon-etki-sayfa-title { font-size: 20px; font-weight: 900; color: white; overflow-wrap: anywhere; }
  .kolon-etki-sayfa-alt { font-size: 11px; color: var(--slate); margin-top: 4px; }
  .kolon-etki-sayfa-geri { flex: none; border: 1px solid rgba(255,255,255,0.14); border-radius: 9px;
                           background: rgba(255,255,255,0.05); color: #E8ECFB; cursor: pointer;
                           padding: 8px 12px; font-size: 12px; font-weight: 900; text-decoration: none; }
  .kolon-etki-sayfa-geri:hover { background: rgba(255,255,255,0.12); }
  .kolon-etki-sayfa-govde { flex: 1; min-height: 0; overflow: auto; }
  .kolon-etki-sayfa .kem-diagram-kapsayici { min-height: calc(100vh - 230px); max-height: none; }
  .kem-ozet { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
  .kem-ozet-kutu { border: 1px solid rgba(255,255,255,0.10); border-radius: 10px; padding: 9px 10px;
                   background: rgba(255,255,255,0.035); }
  .kem-ozet-sayi { font-size: 18px; font-weight: 900; color: #E8ECFB; line-height: 1.1; }
  .kem-ozet-etiket { font-size: 10px; color: var(--slate); margin-top: 3px; font-weight: 800; }
  .kem-kontrol-satiri { display: flex; align-items: center; justify-content: space-between; gap: 12px;
                        flex-wrap: wrap; margin: 0 0 12px 0; padding: 10px 11px;
                        border: 1px solid rgba(255,255,255,0.10); border-radius: 10px;
                        background: rgba(255,255,255,0.035); }
  .kem-kontrol-label { display: inline-flex; align-items: center; gap: 8px; font-size: 11px;
                       font-weight: 900; color: #D8DEEF; }
  .kem-kontrol-not { font-size: 10.5px; color: var(--slate); }
  .kem-uyari { margin: -2px 0 12px 0; padding: 9px 11px; border-radius: 10px;
               border: 1px solid rgba(201,154,68,0.30); background: rgba(201,154,68,0.085);
               color: #E8D4A8; font-size: 11px; font-weight: 800; }
  .kem-bolum-baslik { font-size: 11px; font-weight: 900; color: #70D7A2; margin: 12px 0 8px 0; }
  .kem-akis { display: flex; align-items: stretch; gap: 10px; min-width: max-content; padding: 8px 0 14px 0;
              overflow-x: auto; }
  .kem-seviye { width: 230px; flex: none; border: 1px solid rgba(112,215,162,0.16); border-radius: 12px;
                background: rgba(255,255,255,0.03); padding: 9px; }
  .kem-seviye-baslik { font-size: 10px; font-weight: 900; color: var(--amber); margin-bottom: 8px; }
  .kem-node { border: 1px solid rgba(255,255,255,0.12); border-left: 4px solid #70D7A2; border-radius: 9px;
              padding: 8px 9px; margin-bottom: 7px; background: rgba(255,255,255,0.045); }
  .kem-node.kok { border-left-color: var(--amber); background: rgba(201,154,68,0.08); }
  .kem-node-ust { font-size: 10px; color: var(--slate); overflow-wrap: anywhere; margin-bottom: 3px; }
  .kem-node-kolon { font-size: 12px; font-weight: 900; color: #E8ECFB; overflow-wrap: anywhere; }
  .kem-node-tip { font-size: 9px; color: #70D7A2; margin-top: 4px; }
  .kem-seviye-ok { flex: none; display: flex; align-items: center; justify-content: center;
                   color: #70D7A2; font-size: 18px; font-weight: 900; }
  .kem-adim { border: 1px solid rgba(112,215,162,0.18); border-radius: 10px; padding: 9px 10px;
              margin-bottom: 8px; background: rgba(255,255,255,0.035); }
  .kem-adim-akis { display: grid; grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr); gap: 9px;
                   align-items: center; }
  .kem-adim-ok { text-align: center; color: #70D7A2; font-size: 16px; font-weight: 900; }
  .kem-meta { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 7px; font-size: 9.5px; color: var(--slate); }
  .kem-badge { border-radius: 999px; padding: 2px 7px; background: rgba(255,255,255,0.07);
               color: #C9CEDB; font-weight: 800; }
  .kem-kosul { border-left-color: var(--amber); }
  .kem-kosul-hedef { font-size: 11px; color: #D8DEEF; margin: 6px 0 0 0; overflow-wrap: anywhere; }
  .kem-ifade { margin-top: 8px; border: 1px solid rgba(255,255,255,0.10); border-radius: 8px;
               background: rgba(0,0,0,0.10); overflow: hidden; }
  .kem-ifade summary { cursor: pointer; list-style: none; padding: 7px 9px; color: var(--amber);
                       font-size: 10px; font-weight: 900; }
  .kem-ifade summary::-webkit-details-marker { display: none; }
  .kem-ifade pre { margin: 0; padding: 9px; border-top: 1px solid rgba(255,255,255,0.10);
                   max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-word;
                   font-family: Consolas, monospace; font-size: 11px; line-height: 1.45; color: #C9CEDB; }
  .kem-legend { display: flex; gap: 8px; flex-wrap: wrap; margin: -4px 0 12px 0; }
  .kem-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; color: #C9CEDB;
                     border: 1px solid rgba(255,255,255,0.10); border-radius: 999px; padding: 4px 8px;
                     background: rgba(255,255,255,0.035); cursor: pointer; font-family: inherit; font-weight: 800; }
  .kem-legend-item:hover { background: rgba(255,255,255,0.075); }
  .kem-legend-item.aktif { border-color: rgba(112,215,162,0.26); }
  .kem-legend-item.pasif { opacity: 0.42; filter: grayscale(0.8); }
  .kem-legend-cizgi { width: 20px; height: 0; border-top: 2px solid #70D7A2; }
  .kem-legend-cizgi.turetilmis { border-top-color: #8FB7FF; }
  .kem-legend-cizgi.kosul { border-top-color: var(--amber); border-top-style: dashed; }
  .kem-legend-cizgi.rapor { border-top-color: #CDB7FF; }
  .kem-diagram-kapsayici { position: relative; min-height: 510px; max-height: 58vh; overflow: auto;
                            border: 1px solid rgba(255,255,255,0.11); border-radius: 14px;
                            background:
                              repeating-linear-gradient(0deg, rgba(255,255,255,0.025), rgba(255,255,255,0.025) 23px, transparent 23px, transparent 24px),
                              repeating-linear-gradient(90deg, rgba(255,255,255,0.025), rgba(255,255,255,0.025) 23px, transparent 23px, transparent 24px),
                              rgba(0,0,0,0.10);
                            padding: 22px 26px 26px 26px; }
  .kem-diagram-icerik { position: relative; min-width: max-content; padding: 4px 0 16px 0; }
  .kem-diagram-svg { position: absolute; left: 0; top: 0; z-index: 1; pointer-events: none; overflow: visible; }
  .kem-diagram-grid { position: relative; z-index: 2; display: flex; align-items: flex-start; gap: 82px; }
  .kem-diagram-seviye { width: 286px; flex: none; }
  .kem-diagram-seviye-baslik { font-size: 10px; font-weight: 900; color: var(--amber); margin: 0 0 9px 2px; }
  .kem-kolon-kart { width: 286px; border: 1px solid rgba(112,215,162,0.20); border-radius: 10px;
                    background: rgba(7,35,27,0.96); box-shadow: 0 12px 28px rgba(0,0,0,0.18);
                    overflow: hidden; margin-bottom: 14px; }
  .kem-kolon-kart.kok { border-color: rgba(201,154,68,0.50); }
  .kem-kolon-kart.rapor { border-color: rgba(205,183,255,0.38); background: rgba(28,24,49,0.94); }
  .kem-kart-baslik { display: flex; align-items: center; justify-content: space-between; gap: 8px;
                     padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.10); cursor: pointer; }
  .kem-kart-baslik:hover { background: rgba(255,255,255,0.045); }
  .kem-kart-ad { min-width: 0; font-size: 11.5px; font-weight: 900; color: white; overflow-wrap: anywhere; }
  .kem-kart-sag { flex: none; display: inline-flex; align-items: center; gap: 5px; }
  .kem-kart-tip { flex: none; font-size: 8.5px; font-weight: 900; color: #0F2A20; background: #70D7A2;
                  border-radius: 999px; padding: 2px 7px; }
  .kem-kolon-kart.rapor .kem-kart-tip { background: #CDB7FF; }
  .kem-kart-detay { flex: none; font-size: 8.5px; font-weight: 900; color: #C9CEDB; background: rgba(255,255,255,0.07);
                    border-radius: 999px; padding: 2px 7px; }
  .kem-kolon-listesi { display: none; padding: 7px 8px 9px 8px; }
  .kem-kolon-kart.acik .kem-kolon-listesi { display: block; }
  .kem-kolon-satir { min-height: 31px; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto;
                     align-items: center; gap: 7px; padding: 5px 6px; margin-bottom: 4px;
                     border: 1px solid rgba(255,255,255,0.08); border-radius: 7px;
                     background: rgba(255,255,255,0.035); cursor: pointer;
                     transition: border-color 0.12s ease, background 0.12s ease, opacity 0.12s ease, transform 0.12s ease; }
  .kem-kolon-satir:hover { border-color: rgba(112,215,162,0.30); background: rgba(112,215,162,0.075); }
  .kem-kolon-satir:last-child { margin-bottom: 0; }
  .kem-kolon-satir.kok { background: rgba(201,154,68,0.12); border-color: rgba(201,154,68,0.25); }
  .kem-kolon-satir.direkt { background: rgba(112,215,162,0.055); border-color: rgba(112,215,162,0.20); }
  .kem-kolon-satir.turetilmis { background: rgba(143,183,255,0.065); border-color: rgba(143,183,255,0.22); }
  .kem-kolon-satir.kosul { background: rgba(201,154,68,0.08); border-color: rgba(201,154,68,0.22); }
  .kem-kolon-satir.rapor { background: rgba(205,183,255,0.10); border-color: rgba(205,183,255,0.22); }
  .kem-kolon-satir.kem-secili { border-color: rgba(232,236,251,0.78); background: rgba(232,236,251,0.13);
                                box-shadow: 0 0 0 2px rgba(232,236,251,0.10); transform: translateX(2px); }
  .kem-kolon-satir.kem-iliskili { border-color: rgba(112,215,162,0.55); background: rgba(112,215,162,0.11); }
  .kem-kolon-satir.kem-soluk { opacity: 0.42; }
  .kem-kolon-kart.kem-iliskili-kart { border-color: rgba(112,215,162,0.42); }
  .kem-kolon-kart.kem-secili-kart { border-color: rgba(232,236,251,0.72); box-shadow: 0 14px 32px rgba(112,215,162,0.18); }
  .kem-kolon-nokta { width: 8px; height: 8px; border-radius: 999px; background: #70D7A2; box-shadow: 0 0 0 3px rgba(112,215,162,0.10); }
  .kem-kolon-satir.turetilmis .kem-kolon-nokta { background: #8FB7FF; }
  .kem-kolon-satir.kosul .kem-kolon-nokta { background: var(--amber); }
  .kem-kolon-satir.rapor .kem-kolon-nokta { background: #CDB7FF; }
  .kem-kolon-ad { min-width: 0; font-size: 11.5px; font-weight: 850; color: #E8ECFB; overflow-wrap: anywhere; }
  .kem-kolon-tip { display: block; font-size: 9px; color: var(--slate); margin-top: 2px; font-weight: 700; }
  .kem-kolon-badgeler { display: flex; align-items: center; justify-content: flex-end; gap: 4px; flex-wrap: wrap; }
  .kem-mini-badge { flex: none; border-radius: 999px; padding: 2px 6px; font-size: 8.5px; font-weight: 900;
                    color: #C9CEDB; background: rgba(255,255,255,0.07); }
  .kem-mini-badge.direkt { color: #70D7A2; background: rgba(112,215,162,0.12); }
  .kem-mini-badge.turetilmis { color: #8FB7FF; background: rgba(143,183,255,0.12); }
  .kem-mini-badge.kosul { color: var(--amber); background: rgba(201,154,68,0.13); }
  .kem-mini-badge.rapor { color: #CDB7FF; background: rgba(205,183,255,0.13); }
  .kem-diagram-path { fill: none; stroke-width: 2; opacity: 0.88; }
  .kem-diagram-path.tablo { stroke: rgba(112,215,162,0.52); stroke-width: 1.7; }
  .kem-diagram-path.vurgu { stroke-width: 2.6; opacity: 0.98; }
  .kem-diagram-path.lineage { stroke: #70D7A2; }
  .kem-diagram-path.turetilmis { stroke: #8FB7FF; }
  .kem-diagram-path.kosul { stroke: #C99A44; stroke-dasharray: 6 4; }
  .kem-diagram-path.rapor { stroke: #CDB7FF; }
  .kem-kosul-detaylar { margin-top: 14px; }
</style>
</head>
<body>
<div class="uygulama">
  <header class="ust-cubuk">
    <div class="logo-alan">
      <svg class="logo-svg" width="42" height="42" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="9" fill="#141B47"/>
        <circle cx="20" cy="11" r="4.5" fill="#D98E04"/>
        <circle cx="10.5" cy="29" r="4" fill="#CADCFC"/>
        <circle cx="29.5" cy="29" r="4" fill="#CADCFC"/>
        <path d="M18.3 14.8 L11.8 25.2" stroke="#5B6B8C" stroke-width="1.8" fill="none"/>
        <path d="M21.7 14.8 L28.2 25.2" stroke="#5B6B8C" stroke-width="1.8" fill="none"/>
      </svg>
      <div>
        <div class="uygulama-adi">DWH Analyzer</div>
        <div class="uygulama-alt-yazi">Katalog Lineage &amp; Etki Analizi</div>
      </div>
    </div>
    <div class="mod-toggle">
      <button class="mod-buton aktif" id="modTabloBtn" data-mod="tablo">TABLO</button>
      <button class="mod-buton" id="modRaporBtn" data-mod="rapor">RAPOR</button>
      <button class="mod-buton" id="modKolonBtn" data-mod="kolon">KOLON</button>
    </div>
  </header>

  <div class="kriter-paneli">
    <span class="kriter-etiket" id="kriterEtiket">TABLO ADI</span>
    <input type="text" id="kriterInput" placeholder="Örn: SM_GL_ASSET" autofocus>
    <button id="kriterAraButon">Ara</button>
  </div>

  <div id="genelBilgiSeridi" class="genel-bilgi-seridi"><div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div></div>

  <div class="ana-alan">
    <div class="agac-panel">
      <div class="agac-kutu">
        <div class="agac-arama">
          <input type="text" id="agacAramaInput" placeholder="Ağaçta tablo ara...">
          <span id="agacAramaSayac" class="agac-arama-sayac">0</span>
          <button id="agacAramaOnceki" class="agac-arama-btn" title="Önceki eşleşme">↑</button>
          <button id="agacAramaSonraki" class="agac-arama-btn" title="Sonraki eşleşme">↓</button>
        </div>
        <div class="agac-ust-secenekler">
          <label class="basit-secenek">
            <input type="checkbox" id="basitCheckbox">
            Basit görünüm (alt sorgu ayrımı olmadan, düz liste)
          </label>
          <button id="diyagramBtn" class="diyagram-btn" title="Bu ağacı görsel bir diyagram olarak göster">
            Diyagram Görünümü
          </button>
          <button id="agacDaraltBtn" class="agac-daralt-btn" title="Sol ağacı daralt">‹</button>
        </div>
        <div id="agacAlani"></div>
        <div id="agacResizeTutamac" class="agac-resize-tutamac" title="Ağaç panelini genişlet/daralt"></div>
      </div>
    </div>
    <div class="detay-panel-sarici"></div>
  </div>

  <div id="diyagramModal" class="diyagram-modal-arkaplan">
    <div class="diyagram-modal-kutu">
      <div class="diyagram-modal-baslik">
        <span id="diyagramBaslikMetin">Hiyerarşi Diyagramı</span>
        <div class="diyagram-modal-araclar">
          <button id="diyagramIndirBtn" class="diyagram-arac-btn">⬇ PNG indir</button>
          <button id="diyagramKapatBtn" class="diyagram-arac-btn diyagram-kapat">✕ Kapat</button>
        </div>
      </div>
      <div id="diyagramFiltreSatiri" class="diyagram-filtre-satiri">
        <input type="text" id="diyagramAramaInput" class="diyagram-arama-input" placeholder="Diyagramda tablo ara...">
        <span id="diyagramAramaSayac" class="diyagram-arama-sayac"></span>
        <button id="diyagramAramaOnceki" class="diyagram-arama-btn" title="Önceki eşleşme">↑</button>
        <button id="diyagramAramaSonraki" class="diyagram-arama-btn" title="Sonraki eşleşme">↓</button>
        <span class="diyagram-legend" title="Diyagram düğüm anlamları">
          <span class="diyagram-legend-item"><span class="diyagram-legend-dot dongu"></span>Döngü</span>
          <span class="diyagram-legend-item"><span class="diyagram-legend-dot referans"></span>Referans</span>
          <span class="diyagram-legend-item"><span class="diyagram-legend-dot alt"></span>Alt sorgu</span>
          <span class="diyagram-legend-item"><span class="diyagram-legend-dot ex"></span>EX</span>
          <span class="diyagram-legend-item"><span class="diyagram-legend-dot tr"></span>TR</span>
          <span class="diyagram-legend-item"><span class="diyagram-legend-dot ld"></span>LD</span>
          <span class="diyagram-legend-item"><span class="diyagram-legend-dot kaynak"></span>KAYNAK</span>
        </span>
      </div>
      <div class="diyagram-calisma-alani">
        <div id="diyagramGovde" class="diyagram-modal-govde"></div>
        <div id="diyagramGorunumPanel" class="diyagram-gorunum-panel diyagram-panel-kapali">
          <button type="button" class="diyagram-panel-baslik" data-diyagram-panel-toggle="gorunum" title="Görünüm seçenekleri" aria-label="Görünüm seçenekleri">Görünüm</button>
          <div class="diyagram-panel-icerik">
            <div id="diyagramGorunumSecici" class="diyagram-gorunum-secici">
              <button class="diyagram-gorunum-btn aktif" data-diyagram-gorunum="agac">Ağaç</button>
              <button class="diyagram-gorunum-btn" data-diyagram-gorunum="katman">Katman</button>
              <button class="diyagram-gorunum-btn" data-diyagram-gorunum="radial">Radial</button>
            </div>
            <div id="diyagramYerlesimBolumu" class="diyagram-yerlesim-bolumu">
              <div class="diyagram-yerlesim-ayrac"></div>
              <span class="diyagram-filtre-baslik">Ağaç yerleşimi</span>
              <div id="diyagramYerlesimSecici" class="diyagram-yerlesim-secici">
                <button class="diyagram-yerlesim-btn aktif" data-diyagram-yerlesim="parent">Yakın</button>
                <button class="diyagram-yerlesim-btn" data-diyagram-yerlesim="klasik">Klasik</button>
              </div>
            </div>
          </div>
        </div>
        <div id="diyagramKatmanPanel" class="diyagram-katman-panel diyagram-panel-kapali">
          <button type="button" class="diyagram-panel-baslik" data-diyagram-panel-toggle="katman" title="Katman filtreleri" aria-label="Katman filtreleri">Katman</button>
          <div class="diyagram-panel-icerik">
            <label class="diyagram-filtre-secenek" data-katman="EX"><input type="checkbox" checked> 📥 EX</label>
            <label class="diyagram-filtre-secenek" data-katman="TR"><input type="checkbox" checked> 🔄 TR</label>
            <label class="diyagram-filtre-secenek" data-katman="KAYNAK"><input type="checkbox" checked> 🌐 KAYNAK</label>
            <label class="diyagram-filtre-secenek" data-katman="LD"><input type="checkbox" checked> 🗄 LD</label>
            <label class="diyagram-filtre-secenek" data-katman="DIGER"><input type="checkbox" checked> ❔ Diğer</label>
            <span id="diyagramFiltreOzet" class="diyagram-filtre-ozet"></span>
            <div class="diyagram-katman-ayrac"></div>
            <label class="diyagram-filtre-secenek diyagram-alt-sorgusuz-secenek" title="SQL alt sorgu gruplarını çizmeden, içlerindeki tabloları üst düğüme bağlar">
              <input type="checkbox" id="diyagramAltSorgusuzCheckbox"> Alt sorgusuz
            </label>
          </div>
        </div>
        <div class="diyagram-alt-nav-grup" title="Diyagram gezinme ve yakınlaştırma">
          <div class="diyagram-alt-nav-satir">
            <button id="diyagramZoomOutBtn" class="diyagram-zoom-btn" title="Uzaklaştır" aria-label="Uzaklaştır">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M15.4 15.4 21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M7.7 10.5h5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <button id="diyagramKokNavBtn" class="diyagram-kok-nav-btn" title="Başlangıç noktasını ortala" aria-label="Başlangıç noktasını ortala">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" stroke-width="2"/>
                <circle cx="12" cy="12" r="2.7" fill="currentColor"/>
                <path d="M12 2.7v3.4M12 17.9v3.4M2.7 12h3.4M17.9 12h3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <button id="diyagramZoomInBtn" class="diyagram-zoom-btn" title="Yakınlaştır" aria-label="Yakınlaştır">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M15.4 15.4 21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M7.7 10.5h5.6M10.5 7.7v5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button id="diyagramZoomResetBtn" class="diyagram-zoom-reset-btn" title="Zoomu sıfırla" aria-label="Zoomu sıfırla">100%</button>
        </div>
        <div id="diyagramSeviyeOverlay" class="diyagram-seviye-overlay"></div>
        <div id="diyagramGenisletOverlay" class="diyagram-genislet-overlay"></div>
        <div id="diyagramBaglantiOzet" class="diyagram-baglanti-ozet" aria-live="polite"></div>
      </div>
    </div>
  </div>
</div>

<div id="sqlModal" class="sql-modal-arkaplan" aria-hidden="true">
  <div class="sql-modal-kutu" role="dialog" aria-modal="true" aria-labelledby="sqlModalTitle">
    <div class="sql-modal-baslik">
      <div class="sql-modal-baslik-metin">
        <div class="sql-modal-eyebrow">PROSEDÜR</div>
        <div id="sqlModalTitle" class="sql-modal-title">SQL</div>
      </div>
      <button id="sqlModalKapatBtn" class="sql-modal-kapat" title="Kapat">✕</button>
    </div>
    <div id="sqlModalMeta" class="sql-modal-meta"></div>
    <div class="sql-modal-govde">
      <div id="sqlModalAkis" class="sql-modal-akis"></div>
      <div class="sql-modal-araclar">
        <div id="sqlModalGorunum" class="sql-modal-gorunum"></div>
      </div>
      <pre id="sqlModalGovde" class="sql-tooltip-govde sql-modal-sql"></pre>
    </div>
  </div>
</div>

<div id="kolonEtkiSayfa" class="kolon-etki-sayfa">
  <div class="kolon-etki-sayfa-baslik">
    <div>
      <div class="kolon-etki-sayfa-eyebrow">KOLON ETKİ HARİTASI</div>
      <div id="kolonEtkiSayfaTitle" class="kolon-etki-sayfa-title">Kolon Etkisi</div>
      <div id="kolonEtkiSayfaAlt" class="kolon-etki-sayfa-alt"></div>
    </div>
    <a class="kolon-etki-sayfa-geri" href="/" id="kolonEtkiSayfaGeri">Ana ekrana dön</a>
  </div>
  <div id="kolonEtkiSayfaGovde" class="kolon-etki-sayfa-govde"></div>
</div>

<script>
  const kriterInput = document.getElementById("kriterInput");
  const kriterAraButon = document.getElementById("kriterAraButon");
  const agacAlani = document.getElementById('agacAlani');
  const basitCheckbox = document.getElementById('basitCheckbox');
  const agacAramaInput = document.getElementById('agacAramaInput');
  const agacAramaSayac = document.getElementById('agacAramaSayac');
  const agacAramaOnceki = document.getElementById('agacAramaOnceki');
  const agacAramaSonraki = document.getElementById('agacAramaSonraki');

  // --- Inspector Panel: artik SAYFANIN NORMAL BIR PARCASI (yuzen degil),
  // her zaman gorunur. Bir tablonun ADINA tiklaninca icerigi guncellenir.
  const anaAlan = document.querySelector('.ana-alan');
  const detayPanelSarici = document.querySelector('.detay-panel-sarici');
  const inspector = document.createElement('div');
  inspector.className = 'inspector-panel';
  inspector.innerHTML = '<div class="inspector-bos-durum">← Soldaki ağaçtan bir tablo adına tıklayın</div>';
  detayPanelSarici.appendChild(inspector);
  const sqlModal = document.getElementById('sqlModal');
  const sqlModalTitle = document.getElementById('sqlModalTitle');
  const sqlModalMeta = document.getElementById('sqlModalMeta');
  const sqlModalAkis = document.getElementById('sqlModalAkis');
  const sqlModalGorunum = document.getElementById('sqlModalGorunum');
  const sqlModalGovde = document.getElementById('sqlModalGovde');
  const sqlModalKapatBtn = document.getElementById('sqlModalKapatBtn');
  const kolonEtkiSayfa = document.getElementById('kolonEtkiSayfa');
  const kolonEtkiSayfaTitle = document.getElementById('kolonEtkiSayfaTitle');
  const kolonEtkiSayfaAlt = document.getElementById('kolonEtkiSayfaAlt');
  const kolonEtkiSayfaGovde = document.getElementById('kolonEtkiSayfaGovde');
  const kolonEtkiSayfaGeri = document.getElementById('kolonEtkiSayfaGeri');
  let sqlModalStatement = null;
  let sqlModalStatementler = [];
  let sqlModalStatementIndex = 0;
  let sqlModalContext = null;
  let sqlModalGorunumModu = 'sade';
  const genelBilgiSeridi = document.getElementById('genelBilgiSeridi');
  const agacDaraltBtn = document.getElementById('agacDaraltBtn');
  const agacPanel = document.querySelector('.agac-panel');
  const agacResizeTutamac = document.getElementById('agacResizeTutamac');
  setTimeout(panelYuksekliginiAyarla, 0);  // fonksiyon asagida tanimli, hoisting sayesinde guvenli

  const inspectorOnbellek = {};       // table_id -> /api/tablo_detay sonucu
  const inspectorKolonOnbellek = {};  // table_id -> /api/kolonlar sonucu
  const inspectorLineageOnbellek = {};// table_id -> /api/kolon_lineage sonucu
  const inspectorEtkiOnbellek = {};   // table_id -> /api/etki sonucu
  const inspectorSoykutukOnbellek = {};  // "table_id::kolon_adi" -> /api/kolon_soykutugu sonucu
  const inspectorKolonEtkiOnbellek = {}; // "table_id::kolon_adi" -> /api/kolon_etki sonucu
  let inspectorTableId = null;
  let inspectorTabloAdi = null;
  let inspectorAktifSekme = 'sql';
  let inspectorSeciliStatementId = null;
  let inspectorSqlGorunumModu = 'sade';   // 'sade' | 'tam'
  let inspectorAktifSpan = null;
  let inspectorLineageFiltre = '';
  let inspectorVurgulananKolon = null;   // Kolon modundan gelindiyse: SQL'de ve Kolonlar listesinde sari vurgulanacak alan
  let inspectorKolonEtkiKolon = '';
  let inspectorKolonEtkiYukleniyor = false;
  let kolonEtkiSonDiagramModel = null;
  let kolonEtkiSonGorunurGraf = null;
  let kolonEtkiAktifGovde = null;
  let kolonEtkiSeciliNode = null;
  let kolonEtkiAkisFiltreleri = { lineage: true, turetilmis: true, kosul: true, rapor: true };
  const KOLON_ETKI_AKIS_STORAGE_KEY = 'dwhAnalyzer.kolonEtkiAkisFiltreleri';
  let agacAramaSonuclari = [];
  let agacAramaAktifIndex = -1;
  let agacUzakAramaZamanlayici = null;
  let agacUzakAramaSira = 0;

  function agacAramaVurgulariTemizle() {
    agacAlani.querySelectorAll('.agac-arama-eslesme, .agac-arama-aktif').forEach(function (el) {
      el.classList.remove('agac-arama-eslesme', 'agac-arama-aktif');
    });
  }

  function agacAramaSonucSayaciGuncelle(metin) {
    if (metin) {
      agacAramaSayac.textContent = metin;
      agacAramaOnceki.disabled = true;
      agacAramaSonraki.disabled = true;
      return;
    }
    if (agacAramaSonuclari.length === 0) {
      agacAramaSayac.textContent = agacAramaInput.value.trim() ? '0' : '0';
      agacAramaOnceki.disabled = true;
      agacAramaSonraki.disabled = true;
      return;
    }
    agacAramaSayac.textContent = (agacAramaAktifIndex + 1) + ' / ' + agacAramaSonuclari.length;
    agacAramaOnceki.disabled = agacAramaSonuclari.length <= 1;
    agacAramaSonraki.disabled = agacAramaSonuclari.length <= 1;
  }

  function agacAramaAtalariAc(el) {
    let ul = el.closest('ul');
    while (ul && ul !== agacAlani) {
      if (ul.style.display === 'none') {
        ul.style.display = '';
        const sahipLi = ul.parentElement;
        const toggle = sahipLi ? sahipLi.querySelector(':scope > .dugum-satir .toggle-ikon') : null;
        if (toggle) toggle.classList.add('acik');
      }
      ul = ul.parentElement ? ul.parentElement.closest('ul') : null;
    }
  }

  function agacAramaAktifiGoster() {
    agacAramaVurgulariTemizle();
    agacAramaSonuclari.forEach(function (el) { el.classList.add('agac-arama-eslesme'); });
    const aktif = agacAramaSonuclari[agacAramaAktifIndex];
    if (!aktif) {
      agacAramaSonucSayaciGuncelle();
      return;
    }
    agacAramaAtalariAc(aktif);
    aktif.classList.add('agac-arama-aktif');
    aktif.scrollIntoView({ block: 'center', inline: 'nearest' });
    agacAramaSonucSayaciGuncelle();
  }

  function agacAramaSonuclariGuncelle(uzakAra) {
    if (uzakAra === undefined) uzakAra = true;
    if (agacUzakAramaZamanlayici) clearTimeout(agacUzakAramaZamanlayici);
    const q = agacAramaInput.value.trim().toLowerCase();
    agacAramaVurgulariTemizle();
    agacAramaInput.classList.remove('agac-arama-yok');
    agacAramaSonuclari = [];
    agacAramaAktifIndex = -1;
    if (!q) {
      agacAramaSonucSayaciGuncelle();
      return;
    }
    if (uzakAra && q.length >= 2) {
      agacUzakAramaZamanlayici = setTimeout(function () { agacUzakAramaYap(q); }, 350);
    }
    const adaylar = Array.from(agacAlani.querySelectorAll('.tablo-adi, .esleme-tablo-kolon'));
    agacAramaSonuclari = adaylar.filter(function (el) {
      return (el.textContent || '').toLowerCase().includes(q);
    });
    if (agacAramaSonuclari.length === 0) {
      agacAramaInput.classList.add('agac-arama-yok');
      agacAramaSonucSayaciGuncelle();
      return;
    }
    agacAramaAktifIndex = 0;
    agacAramaAktifiGoster();
  }

  function agacAramadaGez(yon) {
    if (agacAramaSonuclari.length === 0) return;
    agacAramaAktifIndex = (agacAramaAktifIndex + yon + agacAramaSonuclari.length) % agacAramaSonuclari.length;
    agacAramaAktifiGoster();
  }

  function agacAramaSifirla() {
    if (agacUzakAramaZamanlayici) clearTimeout(agacUzakAramaZamanlayici);
    agacUzakAramaSira += 1;
    agacAramaInput.value = '';
    agacAramaInput.classList.remove('agac-arama-yok');
    agacAramaVurgulariTemizle();
    agacAramaSonuclari = [];
    agacAramaAktifIndex = -1;
    agacAramaSonucSayaciGuncelle();
  }

  function agacKokBilgisi() {
    const kokLi = agacAlani.querySelector(':scope > ul.agac > li');
    if (!kokLi) return null;
    if (kokLi.dataset.tableId) return { kokLi: kokLi, tip: 'table_id', id: kokLi.dataset.tableId };
    if (kokLi.dataset.raporId) return { kokLi: kokLi, tip: 'rapor_id', id: kokLi.dataset.raporId };
    return null;
  }

  function agacCocukLiBul(ebeveynLi, adim) {
    const cocukUl = ebeveynLi.__agacCocukAlani ? ebeveynLi.__agacCocukAlani() : ebeveynLi.querySelector(':scope > ul');
    if (!cocukUl) return null;
    const cocuklar = Array.from(cocukUl.querySelectorAll(':scope > li'));
    if (adim.tip === 'tablo') {
      return cocuklar.find(function (li) { return li.dataset.tableId === String(adim.table_id); }) || null;
    }
    if (adim.tip === 'altsorgu') {
      return cocuklar.find(function (li) { return li.dataset.altSorguId === String(adim.alt_sorgu_id); }) || null;
    }
    return null;
  }

  async function agacYoluAc(path) {
    if (!path || path.length === 0) return null;
    const kok = agacKokBilgisi();
    if (!kok) return null;
    let mevcutLi = kok.kokLi;
    let baslangic = path[0].tip === 'rapor' ? 1 : 1;
    if (path[0].tip === 'tablo' && mevcutLi.dataset.tableId !== String(path[0].table_id)) return null;
    for (let i = baslangic; i < path.length; i += 1) {
      if (mevcutLi.__agacAc) await mevcutLi.__agacAc();
      const sonrakiLi = agacCocukLiBul(mevcutLi, path[i]);
      if (!sonrakiLi) return null;
      mevcutLi = sonrakiLi;
    }
    const hedef = mevcutLi.querySelector(':scope > .dugum-satir .tablo-adi, :scope > .dugum-satir .esleme-tablo-kolon');
    if (hedef) {
      agacAramaAtalariAc(hedef);
      hedef.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    return hedef;
  }

  async function agacUzakAramaYap(q) {
    const kok = agacKokBilgisi();
    if (!kok || agacAramaInput.value.trim().toLowerCase() !== q) return;
    const sira = ++agacUzakAramaSira;
    agacAramaSonucSayaciGuncelle('...');
    const params = new URLSearchParams();
    params.set('q', q);
    params.set(kok.tip, kok.id);
    params.set('basit', basitCheckbox.checked ? '1' : '0');
    let veri;
    try {
      const yanit = await fetch('/api/agac_ara?' + params.toString());
      veri = await yanit.json();
      if (!yanit.ok) throw new Error(veri.hata || 'arama yapılamadı');
    } catch (err) {
      if (sira === agacUzakAramaSira) agacAramaSonucSayaciGuncelle('!');
      return;
    }
    if (sira !== agacUzakAramaSira || agacAramaInput.value.trim().toLowerCase() !== q) return;
    const yollar = (veri.sonuclar || []).map(function (s) { return s.path; });
    if (yollar.length === 0) {
      agacAramaInput.classList.add('agac-arama-yok');
      agacAramaSonucSayaciGuncelle();
      return;
    }
    for (const yol of yollar) {
      if (sira !== agacUzakAramaSira || agacAramaInput.value.trim().toLowerCase() !== q) return;
      await agacYoluAc(yol);
    }
    if (sira !== agacUzakAramaSira || agacAramaInput.value.trim().toLowerCase() !== q) return;
    agacAramaSonuclariGuncelle(false);
  }

  async function inspectorAc(tableId, tabloAdi, span, vurgulananKolon) {
    if (inspectorAktifSpan) inspectorAktifSpan.classList.remove('tablo-adi-secili');
    inspectorTableId = tableId;
    inspectorTabloAdi = tabloAdi;
    inspectorAktifSekme = 'sql';
    inspectorSeciliStatementId = null;
    inspectorSqlGorunumModu = 'sade';
    inspectorLineageFiltre = '';
    inspectorVurgulananKolon = vurgulananKolon || null;
    inspectorKolonEtkiKolon = vurgulananKolon || '';
    inspectorKolonEtkiYukleniyor = false;
    inspectorAktifSpan = span;
    if (span) span.classList.add('tablo-adi-secili');
    inspectorCiz();

    if (!inspectorOnbellek[tableId]) {
      try {
        const yanit = await fetch('/api/tablo_detay?table_id=' + tableId);
        inspectorOnbellek[tableId] = await yanit.json();
      } catch (err) {
        inspectorOnbellek[tableId] = { hata: 'Sunucuya ulaşılamadı.' };
      }
    }
    // Genel bilgi şeridi SADECE Tablo modunda bu tabloya göre güncellenir --
    // Kolon modunda bir eşlemeye tıklayıp panel açmak, aramanın kendi özet
    // şeridini ("X tablo, Y rapor eşleşti") EZMEMELİ; kullanıcı tekrar
    // aratmadan o özete geri dönemiyordu.
    if (mevcutMod === 'tablo') genelBilgiSeridiCiz();
    inspectorCiz();
  }

  function genelBilgiSeridiCiz() {
    const veri = inspectorOnbellek[inspectorTableId];
    if (!veri) { genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>'; return; }
    if (veri.hata) {
      genelBilgiSeridi.innerHTML = '<div class="gbs-baslik">' + kacisliMetin(inspectorTabloAdi) + '</div><div class="gbs-satirlar">' + kacisliMetin(veri.hata) + '</div>';
      return;
    }
    const entries = veri.entries || [];
    const yazanlar = entries.filter(e => e.rol === 'yazan');
    const kullanilanlar = entries.filter(e => e.rol === 'kullanilan');
    const paketler = new Set(entries.map(e => e.paket_adi + '.' + e.procedure_adi));
    genelBilgiSeridi.innerHTML =
      '<div class="gbs-baslik">' + kacisliMetin((veri.schema_adi ? veri.schema_adi + '.' : '') + veri.tablo_adi) + '</div>' +
      '<div class="gbs-satirlar">' +
        '<span><b>' + yazanlar.length + '</b> dolduran sorgu</span>' +
        '<span><b>' + kullanilanlar.length + '</b> kaynak olarak kullanıldığı sorgu</span>' +
        '<span><b>' + paketler.size + '</b> farklı paket/prosedür</span>' +
      '</div>';
  }

  const SEKME_ENDPOINT = {
    kolonlar: { onbellek: () => inspectorKolonOnbellek, url: (id) => '/api/kolonlar?table_id=' + id },
    lineage: { onbellek: () => inspectorLineageOnbellek, url: (id) => '/api/kolon_lineage?table_id=' + id },
    etki: { onbellek: () => inspectorEtkiOnbellek, url: (id) => '/api/etki?table_id=' + id },
  };

  async function inspectorVeriGetir(anahtar) {
    const eslesme = SEKME_ENDPOINT[anahtar];
    const onbellek = eslesme.onbellek();
    if (!onbellek[inspectorTableId]) {
      inspectorCiz();  // "yukleniyor" gorunsun
      try {
        const yanit = await fetch(eslesme.url(inspectorTableId));
        onbellek[inspectorTableId] = await yanit.json();
      } catch (err) {
        onbellek[inspectorTableId] = { hata: 'Sunucuya ulaşılamadı.' };
      }
    }
    inspectorCiz();
  }

  async function inspectorSekmeSec(sekme) {
    inspectorAktifSekme = sekme;
    if (sekme === 'kolonlar' || sekme === 'lineage' || sekme === 'etki') {
      await inspectorVeriGetir(sekme);
    } else {
      inspectorCiz();
    }
  }

  async function inspectorSoykutukGetir() {
    const anahtar = inspectorTableId + '::' + inspectorVurgulananKolon;
    if (!inspectorSoykutukOnbellek[anahtar]) {
      try {
        const yanit = await fetch('/api/kolon_soykutugu?table_id=' + inspectorTableId +
                                   '&kolon_adi=' + encodeURIComponent(inspectorVurgulananKolon));
        inspectorSoykutukOnbellek[anahtar] = await yanit.json();
      } catch (err) {
        inspectorSoykutukOnbellek[anahtar] = { hata: 'Sunucuya ulaşılamadı.' };
      }
      inspectorCiz();
    }
  }

  function kolonEtkiSayfaUrl(tableId, kolonAdi, tabloAdi) {
    const params = new URLSearchParams();
    params.set('table_id', tableId);
    params.set('kolon', kolonAdi || '');
    if (tabloAdi) params.set('tablo', tabloAdi);
    const akis = kolonEtkiAktifAkisParam();
    params.set('akis', akis);
    return '/kolon_etki?' + params.toString();
  }

  function kolonEtkiAktifAkisParam() {
    return Object.keys(kolonEtkiAkisFiltreleri)
      .filter(function (k) { return kolonEtkiAkisFiltreleri[k] !== false; })
      .join(',');
  }

  function kolonEtkiAkisFiltreleriniUrlParamdanOku() {
    const params = new URLSearchParams(window.location.search);
    const urlAkis = params.get('akis');
    const kayitliAkis = sessionStorage.getItem(KOLON_ETKI_AKIS_STORAGE_KEY);
    const akis = urlAkis !== null ? urlAkis : kayitliAkis;
    if (akis === null) return;
    kolonEtkiAkisFiltreleriniParamdanUygula(akis);
  }

  function kolonEtkiAkisFiltreleriniParamdanUygula(akis) {
    const secili = new Set((akis || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean));
    ['lineage', 'turetilmis', 'kosul', 'rapor'].forEach(function (tip) {
      kolonEtkiAkisFiltreleri[tip] = secili.has(tip);
    });
  }

  function kolonEtkiAkisFiltreleriniKaydet() {
    sessionStorage.setItem(KOLON_ETKI_AKIS_STORAGE_KEY, kolonEtkiAktifAkisParam());
  }

  function kolonEtkiSayfasiAc(kolonAdi) {
    const temizKolon = (kolonAdi || '').trim();
    if (!temizKolon || !inspectorTableId) return;
    window.open(kolonEtkiSayfaUrl(inspectorTableId, temizKolon, inspectorTabloAdi), '_blank');
  }

  async function inspectorKolonEtkiGetir(kolonAdi) {
    const temizKolon = (kolonAdi || '').trim();
    if (!temizKolon || !inspectorTableId) return;
    inspectorKolonEtkiKolon = temizKolon;
    const anahtar = inspectorTableId + '::' + temizKolon.toLowerCase();
    if (!inspectorKolonEtkiOnbellek[anahtar]) {
      inspectorKolonEtkiYukleniyor = true;
      inspectorCiz();
      try {
        const yanit = await fetch('/api/kolon_etki?table_id=' + inspectorTableId +
                                  '&kolon_adi=' + encodeURIComponent(temizKolon));
        inspectorKolonEtkiOnbellek[anahtar] = await yanit.json();
      } catch (err) {
        inspectorKolonEtkiOnbellek[anahtar] = { hata: 'Sunucuya ulaşılamadı.' };
      }
      inspectorKolonEtkiYukleniyor = false;
    }
    inspectorCiz();
  }

  function sekmeButonu(anahtar, etiket, devreDisi) {
    const aktifMi = inspectorAktifSekme === anahtar;
    const sinif = 'inspector-sekme' + (aktifMi ? ' aktif' : '') + (devreDisi ? ' devre-disi' : '');
    return '<span class="' + sinif + '" data-sekme="' + anahtar + '">' + etiket + '</span>';
  }

  function tamAdiParcala(tamAd) {
    const metin = (tamAd || '').trim();
    const nokta = metin.indexOf('.');
    if (nokta > 0) {
      return { schema: metin.slice(0, nokta), tablo: metin.slice(nokta + 1) };
    }
    return { schema: null, tablo: metin };
  }

  function sorguAdHtml(schema, tablo) {
    return (schema ? '<span class="sorgu-ad-schema">' + kacisliMetin(schema) + '</span><span class="sorgu-ad-ayrac"></span>' : '') +
           '<span class="sorgu-ad-tablo">' + kacisliMetin(tablo || '') + '</span>';
  }

  function tamAdHtml(tamAd) {
    const p = tamAdiParcala(tamAd);
    return sorguAdHtml(p.schema, p.tablo);
  }

  function dmlSinif(dml) {
    const tip = (dml || '').toUpperCase();
    if (tip === 'INSERT') return 'dml-insert';
    if (tip === 'UPDATE') return 'dml-update';
    if (tip === 'DELETE') return 'dml-delete';
    if (tip === 'TRUNCATE') return 'dml-truncate';
    if (tip === 'MERGE') return 'dml-merge';
    return 'dml-diger';
  }

  function tabloTamAdi(schema, tablo) {
    return (schema ? schema + '.' : '') + (tablo || '');
  }

  function sqlModalBaglamSatiri(etiket, degerHtml) {
    if (!degerHtml) return '';
    return '<div class="sql-modal-akis-etiket">' + etiket + '</div>' +
           '<div class="sql-modal-akis-deger">' + degerHtml + '</div>';
  }

  function sqlModalIcerikCiz() {
    if (!sqlModalStatement) return;
    const e = sqlModalStatement;
    const ctx = sqlModalContext || {};
    const sadeVarMi = !!e.sql_sade;
    if (!sadeVarMi) sqlModalGorunumModu = 'tam';
    const procedure = (e.paket_adi ? e.paket_adi + '.' : '') + (e.procedure_adi || '');
    sqlModalTitle.textContent = procedure || 'SQL';
    sqlModalMeta.innerHTML =
      '<span class="dml-badge ' + dmlSinif(e.dml_tipi) + '">' + kacisliMetin(e.dml_tipi || 'SQL') + '</span>' +
      '<span class="sql-modal-meta-kutu"><b>Satır:</b> ' + (e.satir_no ? kacisliMetin(String(e.satir_no)) : 'bilgi yok') + '</span>';

    let akisHtml = '';
    if (ctx.hedefTamAd) akisHtml += sqlModalBaglamSatiri('Sorgunun doldurduğu hedef tablo', tamAdHtml(ctx.hedefTamAd));
    if (ctx.kaynaklar && ctx.kaynaklar.length > 0) {
      const kaynakHtml = ctx.kaynaklar.map(function (k) { return tamAdHtml(k); }).join('<br>');
      const kaynakEtiket = ctx.kaynaklar.length > 1
        ? 'Sorgunun okuduğu kaynak tablolar'
        : 'Sorgunun okuduğu kaynak tablo';
      akisHtml += sqlModalBaglamSatiri(kaynakEtiket, kaynakHtml);
    }
    if (sqlModalStatementler.length > 1) {
      const seciciHtml = sqlModalStatementler.map(function (s, i) {
        const proc = (s.paket_adi ? s.paket_adi + '.' : '') + (s.procedure_adi || 'SQL');
        const satir = s.satir_no ? ' / ' + s.satir_no : '';
        return '<button class="sql-modal-statement-btn' + (i === sqlModalStatementIndex ? ' aktif' : '') +
               '" data-sql-statement-index="' + i + '">' + kacisliMetin((i + 1) + '. ' + proc + satir) + '</button>';
      }).join('');
      akisHtml += sqlModalBaglamSatiri('Bu bağlantıyı kuran sorgular',
        '<div class="sql-modal-statement-secici">' + seciciHtml + '</div>');
    }
    sqlModalAkis.innerHTML = akisHtml;

    if (sadeVarMi) {
      sqlModalGorunum.innerHTML =
        '<button class="sql-modal-gorunum-btn' + (sqlModalGorunumModu === 'sade' ? ' aktif' : '') + '" data-sql-modal-gorunum="sade">Sade Görünüm</button>' +
        '<button class="sql-modal-gorunum-btn' + (sqlModalGorunumModu === 'tam' ? ' aktif' : '') + '" data-sql-modal-gorunum="tam">Tam SQL</button>';
    } else {
      sqlModalGorunum.innerHTML = '<span class="sql-modal-meta-kutu">Tam SQL</span>';
    }
    const metin = (sadeVarMi && sqlModalGorunumModu === 'sade') ? e.sql_sade : e.sql_metni;
    sqlModalGovde.innerHTML = sqlRenkli(metin || '', ctx.vurguTablo || inspectorTabloAdi, ctx.vurguKolon || inspectorVurgulananKolon);
  }

  function sqlModalAc(statement, context) {
    if (!statement || !(statement.sql_metni || statement.sql_sade)) return;
    sqlModalStatement = statement;
    sqlModalStatementler = [statement];
    sqlModalStatementIndex = 0;
    sqlModalContext = context || {};
    sqlModalGorunumModu = statement.sql_sade ? 'sade' : 'tam';
    sqlModalIcerikCiz();
    sqlModal.classList.add('acik');
    sqlModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sql-modal-acik');
  }

  function sqlModalKapat() {
    sqlModal.classList.remove('acik');
    sqlModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sql-modal-acik');
    sqlModalStatement = null;
    sqlModalStatementler = [];
    sqlModalStatementIndex = 0;
    sqlModalContext = null;
  }

  function sqlModalStatementlerAc(statementler, context) {
    const liste = (statementler || []).filter(s => s && (s.sql_metni || s.sql_sade));
    if (liste.length === 0) return;
    sqlModalStatementler = liste;
    sqlModalStatementIndex = 0;
    sqlModalStatement = liste[0];
    sqlModalContext = context || {};
    sqlModalGorunumModu = sqlModalStatement.sql_sade ? 'sade' : 'tam';
    sqlModalIcerikCiz();
    sqlModal.classList.add('acik');
    sqlModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sql-modal-acik');
  }

  function sqlModalSorgudanAc(statementId) {
    const veri = inspectorOnbellek[inspectorTableId];
    const entries = veri ? (veri.entries || []) : [];
    const e = entries.find(row => row.statement_id === statementId);
    if (!e) return;
    const mevcutTamAd = tabloTamAdi(veri.schema_adi, veri.tablo_adi);
    const hedefTamAd = e.rol === 'kullanilan' ? e.iliskili_tam_ad : mevcutTamAd;
    const kaynaklar = e.rol === 'kullanilan' ? [mevcutTamAd] : (e.kaynaklar || []);
    sqlModalAc(e, {
      rol: e.rol === 'kullanilan' ? 'Bu tablo kaynak olarak kullanılıyor' : 'Bu tablo dolduruluyor',
      hedefTamAd: hedefTamAd,
      kaynaklar: kaynaklar,
      vurguTablo: inspectorTabloAdi,
      vurguKolon: inspectorVurgulananKolon,
    });
  }

  function sqlModalEtkidenAc(statementId, etkiIndex) {
    const veri = inspectorEtkiOnbellek[inspectorTableId];
    const rows = veri ? (veri.etkilenenler || []) : [];
    const e = Number.isInteger(etkiIndex) && rows[etkiIndex] ? rows[etkiIndex] : rows.find(row => row.statement_id === statementId);
    if (!e) return;
    sqlModalAc(e, {
      rol: 'Etki oluşturan sorgu',
      hedefTamAd: tabloTamAdi(e.schema_adi, e.tablo_adi),
      kaynaklar: [tabloTamAdi(e.kaynak_schema_adi, e.kaynak_tablo_adi)],
      vurguTablo: e.kaynak_tablo_adi || inspectorTabloAdi,
      vurguKolon: inspectorVurgulananKolon,
    });
  }

  function kolonEtkiSayfaYukleniyorGoster(tabloAdi, kolonAdi) {
    document.body.classList.add('kolon-etki-sayfasi');
    kolonEtkiSayfaTitle.textContent = (tabloAdi || 'Tablo') + '.' + (kolonAdi || 'Kolon');
    kolonEtkiSayfaAlt.textContent = 'Kolon seviyesinde aşağı yönlü etki haritası';
    kolonEtkiSayfaGovde.innerHTML = '<div class="inspector-bos">Kolon etki haritası hazırlanıyor...</div>';
    kolonEtkiAktifGovde = kolonEtkiSayfaGovde;
  }

  function kolonKullanimTipiEtiket(tip) {
    const map = {
      JOIN_ON: 'JOIN koşulu',
      WHERE: 'WHERE / filtre',
      CASE_WHEN: 'CASE koşulu',
      MERGE_ON: 'MERGE eşleşmesi',
      GROUP_BY: 'GROUP BY',
      HAVING: 'HAVING',
      ORDER_BY: 'ORDER BY',
    };
    return map[tip] || tip || 'Koşul';
  }

  function kolonEtkiRolOncelik(rol) {
    const map = { kok: 5, rapor: 4, turetilmis: 3, direkt: 2, kosul: 1, kaynak: 0 };
    return map[rol] || 0;
  }

  function kolonEtkiDiagramModeliOlustur(veri) {
    const bas = veri.baslangic || {};
    const kartlar = new Map();
    const kenarlar = [];
    const kenarAnahtarlari = new Set();

    function kartId(tur, ad) {
      return tur + '::' + (ad || '');
    }

    function kolonKey(kartIdDegeri, kolon) {
      return kartIdDegeri + '::' + (kolon || '');
    }

    function kartEkle(tur, ad, seviye, kokMu) {
      const id = kartId(tur, ad);
      let kart = kartlar.get(id);
      if (!kart) {
        kart = { id: id, tur: tur, ad: ad || 'bilgi yok', seviye: seviye, kok: !!kokMu, kolonlar: new Map() };
        kartlar.set(id, kart);
      } else {
        kart.seviye = Math.min(kart.seviye, seviye);
        kart.kok = kart.kok || !!kokMu;
      }
      return kart;
    }

    function kolonEkle(tur, tablo, kolon, veriTipi, seviye, rol, badge) {
      const kart = kartEkle(tur, tablo, seviye, rol === 'kok');
      const key = kolonKey(kart.id, kolon);
      let satir = kart.kolonlar.get(key);
      const badgeClass = rol === 'turetilmis' ? 'turetilmis' : (rol === 'kosul' ? 'kosul' : (rol === 'rapor' ? 'rapor' : 'direkt'));
      function badgeEkle() {
        if (!badge) return;
        if (!satir.badges) satir.badges = [];
        if (!satir.badges.some(function (b) { return b.etiket === badge; })) {
          satir.badges.push({ etiket: badge, sinif: badgeClass });
        }
        if (!satir.badge) satir.badge = badge;
      }
      if (!satir) {
        satir = { key: key, kartId: kart.id, ad: kolon || 'kolon bilgisi yok', veriTipi: veriTipi || '', rol: rol || 'kaynak', badge: '', badges: [] };
        kart.kolonlar.set(key, satir);
        badgeEkle();
      } else {
        if (!satir.veriTipi && veriTipi) satir.veriTipi = veriTipi;
        if (kolonEtkiRolOncelik(rol) > kolonEtkiRolOncelik(satir.rol)) satir.rol = rol;
        badgeEkle();
      }
      return key;
    }

    function kenarEkle(from, to, tur, etiket) {
      if (!from || !to || from === to) return;
      const key = from + '->' + to + '::' + tur;
      if (kenarAnahtarlari.has(key)) return;
      kenarAnahtarlari.add(key);
      kenarlar.push({ from: from, to: to, tur: tur, etiket: etiket || '' });
    }

    const kokKey = kolonEkle('tablo', bas.tam_tablo_adi, bas.kolon_adi, bas.veri_tipi, 0, 'kok', 'KAYNAK');

    (veri.etkilenenler || []).forEach(function (e) {
      const kaynakSeviye = Math.max(0, (e.seviye || 1) - 1);
      const kaynakKey = kolonEkle('tablo', e.kaynak_tam_ad, e.kaynak_kolon, null, kaynakSeviye, 'kaynak', '');
      const turetilmisMi = e.donusum_tipi === 'TURETILMIS';
      const hedefKey = kolonEkle(
        'tablo', e.hedef_tam_ad, e.hedef_kolon, e.hedef_veri_tipi, e.seviye || 1,
        turetilmisMi ? 'turetilmis' : 'direkt',
        turetilmisMi ? 'TÜRETİLMİŞ' : 'DİREKT'
      );
      kenarEkle(kaynakKey, hedefKey, turetilmisMi ? 'turetilmis' : 'lineage', e.donusum_tipi);
    });

    const kosulHedefKolonlari = veri.kosul_hedef_kolonlari || [];
    if (kosulHedefKolonlari.length > 0) {
      kosulHedefKolonlari.forEach(function (k) {
        const kaynakKey = kolonEkle('tablo', k.kaynak_tam_ad, k.kaynak_kolon, k.kaynak_veri_tipi, k.seviye || 0, 'kaynak', '');
        const hedefTur = k.tur === 'rapor' ? 'rapor' : 'tablo';
        const hedefAd = k.tur === 'rapor' ? (k.rapor_adi || k.hedef_tam_ad) : (k.hedef_tam_ad || 'Sorgu sonucu');
        const hedefKey = kolonEkle(
          hedefTur, hedefAd, k.hedef_kolon, k.hedef_veri_tipi || '', k.hedef_seviye || ((k.seviye || 0) + 1),
          'kosul', 'SATIR SEÇİMİ'
        );
        kenarEkle(kaynakKey, hedefKey, 'kosul', k.kullanim_tipi || 'SATIR_SECIMI');
      });
    } else {
      (veri.kosul_kullanimlari || []).forEach(function (k) {
        const kaynakKey = kolonEkle('tablo', k.kaynak_tam_ad, k.kaynak_kolon, k.kaynak_veri_tipi, k.seviye || 0, 'kaynak', '');
        const hedefTur = k.tur === 'rapor' ? 'rapor' : 'tablo';
        const hedefAd = k.tur === 'rapor' ? k.rapor_adi : (k.hedef_tam_ad || 'Sorgu sonucu');
        const hedefKolon = kolonKullanimTipiEtiket(k.kullanim_tipi);
        const hedefKey = kolonEkle(hedefTur, hedefAd, hedefKolon, '', (k.seviye || 0) + 1, 'kosul', 'KOŞUL');
        kenarEkle(kaynakKey, hedefKey, 'kosul', k.kullanim_tipi || 'KOŞUL');
      });
    }

    (veri.etkilenen_raporlar || []).forEach(function (r) {
      const kaynakSeviye = r.seviye || 0;
      const kaynakKey = kolonEkle('tablo', r.kaynak_tam_ad, r.kaynak_kolon, '', kaynakSeviye, 'kaynak', '');
      const raporKey = kolonEkle('rapor', r.rapor_adi, r.rapor_kolon_adi, '', kaynakSeviye + 1, 'rapor', 'RAPOR');
      kenarEkle(kaynakKey, raporKey, 'rapor', r.donusum_tipi);
    });

    const kartListesi = Array.from(kartlar.values()).map(function (kart) {
      return Object.assign({}, kart, { kolonlar: Array.from(kart.kolonlar.values()) });
    });
    const kolonKartHaritasi = {};
    const kartSeviyeHaritasi = {};
    kartListesi.forEach(function (kart) {
      kartSeviyeHaritasi[kart.id] = kart.seviye;
      kart.kolonlar.forEach(function (kolon) { kolonKartHaritasi[kolon.key] = kart.id; });
    });
    const zenginKenarlar = kenarlar.map(function (kenar) {
      const fromKartId = kolonKartHaritasi[kenar.from] || '';
      const toKartId = kolonKartHaritasi[kenar.to] || '';
      return Object.assign({}, kenar, {
        fromKartId: fromKartId,
        toKartId: toKartId,
        fromKartSeviye: kartSeviyeHaritasi[fromKartId],
        toKartSeviye: kartSeviyeHaritasi[toKartId],
      });
    });
    kartListesi.sort(function (a, b) {
      return a.seviye - b.seviye || (a.tur === b.tur ? a.ad.localeCompare(b.ad) : a.tur.localeCompare(b.tur));
    });
    return { kartlar: kartListesi, kenarlar: zenginKenarlar, kokKey: kokKey };
  }

  function kolonEtkiKartKolonlariHtml(kart) {
    if (!kart || !kart.kolonlar || kart.kolonlar.length === 0) {
      return '<div class="inspector-bos">Bu düğüm için kolon detayı yok.</div>';
    }
    let html = '';
    kart.kolonlar.forEach(function (kolon) {
      if (!kolonEtkiKolonGrafteGorunurMu(kolon)) return;
      const rol = kolon.rol || 'kaynak';
      const badges = kolon.badges && kolon.badges.length > 0
        ? kolon.badges
        : (kolon.badge ? [{ etiket: kolon.badge, sinif: rol === 'turetilmis' ? 'turetilmis' : (rol === 'kosul' ? 'kosul' : (rol === 'rapor' ? 'rapor' : 'direkt')) }] : []);
      const gorunurBadges = badges.filter(function (b) { return kolonEtkiBadgeGorunurMu(b, rol); });
      if (!kolonEtkiKolonGorunurMu(kolon) && rol !== 'kok' && rol !== 'kaynak') return;
      const satirRol = kolonEtkiSatirRol(kolon, gorunurBadges);
      const badgesHtml = gorunurBadges.map(function (b) {
        return '<span class="kem-mini-badge ' + kacisliAttr(b.sinif || 'direkt') + '">' + kacisliMetin(b.etiket) + '</span>';
      }).join('');
      html += '<div class="kem-kolon-satir ' + kacisliAttr(satirRol) + '" data-kem-node="' + kacisliAttr(kolon.key) + '">' +
                '<span class="kem-kolon-nokta"></span>' +
                '<span class="kem-kolon-ad">' + kacisliMetin(kolon.ad) +
                  (kolon.veriTipi ? '<span class="kem-kolon-tip">' + kacisliMetin(kolon.veriTipi) + '</span>' : '') +
                '</span>' +
                (badgesHtml ? '<span class="kem-kolon-badgeler">' + badgesHtml + '</span>' : '') +
              '</div>';
    });
    return html;
  }

  function kolonEtkiBadgeAkisTipi(badge) {
    const sinif = badge && badge.sinif;
    if (sinif === 'turetilmis') return 'turetilmis';
    if (sinif === 'kosul') return 'kosul';
    if (sinif === 'rapor') return 'rapor';
    return 'lineage';
  }

  function kolonEtkiBadgeGorunurMu(badge, rol) {
    if (rol === 'kok' || rol === 'kaynak') return true;
    return kolonEtkiAkisFiltreleri[kolonEtkiBadgeAkisTipi(badge)] !== false;
  }

  function kolonEtkiKolonGorunurMu(kolon) {
    const rol = kolon.rol || 'kaynak';
    if (rol === 'kok' || rol === 'kaynak') return true;
    const badges = kolon.badges && kolon.badges.length > 0
      ? kolon.badges
      : (kolon.badge ? [{ etiket: kolon.badge, sinif: rol === 'turetilmis' ? 'turetilmis' : (rol === 'kosul' ? 'kosul' : (rol === 'rapor' ? 'rapor' : 'direkt')) }] : []);
    return badges.some(function (b) { return kolonEtkiBadgeGorunurMu(b, rol); });
  }

  function kolonEtkiKolonGrafteGorunurMu(kolon) {
    if (!kolonEtkiSonGorunurGraf || !kolon) return true;
    return kolonEtkiSonGorunurGraf.dugumler.has(kolon.key);
  }

  function kolonEtkiSatirRol(kolon, badges) {
    const rol = kolon.rol || 'kaynak';
    if (rol === 'kok' || rol === 'kaynak' || rol === 'rapor') return rol;
    if (badges.some(function (b) { return b.sinif === 'turetilmis'; })) return 'turetilmis';
    if (badges.some(function (b) { return b.sinif === 'direkt'; })) return 'direkt';
    if (badges.some(function (b) { return b.sinif === 'kosul'; })) return 'kosul';
    return rol;
  }

  function kolonEtkiDiagramHtml(model) {
    if (!model || model.kartlar.length === 0) {
      return '<div class="inspector-bos">Diyagram için gösterilecek kolon bağlantısı bulunamadı.</div>';
    }
    const seviyeler = {};
    const gorunurGraf = kolonEtkiGorunurGrafHesapla(model);
    kolonEtkiSonGorunurGraf = gorunurGraf;
    const gorunurKartlar = model.kartlar.filter(function (kart) {
      return kolonEtkiKartGorunurMu(kart, gorunurGraf);
    });
    gorunurKartlar.forEach(function (kart) {
      seviyeler[kart.seviye] = seviyeler[kart.seviye] || [];
      seviyeler[kart.seviye].push(kart);
    });
    const seviyeListesi = Object.keys(seviyeler).map(Number).sort((a, b) => a - b);
    if (seviyeListesi.length === 0) {
      return kolonEtkiLegendHtml() + '<div class="inspector-bos">Seçili akış türleri için gösterilecek bağlantı bulunamadı.</div>';
    }

    let html = kolonEtkiLegendHtml() +
               '<div class="kem-diagram-kapsayici">' +
                 '<div class="kem-diagram-icerik">' +
                   '<svg class="kem-diagram-svg"></svg>' +
                   '<div class="kem-diagram-grid">';

    seviyeListesi.forEach(function (seviye) {
      html += '<div class="kem-diagram-seviye">' +
                '<div class="kem-diagram-seviye-baslik">' + (seviye === 0 ? 'Başlangıç' : 'Seviye ' + seviye) + '</div>';
      seviyeler[seviye].forEach(function (kart) {
        const kartSinif = 'kem-kolon-kart' + (kart.kok ? ' kok' : '') + (kart.tur === 'rapor' ? ' rapor' : '');
        html += '<div class="' + kartSinif + '" data-kem-card="' + kacisliAttr(kart.id) + '">' +
                  '<div class="kem-kart-baslik">' +
                    '<div class="kem-kart-ad">' + kacisliMetin(kart.ad) + '</div>' +
                    '<div class="kem-kart-sag">' +
                      '<span class="kem-kart-detay">' + kolonEtkiKartGorunurKolonSayisi(kart) + ' kolon</span>' +
                      '<span class="kem-kart-tip">' + (kart.tur === 'rapor' ? 'RAPOR' : 'TABLO') + '</span>' +
                    '</div>' +
                  '</div>' +
                  '<div class="kem-kolon-listesi" data-kem-kolon-listesi="' + kacisliAttr(kart.id) + '"></div>' +
                '</div>';
      });
      html += '</div>';
    });

    html += '</div></div></div>';
    return html;
  }

  function kolonEtkiLegendHtml() {
    function item(tip, icHtml, etiket) {
      const aktif = kolonEtkiAkisFiltreleri[tip] !== false;
      return '<button type="button" class="kem-legend-item' + (aktif ? ' aktif' : ' pasif') + '" data-kem-akis="' + tip + '">' +
               icHtml + kacisliMetin(etiket) +
             '</button>';
    }
    return '<div class="kem-legend">' +
             item('lineage', '<span class="kem-legend-cizgi"></span>', 'DİREKT kolon akışı') +
             item('turetilmis', '<span class="kem-legend-cizgi turetilmis"></span>', 'Türetilmiş kolon akışı') +
             item('kosul', '<span class="kem-mini-badge kosul">SATIR SEÇİMİ</span>', 'Sorgu içinde kolon akışı') +
             item('rapor', '<span class="kem-legend-cizgi rapor"></span>', 'Rapor kolon akışı') +
           '</div>';
  }

  function kolonEtkiGorunurGrafHesapla(model) {
    const dugumler = new Set();
    const kenarlar = [];
    const kartlar = new Set();
    if (!model || !model.kokKey) return { dugumler, kenarlar, kartlar };
    const komsular = {};
    model.kenarlar.filter(kolonEtkiKenarGorunurMu).forEach(function (kenar) {
      komsular[kenar.from] = komsular[kenar.from] || [];
      komsular[kenar.from].push(kenar);
    });
    const kuyruk = [model.kokKey];
    dugumler.add(model.kokKey);
    while (kuyruk.length > 0) {
      const dugum = kuyruk.shift();
      (komsular[dugum] || []).forEach(function (kenar) {
        kenarlar.push(kenar);
        if (!dugumler.has(kenar.to)) {
          dugumler.add(kenar.to);
          kuyruk.push(kenar.to);
        }
      });
    }
    kenarlar.forEach(function (kenar) {
      if (kenar.fromKartId) kartlar.add(kenar.fromKartId);
      if (kenar.toKartId) kartlar.add(kenar.toKartId);
    });
    return { dugumler, kenarlar, kartlar };
  }

  function kolonEtkiKartGorunurKolonSayisi(kart) {
    if (!kart || !kart.kolonlar) return 0;
    return kart.kolonlar.filter(kolonEtkiKolonGrafteGorunurMu).length;
  }

  function kolonEtkiKartGorunurMu(kart, gorunurGraf) {
    if (!kart) return false;
    if (kart.kok) return true;
    return !!(gorunurGraf && gorunurGraf.kartlar.has(kart.id));
  }

  function kolonEtkiKenarGorunurMu(kenar) {
    if (!kenar) return false;
    if (kenar.tur === 'turetilmis') return kolonEtkiAkisFiltreleri.turetilmis !== false;
    if (kenar.tur === 'rapor') return kolonEtkiAkisFiltreleri.rapor !== false;
    if (kenar.tur === 'kosul') return kolonEtkiAkisFiltreleri.kosul !== false;
    return kolonEtkiAkisFiltreleri.lineage !== false;
  }

  function kolonEtkiAktifKenarlar(model) {
    if (!model) return [];
    return kolonEtkiSonGorunurGraf ? kolonEtkiSonGorunurGraf.kenarlar : model.kenarlar.filter(kolonEtkiKenarGorunurMu);
  }

  function kolonEtkiCizilecekKenarlar(model) {
    const kenarlar = kolonEtkiAktifKenarlar(model);
    if (kolonEtkiSeciliNode) {
      return kenarlar.filter(function (kenar) {
        return kenar.from === kolonEtkiSeciliNode || kenar.to === kolonEtkiSeciliNode;
      });
    }
    return [];
  }

  function kolonEtkiSecimSiniflariniTemizle(govde) {
    govde.querySelectorAll('.kem-kolon-satir').forEach(function (el) {
      el.classList.remove('kem-secili', 'kem-iliskili', 'kem-soluk');
    });
    govde.querySelectorAll('.kem-kolon-kart').forEach(function (el) {
      el.classList.remove('kem-secili-kart', 'kem-iliskili-kart');
    });
  }

  function kolonEtkiSecimiUygula(model) {
    const govde = kolonEtkiAktifGovde || kolonEtkiSayfaGovde;
    kolonEtkiSecimSiniflariniTemizle(govde);
    if (!model || !kolonEtkiSeciliNode) return;
    const iliskiliNodeLar = new Set([kolonEtkiSeciliNode]);
    const iliskiliKartlar = new Set();
    let seciliKartId = null;
    model.kartlar.forEach(function (kart) {
      if ((kart.kolonlar || []).some(function (kolon) { return kolon.key === kolonEtkiSeciliNode; })) {
        seciliKartId = kart.id;
      }
    });
    const kenarlar = kolonEtkiAktifKenarlar(model).filter(function (kenar) {
      return kenar.from === kolonEtkiSeciliNode || kenar.to === kolonEtkiSeciliNode;
    });
    kenarlar.forEach(function (kenar) {
      iliskiliNodeLar.add(kenar.from);
      iliskiliNodeLar.add(kenar.to);
      if (kenar.fromKartId) iliskiliKartlar.add(kenar.fromKartId);
      if (kenar.toKartId) iliskiliKartlar.add(kenar.toKartId);
    });

    govde.querySelectorAll('.kem-kolon-satir[data-kem-node]').forEach(function (el) {
      if (el.dataset.kemNode === kolonEtkiSeciliNode) el.classList.add('kem-secili');
      else if (iliskiliNodeLar.has(el.dataset.kemNode)) el.classList.add('kem-iliskili');
      else el.classList.add('kem-soluk');
    });
    govde.querySelectorAll('.kem-kolon-kart[data-kem-card]').forEach(function (el) {
      if (el.dataset.kemCard === seciliKartId || el.querySelector('.kem-kolon-satir.kem-secili')) el.classList.add('kem-secili-kart');
      else if (iliskiliKartlar.has(el.dataset.kemCard)) el.classList.add('kem-iliskili-kart');
    });
  }

  function kolonEtkiDiagramYenidenCiz() {
    const govde = kolonEtkiAktifGovde || kolonEtkiSayfaGovde;
    const alan = govde.querySelector('.kem-diagram-alani');
    if (!alan || !kolonEtkiSonDiagramModel) return;
    const acikKartlar = new Set(Array.from(alan.querySelectorAll('.kem-kolon-kart.acik')).map(function (el) {
      return el.dataset.kemCard;
    }));
    alan.innerHTML = kolonEtkiDiagramHtml(kolonEtkiSonDiagramModel);
    acikKartlar.forEach(function (kartId) {
      const kartEl = alan.querySelector('[data-kem-card="' + CSS.escape(kartId) + '"]');
      const kart = kolonEtkiSonDiagramModel.kartlar.find(function (k) { return k.id === kartId; });
      const liste = kartEl ? kartEl.querySelector('[data-kem-kolon-listesi]') : null;
      if (kartEl && kart && liste) {
        kartEl.classList.add('acik');
        liste.innerHTML = kolonEtkiKartKolonlariHtml(kart);
        liste.dataset.rendered = '1';
      }
    });
    requestAnimationFrame(function () { kolonEtkiDiagramOklariniCiz(kolonEtkiSonDiagramModel); });
    kolonEtkiOzetYenile();
  }

  function kolonEtkiOzetHtml(model) {
    if (!model || !kolonEtkiSonGorunurGraf) return '';
    const etkilenenTablolar = new Set();
    const etkilenenTabloKolonlari = new Set();
    const etkilenenRaporKolonlari = new Set();
    const satirSecimiKolonlari = new Set();
    model.kartlar.forEach(function (kart) {
      (kart.kolonlar || []).forEach(function (kolon) {
        if (!kolonEtkiKolonGrafteGorunurMu(kolon)) return;
        const rol = kolon.rol || 'kaynak';
        if (rol === 'kok' || rol === 'kaynak') return;
        const tamKolon = kart.ad + '.' + kolon.ad;
        if (kart.tur === 'rapor') {
          etkilenenRaporKolonlari.add(tamKolon);
        } else {
          etkilenenTablolar.add(kart.ad);
          etkilenenTabloKolonlari.add(tamKolon);
        }
        const badges = kolon.badges && kolon.badges.length > 0
          ? kolon.badges
          : (kolon.badge ? [{ etiket: kolon.badge, sinif: rol === 'turetilmis' ? 'turetilmis' : (rol === 'kosul' ? 'kosul' : (rol === 'rapor' ? 'rapor' : 'direkt')) }] : []);
        if (badges.some(function (b) { return b.sinif === 'kosul' && kolonEtkiBadgeGorunurMu(b, rol); })) {
          satirSecimiKolonlari.add(tamKolon);
        }
      });
    });
    return '<div class="kem-ozet">' +
             '<div class="kem-ozet-kutu"><div class="kem-ozet-sayi">' + etkilenenTablolar.size + '</div><div class="kem-ozet-etiket">etkilenen tablo</div></div>' +
             '<div class="kem-ozet-kutu"><div class="kem-ozet-sayi">' + etkilenenTabloKolonlari.size + '</div><div class="kem-ozet-etiket">etkilenen tablo kolonu</div></div>' +
             '<div class="kem-ozet-kutu"><div class="kem-ozet-sayi">' + etkilenenRaporKolonlari.size + '</div><div class="kem-ozet-etiket">etkilenen rapor kolonu</div></div>' +
             '<div class="kem-ozet-kutu"><div class="kem-ozet-sayi">' + satirSecimiKolonlari.size + '</div><div class="kem-ozet-etiket">satır seçimi etkisi</div></div>' +
           '</div>';
  }

  function kolonEtkiOzetYenile() {
    const govde = kolonEtkiAktifGovde || kolonEtkiSayfaGovde;
    const ozet = govde.querySelector('.kem-ozet-alani');
    if (ozet) ozet.innerHTML = kolonEtkiOzetHtml(kolonEtkiSonDiagramModel);
  }

  function kolonEtkiDiagramOklariniCiz(model) {
    const govde = kolonEtkiAktifGovde || kolonEtkiSayfaGovde;
    const icerik = govde.querySelector('.kem-diagram-icerik');
    const svg = govde.querySelector('.kem-diagram-svg');
    if (!icerik || !svg || !model) return;
    const nodeEls = Array.from(icerik.querySelectorAll('[data-kem-node]')).filter(function (el) {
      return el.getClientRects().length > 0;
    });
    const nodeMap = {};
    nodeEls.forEach(function (el) { nodeMap[el.dataset.kemNode] = el; });
    const cardEls = Array.from(icerik.querySelectorAll('[data-kem-card]'));
    const cardMap = {};
    cardEls.forEach(function (el) { cardMap[el.dataset.kemCard] = el; });
    const rect = icerik.getBoundingClientRect();
    const genislik = Math.max(icerik.scrollWidth, icerik.offsetWidth);
    const yukseklik = Math.max(icerik.scrollHeight, icerik.offsetHeight);
    svg.setAttribute('width', genislik);
    svg.setAttribute('height', yukseklik);
    svg.setAttribute('viewBox', '0 0 ' + genislik + ' ' + yukseklik);
    svg.innerHTML =
      '<defs>' +
        '<marker id="kemOkLineage" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#70D7A2"/></marker>' +
        '<marker id="kemOkTuretilmis" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#8FB7FF"/></marker>' +
        '<marker id="kemOkKosul" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#C99A44"/></marker>' +
        '<marker id="kemOkRapor" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#CDB7FF"/></marker>' +
      '</defs>';

    const cizilenKartKenarlari = new Set();
    function kenarCiz(fromEl, toEl, tur, kartSeviyesi, vurgulu) {
      if (!fromEl || !toEl) return;
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      const x1 = a.right - rect.left;
      const y1 = a.top + a.height / 2 - rect.top;
      const x2 = b.left - rect.left;
      const y2 = b.top + b.height / 2 - rect.top;
      const dx = Math.max(42, Math.abs(x2 - x1) * 0.45);
      const c1x = x1 + dx;
      const c2x = x2 - dx;
      const marker = tur === 'kosul' ? 'kemOkKosul' : (tur === 'rapor' ? 'kemOkRapor' : (tur === 'turetilmis' ? 'kemOkTuretilmis' : 'kemOkLineage'));
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'kem-diagram-path ' + (kartSeviyesi ? 'tablo ' : '') + tur + (vurgulu ? ' vurgu' : ''));
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + c1x + ' ' + y1 + ', ' + c2x + ' ' + y2 + ', ' + x2 + ' ' + y2);
      path.setAttribute('marker-end', 'url(#' + marker + ')');
      svg.appendChild(path);
    }

    const cizilecekKenarlar = kolonEtkiCizilecekKenarlar(model);
    cizilecekKenarlar.forEach(function (kenar) {
      const seciliKenarMi = kolonEtkiSeciliNode && (kenar.from === kolonEtkiSeciliNode || kenar.to === kolonEtkiSeciliNode);
      const fromEl = nodeMap[kenar.from];
      const toEl = nodeMap[kenar.to];
      if (fromEl && toEl) {
        kenarCiz(fromEl, toEl, kenar.tur, false, seciliKenarMi);
        return;
      }
      if (!kenar.fromKartId || !kenar.toKartId || kenar.fromKartId === kenar.toKartId) return;
      const fromCizimEl = fromEl || cardMap[kenar.fromKartId];
      const toCizimEl = toEl || cardMap[kenar.toKartId];
      const kartSeviyesiMi = !fromEl && !toEl;
      if (kartSeviyesiMi) {
        const kartKey = kenar.fromKartId + '->' + kenar.toKartId + '::' + kenar.tur;
        if (cizilenKartKenarlari.has(kartKey)) return;
        cizilenKartKenarlari.add(kartKey);
      }
      kenarCiz(fromCizimEl, toCizimEl, kenar.tur, kartSeviyesiMi, seciliKenarMi);
    });
    kolonEtkiSecimiUygula(model);
  }

  function kolonEtkiKartDetayToggle(kartEl) {
    if (!kartEl || !kolonEtkiSonDiagramModel) return;
    const kartId = kartEl.dataset.kemCard;
    const liste = kartEl.querySelector('[data-kem-kolon-listesi]');
    const kart = kolonEtkiSonDiagramModel.kartlar.find(function (k) { return k.id === kartId; });
    if (!liste || !kart) return;
    const acikMi = kartEl.classList.toggle('acik');
    if (acikMi && !liste.dataset.rendered) {
      liste.innerHTML = kolonEtkiKartKolonlariHtml(kart);
      liste.dataset.rendered = '1';
    }
    requestAnimationFrame(function () { kolonEtkiDiagramOklariniCiz(kolonEtkiSonDiagramModel); });
  }

  function kolonEtkiKolonSec(nodeKey) {
    if (!nodeKey || !kolonEtkiSonDiagramModel) return;
    kolonEtkiSeciliNode = kolonEtkiSeciliNode === nodeKey ? null : nodeKey;
    requestAnimationFrame(function () { kolonEtkiDiagramOklariniCiz(kolonEtkiSonDiagramModel); });
  }

  function kolonKosulKullanimlariHtml(kullanimlar, aktifMi) {
    if (aktifMi === false) {
      return '<div class="inspector-bos">Koşul/join kataloğu henüz oluşturulmamış. Migration çalışıp katalog tekrar üretildiğinde burada görünecek.</div>';
    }
    if (!kullanimlar || kullanimlar.length === 0) {
      return '';
    }
    let html = '';
    kullanimlar.forEach(function (k) {
      const proc = (k.paket_adi ? k.paket_adi + '.' : '') + (k.procedure_adi || '');
      const hedef = k.tur === 'rapor'
        ? ('Rapor: ' + (k.rapor_adi || ''))
        : ('Hedef tablo: ' + (k.hedef_tam_ad || 'bilgi yok'));
      html += '<div class="kem-adim kem-kosul">' +
                '<div class="kem-kosul-hedef">' + kacisliMetin(hedef) + '</div>' +
                '<div class="kem-meta">' +
                  '<span class="kem-badge">' + kacisliMetin(k.kaynak_tam_ad) + '.' + kacisliMetin(k.kaynak_kolon) + '</span>' +
                  '<span class="kem-badge">' + kacisliMetin(kolonKullanimTipiEtiket(k.kullanim_tipi)) + '</span>' +
                  (k.seviye ? '<span class="kem-badge">Kolon seviye ' + kacisliMetin(String(k.seviye)) + '</span>' : '') +
                  (proc ? '<span class="kem-badge">' + kacisliMetin(proc) + '</span>' : '') +
                  (k.satir_no ? '<span class="kem-badge">Satır ' + kacisliMetin(String(k.satir_no)) + '</span>' : '') +
                  (k.guven_seviyesi === 'TAHMIN' ? '<span class="cl-tahmin">(tahmin)</span>' : '') +
                '</div>' +
                (k.ifade_metni ? '<details class="kem-ifade"><summary>Koşul ifadesi</summary><pre>' + sqlRenkli(k.ifade_metni, inspectorTabloAdi, k.kaynak_kolon) + '</pre></details>' : '') +
              '</div>';
    });
    return html;
  }

  function kolonEtkiSayfaCiz(veri, kolonAdi, tabloAdi) {
    kolonEtkiSayfaTitle.textContent = (tabloAdi || inspectorTabloAdi || 'Tablo') + '.' + (kolonAdi || 'Kolon');
    kolonEtkiSayfaAlt.textContent = 'Yeşil/mavi çizgiler değer akışını, SATIR SEÇİMİ etiketi koşul/join/filter etkisini gösterir.';
    kolonEtkiAktifGovde = kolonEtkiSayfaGovde;
    if (!veri) {
      kolonEtkiSayfaGovde.innerHTML = '<div class="inspector-bos">Kolon etkisi bulunamadı.</div>';
    } else if (veri.hata) {
      kolonEtkiSayfaGovde.innerHTML = '<div class="inspector-bos">' + kacisliMetin(veri.hata) + '</div>';
    } else {
      const etkilenenler = veri.etkilenenler || [];
      const raporlar = veri.etkilenen_raporlar || [];
      const kosulKullanimlari = veri.kosul_kullanimlari || [];
      const diagramModel = kolonEtkiDiagramModeliOlustur(veri);
      kolonEtkiSonDiagramModel = diagramModel;
      const diagramHtml = kolonEtkiDiagramHtml(diagramModel);
      let html = '<div class="kem-ozet-alani">' + kolonEtkiOzetHtml(diagramModel) + '</div>' +
                 '<div class="kem-bolum-baslik">Tablo Bağlantıları <span class="cl-tahmin">(kolon detayı için tabloya tıklayın)</span></div>' +
                 '<div class="kem-diagram-alani">' + diagramHtml + '</div>' +
                 '<div class="kem-kontrol-not">Seçili akış türleriyle ulaşılabilen tüm etki katmanları gösterilir.</div>';
      const kosulDetaylari = kolonKosulKullanimlariHtml(kosulKullanimlari, veri.kosul_kullanimlari_aktif);
      if (kosulDetaylari) {
        html += '<div class="kem-kosul-detaylar">' +
                  '<div class="kem-bolum-baslik">Koşul İfadeleri</div>' +
                  kosulDetaylari +
                '</div>';
      }
      kolonEtkiSayfaGovde.innerHTML = html;
      requestAnimationFrame(function () { kolonEtkiDiagramOklariniCiz(diagramModel); });
    }
  }

  async function kolonEtkiSayfasiBaslat() {
    kolonEtkiAkisFiltreleriniUrlParamdanOku();
    const tableId = urlParams.get('table_id');
    const kolonAdi = (urlParams.get('kolon') || '').trim();
    const tabloAdi = urlParams.get('tablo') || 'Tablo';
    if (!tableId || !kolonAdi) {
      document.body.classList.add('kolon-etki-sayfasi');
      kolonEtkiSayfaTitle.textContent = 'Kolon Etkisi';
      kolonEtkiSayfaGovde.innerHTML = '<div class="inspector-bos">Kolon etki sayfası için table_id ve kolon parametreleri gerekli.</div>';
      return;
    }
    kolonEtkiSayfaGeri.href = '/?tablo=' + encodeURIComponent(tabloAdi);
    kolonEtkiSayfaYukleniyorGoster(tabloAdi, kolonAdi);
    let veri;
    try {
      const yanit = await fetch('/api/kolon_etki?table_id=' + encodeURIComponent(tableId) +
                                '&kolon_adi=' + encodeURIComponent(kolonAdi) +
                                '&akis=' + encodeURIComponent(kolonEtkiAktifAkisParam()));
      veri = await yanit.json();
      if (!yanit.ok) throw new Error(veri.hata || 'kolon etkisi alınamadı');
    } catch (err) {
      veri = { hata: String(err.message || err) };
    }
    kolonEtkiSayfaCiz(veri, kolonAdi, tabloAdi);
  }

  function inspectorSqlHtml(veri) {
    const entries = veri.entries || [];
    if (entries.length === 0) {
      return '<div class="inspector-bos">Bu tablo için kayıtlı bir SQL bulunamadı.</div>';
    }
    if (inspectorSeciliStatementId === null) inspectorSeciliStatementId = entries[0].statement_id;
    const secili = entries.find(e => e.statement_id === inspectorSeciliStatementId) || entries[0];

    let html = '';
    const yazanlar = entries.filter(e => e.rol === 'yazan');
    const kullanilanlar = entries.filter(e => e.rol === 'kullanilan');
    const mevcutTabloBaslik = sorguAdHtml(veri.schema_adi, veri.tablo_adi);

    function sorguSecenekHtml(e) {
      const aktifMi = e.statement_id === secili.statement_id;
      const baglam = e.rol === 'yazan'
        ? kacisliMetin(e.paket_adi) + '.' + kacisliMetin(e.procedure_adi)
        : kacisliMetin(e.paket_adi) + '.' + kacisliMetin(e.procedure_adi) + ' → ' + tamAdHtml(e.iliskili_tam_ad);
      return '<div class="inspector-sql-secenek' + (aktifMi ? ' aktif' : '') + '" data-statement-id="' + e.statement_id + '">' +
               '<span class="inspector-sql-secenek-metin">' + baglam + '</span>' +
               '<span class="dml-badge ' + dmlSinif(e.dml_tipi) + '">' + kacisliMetin(e.dml_tipi) + '</span>' +
             '</div>';
    }

    html += '<div class="inspector-sql-secici">';
    if (yazanlar.length > 0) {
      html += '<div class="inspector-sql-grup">' +
                '<div class="inspector-sql-grup-baslik">' + mevcutTabloBaslik + ' tablosunu dolduran sorgular (' + yazanlar.length + ')</div>';
      yazanlar.forEach(function (e) { html += sorguSecenekHtml(e); });
      html += '</div>';
    }
    if (kullanilanlar.length > 0) {
      html += '<div class="inspector-sql-grup">' +
                '<div class="inspector-sql-grup-baslik">' + mevcutTabloBaslik + ' tablosunu kaynak olarak kullanan sorgular (' + kullanilanlar.length + ')</div>' +
                '<div class="inspector-sql-format-notu"><b>Prosedür</b><span class="ok">→</span><b>Etkilediği tablo</b></div>';
      kullanilanlar.forEach(function (e) { html += sorguSecenekHtml(e); });
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="inspector-sql-alan">';
    html += '<div class="sorgu-satir-notu"><b>Satır:</b> ' +
              (secili.satir_no ? kacisliMetin(String(secili.satir_no)) : 'bilgi yok') +
            '</div>';
    if ((secili.kaynaklar || []).length > 0) {
      const kaynakAcik = secili.kaynaklar.length <= 5 ? ' open' : '';
      const kaynakBaslik = secili.kaynaklar.length === 1
        ? 'Seçili sorgunun okuduğu kaynak tablo'
        : 'Seçili sorgunun okuduğu kaynak tablolar';
      html += '<details class="sorgu-kaynak-detay"' + kaynakAcik + '>' +
                '<summary>' + kaynakBaslik + ' (' + secili.kaynaklar.length + ')</summary>' +
                '<div class="sorgu-kaynak-listesi">';
      secili.kaynaklar.forEach(function (k) {
        html += '<div class="sorgu-kaynak-satir">' + tamAdHtml(k) + '</div>';
      });
      html += '</div></details>';
    }

    html += '</div>';
    return html;
  }

  // Escape edilmis metin icinde tablo adini (buyuk/kucuk harf duyarsiz, tam
  // kelime siniriyla -- baska bir kelimenin parcasi eslesmesin) sari vurguyla
  // isaretler. Orijinal harf buyuklugunu KORUR (SQL'de nasil yazilmissa oyle
  // kalir), sadece etrafina <mark> sarar.
  function vurgula(escapedMetin, tabloAdi) {
    if (!tabloAdi) return escapedMetin;
    const guvenliAd = tabloAdi.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const regex = new RegExp('\\\\b(' + guvenliAd + ')\\\\b', 'gi');
    return escapedMetin.replace(regex, '<mark class="sql-vurgu">$1</mark>');
  }

  // Basit bir editor-tarzi SQL sozdizimi renklendirici. Metni TEK GECISTE
  // (yorum/string/sayi/anahtar-kelime/kelime olarak) parcalara ayirir --
  // boylece hem renklendirme hem tablo-adi vurgusu AYNI ADIMDA uygulanir,
  // iki ayri regex gecisinin (once renklendir, sonra vurgula ara) HTML
  // etiketlerinin icine yanlislikla eslesme riskini tasimaz.
  const SQL_ANAHTAR_KELIMELER = new Set([
    'select','insert','into','update','delete','merge','using','on','from','where','and','or','not',
    'in','exists','is','null','join','left','right','inner','outer','full','cross','union','all',
    'distinct','group','by','order','having','as','case','when','then','else','end','values','set',
    'execute','immediate','commit','rollback','truncate','table','create','replace','procedure',
    'begin','exception','when','others','raise','return','declare','cursor','loop','end loop','if',
    'elsif','for','while','with','over','partition','asc','desc','between','like','nvl','decode',
    'to_date','to_char','to_number','cast','substr','trim','count','sum','avg','min','max','rank',
    'rowid','sysdate','dual','connect','prior','nulls','first','last',
  ]);
  const SQL_TOKEN_REGEX = /(--[^\\n]*)|(\\/\\*[\\s\\S]*?\\*\\/)|('(?:[^']|'')*')|(\\b\\d+\\.?\\d*\\b)|([A-Za-z_][A-Za-z0-9_$#]*(?:@[A-Za-z0-9_$#]+)?)|(\\s+)|([^\\sA-Za-z0-9_])/g;

  function sqlRenkli(hamMetin, tabloAdi, kolonAdi) {
    if (!hamMetin) return '';
    const tabloAdiKucuk = tabloAdi ? tabloAdi.toLowerCase() : null;
    const kolonAdiKucuk = kolonAdi ? kolonAdi.toLowerCase() : null;
    let sonuc = '';
    let m;
    SQL_TOKEN_REGEX.lastIndex = 0;
    while ((m = SQL_TOKEN_REGEX.exec(hamMetin)) !== null) {
      const parca = kacisliMetin(m[0]);
      if (m[1] || m[2]) {
        sonuc += '<span class="sql-tok-comment">' + parca + '</span>';
      } else if (m[3]) {
        sonuc += '<span class="sql-tok-str">' + parca + '</span>';
      } else if (m[4]) {
        sonuc += '<span class="sql-tok-num">' + parca + '</span>';
      } else if (m[5]) {
        // '@' iceren bir kelime (dblink) ise sadece '@'den ONCEKI kismi
        // tablo/kolon adiyla karsilastir (ornek: pyf_fm_institution@csofsa)
        const govdeKisim = m[5].split('@')[0];
        const govdeKucuk = govdeKisim.toLowerCase();
        if ((tabloAdiKucuk && govdeKucuk === tabloAdiKucuk) || (kolonAdiKucuk && govdeKucuk === kolonAdiKucuk)) {
          sonuc += '<mark class="sql-vurgu">' + parca + '</mark>';
        } else if (SQL_ANAHTAR_KELIMELER.has(m[5].toLowerCase())) {
          sonuc += '<span class="sql-tok-kw">' + parca + '</span>';
        } else {
          sonuc += parca;
        }
      } else {
        sonuc += parca;
      }
    }
    return sonuc;
  }

  function inspectorKolonlarHtml() {
    const veri = inspectorKolonOnbellek[inspectorTableId];
    if (!veri) return '<div class="inspector-bos">Yükleniyor...</div>';
    if (veri.hata) return '<div class="inspector-bos">' + kacisliMetin(veri.hata) + '</div>';
    if (!veri.kolonlar || veri.kolonlar.length === 0) {
      return '<div class="inspector-bos">Bu tablonun kayıtlı kolonu yok.</div>';
    }
    const vurgulananKucuk = inspectorVurgulananKolon ? inspectorVurgulananKolon.toLowerCase() : null;
    let html = '<div class="kolon-paneli-liste">';
    veri.kolonlar.forEach(function (k) {
      const vurguluMu = vurgulananKucuk && k.kolon_adi.toLowerCase() === vurgulananKucuk;
      html += '<div class="kolon-paneli-satir' + (vurguluMu ? ' kolon-satir-vurgulu' : '') + '"' +
                (vurguluMu ? ' id="vurgulananKolonSatiri"' : '') + '>' +
                '<span class="kolon-paneli-sira">' + (k.kolon_sira != null ? k.kolon_sira : '') + '</span>' +
                '<span class="kolon-paneli-ad">' + (vurguluMu ? '<mark class="sql-vurgu">' + kacisliMetin(k.kolon_adi) + '</mark>' : kacisliMetin(k.kolon_adi)) + '</span>' +
                '<span class="kolon-paneli-tip">' + kacisliMetin(k.veri_tipi || '—') + '</span>' +
                '<button class="kolon-etki-hizli-btn" data-kolon-adi="' + kacisliAttr(k.kolon_adi) + '">Etki</button>' +
              '</div>';
    });
    html += '</div>';
    return html;
  }

  function inspectorCiz() {
    const veri = inspectorOnbellek[inspectorTableId];
    let html = '<div class="inspector-baslik-satir">' +
                 '<span class="inspector-baslik-metin">' + kacisliMetin(inspectorTabloAdi) + '</span>' +
               '</div>' +
               '<div class="inspector-sekme-bar">' +
                 sekmeButonu('sql', 'SORGU') + sekmeButonu('kolonlar', 'KOLONLAR') +
                 sekmeButonu('lineage', 'LINEAGE') + sekmeButonu('etki', 'ETKİ') +
               '</div>' +
               '<div class="inspector-icerik">';

    if (inspectorAktifSekme === 'kolonlar') {
      html += inspectorKolonlarHtml();
    } else if (inspectorAktifSekme === 'lineage') {
      html += inspectorLineageHtml();
    } else if (inspectorAktifSekme === 'etki') {
      html += inspectorEtkiHtml();
    } else if (!veri) {
      html += '<div class="inspector-bos">Yükleniyor...</div>';
    } else if (veri.hata) {
      html += '<div class="inspector-bos">' + kacisliMetin(veri.hata) + '</div>';
    } else if (inspectorAktifSekme === 'sql') {
      html += inspectorSqlHtml(veri);
    }
    html += '</div>';
    inspector.innerHTML = html;
    // filtre kutusu varsa (Column Lineage sekmesi) her cizimde odagi ve imlec konumunu koru
    const filtreKutusu = inspector.querySelector('.inspector-filtre');
    if (filtreKutusu) {
      filtreKutusu.focus();
      filtreKutusu.setSelectionRange(filtreKutusu.value.length, filtreKutusu.value.length);
    }
    // Kolonlar sekmesindeyken vurgulanan satir varsa gorunur alana kaydir --
    // liste yuzlerce kolon icerebiliyor, vurgu tek basina bulunmasi zor olurdu
    const vurgulananSatir = inspector.querySelector('#vurgulananKolonSatiri');
    if (vurgulananSatir) {
      vurgulananSatir.scrollIntoView({ block: 'center' });
    }
    panelYuksekliginiAyarla();
  }

  // Panel'in max-height'ini CSS'te SABIT bir deger yerine, panelin O ANKI
  // gercek konumuna gore JS ile hesaplar -- boylece GENERAL INFO seridi
  // acilip/kapanip ust bosluk degistiginde bile panel HER ZAMAN kalan
  // dikey alana tam oturur, tasan icerik kendi icinde kaydirilir; sayfa
  // "asagi kayiyormus" hissi vermez.
  function panelYuksekliginiAyarla() {
    const ustKonum = inspector.getBoundingClientRect().top;
    const kalanAlan = window.innerHeight - ustKonum - 20;
    inspector.style.maxHeight = Math.max(300, kalanAlan) + 'px';
  }
  window.addEventListener('resize', function () {
    panelYuksekliginiAyarla();
    if (!anaAlan.classList.contains('agac-kapali')) {
      agacPanelGenislikAyarla(agacPanel.getBoundingClientRect().width, false);
    }
    if (kolonEtkiSonDiagramModel && document.body.classList.contains('kolon-etki-sayfasi')) {
      requestAnimationFrame(function () { kolonEtkiDiagramOklariniCiz(kolonEtkiSonDiagramModel); });
    }
  });

  function inspectorLineageHtml() {
    const veri = inspectorLineageOnbellek[inspectorTableId];
    if (!veri) return '<div class="inspector-bos">Yükleniyor...</div>';
    if (veri.hata) return '<div class="inspector-bos">' + kacisliMetin(veri.hata) + '</div>';
    const tumKolonlar = veri.kolonlar || [];
    if (tumKolonlar.length === 0) {
      return '<div class="inspector-bos">Bu tablo için kayıtlı kolon lineage bilgisi yok.</div>';
    }

    const f = inspectorLineageFiltre.trim().toLowerCase();
    const kolonlar = f
      ? tumKolonlar.filter(function (k) {
          if (k.hedef_kolon.toLowerCase().includes(f)) return true;
          return (k.kaynaklar || []).some(s =>
            s.kaynak_kolon.toLowerCase().includes(f) || s.kaynak_tablo.toLowerCase().includes(f));
        })
      : tumKolonlar;

    let html = '';
    html += '<input type="text" class="inspector-filtre" placeholder="Kolon veya kaynak adına göre filtrele..." value="' +
                kacisliMetin(inspectorLineageFiltre) + '">' +
               '<div class="cl-ozet">' + kolonlar.length + ' / ' + tumKolonlar.length + ' kolon gösteriliyor</div>';

    if (kolonlar.length === 0) {
      html += '<div class="inspector-bos">Filtreyle eşleşen kolon yok.</div>';
    }
    kolonlar.forEach(function (k) {
      html += '<div class="cl-satir"><div class="cl-hedef-kolon">' + kacisliMetin(k.hedef_kolon) + '</div>';
      (k.kaynaklar || []).forEach(function (s) {
        const donusumSinif = s.donusum_tipi === 'TURETILMIS' ? 'cl-donusum-turetilmis' : 'cl-donusum-direkt';
        const donusumMetin = s.donusum_tipi === 'TURETILMIS' ? 'TÜRETİLMİŞ' : 'DİREKT';
        html += '<div class="cl-kaynak-satir">← ' + kacisliMetin(s.kaynak_tablo) + '.' + kacisliMetin(s.kaynak_kolon) +
                  '<span class="' + donusumSinif + '">' + donusumMetin + '</span>' +
                  (s.guven_seviyesi === 'TAHMIN' ? '<span class="cl-tahmin">(tahmin)</span>' : '') +
                '</div>';
      });
      html += '</div>';
    });
    return html;
  }

  // Vurgulanan kolonun ORİJİNAL kaynağına kadar (kaç ETL adımından geçerse
  // geçsin) özyinelemeli soykütüğünü, ETKİ sekmesindeki "Seviye" gruplamasıyla
  // aynı görsel dilde gösterir -- kaynak SM_GL_ASSET'e kadar tek adımda değil,
  // orijin tabloya kadar (birden fazla adım olabilir) izler.
  function inspectorSoykutukHtml() {
    const anahtar = inspectorTableId + '::' + inspectorVurgulananKolon;
    const veri = inspectorSoykutukOnbellek[anahtar];
    let ic = '';
    if (!veri) {
      ic = '<div class="inspector-bos">Yükleniyor...</div>';
    } else if (veri.hata) {
      ic = '<div class="inspector-bos">' + kacisliMetin(veri.hata) + '</div>';
    } else if (!veri.adimlar || veri.adimlar.length === 0) {
      ic = '<div class="inspector-bos">Bu kolon için kayıtlı bir kaynak bulunamadı (muhtemelen bu tablonun kendisi orijinal kaynak).</div>';
    } else {
      let sonSeviye = null;
      veri.adimlar.forEach(function (a) {
        if (a.seviye !== sonSeviye) {
          ic += '<div class="etki-seviye-baslik">Seviye ' + a.seviye + '</div>';
          sonSeviye = a.seviye;
        }
        const donusumSinif = a.donusum_tipi === 'TURETILMIS' ? 'cl-donusum-turetilmis' : 'cl-donusum-direkt';
        const donusumMetin = a.donusum_tipi === 'TURETILMIS' ? 'TÜRETİLMİŞ' : 'DİREKT';
        ic += '<div class="etki-satir">' + (a.orijinal_mi ? '🏁 ' : '• ') + kacisliMetin(a.kaynak_tam_ad) + '.' +
                kacisliMetin(a.kaynak_kolon) + '<span class="' + donusumSinif + '">' + donusumMetin + '</span>' +
                (a.orijinal_mi ? '<span class="cl-tahmin">(orijinal kaynak)</span>' : '') +
              '</div>';
      });
    }
    return '<div class="soykutuk-kutusu">' +
             '<div class="inspector-genel-alt-baslik">🧬 "' + kacisliMetin(inspectorVurgulananKolon) + '" -- Tam Soykütük (orijinal kaynağa kadar)</div>' +
             ic +
           '</div>';
  }

  function inspectorKolonEtkiHtml() {
    const kolonDegeri = inspectorKolonEtkiKolon || '';
    let html = '<div class="kolon-etki-kutusu">' +
                 '<div class="kolon-etki-baslik">Kolon Etkisi</div>' +
                 '<div class="kolon-etki-form">' +
                   '<input type="text" class="kolon-etki-input" placeholder="Kolon adı yazın..." value="' + kacisliAttr(kolonDegeri) + '">' +
                   '<button class="kolon-etki-btn">Haritayı Aç</button>' +
                 '</div>' +
                 '<div class="etki-format-not">Seçili tablodaki bir kolon değişirse, aşağı yönde hangi tablo/rapor kolonları etkilenir?</div>';

    if (inspectorKolonEtkiYukleniyor) {
      html += '<div class="inspector-bos">Kolon etkisi hesaplanıyor...</div></div>';
      return html;
    }
    if (!kolonDegeri) {
      html += '<div class="inspector-bos">Kolon adı girerek kolon seviyesinde etki analizi yapabilirsiniz.</div></div>';
      return html;
    }
    html += '<div class="inspector-bos">Harita yeni sekmede ayrı analiz sayfası olarak açılır.</div></div>';
    return html;
  }

  function inspectorEtkiGruplariOlustur(veri) {
    const etkilenenler = veri ? (veri.etkilenenler || []) : [];
    const gruplar = [];
    const grupHaritasi = {};
    etkilenenler.forEach(function (e, index) {
        const hedefTamAd = (e.schema_adi ? e.schema_adi + '.' : '') + e.tablo_adi;
        const anahtar = e.seviye + '::' + hedefTamAd;
        if (!grupHaritasi[anahtar]) {
          grupHaritasi[anahtar] = {
            seviye: e.seviye,
            hedefSchema: e.schema_adi,
            hedefTablo: e.tablo_adi,
            hedefTamAd: hedefTamAd,
            adimlar: [],
          };
          gruplar.push(grupHaritasi[anahtar]);
        }
        grupHaritasi[anahtar].adimlar.push(Object.assign({ __etkiIndex: index }, e));
      });
    return gruplar;
  }

  function inspectorEtkiGrupDetayHtml(grup) {
    if (!grup) return '';
    let html = '';
    grup.adimlar.forEach(function (e) {
      const procTamAd = (e.paket_adi ? e.paket_adi + '.' : '') + (e.procedure_adi || '');
      const satirMetni = e.satir_no ? 'Satır ' + e.satir_no : 'Satır bilgisi yok';
      const kaynakEtiketi = (e.kaynak_schema_adi ? '<span class="schema">' + kacisliMetin(e.kaynak_schema_adi) + '</span><span class="ayrac"></span>' : '') +
                            kacisliMetin(e.kaynak_tablo_adi);
      const hedefEtiketi = (grup.hedefSchema ? '<span class="schema">' + kacisliMetin(grup.hedefSchema) + '</span><span class="ayrac"></span>' : '') +
                           kacisliMetin(grup.hedefTablo);
      const sqlTiklanabilirMi = !!(e.sql_metni || e.sql_sade);
      const sqlTiklamaClass = sqlTiklanabilirMi ? ' sql-modal-ac-btn' : '';
      const sqlTiklamaAttr = sqlTiklanabilirMi
        ? ' data-sql-kaynak="etki" data-statement-id="' + e.statement_id + '" data-etki-index="' + e.__etkiIndex + '" title="SQL görüntüle"'
        : '';
      html += '<div class="etki-kart' + sqlTiklamaClass + '"' + sqlTiklamaAttr + '>' +
                '<div class="etki-kart-baslik">' +
                  '<span class="etki-kart-hedef">Procedure: ' + kacisliMetin(procTamAd) + '</span>' +
                  '<span class="etki-kart-dml">' + kacisliMetin(e.dml_tipi) + '</span>' +
                '</div>' +
                '<div class="etki-io-satir"><span class="etki-io-etiket">Kaynak</span><span class="etki-io-deger">' + kaynakEtiketi + '</span></div>' +
                '<div class="etki-io-satir"><span class="etki-io-etiket">Hedef</span><span class="etki-io-deger">' + hedefEtiketi + '</span></div>' +
                '<div class="etki-meta">' + kacisliMetin(satirMetni) + '</div>' +
              '</div>';
    });
    return html;
  }

  function inspectorEtkiGrupDetayYukle(detailsEl) {
    const veri = inspectorEtkiOnbellek[inspectorTableId];
    if (!veri || !detailsEl || !detailsEl.open || detailsEl.dataset.rendered === '1') return;
    const index = parseInt(detailsEl.dataset.etkiGrupIndex, 10);
    const gruplar = inspectorEtkiGruplariOlustur(veri);
    const detay = detailsEl.querySelector('.etki-tablo-detay');
    if (!detay || !gruplar[index]) return;
    detay.innerHTML = inspectorEtkiGrupDetayHtml(gruplar[index]);
    detailsEl.dataset.rendered = '1';
  }

  function inspectorEtkiHtml() {
    const veri = inspectorEtkiOnbellek[inspectorTableId];
    if (!veri) return '<div class="inspector-bos">Yükleniyor...</div>';
    if (veri.hata) return '<div class="inspector-bos">' + kacisliMetin(veri.hata) + '</div>';
    const etkilenenler = veri.etkilenenler || [];
    const etkilenenRaporlar = veri.etkilenen_raporlar || [];

    let html = inspectorKolonEtkiHtml();
    if (etkilenenler.length === 0) {
      html += '<div class="inspector-bos">Bu tabloyu kaynak olarak kullanan başka bir tablo bulunamadı.</div>';
    } else {
      const gruplar = inspectorEtkiGruplariOlustur(veri);

      html += '<div class="etki-format-not">Bu tablonun değişmesi halinde etkilenecek:</div>' +
              '<div class="etki-ust-ozet">' +
                '<div class="etki-ozet-kutu"><div class="etki-ozet-sayi">' + gruplar.length + '</div><div class="etki-ozet-etiket">tablo</div></div>' +
                '<div class="etki-ozet-kutu"><div class="etki-ozet-sayi">' + etkilenenler.length + '</div><div class="etki-ozet-etiket">sorgu</div></div>' +
                '<div class="etki-ozet-kutu"><div class="etki-ozet-sayi">' + etkilenenRaporlar.length + '</div><div class="etki-ozet-etiket">rapor</div></div>' +
              '</div>' +
              '<div class="etki-format-not">Seviye 1 doğrudan etki, Seviye 2+ zincir üzerindeki dolaylı etkidir.</div>' +
              '<div class="etki-format-not">Gösterim: <b>Şema</b><span class="ayrac"></span><b>Tablo</b></div>';
      let sonSeviye = null;
      gruplar.forEach(function (grup, grupIndex) {
        if (grup.seviye !== sonSeviye) {
          html += '<div class="etki-seviye-baslik">Seviye ' + grup.seviye + '</div>';
          sonSeviye = grup.seviye;
        }

        const acikAttr = '';
        const hedefBaslikHtml = (grup.hedefSchema
          ? '<span class="etki-ad-schema">' + kacisliMetin(grup.hedefSchema) + '</span><span class="etki-ad-ayrac"></span>'
          : '') + '<span class="etki-ad-tablo">' + kacisliMetin(grup.hedefTablo) + '</span>';
        html += '<details class="etki-tablo-grup"' + acikAttr + ' data-etki-grup-index="' + grupIndex + '">' +
                  '<summary>' +
                    '<div class="etki-tablo-baslik">' +
                      '<span class="etki-tablo-ad">' + hedefBaslikHtml + '</span>' +
                      '<span class="etki-tablo-ozet">' + grup.adimlar.length + ' sorgu</span>' +
                    '</div>' +
                  '</summary>' +
                  '<div class="etki-tablo-detay"></div>' +
                '</details>';
      });
    }

    html += '<div class="etki-seviye-baslik">📄 Etkilenen Raporlar</div>';
    if (etkilenenRaporlar.length === 0) {
      html += '<div class="inspector-bos">Bu tabloyu (veya yukarıdaki etkilenen tabloları) kaynak olarak kullanan kayıtlı bir rapor bulunamadı.</div>';
    } else {
      etkilenenRaporlar.forEach(function (r) {
        html += '<div class="etki-rapor-kart">' +
                  '<div class="etki-rapor-ad">📄 ' + kacisliMetin(r.rapor_adi) + '</div>' +
                  '<div class="etki-rapor-meta">üzerinden: <b>' + kacisliMetin(r.tablo_adi) + '</b></div>' +
                '</div>';
      });
    }
    return html;
  }

  // olay delegasyonu -- innerHTML her cizimde silindigi icin tek seferlik,
  // panelin KENDISINE baglanan kalici dinleyiciler kullanilir
  inspector.addEventListener('click', function (e) {
    const kolonEtkiHizliBtn = e.target.closest('.kolon-etki-hizli-btn');
    if (kolonEtkiHizliBtn) {
      inspectorKolonEtkiKolon = kolonEtkiHizliBtn.dataset.kolonAdi || '';
      inspectorVurgulananKolon = inspectorKolonEtkiKolon;
      inspectorAktifSekme = 'etki';
      inspectorCiz();
      kolonEtkiSayfasiAc(inspectorKolonEtkiKolon);
      inspectorVeriGetir('etki');
      return;
    }
    const kolonEtkiBtn = e.target.closest('.kolon-etki-btn');
    if (kolonEtkiBtn) {
      const input = inspector.querySelector('.kolon-etki-input');
      kolonEtkiSayfasiAc(input ? input.value : '');
      return;
    }
    const etkiGrupSummary = e.target.closest('.etki-tablo-grup > summary');
    if (etkiGrupSummary) {
      const detailsEl = etkiGrupSummary.closest('.etki-tablo-grup');
      requestAnimationFrame(function () { inspectorEtkiGrupDetayYukle(detailsEl); });
      return;
    }
    const sqlModalBtn = e.target.closest('.sql-modal-ac-btn');
    if (sqlModalBtn) {
      const statementId = parseInt(sqlModalBtn.dataset.statementId, 10);
      if (sqlModalBtn.dataset.sqlKaynak === 'etki') sqlModalEtkidenAc(statementId, parseInt(sqlModalBtn.dataset.etkiIndex, 10));
      else sqlModalSorgudanAc(statementId);
      return;
    }
    const sekmeBtn = e.target.closest('.inspector-sekme');
    const sqlSecenek = e.target.closest('.inspector-sql-secenek');
    if (sekmeBtn && !sekmeBtn.classList.contains('devre-disi')) {
      inspectorSekmeSec(sekmeBtn.dataset.sekme);
    } else if (sqlSecenek) {
      inspectorSeciliStatementId = parseInt(sqlSecenek.dataset.statementId, 10);
      inspectorCiz();
      sqlModalSorgudanAc(inspectorSeciliStatementId);
    } else if (e.target.classList.contains('inspector-gorunum-btn')) {
      inspectorSqlGorunumModu = e.target.dataset.gorunum;
      inspectorCiz();
    }
  });

  sqlModal.addEventListener('click', function (e) {
    if (e.target === sqlModal) {
      sqlModalKapat();
      return;
    }
    const gorunumBtn = e.target.closest('.sql-modal-gorunum-btn');
    if (gorunumBtn) {
      sqlModalGorunumModu = gorunumBtn.dataset.sqlModalGorunum;
      sqlModalIcerikCiz();
      return;
    }
    const statementBtn = e.target.closest('.sql-modal-statement-btn');
    if (statementBtn) {
      const index = parseInt(statementBtn.dataset.sqlStatementIndex, 10);
      if (Number.isInteger(index) && sqlModalStatementler[index]) {
        sqlModalStatementIndex = index;
        sqlModalStatement = sqlModalStatementler[index];
        sqlModalGorunumModu = sqlModalStatement.sql_sade ? 'sade' : 'tam';
        sqlModalIcerikCiz();
      }
    }
  });

  kolonEtkiSayfaGovde.addEventListener('click', function (e) {
    const akisBtn = e.target.closest('.kem-legend-item[data-kem-akis]');
    if (akisBtn) {
      const tip = akisBtn.dataset.kemAkis;
      kolonEtkiAkisFiltreleri[tip] = kolonEtkiAkisFiltreleri[tip] === false;
      const params = new URLSearchParams(window.location.search);
      const akis = kolonEtkiAktifAkisParam();
      params.set('akis', akis);
      kolonEtkiAkisFiltreleriniKaydet();
      window.location.href = window.location.pathname + '?' + params.toString();
      return;
    }
    const kolonSatir = e.target.closest('.kem-kolon-satir[data-kem-node]');
    if (kolonSatir) {
      kolonEtkiKolonSec(kolonSatir.dataset.kemNode);
      return;
    }
    const kartBaslik = e.target.closest('.kem-kart-baslik');
    if (!kartBaslik) return;
    kolonEtkiKartDetayToggle(kartBaslik.closest('.kem-kolon-kart'));
  });

  sqlModalKapatBtn.addEventListener('click', sqlModalKapat);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sqlModal.classList.contains('acik')) sqlModalKapat();
  });

  inspector.addEventListener('input', function (e) {
    if (e.target.classList.contains('inspector-filtre')) {
      inspectorLineageFiltre = e.target.value;
      inspectorCiz();
    }
  });

  inspector.addEventListener('keydown', function (e) {
    if (e.target.classList.contains('kolon-etki-input') && e.key === 'Enter') {
      e.preventDefault();
      kolonEtkiSayfasiAc(e.target.value);
    }
  });

  const AGAC_PANEL_MIN = 360;
  const AGAC_PANEL_DEFAULT = 560;
  const AGAC_PANEL_STORAGE_KEY = 'dwhAnalyzer.agacPanelGenislik';

  function agacPanelMaksGenislik() {
    const anaGenislik = anaAlan.getBoundingClientRect().width || window.innerWidth;
    return Math.max(AGAC_PANEL_MIN, Math.min(960, anaGenislik - 360));
  }

  function agacPanelGenislikAyarla(genislik, kaydet) {
    const sinirli = Math.max(AGAC_PANEL_MIN, Math.min(agacPanelMaksGenislik(), genislik));
    document.documentElement.style.setProperty('--agac-panel-genislik', sinirli + 'px');
    if (kaydet) localStorage.setItem(AGAC_PANEL_STORAGE_KEY, String(Math.round(sinirli)));
    panelYuksekliginiAyarla();
  }

  const kayitliAgacGenislik = parseInt(localStorage.getItem(AGAC_PANEL_STORAGE_KEY) || '', 10);
  agacPanelGenislikAyarla(Number.isFinite(kayitliAgacGenislik) ? kayitliAgacGenislik : AGAC_PANEL_DEFAULT, false);

  agacResizeTutamac.addEventListener('pointerdown', function (e) {
    if (anaAlan.classList.contains('agac-kapali')) return;
    e.preventDefault();
    const baslangicX = e.clientX;
    const baslangicGenislik = agacPanel.getBoundingClientRect().width;
    let sonGenislik = baslangicGenislik;
    document.body.classList.add('agac-resize-aktif');

    function surukle(ev) {
      sonGenislik = baslangicGenislik + ev.clientX - baslangicX;
      agacPanelGenislikAyarla(sonGenislik, false);
    }

    function bitir(ev) {
      document.removeEventListener('pointermove', surukle);
      document.removeEventListener('pointerup', bitir);
      document.removeEventListener('pointercancel', bitir);
      document.body.classList.remove('agac-resize-aktif');
      agacPanelGenislikAyarla(sonGenislik, true);
    }

    document.addEventListener('pointermove', surukle);
    document.addEventListener('pointerup', bitir);
    document.addEventListener('pointercancel', bitir);
  });

  agacDaraltBtn.addEventListener('click', function () {
    const kapaliMi = anaAlan.classList.toggle('agac-kapali');
    agacDaraltBtn.textContent = kapaliMi ? '›' : '‹';
    agacDaraltBtn.title = kapaliMi ? 'Sol ağacı aç' : 'Sol ağacı daralt';
    panelYuksekliginiAyarla();
  });

  agacAramaInput.addEventListener('input', agacAramaSonuclariGuncelle);
  agacAramaInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      agacAramadaGez(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      agacAramaSifirla();
    }
  });
  agacAramaOnceki.addEventListener('click', function () { agacAramadaGez(-1); });
  agacAramaSonraki.addEventListener('click', function () { agacAramadaGez(1); });
  agacAramaSonucSayaciGuncelle();

  function kacisliMetin(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function kacisliAttr(s) {
    return kacisliMetin(s).replace(/"/g, '&quot;');
  }

  // --- Mod gecisi (TABLO / KOLON / RAPOR) -- ayni ekran iskeleti, farkli arama/agac ---
  let mevcutMod = 'tablo';
  const modTabloBtn = document.getElementById('modTabloBtn');
  const modKolonBtn = document.getElementById('modKolonBtn');
  const modRaporBtn = document.getElementById('modRaporBtn');
  const kriterEtiket = document.getElementById('kriterEtiket');
  const aciklamaMetni = document.getElementById('aciklamaMetni');

  function modGuncelle(yeniMod, temizle) {
    mevcutMod = yeniMod;
    genelBilgiSeridi.classList.remove('rapor-ozet-kompakt');
    modTabloBtn.classList.toggle('aktif', yeniMod === 'tablo');
    modKolonBtn.classList.toggle('aktif', yeniMod === 'kolon');
    modRaporBtn.classList.toggle('aktif', yeniMod === 'rapor');
    if (yeniMod === 'tablo') {
      kriterEtiket.textContent = 'TABLO ADI';
      kriterInput.placeholder = 'Örn: SM_GL_ASSET';
    } else if (yeniMod === 'kolon') {
      kriterEtiket.textContent = 'KOLON / ALAN ADI';
      kriterInput.placeholder = 'Örn: bakiye, customer_code (virgülle birden fazla)';
      aciklamaMetni.textContent = 'Bir alan/kolon adı girin -- hem DWH tablolarında hem mevcut raporlarda bu alanın olup olmadığını gösterir. Bir tablo eşlemesine tıklayarak sağdaki panelde detaylarını inceleyin, "İncele" ile Tablo moduna geçip o tabloyu tam olarak açın.';
    } else {
      kriterEtiket.textContent = 'RAPOR ADI';
      kriterInput.placeholder = 'Örn: RPT_GL_ASSET_OZETI';
    }
    // Mod degisince ONCEKI modun kriteri/sonuclari TASINMAZ -- bir moddaki
    // aramayi baska bir modda otomatik tekrar denemek ("...katalogda kayitli
    // degil" gibi) kafa karistirici oluyordu. Her mod gecisinde bombos baslar.
    if (temizle) {
      kriterInput.value = '';
      agacAramaSifirla();
      agacAlani.innerHTML = '';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      inspector.innerHTML = '<div class="inspector-bos-durum">← Soldaki ağaçtan bir tabloya tıklayın</div>';
      if (inspectorAktifSpan) { inspectorAktifSpan.classList.remove('tablo-adi-secili'); inspectorAktifSpan = null; }
      inspectorTableId = null;
      kriterInput.focus();
    }
  }
  modTabloBtn.addEventListener('click', () => modGuncelle('tablo', true));
  modKolonBtn.addEventListener('click', () => modGuncelle('kolon', true));
  modRaporBtn.addEventListener('click', () => modGuncelle('rapor', true));

  async function ara() {
    if (mevcutMod === 'tablo') await tabloAra();
    else if (mevcutMod === 'kolon') await kolonAra();
    else await raporAra();
  }

  kriterAraButon.addEventListener('click', ara);
  kriterInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') ara(); });
  basitCheckbox.addEventListener('change', function () {
    // Onceden sadece TABLO modundaysa yenileniyordu -- RAPOR/KOLON modunda
    // checkbox degisince agac HIC yenilenmiyordu, zaten acilmis dugumler
    // eski haliyle kalip "checkbox calismiyor" izlenimi veriyordu. Artik
    // hangi moddaysak o modun aramasini (ara() zaten dogru moda yonlendiriyor)
    // tazeliyoruz -- boylece sonraki tum genislemeler yeni checkbox durumunu
    // tutarli sekilde yansitir.
    if (kriterInput.value.trim()) ara();
  });

  // URL parametreleri: ?mod=kolon|rapor|tablo, ?tablo=X (Tablo modu), ?kolon=Y
  // ('tablo' YOKSA Kolon modu arama terimi; 'tablo' VARSA o tablonun
  // Lineage sekmesinde filtrelenecek kolon)
  const urlParams = new URLSearchParams(window.location.search);
  const urlKolonEtkiModu = window.location.pathname === '/kolon_etki' || urlParams.get('kolon_etki') === '1';
  if (urlKolonEtkiModu) {
    kolonEtkiSayfasiBaslat();
  } else {
    if (urlParams.get('mod') === 'kolon') modGuncelle('kolon', false);
    else if (urlParams.get('mod') === 'rapor') modGuncelle('rapor', false);
    const baslangicTablo = urlParams.get('tablo');
    const baslangicKolonParam = urlParams.get('kolon');
    if (mevcutMod === 'tablo' && baslangicTablo) {
      kriterInput.value = baslangicTablo;
      ara();
    } else if (mevcutMod === 'kolon' && baslangicKolonParam) {
      kriterInput.value = baslangicKolonParam;
      ara();
    }
  }

  async function tabloAra(kolonFiltre) {
    const ad = kriterInput.value.trim();
    if (!ad) return;
    agacAramaSifirla();
    genelBilgiSeridi.classList.remove('rapor-ozet-kompakt');
    agacAlani.innerHTML = '<div class="bilgi-mesaj">Sorgulanıyor...</div>';
    genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Sorgulanıyor...</div>';

    let veri;
    try {
      const yanit = await fetch('/api/tablo?ad=' + encodeURIComponent(ad));
      veri = await yanit.json();
      if (!yanit.ok) {
        agacAlani.innerHTML = '<div class="hata-mesaj">' + (veri.hata || 'Bilinmeyen hata') + '</div>';
        genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
        return;
      }
    } catch (err) {
      agacAlani.innerHTML = '<div class="hata-mesaj">Sunucuya ulaşılamadı: ' + err + '</div>';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      return;
    }

    if (!veri.bulundu) {
      agacAlani.innerHTML = '<div class="hata-mesaj">"' + veri.aranan + '" adında bir tablo katalogda kayıtlı değil.</div>';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      return;
    }

    agacAlani.innerHTML = '';
    const kokUl = document.createElement('ul');
    kokUl.className = 'agac';
    const kokLi = dugumOlustur(veri.table_id, veri.tablo_adi, [veri.table_id], true, veri.katman, veri.schema_adi);
    kokUl.appendChild(kokLi);
    agacAlani.appendChild(kokUl);

    // kök düğümü otomatik ilk seviyeye kadar aç
    const kokSatir = kokLi.querySelector(':scope > .dugum-satir');
    kokSatir.click();

    // Inspector Panel'i de otomatik ac -- boyle bir link ile gelindiginde
    // (ozellikle Kolon modundan gecince) panel bombos kalmasin. Bir kolon
    // filtresi verildiyse (parametreyle YA DA ilk sayfa yuklemesinde URL'den)
    // dogrudan LINEAGE sekmesine, o kolona filtrelenmis sekilde gecilir --
    // AYRICA SQL/Kolonlar sekmelerinde de sari vurgulanir.
    const kokAdSpani = kokSatir.querySelector('.tablo-adi');
    const uygulanacakKolon = kolonFiltre !== undefined ? kolonFiltre : urlParams.get('kolon');
    await inspectorAc(veri.table_id, veri.tablo_adi, kokAdSpani, uygulanacakKolon);
    if (uygulanacakKolon) {
      inspectorLineageFiltre = uygulanacakKolon;
      await inspectorSekmeSec('lineage');
    }
  }

  // --- RAPOR modu: rapor adini kok yapar, dogrudan kaynak tablolarini
  // NORMAL agac dugumleri (dugumOlustur ile, TABLO modundaki AYNI mekanizma)
  // olarak cocuk yapar -- boylece rapor, tikladikca ETL zincirinin tamamina
  // dogal olarak baglanir.
  async function raporAra() {
    const ad = kriterInput.value.trim();
    if (!ad) return;
    agacAramaSifirla();
    agacAlani.innerHTML = '<div class="bilgi-mesaj">Sorgulanıyor...</div>';
    genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Sorgulanıyor...</div>';
    inspector.innerHTML = '<div class="inspector-bos-durum">← Soldaki ağaçtan bir tabloya tıklayın</div>';

    let veri;
    try {
      const yanit = await fetch('/api/rapor?ad=' + encodeURIComponent(ad));
      veri = await yanit.json();
      if (!yanit.ok) {
        agacAlani.innerHTML = '<div class="hata-mesaj">' + (veri.hata || 'Bilinmeyen hata') + '</div>';
        genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
        return;
      }
    } catch (err) {
      agacAlani.innerHTML = '<div class="hata-mesaj">Sunucuya ulaşılamadı: ' + err + '</div>';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      return;
    }
    if (!veri.bulundu) {
      agacAlani.innerHTML = '<div class="hata-mesaj">"' + veri.aranan + '" adında (ya da buna kısmen uyan tek bir) rapor katalogda kayıtlı değil.</div>';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      return;
    }

    let detay;
    try {
      const yanit2 = await fetch('/api/rapor_detay?rapor_id=' + veri.rapor_id);
      detay = await yanit2.json();
    } catch (err) {
      agacAlani.innerHTML = '<div class="hata-mesaj">Sunucuya ulaşılamadı: ' + err + '</div>';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      return;
    }

    genelBilgiSeridi.style.display = 'block';
    genelBilgiSeridi.classList.add('rapor-ozet-kompakt');
    genelBilgiSeridi.innerHTML =
      '<div class="gbs-baslik">' + kacisliMetin(detay.rapor_adi) + '</div>';

    agacAlani.innerHTML = '';
    const kokUl = document.createElement('ul');
    kokUl.className = 'agac';
    const kokLi = document.createElement('li');
    kokLi.dataset.raporId = veri.rapor_id;
    const kokSatir = document.createElement('div');
    kokSatir.className = 'dugum-satir kok';
    kokSatir.innerHTML = '<span class="toggle-ikon">▼</span><span class="kok-rapor-etiket">📄 ' + kacisliMetin(detay.rapor_adi) + '</span>';
    kokLi.appendChild(kokSatir);

    if (detay.kaynak_tablolar.length === 0) {
      const bosLi = document.createElement('li');
      bosLi.innerHTML = '<div class="dugum-satir"><span class="dongu-etiket">Bu rapor için kayıtlı kaynak tablo yok</span></div>';
      kokLi.appendChild(bosLi);
    } else {
      const cocukUl = document.createElement('ul');
      detay.kaynak_tablolar.forEach(function (t) {
        cocukUl.appendChild(dugumOlustur(t.table_id, t.tablo_adi, [t.table_id], false, t.katman, t.schema_adi));
      });
      kokLi.appendChild(cocukUl);
    }
    kokUl.appendChild(kokLi);
    agacAlani.appendChild(kokUl);

    kokSatir.addEventListener('click', function () {
      const cocukUlEl = kokLi.querySelector(':scope > ul');
      if (!cocukUlEl) return;
      const acikMi = cocukUlEl.style.display !== 'none';
      cocukUlEl.style.display = acikMi ? 'none' : 'block';
      kokSatir.querySelector('.toggle-ikon').textContent = acikMi ? '▶' : '▼';
    });
  }

  // --- KOLON modu: arama metnini kok, "Tablolar"/"Raporlar" olarak 2 dala
  // ayrilan bir agac cizer. Bir tablo eslemesine tiklamak Inspector Panel'i
  // (Tablo modundaki AYNI panel) acar; "İncele" ise TABLO moduna gecip o
  // tabloyu kok olarak yukler.
  async function kolonAra() {
    const q = kriterInput.value.trim();
    if (!q) return;
    agacAramaSifirla();
    genelBilgiSeridi.classList.remove('rapor-ozet-kompakt');
    agacAlani.innerHTML = '<div class="bilgi-mesaj">Aranıyor...</div>';
    genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Aranıyor...</div>';
    inspector.innerHTML = '<div class="inspector-bos-durum">← Soldaki ağaçtan bir tablo eşlemesine tıklayın</div>';

    let veri;
    try {
      const yanit = await fetch('/api/alan_ara?q=' + encodeURIComponent(q));
      veri = await yanit.json();
      if (!yanit.ok) {
        agacAlani.innerHTML = '<div class="hata-mesaj">' + (veri.hata || 'Bilinmeyen hata') + '</div>';
        genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
        return;
      }
    } catch (err) {
      agacAlani.innerHTML = '<div class="hata-mesaj">Sunucuya ulaşılamadı: ' + err + '</div>';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      return;
    }

    const t = veri.tablo_sonuclari || [];
    const r = veri.rapor_sonuclari || [];
    if (t.length === 0 && r.length === 0) {
      agacAlani.innerHTML = '<div class="hata-mesaj">"' + kacisliMetin(veri.q) + '" için hiçbir sonuç bulunamadı.</div>';
      genelBilgiSeridi.innerHTML = '<div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div>';
      return;
    }

    genelBilgiSeridi.style.display = 'block';
    genelBilgiSeridi.innerHTML =
      '<div class="gbs-baslik">"' + kacisliMetin(veri.q) + '"</div>' +
      '<div class="gbs-satirlar">' +
        '<span><b>' + t.length + '</b> tablo kolonu eşleşti</span>' +
        '<span><b>' + r.length + '</b> rapor kolonu eşleşti</span>' +
      '</div>';

    agacAlani.innerHTML = '';
    const kokUl = document.createElement('ul');
    kokUl.className = 'agac';
    const kokLi = document.createElement('li');
    const kokSatir = document.createElement('div');
    kokSatir.className = 'dugum-satir kok';
    kokSatir.innerHTML = '<span class="toggle-ikon">▼</span><span class="kok-kolon-etiket">"' + kacisliMetin(veri.q) + '"</span>';
    kokLi.appendChild(kokSatir);

    const dallarUl = document.createElement('ul');
    if (t.length > 0) dallarUl.appendChild(kolonGrupDugumuOlustur('🗄 Tablolar', t.length, 'tablo', t, veri.terimler));
    if (r.length > 0) dallarUl.appendChild(kolonGrupDugumuOlustur('📄 Raporlar', r.length, 'rapor', r, veri.terimler));
    kokLi.appendChild(dallarUl);
    kokUl.appendChild(kokLi);
    agacAlani.appendChild(kokUl);

    kokSatir.addEventListener('click', function () {
      const acikMi = dallarUl.style.display !== 'none';
      dallarUl.style.display = acikMi ? 'none' : 'block';
      kokSatir.querySelector('.toggle-ikon').textContent = acikMi ? '▶' : '▼';
    });
  }

  // Bir satirin verilen terime uyup uymadigini backend'deki ILIKE mantigiyla
  // AYNI sekilde (kolon/tablo adi VEYA rapor kolonu/rapor adi icinde geciyor
  // mu) kontrol eder -- terim bazli alt gruplama icin.
  function terimEslesiyorMu(row, terimKucuk, tip) {
    if (tip === 'tablo') {
      return row.kolon_adi.toLowerCase().includes(terimKucuk);
    }
    return row.rapor_kolon_adi.toLowerCase().includes(terimKucuk);
  }

  function kolonGrupDugumuOlustur(baslik, adet, tip, satirlar, terimler) {
    const grupLi = document.createElement('li');
    const grupSatir = document.createElement('div');
    grupSatir.className = 'dugum-satir';
    grupSatir.innerHTML = '<span class="toggle-ikon">▼</span><span class="grup-etiket">' + baslik +
                           '<span class="grup-adet">(' + adet + ')</span></span>';
    grupLi.appendChild(grupSatir);

    const icUl = document.createElement('ul');
    if (terimler && terimler.length > 1) {
      // COKLU terim aranmissa: "musteri_kodu / kurum_kodu" gibi karisik tek
      // liste yerine, HER terim icin ayri, genisletilebilir bir alt-grup --
      // tek terimde bu ekstra katman gereksiz oldugu icin eklenmiyor.
      terimler.forEach(function (terim) {
        const terimKucuk = terim.toLowerCase();
        const eslesenler = satirlar.filter(row => terimEslesiyorMu(row, terimKucuk, tip));
        if (eslesenler.length === 0) return;
        icUl.appendChild(kolonAltGrupDugumuOlustur(terim, tip, eslesenler));
      });
    } else {
      satirlar.forEach(function (row) {
        icUl.appendChild(tip === 'tablo' ? tabloEslemeDugumu(row) : raporEslemeDugumu(row));
      });
    }
    grupLi.appendChild(icUl);

    grupSatir.addEventListener('click', function () {
      const acikMi = icUl.style.display !== 'none';
      icUl.style.display = acikMi ? 'none' : 'block';
      grupSatir.querySelector('.toggle-ikon').textContent = acikMi ? '▶' : '▼';
    });
    return grupLi;
  }

  // Coklu terim durumunda, bir terime ait eslesmeleri toplayan ara-seviye
  // (Tablolar/Raporlar ile asil eslesme satirlari arasindaki) grup dugumu.
  // Ic taraftaki asil satirlar (tabloEslemeDugumu/raporEslemeDugumu) HIC
  // DEGISTIRILMEDEN aynen kullanilir -- saga tiklama davranisi bozulmaz.
  function kolonAltGrupDugumuOlustur(terim, tip, satirlar) {
    const altLi = document.createElement('li');
    const altSatir = document.createElement('div');
    altSatir.className = 'dugum-satir';
    altSatir.innerHTML = '<span class="toggle-ikon">▼</span><span class="grup-etiket">' + kacisliMetin(terim) +
                          '<span class="grup-adet">(' + satirlar.length + ')</span></span>';
    altLi.appendChild(altSatir);

    const icUl = document.createElement('ul');
    satirlar.forEach(function (row) {
      icUl.appendChild(tip === 'tablo' ? tabloEslemeDugumu(row) : raporEslemeDugumu(row));
    });
    altLi.appendChild(icUl);

    altSatir.addEventListener('click', function () {
      const acikMi = icUl.style.display !== 'none';
      icUl.style.display = acikMi ? 'none' : 'block';
      altSatir.querySelector('.toggle-ikon').textContent = acikMi ? '▶' : '▼';
    });
    return altLi;
  }

  function tabloEslemeDugumu(row) {
    const li = document.createElement('li');
    const satir = document.createElement('div');
    satir.className = 'dugum-satir esleme-satir';
    const tamAd = (row.schema_adi ? row.schema_adi + '.' : '') + row.tablo_adi;

    const ad = document.createElement('span');
    ad.className = 'esleme-tablo-kolon';
    ad.textContent = tamAd + '.' + row.kolon_adi;
    ad.addEventListener('click', function (e) {
      e.stopPropagation();
      inspectorAcVeFiltreUygula(row.tablo_adi, row.kolon_adi, ad);
    });
    satir.appendChild(ad);

    const inceleBtn = document.createElement('span');
    inceleBtn.className = 'esleme-incele-btn';
    inceleBtn.textContent = '↗ İncele';
    inceleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      tabloModunaGecVeYukle(row.tablo_adi, row.kolon_adi);
    });
    satir.appendChild(inceleBtn);

    li.appendChild(satir);
    return li;
  }

  function raporEslemeDugumu(row) {
    const li = document.createElement('li');
    const satir = document.createElement('div');
    satir.className = 'dugum-satir esleme-satir';

    const bilgi = document.createElement('span');
    bilgi.className = 'esleme-rapor';
    bilgi.innerHTML = kacisliMetin(row.rapor_adi) + '.' + kacisliMetin(row.rapor_kolon_adi) +
      ' <span class="esleme-rapor-kaynak">← ' + kacisliMetin(row.kaynak_tam_ad) + '.' +
      kacisliMetin(row.kaynak_kolon) + ' (' + kacisliMetin(row.donusum_tipi) + ')</span>';
    satir.appendChild(bilgi);

    const kaynakTablo = row.kaynak_tam_ad.split('.').pop();
    const inceleBtn = document.createElement('span');
    inceleBtn.className = 'esleme-incele-btn';
    inceleBtn.textContent = '↗ İncele';
    inceleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      tabloModunaGecVeYukle(kaynakTablo, row.kaynak_kolon);
    });
    satir.appendChild(inceleBtn);

    li.appendChild(satir);
    return li;
  }

  async function inspectorAcVeFiltreUygula(tabloAdi, kolonAdi, span) {
    let veri;
    try {
      const yanit = await fetch('/api/tablo?ad=' + encodeURIComponent(tabloAdi));
      veri = await yanit.json();
    } catch (err) {
      return;
    }
    if (!veri.bulundu) return;
    await inspectorAc(veri.table_id, veri.tablo_adi, span, kolonAdi);
    inspectorLineageFiltre = kolonAdi;
    await inspectorSekmeSec('lineage');
  }

  function tabloModunaGecVeYukle(tabloAdi, kolonAdi) {
    modGuncelle('tablo', false);
    kriterInput.value = tabloAdi;
    tabloAra(kolonAdi);
  }

  // node bir <li> döner. atalarYolu: bu düğüme kadarki table_id dizisi (bu düğüm dahil)
  // ETL katmanina gore sol-kenar vurgu rengi -- diyagramdaki KATMAN_RENKLERI
  // ile AYNI palet, agacta da tutarli olsun diye. LD notr/soluk birakildi.
  const AGAC_KATMAN_RENKLERI = { LD: '#ADB5C4', TR: '#5B7FD9', EX: '#2C8C6E', KAYNAK: '#8B5FBF' };

  function dugumOlustur(tableId, tabloAdi, atalarYolu, kokMu, katman, schemaAdi) {
    const li = document.createElement('li');
    li.dataset.tableId = tableId;
    if (katman) li.dataset.katman = katman;
    if (schemaAdi) li.dataset.schema = schemaAdi;

    const satir = document.createElement('div');
    satir.className = 'dugum-satir' + (kokMu ? ' kok' : '');

    const toggle = document.createElement('span');
    toggle.className = 'toggle-ikon';
    toggle.textContent = '▶';
    satir.appendChild(toggle);

    const ad = document.createElement('span');
    ad.className = 'tablo-adi';
    ad.textContent = tabloAdi;
    if (!kokMu && katman && AGAC_KATMAN_RENKLERI[katman]) {
      ad.style.borderLeft = '4px solid ' + AGAC_KATMAN_RENKLERI[katman];
      ad.title = 'Katman: ' + katman;
    }
    ad.addEventListener('click', function (e) {
      e.stopPropagation();  // arka plandaki dugum ac/kapa tiklamasini tetiklemesin
      inspectorAc(tableId, tabloAdi, ad);
    });
    satir.appendChild(ad);

    const yeniPencereBtn = document.createElement('span');
    yeniPencereBtn.className = 'yeni-pencere-btn';
    yeniPencereBtn.textContent = '↗';
    yeniPencereBtn.title = "'" + tabloAdi + "' tablosunu ayrı pencerede kök olarak incele";
    yeniPencereBtn.addEventListener('click', function (e) {
      e.stopPropagation();  // arka plandaki dugum ac/kapa tiklamasini tetiklemesin
      window.open('/?tablo=' + encodeURIComponent(tabloAdi), '_blank');
    });
    satir.appendChild(yeniPencereBtn);

    li.appendChild(satir);

    let acildiMi = false;
    let cocukUl = null;

    satir.addEventListener('click', tikla);
    li.__agacAc = async function () {
      if (acildiMi) {
        if (cocukUl && cocukUl.style.display === 'none') {
          cocukUl.style.display = '';
          toggle.classList.add('acik');
        }
        return;
      }
      await tikla();
    };
    li.__agacCocukAlani = function () { return cocukUl; };

    async function tikla() {
      if (acildiMi) {
        if (cocukUl.style.display === 'none') {
          cocukUl.style.display = '';
          toggle.classList.add('acik');
        } else {
          cocukUl.style.display = 'none';
          toggle.classList.remove('acik');
        }
        return;
      }

      const basit = basitCheckbox.checked;
      toggle.textContent = '…';
      let veri;
      try {
        const yanit = await fetch('/api/cocuklar?table_id=' + tableId + '&basit=' + (basit ? '1' : '0'));
        veri = await yanit.json();
        if (!yanit.ok) {
          toggle.textContent = '!';
          return;
        }
      } catch (err) {
        toggle.textContent = '!';
        return;
      }

      acildiMi = true;
      toggle.classList.add('acik');
      toggle.textContent = '▶';

      cocukUl = document.createElement('ul');
      cocukUl.className = 'agac';

      if (basit) {
        renderTabloListesi(cocukUl, veri.tablolar, atalarYolu);
      } else {
        const hicKaynakYok = veri.direkt_tablolar.length === 0 && veri.alt_sorgu_gruplari.length === 0;
        if (hicKaynakYok) {
          const bos = document.createElement('div');
          bos.className = 'cocuk-yok';
          bos.textContent = 'kaynak yok — zincirin başlangıcı';
          cocukUl.appendChild(bos);
        } else {
          veri.alt_sorgu_gruplari.forEach(function (a) {
            cocukUl.appendChild(altSorguDugumuOlustur(a.alt_sorgu_id, a.alias, a.tip, atalarYolu));
          });
          renderTabloListesi(cocukUl, veri.direkt_tablolar, atalarYolu);
        }
      }

      li.appendChild(cocukUl);
      if (agacAramaInput.value.trim()) agacAramaSonuclariGuncelle(false);
    }

    return li;
  }

  // Bir tablo listesini (döngü kontrolüyle birlikte) verilen <ul>'e ekler --
  // hem basit modda hem iç içe moddaki "doğrudan tablolar" için ortak kullanılır.
  function renderTabloListesi(cocukUl, liste, atalarYolu) {
    liste.forEach(function (c) {
      const donguMu = atalarYolu.includes(c.table_id);
      if (donguMu) {
        const dli = document.createElement('li');
        dli.dataset.tableId = c.table_id;
        if (c.katman) dli.dataset.katman = c.katman;
        if (c.schema_adi) dli.dataset.schema = c.schema_adi;
        const dsatir = document.createElement('div');
        dsatir.className = 'dugum-satir dongu';
        dsatir.innerHTML = '<span class="toggle-bos"></span>' +
                            '<span class="tablo-adi">' + c.tablo_adi + '</span>' +
                            '<span class="dongu-etiket">&nbsp;🔁 döngü — yukarıda zaten var</span>';
        dli.appendChild(dsatir);
        cocukUl.appendChild(dli);
      } else {
        const yeniYol = atalarYolu.concat([c.table_id]);
        cocukUl.appendChild(dugumOlustur(c.table_id, c.tablo_adi, yeniYol, false, c.katman, c.schema_adi));
      }
    });
  }

  const ALTSORGU_ETIKET = {
    'FROM_ALT_SORGU': 'alt sorgu',
    'WHERE_ALT_SORGU': 'alt sorgu',
    'CTE': 'CTE',
    'UNION_DALI': 'UNION dalı',
    'TABLO_FONKSIYONU': 'tablo fonksiyonu',
  };

  function altSorguEtiketi(tip, alias) {
    const etiket = ALTSORGU_ETIKET[tip] || 'alt sorgu';
    return etiket;
  }

  // Bir "alt sorgu grubu" düğümü -- gerçek bir tablo değil, bir subquery'yi
  // temsil eder. Tıklanınca /api/alt_sorgu ile İÇİNDEKİ tabloları (ve varsa
  // İÇ İÇE alt sorgu gruplarını) getirir. atalarYolu, üst tablo düğümünden
  // OLDUĞU GİBİ devralınır -- bir subquery grubu kendi başına "atası" sayılmaz,
  // sadece içindeki tabloların döngü kontrolü için taşıyıcıdır.
  function altSorguDugumuOlustur(altSorguId, alias, tip, atalarYolu) {
    const li = document.createElement('li');
    li.dataset.altSorguId = altSorguId;

    const satir = document.createElement('div');
    satir.className = 'dugum-satir altsorgu-satir';

    const toggle = document.createElement('span');
    toggle.className = 'toggle-ikon';
    toggle.textContent = '▶';
    satir.appendChild(toggle);

    const etiket = document.createElement('span');
    etiket.className = 'altsorgu-etiket';
    etiket.innerHTML = '<span class="altsorgu-ad">' + kacisliMetin(ALTSORGU_ETIKET[tip] || 'alt sorgu') + '</span>';
    satir.appendChild(etiket);

    li.appendChild(satir);

    let acildiMi = false;
    let cocukUl = null;

    satir.addEventListener('click', tikla);
    li.__agacAc = async function () {
      if (acildiMi) {
        if (cocukUl && cocukUl.style.display === 'none') {
          cocukUl.style.display = '';
          toggle.classList.add('acik');
        }
        return;
      }
      await tikla();
    };
    li.__agacCocukAlani = function () { return cocukUl; };

    async function tikla() {
      if (acildiMi) {
        if (cocukUl.style.display === 'none') {
          cocukUl.style.display = '';
          toggle.classList.add('acik');
        } else {
          cocukUl.style.display = 'none';
          toggle.classList.remove('acik');
        }
        return;
      }

      toggle.textContent = '…';
      let veri;
      try {
        const yanit = await fetch('/api/alt_sorgu?alt_sorgu_id=' + altSorguId);
        veri = await yanit.json();
        if (!yanit.ok) {
          toggle.textContent = '!';
          return;
        }
      } catch (err) {
        toggle.textContent = '!';
        return;
      }

      acildiMi = true;
      toggle.classList.add('acik');
      toggle.textContent = '▶';

      cocukUl = document.createElement('ul');
      cocukUl.className = 'agac';

      const hicYok = veri.direkt_tablolar.length === 0 && veri.alt_sorgu_gruplari.length === 0;
      if (hicYok) {
        const bos = document.createElement('div');
        bos.className = 'cocuk-yok';
        bos.textContent = 'bu SQL grubunda tablo bulunamadı';
        cocukUl.appendChild(bos);
      } else {
        veri.alt_sorgu_gruplari.forEach(function (a) {
          cocukUl.appendChild(altSorguDugumuOlustur(a.alt_sorgu_id, a.alias, a.tip, atalarYolu));
        });
        renderTabloListesi(cocukUl, veri.direkt_tablolar, atalarYolu);
      }

      li.appendChild(cocukUl);
      if (agacAramaInput.value.trim()) agacAramaSonuclariGuncelle(false);
    }

    return li;
  }

  // ============================================================
  // DIYAGRAM GORUNUMU -- soldaki interaktif metin agacini (o an ACIK/
  // genisletilmis hali neyse) profesyonel bir kutu-ok diyagramina (soldan
  // saga akan, organizasyon semasi tarzi) cevirir. Etkilesim modeli
  // (tiklayip genisletme) DEGISMEZ -- bu sadece "an itibariyle gorunen"
  // agacin bir SVG anlik goruntusudur.
  // ============================================================

  const DIY_KUTU_GENISLIK = 260;
  const DIY_KUTU_YUKSEKLIK = 34;
  const DIY_SUTUN_ARALIK = 90;   // iki seviye arasi bosluk
  const DIY_SATIR_ARALIK = 10;   // ayni seviyedeki iki kutu arasi dusey bosluk
  // Geri donusu kolay olsun diye klasik leaf-based layout'u silmiyoruz.
  // Panelde "Yakın" = parent-merkezli, "Klasik" = eski leaf-based yerlesim.
  let diyagramAgacYerlesimModu = 'parent';

  // ETL katmanina gore vurgu rengi -- 'tablo' dugumlerinde sol kenarda ince
  // bir serit, 'katman_grubu'/swimlane basliklarinda ise kutunun kendi rengi
  // olarak kullanilir. LD (butun tablolar arasinda en kalabalik/en az
  // "ilginc" katman -- her seye uyan varsayilan) kasitli olarak notr/soluk
  // birakildi, digerleri (EX/TR/KAYNAK -- ozellikle dis sisteme isaret eden
  // KAYNAK) daha belirgin. HEM agac-tarzi diyagramda HEM swimlane
  // gorunumunde AYNI palet kullanilir -- tutarlilik icin modul seviyesinde.
  const KATMAN_RENKLERI = { LD: '#ADB5C4', TR: '#5B7FD9', EX: '#2C8C6E', KAYNAK: '#8B5FBF' };
  const KATMAN_ACIK_ZEMIN = { LD: '#F2F3F6', TR: '#EAEEFB', EX: '#E5F3EE', KAYNAK: '#F1EBF8' };
  const DIY_KATMAN_CUBUK_GENISLIK = 7;

  // Bir <li> dugumunu (ve GORUNEN -- yani DOM'da var olan -- cocuklarini)
  // hafif bir modele cevirir: {etiket, tip, cocuklar: [...]}
  function domAgaciniModeleCevir(li) {
    const satir = li.querySelector(':scope > .dugum-satir');
    if (!satir) return null;

    let tip = 'tablo';
    if (satir.classList.contains('dongu')) tip = 'dongu';
    else if (satir.classList.contains('altsorgu-satir')) tip = 'altsorgu';
    else if (satir.classList.contains('kok')) tip = 'kok';

    // KOLON modunun DOM yapisi, TABLO modundan tamamen farkli class'lar
    // kullanir (.kok-kolon-etiket, .grup-etiket, .esleme-tablo-kolon,
    // .esleme-rapor) -- bunlari tanimadan hepsi "?" olarak cikardı.
    let etiket;
    if (tip === 'altsorgu') {
      etiket = satir.querySelector('.altsorgu-etiket')?.textContent?.trim() || 'alt sorgu';
    } else if (satir.querySelector('.grup-etiket')) {
      etiket = satir.querySelector('.grup-etiket').textContent.trim();
      tip = 'altsorgu';  // "Tablolar"/"Raporlar" gruplarini gorsel olarak kesikli kutu yap
    } else if (satir.querySelector('.esleme-tablo-kolon')) {
      etiket = satir.querySelector('.esleme-tablo-kolon').textContent.trim();
    } else if (satir.querySelector('.esleme-rapor')) {
      etiket = (satir.querySelector('.esleme-rapor').firstChild?.textContent || satir.querySelector('.esleme-rapor').textContent).trim();
    } else if (satir.querySelector('.kok-kolon-etiket')) {
      etiket = satir.querySelector('.kok-kolon-etiket').textContent.trim();
    } else if (satir.querySelector('.kok-rapor-etiket')) {
      etiket = satir.querySelector('.kok-rapor-etiket').textContent.trim();
    } else {
      etiket = satir.querySelector('.tablo-adi')?.textContent?.trim() || '?';
    }

    const cocukUl = li.querySelector(':scope > ul');
    const cocuklar = [];
    if (cocukUl) {
      cocukUl.querySelectorAll(':scope > li').forEach(function (cli) {
        const model = domAgaciniModeleCevir(cli);
        if (model) cocuklar.push(model);
      });
    }
    const model = { etiket, tip, cocuklar };
    if (li.dataset.tableId) model.table_id = li.dataset.tableId;
    if (li.dataset.raporId) model.rapor_id = li.dataset.raporId;
    if (li.dataset.katman) model.katman = li.dataset.katman;
    if (li.dataset.schema) model.schema_adi = li.dataset.schema;
    return model;
  }

  // KLASIK yerlesim: yapraklari sabit aralikla dizer, parent'i cocuklarinin
  // ortasina koyar. Geri donus icin burada duruyor.
  function diyagramYerlesimiHesaplaKlasik(node, derinlik, yaprakSayaci) {
    node.x = derinlik * (DIY_KUTU_GENISLIK + DIY_SUTUN_ARALIK);
    if (node.cocuklar.length === 0 || node.tip === 'dongu') {
      node.y = yaprakSayaci.deger * (DIY_KUTU_YUKSEKLIK + DIY_SATIR_ARALIK);
      yaprakSayaci.deger += 1;
    } else {
      node.cocuklar.forEach(function (c) { diyagramYerlesimiHesaplaKlasik(c, derinlik + 1, yaprakSayaci); });
      const ilk = node.cocuklar[0].y, son = node.cocuklar[node.cocuklar.length - 1].y;
      node.y = (ilk + son) / 2;
    }
  }

  function diyagramAltAgaciKaydir(node, deltaY) {
    node.y += deltaY;
    (node.cocuklar || []).forEach(function (c) { diyagramAltAgaciKaydir(c, deltaY); });
  }

  function diyagramDugumleriTopla(node, liste) {
    liste.push(node);
    (node.cocuklar || []).forEach(function (c) { diyagramDugumleriTopla(c, liste); });
    return liste;
  }

  // Parent-merkezli yerlesim: cocuklar, parent'in y hizasinin etrafinda
  // baslar. Buyuk alt agaclar parent'i tekrar merkeze cekmez; gerekirse
  // yalnizca cakisan alt agac asagi kaydirilir. Bu, sag tarafa dogru okurken
  // dogrudan cocuklarin parent'tan kopuk gorunmesini azaltir.
  function diyagramYerlesimiHesaplaParentMerkezli(kok) {
    const seviyeler = {};
    const cocukAraligi = DIY_KUTU_YUKSEKLIK + DIY_SATIR_ARALIK;
    const minSeviyeAraligi = DIY_KUTU_YUKSEKLIK + DIY_SATIR_ARALIK;

    function ilkYerlestir(node, derinlik, y) {
      node.x = derinlik * (DIY_KUTU_GENISLIK + DIY_SUTUN_ARALIK);
      node.y = y;
      node._diyDerinlik = derinlik;
      seviyeler[derinlik] = seviyeler[derinlik] || [];
      seviyeler[derinlik].push(node);

      const cocuklar = node.cocuklar || [];
      const baslangicY = y - ((cocuklar.length - 1) * cocukAraligi) / 2;
      cocuklar.forEach(function (c, i) {
        ilkYerlestir(c, derinlik + 1, baslangicY + i * cocukAraligi);
      });
    }

    ilkYerlestir(kok, 0, 0);

    Object.keys(seviyeler).map(Number).sort(function (a, b) { return a - b; }).forEach(function (derinlik) {
      const dugumler = seviyeler[derinlik].slice().sort(function (a, b) { return a.y - b.y; });
      for (let i = 1; i < dugumler.length; i += 1) {
        const onceki = dugumler[i - 1];
        const simdiki = dugumler[i];
        const gerekliY = onceki.y + minSeviyeAraligi;
        if (simdiki.y < gerekliY) {
          diyagramAltAgaciKaydir(simdiki, gerekliY - simdiki.y);
        }
      }
    });

    const tumDugumler = diyagramDugumleriTopla(kok, []);
    const minY = Math.min(...tumDugumler.map(function (n) { return n.y; }));
    if (minY < 10) {
      tumDugumler.forEach(function (n) { n.y += 10 - minY; });
    }
  }

  function diyagramYerlesimiHesapla(node, derinlik, yaprakSayaci) {
    if (diyagramAgacYerlesimModu === 'parent' && derinlik === 0) {
      diyagramYerlesimiHesaplaParentMerkezli(node);
      return;
    }
    diyagramYerlesimiHesaplaKlasik(node, derinlik, yaprakSayaci);
  }

  // Bir etiketi kutuya sigacak sekilde kisaltir -- AMA "SEMA.TABLO.kolon"
  // gibi noktali bir yapida ise, SON parcayi (KOLON aramasinda hangi
  // kolonun eslesigi -- en ayirt edici bilgi) mumkun oldugunca TAM birakip,
  // ONUNDEKI (sema/tablo) kismi kisaltir. Duz "…sonu-kes" yaklasimi, ayni
  // sema.tablo ile baslayan onlarca farkli kolonu (gercek bir vakada oldugu
  // gibi) birbirinden AYIRT EDILEMEZ hale getiriyordu.
  function etiketiKisalt(etiket, maksUzunluk) {
    if (etiket.length <= maksUzunluk) return etiket;
    const parcalar = etiket.split('.');
    if (parcalar.length >= 2) {
      const son = parcalar[parcalar.length - 1];
      const on = parcalar.slice(0, -1).join('.');
      if (son.length <= maksUzunluk - 3) {
        const onPayi = maksUzunluk - son.length - 2;  // '…' + '.' icin pay
        return (onPayi > 2 ? on.slice(0, onPayi) + '…' : '…') + '.' + son;
      }
      // kolon adinin kendisi bile cok uzunsa, en azindan SONUNU goster
      return '…' + son.slice(-(maksUzunluk - 1));
    }
    return etiket.slice(0, maksUzunluk - 1) + '…';
  }

  function diyagramSvgCiz(kok) {
    const yaprakSayaci = { deger: 0 };
    diyagramYerlesimiHesapla(kok, 0, yaprakSayaci);

    const seviyeBaslikBosluk = 34;
    const seviyeAdimi = DIY_KUTU_GENISLIK + DIY_SUTUN_ARALIK;
    diyagramDugumleriTopla(kok, []).forEach(function (node) {
      node._diyDerinlik = Math.round(node.x / seviyeAdimi);
      node.y += seviyeBaslikBosluk;
    });

    const tumDugumler = [];
    const tumKenarlar = [];
    (function topla(node) {
      node._diyId = 'd' + tumDugumler.length;
      tumDugumler.push(node);
      node.cocuklar.forEach(function (c) {
        tumKenarlar.push([node, c]);
        topla(c);
      });
    })(kok);
    diyagramTamBaglantiIndeksi = diyagramTamBaglantiIndeksiKur(tumDugumler, tumKenarlar);

    const maxDerinlik = Math.max(0, ...tumDugumler.map(function (n) { return n._diyDerinlik || 0; }));
    const odak = diyagramKatmanOdakPenceresi(maxDerinlik);
    const dugumler = tumDugumler.filter(function (n) {
      const d = n._diyDerinlik || 0;
      return d >= odak.baslangic && d <= odak.bitis;
    });
    const gorunurDugumIdleri = new Set(dugumler.map(function (n) { return n._diyId; }));
    const kenarlar = tumKenarlar.filter(function ([ust, alt]) {
      return gorunurDugumIdleri.has(ust._diyId) && gorunurDugumIdleri.has(alt._diyId);
    });
    const solGenisletmeVar = odak.aktif && odak.baslangic > 0;
    const sagGenisletmeVar = odak.aktif && odak.bitis < maxDerinlik;
    const genisletmeGenisligi = 74;
    const odakKenarBosluk = odak.aktif ? Math.max(140, diyagramGovde.clientWidth * 0.18) : 0;
    const cizimSolBosluk = (solGenisletmeVar ? genisletmeGenisligi : 0) + odakKenarBosluk;
    const cizimSagBosluk = (sagGenisletmeVar ? genisletmeGenisligi : 0) + odakKenarBosluk;
    const gorunurSeviyeSayisi = Math.max(1, odak.bitis - odak.baslangic + 1);
    const hedefTabanGenislik = odak.aktif
      ? Math.max(
          gorunurSeviyeSayisi * (DIY_KUTU_GENISLIK + 92) + cizimSolBosluk + cizimSagBosluk + 80,
          diyagramGovde.clientWidth * 1.34
        )
      : 0;
    const gorunurSeviyeAdimi = odak.aktif && gorunurSeviyeSayisi > 1
      ? Math.max(seviyeAdimi, (hedefTabanGenislik - cizimSolBosluk - cizimSagBosluk - DIY_KUTU_GENISLIK - 40) / (gorunurSeviyeSayisi - 1))
      : seviyeAdimi;
    const minVisibleY = Math.min(...dugumler.map(function (n) { return n.y; }));
    const yKaydir = Number.isFinite(minVisibleY) ? Math.max(0, seviyeBaslikBosluk + 6 - minVisibleY) : 0;
    const cizimX = function (node) { return ((node._diyDerinlik || 0) - odak.baslangic) * gorunurSeviyeAdimi + cizimSolBosluk; };
    const cizimY = function (node) { return node.y + yKaydir; };
    let maxX = 0, maxY = 0;
    dugumler.forEach(function (node) {
      maxX = Math.max(maxX, cizimX(node) + DIY_KUTU_GENISLIK);
      maxY = Math.max(maxY, cizimY(node) + DIY_KUTU_YUKSEKLIK);
    });

    const genislik = Math.max(320, maxX + cizimSagBosluk + 40);
    const yukseklik = Math.max(180, maxY + 40);
    const renkler = {
      kok: { dolgu: '#0F2A20', metin: 'white', kenar: '#0F2A20' },
      tablo: { dolgu: 'white', metin: '#14171A', kenar: '#C9A961' },
      altsorgu: { dolgu: '#FBF3E1', metin: '#8A6A1F', kenar: '#E4C878' },
      dongu: { dolgu: '#FBEAEE', metin: '#A24D5E', kenar: '#C17B89' },
      referans: { dolgu: '#F0F3FA', metin: '#5B6B8C', kenar: '#C7CEDB' },
    };

    let svg = `<svg width="${genislik}" height="${yukseklik}" viewBox="0 0 ${genislik} ${yukseklik}" ` +
              `data-max-derinlik="${maxDerinlik}" data-odak-aktif="${odak.aktif ? '1' : '0'}" ` +
              `data-odak-secili="${odak.secili == null ? '' : odak.secili}" data-odak-baslangic="${odak.baslangic}" ` +
              `data-odak-bitis="${odak.bitis}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Segoe UI',sans-serif;">`;

    for (let d = odak.baslangic; d <= odak.bitis; d += 1) {
      const sutunX = (d - odak.baslangic) * gorunurSeviyeAdimi + cizimSolBosluk;
      const merkezX = sutunX + DIY_KUTU_GENISLIK / 2;
      if (d > odak.baslangic) {
        const ayiracX = sutunX - gorunurSeviyeAdimi / 2 + DIY_KUTU_GENISLIK / 2;
        svg += `<line x1="${ayiracX}" y1="0" x2="${ayiracX}" y2="${yukseklik}" ` +
               `stroke="#D7DEE9" stroke-width="1" stroke-dasharray="4,5" opacity="0.9"/>`;
      }
      svg += `<line x1="${sutunX}" y1="30" x2="${sutunX + DIY_KUTU_GENISLIK}" y2="30" ` +
             `stroke="#E6D4AA" stroke-width="1.2" opacity="0.75"/>`;
    }

    // ONCE kenarlar (kutularin ALTINDA kalsin diye once cizilir) -- her
    // biri dik-acili (elbow) bir bağlantı çizgisi, org-chart gorunumu icin.
    // data-ust/data-alt: bir dugume tiklayinca giren/cikan oklari bulmak icin.
    kenarlar.forEach(function ([ust, alt]) {
      const x1 = cizimX(ust) + DIY_KUTU_GENISLIK, y1 = cizimY(ust) + DIY_KUTU_YUKSEKLIK / 2;
      const x2 = cizimX(alt), y2 = cizimY(alt) + DIY_KUTU_YUKSEKLIK / 2;
      const ortaX = (x1 + x2) / 2;
      svg += `<path class="diyagram-kenar"${diyagramKenarAttrleri(ust, alt)} ` +
             `d="M ${x1} ${y1} C ${ortaX} ${y1}, ${ortaX} ${y2}, ${x2} ${y2}" ` +
             `stroke="#C7CEDB" stroke-width="1.6" fill="none"/>`;
    });

    // SONRA dugumler (kenarlarin UZERINE)
    dugumler.forEach(function (node) {
      let r = renkler[node.tip] || renkler.tablo;
      if (node.tip === 'katman_grubu') {
        const kr = KATMAN_RENKLERI[node.katman] || '#8A6A1F';
        r = { dolgu: KATMAN_ACIK_ZEMIN[node.katman] || '#FBF3E1', metin: kr, kenar: kr };
      }
      const rx = node.tip === 'kok' ? 17 : 8;
      const kesikCizgi = (node.tip === 'altsorgu' || node.tip === 'katman_grubu') ? ' stroke-dasharray="4,3"' : '';
      const nodeX = cizimX(node);
      const nodeY = cizimY(node);
      svg += `<g class="diyagram-dugum-grup"${diyagramDugumAttrleri(node)} style="cursor:pointer;">` +
             `<rect class="diyagram-dugum-kutu" x="${nodeX}" y="${nodeY}" width="${DIY_KUTU_GENISLIK}" height="${DIY_KUTU_YUKSEKLIK}" rx="${rx}" ` +
             `fill="${r.dolgu}" stroke="${r.kenar}" stroke-width="1.4"${kesikCizgi}/>`;
      // 'tablo' dugumlerinde -- kutunun kendi rengini degistirmeden -- sol
      // kenarda ince bir katman-rengi seridi (KOK ve gruplar haric).
      if (node.tip === 'tablo' && node.katman && KATMAN_RENKLERI[node.katman]) {
        svg += `<rect x="${nodeX}" y="${nodeY + 4}" width="${DIY_KATMAN_CUBUK_GENISLIK}" height="${DIY_KUTU_YUKSEKLIK - 8}" rx="3" ` +
               `fill="${KATMAN_RENKLERI[node.katman]}"/>`;
      }
      const etiketKisa = etiketiKisalt(node.etiket, 34);
      const fontAgirlik = node.tip === 'kok' ? '700' : '600';
      const fontBoyut = (node.tip === 'altsorgu' || node.tip === 'katman_grubu') ? 11 : 12.5;
      svg += `<title>${kacisliMetin(node.etiket)}</title>` +
             `<text x="${nodeX + DIY_KUTU_GENISLIK / 2}" y="${nodeY + DIY_KUTU_YUKSEKLIK / 2 + 4}" ` +
             `text-anchor="middle" font-size="${fontBoyut}" font-weight="${fontAgirlik}" fill="${r.metin}">` +
             `${kacisliMetin(etiketKisa)}</text>`;
      if (node.tip === 'dongu') {
        svg += `<text x="${nodeX + DIY_KUTU_GENISLIK - 8}" y="${nodeY + 14}" text-anchor="end" font-size="11">🔁</text>`;
      }
      svg += '</g>';
    });

    svg += '</svg>';
    return svg;
  }

  const diyagramModal = document.getElementById('diyagramModal');
  const diyagramGovde = document.getElementById('diyagramGovde');
  const diyagramBaslikMetin = document.getElementById('diyagramBaslikMetin');
  const diyagramBaglantiOzet = document.getElementById('diyagramBaglantiOzet');
  const diyagramSeviyeOverlay = document.getElementById('diyagramSeviyeOverlay');
  const diyagramGenisletOverlay = document.getElementById('diyagramGenisletOverlay');
  const DIY_MAKS_DERINLIK = 25;      // guvenlik siniri -- pathological derin zincire karsi
  const DIY_MAKS_TOPLAM_CAGRI = 900; // guvenlik siniri (artik onbellekli oldugu icin -- tekrarlar SAYILMIYOR -- daha yuksek tutulabilir)
  const DIY_FETCH_ZAMAN_ASIMI_MS = 8000; // tek bir istek TAKILIRSA (backend'de sorun varsa) sonsuza kadar beklemeyelim
  let diyagramTamBaglantiIndeksi = null;

  function diyagramDugumAttrleri(node) {
    let attrs = ` data-dugum="${node._diyId}" data-tip="${node.tip}" data-etiket="${kacisliAttr(node.etiket)}"`;
    if (node._diyDerinlik != null) attrs += ` data-derinlik="${node._diyDerinlik}"`;
    if (node.table_id != null) attrs += ` data-table-id="${node.table_id}"`;
    if (node.rapor_id != null) attrs += ` data-rapor-id="${node.rapor_id}"`;
    if (node.schema_adi) attrs += ` data-schema="${kacisliAttr(node.schema_adi)}"`;
    if (node.katman) attrs += ` data-katman="${kacisliAttr(node.katman)}"`;
    return attrs;
  }

  function diyagramKenarAttrleri(ust, alt) {
    const b = alt.baglanti || {};
    let attrs = ` data-ust="${ust._diyId}" data-alt="${alt._diyId}"`;
    if (b.tip) attrs += ` data-baglanti-tip="${kacisliAttr(b.tip)}"`;
    if (b.hedef_table_id != null) attrs += ` data-hedef-table-id="${b.hedef_table_id}"`;
    if (b.kaynak_table_id != null) attrs += ` data-kaynak-table-id="${b.kaynak_table_id}"`;
    if (b.rapor_id != null) attrs += ` data-rapor-id="${b.rapor_id}"`;
    if (Array.isArray(b.statement_ids) && b.statement_ids.length > 0) {
      attrs += ` data-statement-ids="${b.statement_ids.join(',')}"`;
    }
    return attrs;
  }

  function diyagramDugumEtiketi(svg, id) {
    const node = svg.querySelector('.diyagram-dugum-grup[data-dugum="' + id + '"]');
    return node ? (node.dataset.etiket || node.textContent || '').trim() : '';
  }

  function diyagramDugumBilgisi(svg, id) {
    const node = svg.querySelector('.diyagram-dugum-grup[data-dugum="' + id + '"]');
    if (!node) return { dugumId: id, etiket: '' };
    return {
      dugumId: id,
      etiket: (node.dataset.etiket || node.textContent || '').trim(),
      tip: node.dataset.tip || '',
      tableId: node.dataset.tableId || '',
      raporId: node.dataset.raporId || '',
      schema: node.dataset.schema || '',
      katman: node.dataset.katman || '',
    };
  }

  function diyagramModelDugumBilgisi(node) {
    if (!node) return { dugumId: '', etiket: '' };
    return {
      dugumId: node._diyId || '',
      etiket: (node.etiket || '').trim(),
      tip: node.tip || '',
      tableId: node.table_id != null ? String(node.table_id) : '',
      raporId: node.rapor_id != null ? String(node.rapor_id) : '',
      schema: node.schema_adi || '',
      katman: node.katman || '',
    };
  }

  function diyagramModelBaglantiItemOlustur(komsuNode, baglantiNode, yon) {
    const info = diyagramModelDugumBilgisi(komsuNode);
    const b = (baglantiNode && baglantiNode.baglanti) || {};
    return Object.assign(info, {
      yon: yon,
      baglantiTip: b.tip || '',
      statementIds: Array.isArray(b.statement_ids) ? b.statement_ids.slice() : [],
      hedefTableId: b.hedef_table_id != null ? String(b.hedef_table_id) : '',
      kaynakTableId: b.kaynak_table_id != null ? String(b.kaynak_table_id) : '',
      raporId: b.rapor_id != null ? String(b.rapor_id) : (info.raporId || ''),
    });
  }

  function diyagramTamBaglantiIndeksiKur(dugumler, kenarlar) {
    const indeks = {};
    (dugumler || []).forEach(function (node) {
      if (!node || !node._diyId) return;
      indeks[node._diyId] = {
        seciliInfo: diyagramModelDugumBilgisi(node),
        kaynaklar: [],
        hedefler: [],
      };
    });
    (kenarlar || []).forEach(function ([ust, alt]) {
      if (!ust || !alt || !ust._diyId || !alt._diyId) return;
      if (indeks[ust._diyId]) indeks[ust._diyId].kaynaklar.push(diyagramModelBaglantiItemOlustur(alt, alt, 'kaynak'));
      if (indeks[alt._diyId]) indeks[alt._diyId].hedefler.push(diyagramModelBaglantiItemOlustur(ust, alt, 'hedef'));
    });
    return indeks;
  }

  function diyagramBaglantiItemOlustur(svg, kenar, komsuId, yon) {
    const info = diyagramDugumBilgisi(svg, komsuId);
    const statementIds = (kenar.dataset.statementIds || '')
      .split(',')
      .map(s => parseInt(s, 10))
      .filter(n => Number.isInteger(n));
    return Object.assign(info, {
      yon: yon,
      baglantiTip: kenar.dataset.baglantiTip || '',
      statementIds: statementIds,
      hedefTableId: kenar.dataset.hedefTableId || '',
      kaynakTableId: kenar.dataset.kaynakTableId || '',
      raporId: kenar.dataset.raporId || info.raporId || '',
    });
  }

  let diyagramBaglantiOzetVeri = null;
  let diyagramBaglantiOzetKucuk = false;

  function diyagramBaglantiSqlVarMi(item) {
    return !!(item && (
      (item.baglantiTip === 'statement' && item.statementIds && item.statementIds.length > 0) ||
      (item.baglantiTip === 'rapor_sql' && item.raporId && item.kaynakTableId)
    ));
  }

  function diyagramBaglantiTipEtiketi(item) {
    const map = {
      kok: 'KÖK',
      tablo: 'TABLO',
      altsorgu: 'ALT SORGU',
      katman_grubu: 'KATMAN',
      referans: 'REFERANS',
      dongu: 'DÖNGÜ',
      rapor: 'RAPOR',
    };
    return map[item && item.tip] || '';
  }

  function diyagramBaglantiMetaHtml(item, sqlVar) {
    const meta = [];
    const tipEtiketi = diyagramBaglantiTipEtiketi(item);
    if (tipEtiketi) meta.push(tipEtiketi);
    if (item && item.schema) meta.push(item.schema);
    if (item && item.katman) meta.push('Katman ' + item.katman);
    if (sqlVar && item.statementIds && item.statementIds.length > 1) {
      meta.push(item.statementIds.length + ' SQL');
    }
    if (meta.length === 0) return '';
    return '<div class="diyagram-baglanti-meta">' + meta.map(kacisliMetin).join('<span>•</span>') + '</div>';
  }

  function diyagramBaglantiListesiHtml(baslik, sinif, liste) {
    const items = (liste || []).filter(item => item && item.etiket);
    let html = '<div class="diyagram-baglanti-grup">' +
                 '<div class="diyagram-baglanti-grup-baslik ' + sinif + '">' +
                   '<span>' + baslik + '</span><span class="diyagram-baglanti-adet">' + items.length + '</span>' +
                 '</div>';
    if (items.length === 0) {
      html += '<div class="diyagram-baglanti-bos">Bağlı node yok.</div>';
    } else {
      html += '<div class="diyagram-baglanti-liste">';
      items.slice(0, 18).forEach(function (item, index) {
        const sqlVar = diyagramBaglantiSqlVarMi(item);
        html += '<div class="diyagram-baglanti-madde' + (sqlVar ? ' sql-var' : '') + '"' +
                  (sqlVar ? ' data-baglanti-yon="' + sinif + '" data-baglanti-index="' + index + '" title="Bu bağlantının SQL kanıtını aç"' : '') + '>' +
                  '<div class="diyagram-baglanti-madde-ust">' +
                    '<span class="diyagram-baglanti-madde-ad">' + kacisliMetin(item.etiket) + '</span>' +
                    (sqlVar ? '<span class="diyagram-baglanti-rozet sql">SQL</span>' : '') +
                  '</div>' +
                  diyagramBaglantiMetaHtml(item, sqlVar) +
                '</div>';
      });
      if (items.length > 18) {
        html += '<div class="diyagram-baglanti-bos">+' + (items.length - 18) + ' node daha</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function diyagramBaglantiOzetGizle() {
    diyagramBaglantiOzetVeri = null;
    diyagramBaglantiOzetKucuk = false;
    diyagramBaglantiOzet.classList.remove('acik', 'kucuk');
    diyagramBaglantiOzet.innerHTML = '';
  }

  function diyagramBaglantiOzetCiz() {
    if (!diyagramBaglantiOzetVeri) {
      diyagramBaglantiOzetGizle();
      return;
    }
    const veri = diyagramBaglantiOzetVeri;
    const seciliInfo = veri.seciliInfo || { etiket: veri.seciliEtiket || 'Node' };
    const seciliBaslik = seciliInfo.etiket || veri.seciliEtiket || 'Node';
    const seciliMetaHtml = diyagramBaglantiMetaHtml(seciliInfo, false);
    const kaynakAdet = (veri.kaynaklar || []).length;
    const hedefAdet = (veri.hedefler || []).length;
    diyagramBaglantiOzet.classList.toggle('kucuk', diyagramBaglantiOzetKucuk);
    if (diyagramBaglantiOzetKucuk) {
      diyagramBaglantiOzet.innerHTML =
        '<div class="diyagram-baglanti-ust">' +
          '<div>' +
            '<div class="diyagram-baglanti-baslik">' + kacisliMetin(seciliBaslik) + '</div>' +
            seciliMetaHtml +
          '</div>' +
        '</div>' +
        '<div class="diyagram-baglanti-sayilar">' +
          '<div class="diyagram-baglanti-sayi kaynak"><div class="diyagram-baglanti-sayi-deger">' + kaynakAdet + '</div><div class="diyagram-baglanti-sayi-etiket">Kaynak aldığı</div></div>' +
          '<div class="diyagram-baglanti-sayi hedef"><div class="diyagram-baglanti-sayi-deger">' + hedefAdet + '</div><div class="diyagram-baglanti-sayi-etiket">Etkilediği</div></div>' +
        '</div>';
    } else {
      diyagramBaglantiOzet.innerHTML =
        '<div class="diyagram-baglanti-ust">' +
          '<div>' +
            '<div class="diyagram-baglanti-eyebrow">SEÇİLİ NODE</div>' +
            '<div class="diyagram-baglanti-baslik">' + kacisliMetin(seciliBaslik) + '</div>' +
            seciliMetaHtml +
          '</div>' +
          '<button class="diyagram-baglanti-kucult" title="Küçült" aria-label="Bilgi kutusunu küçült">−</button>' +
        '</div>' +
        '<div class="diyagram-baglanti-sayilar">' +
          '<div class="diyagram-baglanti-sayi kaynak"><div class="diyagram-baglanti-sayi-deger">' + kaynakAdet + '</div><div class="diyagram-baglanti-sayi-etiket">Kaynak aldığı</div></div>' +
          '<div class="diyagram-baglanti-sayi hedef"><div class="diyagram-baglanti-sayi-deger">' + hedefAdet + '</div><div class="diyagram-baglanti-sayi-etiket">Etkilediği</div></div>' +
        '</div>' +
        diyagramBaglantiListesiHtml('Kaynak aldığı node’lar', 'kaynak', veri.kaynaklar) +
        diyagramBaglantiListesiHtml('Gittiği / etkilediği node’lar', 'hedef', veri.hedefler);
    }
    diyagramBaglantiOzet.classList.add('acik');
  }

  function diyagramBaglantiOzetGoster(seciliInfo, kaynaklar, hedefler) {
    const info = typeof seciliInfo === 'string' ? { etiket: seciliInfo } : (seciliInfo || { etiket: 'Node' });
    diyagramBaglantiOzetVeri = { seciliEtiket: info.etiket, seciliInfo: info, kaynaklar: kaynaklar, hedefler: hedefler };
    diyagramBaglantiOzetKucuk = true;
    diyagramBaglantiOzetCiz();
  }

  async function diyagramBaglantiSqlAc(item) {
    if (!diyagramBaglantiSqlVarMi(item)) return;
    let url = '';
    if (item.baglantiTip === 'statement') {
      url = '/api/sql_statementler?ids=' + encodeURIComponent(item.statementIds.join(','));
    } else if (item.baglantiTip === 'rapor_sql') {
      url = '/api/rapor_sql_goster?rapor_id=' + encodeURIComponent(item.raporId) +
            '&kaynak_id=' + encodeURIComponent(item.kaynakTableId);
    }
    if (!url) return;
    try {
      const yanit = await fetch(url);
      const veri = await yanit.json();
      if (!yanit.ok || veri.hata || !(veri.sonuclar || []).length) {
        alert(veri.hata || 'Bu bağlantı için kayıtlı SQL bulunamadı.');
        return;
      }
      sqlModalStatementlerAc(veri.sonuclar, { vurguTablo: item.etiket });
    } catch (err) {
      alert('SQL bilgisi alınamadı: ' + err);
    }
  }

  diyagramBaglantiOzet.addEventListener('click', function (e) {
    e.stopPropagation();
    if (diyagramBaglantiOzet.classList.contains('kucuk')) {
      diyagramBaglantiOzetKucuk = false;
      diyagramBaglantiOzetCiz();
      return;
    }
    const baglantiMadde = e.target.closest('.diyagram-baglanti-madde.sql-var');
    if (baglantiMadde && diyagramBaglantiOzetVeri) {
      const liste = baglantiMadde.dataset.baglantiYon === 'kaynak'
        ? diyagramBaglantiOzetVeri.kaynaklar
        : diyagramBaglantiOzetVeri.hedefler;
      const item = liste[parseInt(baglantiMadde.dataset.baglantiIndex, 10)];
      diyagramBaglantiSqlAc(item);
      return;
    }
    if (e.target.closest('.diyagram-baglanti-kucult')) {
      diyagramBaglantiOzetKucuk = !diyagramBaglantiOzetKucuk;
      diyagramBaglantiOzetCiz();
    }
  });

  diyagramSeviyeOverlay.addEventListener('click', function (e) {
    const btn = e.target.closest('.diyagram-seviye-overlay-btn');
    if (!btn) return;
    e.stopPropagation();
    const svg = diyagramGovde.querySelector('svg');
    if (!svg) return;
    const maxDerinlik = parseInt(svg.dataset.maxDerinlik || '0', 10);
    const onceAktifMi = !!diyagramKatmanOdak;
    const onceSecili = diyagramKatmanOdak ? diyagramKatmanOdak.secili : null;
    if (!onceAktifMi) {
      diyagramKatmanOdakOncesiKamera = {
        zoom: diyagramZoom,
        scrollLeft: diyagramGovde.scrollLeft,
        scrollTop: diyagramGovde.scrollTop,
      };
    }
    diyagramKatmanOdakSec(parseInt(btn.dataset.diyagramSeviye || '0', 10), maxDerinlik);
    diyagramKatmanKameraModu = diyagramKatmanOdak
      ? (!(onceAktifMi && onceSecili === diyagramKatmanOdak.secili) ? 'secili' : null)
      : 'restore';
    diyagramFiltreliCiz();
  });

  diyagramGenisletOverlay.addEventListener('click', function (e) {
    const btn = e.target.closest('.diyagram-genislet-btn');
    if (!btn) return;
    e.stopPropagation();
    const svg = diyagramGovde.querySelector('svg');
    if (!svg) return;
    const maxDerinlik = parseInt(svg.dataset.maxDerinlik || '0', 10);
    if (btn.dataset.diyagramDaralt) {
      diyagramKatmanOdakAzalt(btn.dataset.diyagramDaralt);
    } else {
      diyagramKatmanOdakGenislet(btn.dataset.diyagramGenislet, maxDerinlik);
    }
    diyagramKatmanKameraModu = 'pencere';
    diyagramFiltreliCiz();
  });

  // Bir duguma tiklayinca, ona GIREN (kaynaklarindan gelen -- yesil, akan)
  // ve ondan CIKAN (kendisinin besledigi ust tabloya giden -- turuncu, akan)
  // oklari vurgular, alakasiz her seyi soluklastirir. diyagramGovde HER
  // ZAMAN AYNI KONTEYNER (sadece innerHTML degisiyor) -- bu yuzden dinleyici
  // BIR KEZ, event delegation ile baglaniyor; her yeniden cizimde tekrar
  // eklemeye gerek yok.
  diyagramGovde.addEventListener('click', function (e) {
    const svg = diyagramGovde.querySelector('svg');
    if (!svg) return;
    const seviyeBtn = e.target.closest('.diyagram-seviye-btn');
    if (seviyeBtn) {
      const maxDerinlik = parseInt(svg.dataset.maxDerinlik || '0', 10);
      const onceAktifMi = !!diyagramKatmanOdak;
      const onceSecili = diyagramKatmanOdak ? diyagramKatmanOdak.secili : null;
      if (!onceAktifMi) {
        diyagramKatmanOdakOncesiKamera = {
          zoom: diyagramZoom,
          scrollLeft: diyagramGovde.scrollLeft,
          scrollTop: diyagramGovde.scrollTop,
        };
      }
      diyagramKatmanOdakSec(parseInt(seviyeBtn.dataset.diyagramSeviye || '0', 10), maxDerinlik);
      diyagramKatmanKameraModu = diyagramKatmanOdak
        ? (!(onceAktifMi && onceSecili === diyagramKatmanOdak.secili) ? 'secili' : null)
        : 'restore';
      diyagramFiltreliCiz();
      return;
    }
    svg.querySelectorAll('.diyagram-kenar').forEach(function (p) {
      p.classList.remove('diyagram-kenar-gelen', 'diyagram-kenar-giden', 'diyagram-kenar-soluk');
    });
    svg.querySelectorAll('.diyagram-dugum-kutu').forEach(function (r) {
      r.classList.remove('diyagram-dugum-secili-cerceve');
    });
    svg.querySelectorAll('.diyagram-dugum-grup').forEach(function (g) {
      g.classList.remove('diyagram-dugum-soluk', 'diyagram-dugum-secili', 'diyagram-dugum-gelen', 'diyagram-dugum-giden');
    });

    const grup = e.target.closest('.diyagram-dugum-grup');
    if (!grup || grup.dataset.secili === '1') {
      svg.querySelectorAll('.diyagram-dugum-grup').forEach(function (g) { g.dataset.secili = ''; });
      diyagramBaglantiOzetGizle();
      return;   // bos alana ya da ZATEN SECILI duguma tiklandi -- sadece temizle
    }
    svg.querySelectorAll('.diyagram-dugum-grup').forEach(function (g) { g.dataset.secili = ''; });
    grup.dataset.secili = '1';
    grup.classList.add('diyagram-dugum-secili');
    grup.querySelector('.diyagram-dugum-kutu').classList.add('diyagram-dugum-secili-cerceve');

    const seciliId = grup.dataset.dugum;
    const ilgiliDugumler = new Set([seciliId]);
    const kaynakDugumler = new Set();
    const hedefDugumler = new Set();
    const kaynakItems = [];
    const hedefItems = [];
    let ilgiliVarMi = false;
    svg.querySelectorAll('.diyagram-kenar').forEach(function (p) {
      if (p.dataset.ust === seciliId) {
        p.classList.add('diyagram-kenar-gelen');
        kaynakDugumler.add(p.dataset.alt);
        ilgiliDugumler.add(p.dataset.alt);
        kaynakItems.push(diyagramBaglantiItemOlustur(svg, p, p.dataset.alt, 'kaynak'));
        ilgiliVarMi = true;
      } else if (p.dataset.alt === seciliId) {
        p.classList.add('diyagram-kenar-giden');
        hedefDugumler.add(p.dataset.ust);
        ilgiliDugumler.add(p.dataset.ust);
        hedefItems.push(diyagramBaglantiItemOlustur(svg, p, p.dataset.ust, 'hedef'));
        ilgiliVarMi = true;
      }
      else { p.classList.add('diyagram-kenar-soluk'); }
    });
    kaynakDugumler.forEach(function (id) {
      const node = svg.querySelector('.diyagram-dugum-grup[data-dugum="' + id + '"]');
      if (node) node.classList.add('diyagram-dugum-gelen');
    });
    hedefDugumler.forEach(function (id) {
      const node = svg.querySelector('.diyagram-dugum-grup[data-dugum="' + id + '"]');
      if (node) node.classList.add('diyagram-dugum-giden');
    });
    if (ilgiliVarMi) {
      svg.querySelectorAll('.diyagram-dugum-grup').forEach(function (g) {
        if (!ilgiliDugumler.has(g.dataset.dugum)) g.classList.add('diyagram-dugum-soluk');
      });
    }
    const tamBaglanti = diyagramTamBaglantiIndeksi ? diyagramTamBaglantiIndeksi[seciliId] : null;
    diyagramBaglantiOzetGoster(
      tamBaglanti ? tamBaglanti.seciliInfo : diyagramDugumBilgisi(svg, seciliId),
      tamBaglanti ? tamBaglanti.kaynaklar : kaynakItems,
      tamBaglanti ? tamBaglanti.hedefler : hedefItems
    );
  });

  async function diyFetchZamanAsimli(url) {
    const controller = new AbortController();
    const zamanlayici = setTimeout(() => controller.abort(), DIY_FETCH_ZAMAN_ASIMI_MS);
    try {
      const yanit = await fetch(url, { signal: controller.signal });
      return { ok: yanit.ok, veri: await yanit.json() };
    } catch (err) {
      return { ok: false, veri: null };
    } finally {
      clearTimeout(zamanlayici);
    }
  }

  // /api/tam_agac icin: TEK bir istek TUM agaci sunucu tarafinda hesapliyor,
  // bu da normal tek-dugumluk isteklerden (DIY_FETCH_ZAMAN_ASIMI_MS = 8sn)
  // daha uzun surebilir -- ona gore daha genis bir zaman asimi (60sn).
  async function diyFetchZamanAsimliUzun(url) {
    const controller = new AbortController();
    const zamanlayici = setTimeout(() => controller.abort(), 60000);
    try {
      const yanit = await fetch(url, { signal: controller.signal });
      return { ok: yanit.ok, veri: await yanit.json() };
    } catch (err) {
      return { ok: false, veri: null };
    } finally {
      clearTimeout(zamanlayici);
    }
  }

  // Bir alt-sorgu grubunun TUM icini (kendi ic ice alt sorgulari ve
  // tablolari dahil) API'den ozyinelemeli olarak ceker -- kullanicinin
  // elle tiklayip genisletmesini BEKLEMEDEN, en alt duguma kadar iner.
  //
  // GUVENLIK: `durum` nesnesi TUM cagirimlar arasinda PAYLASILIR --
  // durum.sayac toplam istek sayisini sinirlar (DIY_MAKS_TOPLAM_CAGRI),
  // durum.altSorguYolu ise BU DALDAKI ziyaret edilmis alt_sorgu_id'leri
  // tutar (bir alt sorgu grubunun -- veri hatasi ya da beklenmeyen bir
  // yapidan dolayi -- KENDI ZINCIRINE geri donmesine karsi -- gercek bir
  // vakada /api/alt_sorgu'nun DAKIKALARCA surmesine yol acmisti).
  async function tamAltSorguModeliGetir(altSorguId, alias, tip, atalarYolu, derinlik, durum) {
    const etiket = altSorguEtiketi(tip, alias);
    if (durum.altSorguYolu.has(altSorguId)) {
      return { etiket: etiket + ' 🔁', tip: 'dongu', cocuklar: [] };
    }
    if (derinlik >= DIY_MAKS_DERINLIK || durum.sayac >= DIY_MAKS_TOPLAM_CAGRI) {
      durum.kesildi = true;
      return { etiket: etiket + ' (…)', tip: 'altsorgu', cocuklar: [] };
    }

    // ONBELLEK: bu alt_sorgu_id DAHA ONCE (agacin BASKA bir dalinda) cekildiyse
    // ag istegini TEKRARLAMA -- gercek semalarda ayni ortak alt sorgu/tablo
    // onlarca farkli dalda tekrar tekrar karsimiza cikabiliyor, her seferinde
    // yeniden cekmek gercek bir vakada DAKIKALARCA surmustu.
    let veri = durum.altSorguOnbellek.get(altSorguId);
    if (veri === undefined) {
      durum.sayac += 1;
      const sonuc = await diyFetchZamanAsimli('/api/alt_sorgu?alt_sorgu_id=' + altSorguId);
      veri = sonuc.ok ? sonuc.veri : null;
      durum.altSorguOnbellek.set(altSorguId, veri);
    }
    if (!veri) return { etiket, tip: 'altsorgu', cocuklar: [] };

    const yeniAltSorguYolu = new Set(durum.altSorguYolu);
    yeniAltSorguYolu.add(altSorguId);
    const altDurum = { sayac: durum.sayac, altSorguYolu: yeniAltSorguYolu, kesildi: durum.kesildi,
                        cocuklarOnbellek: durum.cocuklarOnbellek, altSorguOnbellek: durum.altSorguOnbellek,
                        genelZiyaretEdildi: durum.genelZiyaretEdildi };

    // PARALEL: ayni seviyedeki tum kardesler AYNI ANDA baslatilir (Promise.all)
    // -- sirayla (bir bir) beklemek yerine. JS'in "ilk await'e kadar senkron
    // calisir" ozelligi sayesinde, genelZiyaretEdildi/onbellek kontrolleri
    // hala DOGRU calisir (iki kardes AYNI tabloya isaret etse bile, ikinci
    // cagri, ilkinin isaretini SENKRON olarak zaten gormus olur).
    const gorevler = [];
    for (const a of veri.alt_sorgu_gruplari) {
      if (altDurum.sayac >= DIY_MAKS_TOPLAM_CAGRI) { altDurum.kesildi = true; break; }
      gorevler.push(tamAltSorguModeliGetir(a.alt_sorgu_id, a.alias, a.tip, atalarYolu, derinlik + 1, altDurum));
    }
    for (const c of veri.direkt_tablolar) {
      if (altDurum.sayac >= DIY_MAKS_TOPLAM_CAGRI) { altDurum.kesildi = true; break; }
      gorevler.push(tamTabloModeliGetir(c.table_id, c.tablo_adi, atalarYolu, derinlik + 1, altDurum));
    }
    const cocuklar = await Promise.all(gorevler);
    durum.sayac = altDurum.sayac;
    durum.kesildi = durum.kesildi || altDurum.kesildi;
    return { etiket, tip: 'altsorgu', cocuklar };
  }

  // Bir tablonun TUM kaynak agacini (elle genisletmeye gerek KALMADAN) API'den
  // ozyinelemeli olarak ceker -- her seviyede /api/cocuklar cagirir, donen her
  // alt-sorgu grubu icin tamAltSorguModeliGetir'i, her dogrudan tablo icin
  // KENDISINI tekrar cagirir. Dongu korumasi (atalarYolu) ve derinlik/toplam-
  // cagri sinirlari (DIY_MAKS_DERINLIK / DIY_MAKS_TOPLAM_CAGRI) sinirsiz
  // beklemeyi ONLER; onbellek (durum.cocuklarOnbellek) ayni tablonun
  // FARKLI dallarda tekrar tekrar agdan cekilmesini onler.
  async function tamTabloModeliGetir(tableId, tabloAdi, atalarYolu, derinlik, durum) {
    if (atalarYolu.includes(tableId)) {
      return { etiket: tabloAdi, tip: 'dongu', cocuklar: [] };
    }
    // GENEL (path'ten bagimsiz) "zaten tam genisletildi" kontrolu -- bu,
    // gercek bir dongu DEGIL (atalarYolu'nda yok), ama bu tablo agacin
    // BASKA bir dalinda ZATEN tam olarak genisletilmisse, alt agacini
    // TEKRAR insa etmek (SQL'de bulunan "cok-yollu patlama" ile AYNI
    // sorun) hem gereksiz hem de diyagrami devasa buyutebiliyordu. Byle
    // bir tekrar gorulunce, kucuk bir REFERANS dugumu (alt dali olmadan)
    // gosteriyoruz.
    if (durum.genelZiyaretEdildi.has(tableId)) {
      return { etiket: tabloAdi + ' 🔗', tip: 'referans', cocuklar: [] };
    }
    if (derinlik >= DIY_MAKS_DERINLIK || durum.sayac >= DIY_MAKS_TOPLAM_CAGRI) {
      durum.kesildi = true;
      return { etiket: tabloAdi + ' (…devamı var)', tip: 'tablo', cocuklar: [] };
    }
    durum.genelZiyaretEdildi.add(tableId);

    let veri = durum.cocuklarOnbellek.get(tableId);
    if (veri === undefined) {
      durum.sayac += 1;
      const sonuc = await diyFetchZamanAsimli('/api/cocuklar?table_id=' + tableId + '&basit=0');
      veri = sonuc.ok ? sonuc.veri : null;
      durum.cocuklarOnbellek.set(tableId, veri);
    }
    if (!veri) return { etiket: tabloAdi, tip: 'tablo', cocuklar: [] };

    const yeniYol = atalarYolu.concat([tableId]);
    const gorevler = [];
    for (const a of veri.alt_sorgu_gruplari) {
      if (durum.sayac >= DIY_MAKS_TOPLAM_CAGRI) { durum.kesildi = true; break; }
      gorevler.push(tamAltSorguModeliGetir(a.alt_sorgu_id, a.alias, a.tip, yeniYol, derinlik + 1, durum));
    }
    for (const c of veri.direkt_tablolar) {
      if (durum.sayac >= DIY_MAKS_TOPLAM_CAGRI) { durum.kesildi = true; break; }
      gorevler.push(tamTabloModeliGetir(c.table_id, c.tablo_adi, yeniYol, derinlik + 1, durum));
    }
    const cocuklar = await Promise.all(gorevler);
    return { etiket: tabloAdi, tip: 'tablo', cocuklar };
  }

  let diyagramSonModel = null;   // en son cekilen HAM model -- filtre degisince yeniden CEKMEDEN, buradan yeniden ciziyoruz
  let diyagramSonUyari = '';

  function diyagramPanelDurumlariniGuncelle() {
    const yerlesimBolumu = document.getElementById('diyagramYerlesimBolumu');
    if (yerlesimBolumu) {
      yerlesimBolumu.classList.toggle('gizli', diyagramGorunumModu !== 'agac');
    }
  }
  let diyagramGorunumModu = 'agac';  // 'agac' | 'katman' | 'radial'
  let diyagramZoom = 1;
  const DIYAGRAM_MIN_ZOOM = 0.35;
  const DIYAGRAM_MAX_ZOOM = 1.5;
  let diyagramAramaSonuclari = [];
  let diyagramAramaAktifIndex = -1;
  let diyagramPanBaslangic = null;
  let diyagramKatmanOdak = null;  // null = tum agac; {secili, baslangic, bitis} = katman penceresi
  let diyagramKatmanKameraModu = null;  // 'secili' | 'pencere' | null
  let diyagramKatmanOdakOncesiKamera = null;

  function diyagramZoomSinirla(zoom) {
    return Math.max(DIYAGRAM_MIN_ZOOM, Math.min(DIYAGRAM_MAX_ZOOM, zoom));
  }

  function diyagramKatmanOdakPenceresi(maxDerinlik) {
    if (!diyagramKatmanOdak || diyagramGorunumModu !== 'agac') {
      return { aktif: false, secili: null, baslangic: 0, bitis: maxDerinlik };
    }
    const secili = Math.max(0, Math.min(maxDerinlik, diyagramKatmanOdak.secili));
    const baslangic = Math.max(0, Math.min(secili, diyagramKatmanOdak.baslangic));
    const bitis = Math.min(maxDerinlik, Math.max(secili, diyagramKatmanOdak.bitis));
    return { aktif: true, secili: secili, baslangic: baslangic, bitis: bitis };
  }

  function diyagramKatmanOdakSec(seviye, maxDerinlik) {
    if (diyagramKatmanOdak && diyagramKatmanOdak.secili === seviye) {
      diyagramKatmanOdak = null;
      return;
    }
    diyagramKatmanOdak = {
      secili: seviye,
      baslangic: Math.max(0, seviye - 1),
      bitis: Math.min(maxDerinlik, seviye + 1),
    };
  }

  function diyagramKatmanOdakGenislet(yon, maxDerinlik) {
    if (!diyagramKatmanOdak) return;
    if (yon === 'sol') {
      diyagramKatmanOdak.baslangic = Math.max(0, diyagramKatmanOdak.baslangic - 1);
    } else if (yon === 'sag') {
      diyagramKatmanOdak.bitis = Math.min(maxDerinlik, diyagramKatmanOdak.bitis + 1);
    }
  }

  function diyagramKatmanOdakAzalt(yon) {
    if (!diyagramKatmanOdak) return;
    if (yon === 'sol') {
      diyagramKatmanOdak.baslangic = Math.min(diyagramKatmanOdak.secili, diyagramKatmanOdak.baslangic + 1);
    } else if (yon === 'sag') {
      diyagramKatmanOdak.bitis = Math.max(diyagramKatmanOdak.secili, diyagramKatmanOdak.bitis - 1);
    }
  }

  function diyagramSeviyeOverlayTemizle() {
    if (!diyagramSeviyeOverlay) return;
    diyagramSeviyeOverlay.classList.remove('acik');
    diyagramSeviyeOverlay.innerHTML = '';
  }

  function diyagramGenisletOverlayTemizle() {
    if (!diyagramGenisletOverlay) return;
    diyagramGenisletOverlay.classList.remove('acik');
    diyagramGenisletOverlay.innerHTML = '';
  }

  function diyagramSeviyeOverlayGuncelle() {
    if (!diyagramSeviyeOverlay || diyagramGorunumModu !== 'agac') {
      diyagramSeviyeOverlayTemizle();
      return;
    }
    const svg = diyagramGovde.querySelector('svg');
    if (!svg) {
      diyagramSeviyeOverlayTemizle();
      return;
    }
    const maxDerinlik = parseInt(svg.dataset.maxDerinlik || '0', 10);
    const odakAktif = svg.dataset.odakAktif === '1';
    const baslangic = odakAktif ? parseInt(svg.dataset.odakBaslangic || '0', 10) : 0;
    const bitis = odakAktif ? parseInt(svg.dataset.odakBitis || String(maxDerinlik), 10) : maxDerinlik;
    const secili = odakAktif ? parseInt(svg.dataset.odakSecili || '-1', 10) : -1;
    const svgRect = svg.getBoundingClientRect();
    const govdeRect = diyagramGovde.getBoundingClientRect();
    const seviyeNoktalari = [];
    for (let d = baslangic; d <= bitis; d += 1) {
      const node = svg.querySelector('.diyagram-dugum-grup[data-derinlik="' + d + '"]');
      if (!node) continue;
      let b;
      try { b = node.getBBox(); } catch (err) { continue; }
      const merkezSvgX = b.x + b.width / 2;
      const ekranX = (svgRect.left - govdeRect.left) + merkezSvgX * diyagramZoom;
      if (ekranX < -80 || ekranX > diyagramGovde.clientWidth + 80) continue;
      seviyeNoktalari.push({ d: d, ekranX: ekranX });
    }

    let minAralik = Infinity;
    for (let i = 1; i < seviyeNoktalari.length; i += 1) {
      minAralik = Math.min(minAralik, Math.abs(seviyeNoktalari[i].ekranX - seviyeNoktalari[i - 1].ekranX));
    }
    const zoomTabanliGenislik = Math.max(46, Math.min(142, DIY_KUTU_GENISLIK * diyagramZoom * 0.46));
    const aralikTabanliGenislik = Number.isFinite(minAralik) ? Math.max(26, minAralik - 10) : zoomTabanliGenislik;
    const btnGenislik = Math.round(Math.min(zoomTabanliGenislik, aralikTabanliGenislik));
    const btnYukseklik = Math.round(Math.max(16, Math.min(28, btnGenislik * 0.22)));
    const btnFont = Math.max(8, Math.min(12.5, btnGenislik / 10));
    const kisaEtiket = btnGenislik < 64;
    const buttons = [];
    seviyeNoktalari.forEach(function (nokta) {
      const d = nokta.d;
      const etiket = d === 0 ? 'Başlangıç' : 'Katman ' + d;
      const gorunenEtiket = kisaEtiket ? (d === 0 ? 'B' : String(d)) : etiket;
      buttons.push('<button type="button" class="diyagram-seviye-overlay-btn' + (secili === d ? ' aktif' : '') +
        '" data-diyagram-seviye="' + d + '" style="left:' + nokta.ekranX.toFixed(1) + 'px;' +
        '--seviye-btn-w:' + btnGenislik + 'px;--seviye-btn-h:' + btnYukseklik + 'px;--seviye-btn-font:' + btnFont.toFixed(1) + 'px" title="' +
        (secili === d ? 'Tüm katmanları göster' : etiket + ' çevresine odaklan') + '" aria-label="' +
        (secili === d ? 'Tüm katmanları göster' : etiket + ' çevresine odaklan') + '">' + gorunenEtiket + '</button>');
    });
    diyagramSeviyeOverlay.innerHTML = buttons.join('');
    diyagramSeviyeOverlay.classList.toggle('acik', buttons.length > 0);
  }

  function diyagramGenisletOverlayGuncelle() {
    if (!diyagramGenisletOverlay || diyagramGorunumModu !== 'agac') {
      diyagramGenisletOverlayTemizle();
      return;
    }
    const svg = diyagramGovde.querySelector('svg');
    if (!svg || svg.dataset.odakAktif !== '1') {
      diyagramGenisletOverlayTemizle();
      return;
    }
    const maxDerinlik = parseInt(svg.dataset.maxDerinlik || '0', 10);
    const baslangic = parseInt(svg.dataset.odakBaslangic || '0', 10);
    const bitis = parseInt(svg.dataset.odakBitis || String(maxDerinlik), 10);
    const secili = parseInt(svg.dataset.odakSecili || '0', 10);
    const solButonlar = [];
    const sagButonlar = [];
    if (baslangic > 0) {
      solButonlar.push('<button type="button" class="diyagram-genislet-btn arttir" data-diyagram-genislet="sol" title="Soldaki katmanı göster">+</button>');
    }
    if (baslangic < secili) {
      solButonlar.push('<button type="button" class="diyagram-genislet-btn azalt" data-diyagram-daralt="sol" title="Soldaki katmanı gizle">−</button>');
    }
    if (bitis < maxDerinlik) {
      sagButonlar.push('<button type="button" class="diyagram-genislet-btn arttir" data-diyagram-genislet="sag" title="Sağdaki katmanı göster">+</button>');
    }
    if (bitis > secili) {
      sagButonlar.push('<button type="button" class="diyagram-genislet-btn azalt" data-diyagram-daralt="sag" title="Sağdaki katmanı gizle">−</button>');
    }
    const html = (solButonlar.length ? '<div class="diyagram-genislet-kolon sol">' + solButonlar.join('') + '</div>' : '') +
                 (sagButonlar.length ? '<div class="diyagram-genislet-kolon sag">' + sagButonlar.join('') + '</div>' : '');
    diyagramGenisletOverlay.innerHTML = html;
    diyagramGenisletOverlay.classList.toggle('acik', html.length > 0);
  }

  function diyagramOverlayleriGuncelle() {
    diyagramSeviyeOverlayGuncelle();
    diyagramGenisletOverlayGuncelle();
  }

  function diyagramKatmanKamerayiAyarla(mod) {
    if (mod === 'restore') {
      if (!diyagramKatmanOdakOncesiKamera) return false;
      diyagramZoom = diyagramZoomSinirla(diyagramKatmanOdakOncesiKamera.zoom || 1);
      diyagramZoomUygula();
      const onceki = diyagramKatmanOdakOncesiKamera;
      requestAnimationFrame(function () {
        diyagramGovde.scrollLeft = onceki.scrollLeft || 0;
        diyagramGovde.scrollTop = onceki.scrollTop || 0;
        diyagramOverlayleriGuncelle();
      });
      diyagramKatmanOdakOncesiKamera = null;
      return true;
    }
    if (!mod || diyagramGorunumModu !== 'agac' || !diyagramKatmanOdak) return false;
    const svg = diyagramGovde.querySelector('svg');
    if (!svg) return false;
    const secili = String(diyagramKatmanOdak.secili);
    const tumGorunurler = Array.from(svg.querySelectorAll('.diyagram-dugum-grup'));
    if (tumGorunurler.length === 0) return false;
    const seciliKatmanDugumleri = tumGorunurler.filter(function (g) { return g.dataset.derinlik === secili; });
    const merkezHedefleri = (mod === 'secili' && seciliKatmanDugumleri.length > 0) ? seciliKatmanDugumleri : tumGorunurler;
    const zoomHedefleri = tumGorunurler;

    function bboxHesapla(hedefler) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      hedefler.forEach(function (g) {
        try {
          const b = g.getBBox();
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        } catch (err) {}
      });
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    const zoomBBox = bboxHesapla(zoomHedefleri);
    const merkezBBox = bboxHesapla(merkezHedefleri) || zoomBBox;
    if (!zoomBBox || !merkezBBox) return false;

    const bosluk = mod === 'secili' ? 130 : 120;
    const hedefGenislik = Math.max(1, zoomBBox.maxX - zoomBBox.minX + bosluk);
    const yatayZoom = diyagramGovde.clientWidth / hedefGenislik;
    const minZoom = mod === 'secili' ? 0.70 : 0.54;
    const maxZoom = mod === 'secili' ? 1.28 : 1.12;
    const hedefZoom = diyagramZoomSinirla(Math.max(minZoom, Math.min(maxZoom, yatayZoom)));
    diyagramZoom = hedefZoom;
    diyagramZoomUygula();

    requestAnimationFrame(function () {
      const merkezX = (merkezBBox.minX + merkezBBox.maxX) / 2;
      const merkezY = (merkezBBox.minY + merkezBBox.maxY) / 2;
      diyagramGovde.scrollLeft = Math.max(0, merkezX * diyagramZoom - diyagramGovde.clientWidth / 2);
      diyagramGovde.scrollTop = Math.max(0, merkezY * diyagramZoom - diyagramGovde.clientHeight / 2);
      diyagramOverlayleriGuncelle();
    });
    return true;
  }

  function diyagramZoomUygula() {
    const svg = diyagramGovde.querySelector('svg');
    const resetBtn = document.getElementById('diyagramZoomResetBtn');
    if (resetBtn) resetBtn.textContent = Math.round(diyagramZoom * 100) + '%';
    if (!svg) return;
    if (!svg.dataset.baseWidth) {
      svg.dataset.baseWidth = svg.getAttribute('width');
      svg.dataset.baseHeight = svg.getAttribute('height');
    }
    const baseWidth = parseFloat(svg.dataset.baseWidth);
    const baseHeight = parseFloat(svg.dataset.baseHeight);
    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) return;
    const yeniGenislik = Math.round(baseWidth * diyagramZoom);
    const yeniYukseklik = Math.round(baseHeight * diyagramZoom);
    svg.setAttribute('width', yeniGenislik);
    svg.setAttribute('height', yeniYukseklik);
    svg.style.display = 'block';
    svg.style.marginLeft = Math.max(0, (diyagramGovde.clientWidth - yeniGenislik) / 2) + 'px';
    svg.style.marginTop = Math.max(0, (diyagramGovde.clientHeight - yeniYukseklik) / 2) + 'px';
    diyagramOverlayleriGuncelle();
  }

  function diyagramKokuOrtala() {
    const svg = diyagramGovde.querySelector('svg');
    if (!svg) return;
    requestAnimationFrame(function () {
      const kok = svg.querySelector('.diyagram-dugum-grup[data-dugum="d0"]') ||
                  svg.querySelector('.diyagram-dugum-grup');
      if (!kok) return;
      const govdeRect = diyagramGovde.getBoundingClientRect();
      const kokRect = kok.getBoundingClientRect();
      const kokMerkezX = kokRect.left - govdeRect.left + diyagramGovde.scrollLeft + kokRect.width / 2;
      const kokMerkezY = kokRect.top - govdeRect.top + diyagramGovde.scrollTop + kokRect.height / 2;
      diyagramGovde.scrollLeft = kokMerkezX - diyagramGovde.clientWidth / 2;
      diyagramGovde.scrollTop = kokMerkezY - diyagramGovde.clientHeight / 2;
      diyagramOverlayleriGuncelle();
    });
  }

  function diyagramRadialKokeGit() {
    if (diyagramGorunumModu !== 'radial') return;
    diyagramKokuOrtala();
  }

  function diyagramZoomDegistir(yeniZoom, merkezeGit) {
    const svg = diyagramGovde.querySelector('svg');
    if (svg) {
      const rect = diyagramGovde.getBoundingClientRect();
      diyagramZoomNoktadan(yeniZoom, rect.left + diyagramGovde.clientWidth / 2, rect.top + diyagramGovde.clientHeight / 2);
    } else {
      diyagramZoom = diyagramZoomSinirla(yeniZoom);
      diyagramZoomUygula();
    }
    if (merkezeGit) diyagramRadialKokeGit();
  }

  function diyagramZoomNoktadan(yeniZoom, clientX, clientY) {
    const oncekiZoom = diyagramZoom;
    const hedefZoom = diyagramZoomSinirla(yeniZoom);
    if (Math.abs(hedefZoom - oncekiZoom) < 0.001) return;
    const rect = diyagramGovde.getBoundingClientRect();
    const icerikX = diyagramGovde.scrollLeft + clientX - rect.left;
    const icerikY = diyagramGovde.scrollTop + clientY - rect.top;
    const oran = hedefZoom / oncekiZoom;
    diyagramZoom = hedefZoom;
    diyagramZoomUygula();
    diyagramGovde.scrollLeft = icerikX * oran - (clientX - rect.left);
    diyagramGovde.scrollTop = icerikY * oran - (clientY - rect.top);
    diyagramOverlayleriGuncelle();
  }

  function diyagramAramaSayacGuncelle() {
    const sayac = document.getElementById('diyagramAramaSayac');
    const onceki = document.getElementById('diyagramAramaOnceki');
    const sonraki = document.getElementById('diyagramAramaSonraki');
    if (!sayac || !onceki || !sonraki) return;
    if (diyagramAramaSonuclari.length === 0) {
      sayac.textContent = document.getElementById('diyagramAramaInput').value.trim() ? '0' : '';
      onceki.disabled = true;
      sonraki.disabled = true;
      return;
    }
    sayac.textContent = (diyagramAramaAktifIndex + 1) + ' / ' + diyagramAramaSonuclari.length;
    onceki.disabled = diyagramAramaSonuclari.length <= 1;
    sonraki.disabled = diyagramAramaSonuclari.length <= 1;
  }

  function diyagramAramaAktifiOrtala() {
    const aktif = diyagramAramaSonuclari[diyagramAramaAktifIndex];
    const svg = diyagramGovde.querySelector('svg');
    if (!aktif || !svg) return;
    requestAnimationFrame(function () {
      const govdeRect = diyagramGovde.getBoundingClientRect();
      const aktifRect = aktif.getBoundingClientRect();
      const aktifMerkezX = aktifRect.left - govdeRect.left + diyagramGovde.scrollLeft + aktifRect.width / 2;
      const aktifMerkezY = aktifRect.top - govdeRect.top + diyagramGovde.scrollTop + aktifRect.height / 2;
      diyagramGovde.scrollLeft = aktifMerkezX - diyagramGovde.clientWidth / 2;
      diyagramGovde.scrollTop = aktifMerkezY - diyagramGovde.clientHeight / 2;
    });
  }

  function diyagramAramaAktifiGoster(ortala) {
    diyagramAramaSonuclari.forEach(function (g) { g.classList.remove('diyagram-dugum-arama-aktif'); });
    const aktif = diyagramAramaSonuclari[diyagramAramaAktifIndex];
    if (aktif) {
      aktif.classList.add('diyagram-dugum-arama-aktif');
      if (ortala) diyagramAramaAktifiOrtala();
    }
    diyagramAramaSayacGuncelle();
  }

  function diyagramAramaUygula(ortalaAktif) {
    if (ortalaAktif === undefined) ortalaAktif = true;
    const input = document.getElementById('diyagramAramaInput');
    const svg = diyagramGovde.querySelector('svg');
    const q = input ? input.value.trim().toLowerCase() : '';
    diyagramAramaSonuclari = [];
    diyagramAramaAktifIndex = -1;
    if (!svg) return;

    const aranabilirTipler = new Set(['kok', 'tablo', 'dongu', 'referans']);
    const dugumler = Array.from(svg.querySelectorAll('.diyagram-dugum-grup'));
    dugumler.forEach(function (g) {
      g.classList.remove('diyagram-dugum-arama-eslesme');
      g.classList.remove('diyagram-dugum-arama-aktif');
      if (!q || !aranabilirTipler.has(g.dataset.tip)) return;
      const etiket = (g.dataset.etiket || '').toLowerCase();
      if (etiket.includes(q)) {
        g.classList.add('diyagram-dugum-arama-eslesme');
        diyagramAramaSonuclari.push(g);
      }
    });
    if (diyagramAramaSonuclari.length > 0) {
      diyagramAramaAktifIndex = 0;
      diyagramAramaAktifiGoster(ortalaAktif);
    } else {
      diyagramAramaSayacGuncelle();
    }
  }

  function diyagramAramadaGez(yon) {
    if (diyagramAramaSonuclari.length === 0) return;
    diyagramAramaAktifIndex = (diyagramAramaAktifIndex + yon + diyagramAramaSonuclari.length) % diyagramAramaSonuclari.length;
    diyagramAramaAktifiGoster(true);
  }

  // Bir dugumu (ve alt agacini) verilen gizli-katman kumesine gore FILTRELER.
  // 'tablo'/'dongu'/'referans' tipindeki dugumler, katmanlari gizliyse TUM
  // ALT AGAÇLARIYLA BIRLIKTE budanir (yeniden baglama YAPILMAZ -- basit ve
  // ongorulebilir: "bu katmani gizle" = "bu dal artik yok"). 'katman_grubu'
  // dugumleri, TUM uyeleri filtrelenince kendisi de kaybolur, kismen
  // filtrelenirse etiketindeki sayi GUNCELLENIR. Kok dugum HICBIR ZAMAN
  // filtrelenmez (o an baktigimiz tablo/rapor budur).
  function modelKatmanFiltrele(node, gizliKatmanlar, kokMu) {
    if (!kokMu && (node.tip === 'tablo' || node.tip === 'dongu' || node.tip === 'referans')) {
      const k = node.katman || 'DIGER';
      if (gizliKatmanlar.has(k)) return null;
    }
    const yeniCocuklar = [];
    (node.cocuklar || []).forEach(function (c) {
      const filtrelenmis = modelKatmanFiltrele(c, gizliKatmanlar, false);
      if (filtrelenmis) yeniCocuklar.push(filtrelenmis);
    });
    if (node.tip === 'katman_grubu') {
      if (yeniCocuklar.length === 0) return null;
      const orijinalEtiket = KATMAN_GRUP_BASLIK[node.katman] || '❔ Diğer';
      return Object.assign({}, node, { cocuklar: yeniCocuklar, etiket: orijinalEtiket + ' (' + yeniCocuklar.length + ')' });
    }
    return Object.assign({}, node, { cocuklar: yeniCocuklar });
  }
  const KATMAN_GRUP_BASLIK = { LD: '🗄 LD', TR: '🔄 TR', EX: '📥 EX', KAYNAK: '🌐 KAYNAK' };

  function modelAltSorgulariGizle(node) {
    const yeniCocuklar = [];
    (node.cocuklar || []).forEach(function (c) {
      const temiz = modelAltSorgulariGizle(c);
      if (temiz.tip === 'altsorgu') {
        (temiz.cocuklar || []).forEach(function (torun) { yeniCocuklar.push(torun); });
      } else {
        yeniCocuklar.push(temiz);
      }
    });
    return Object.assign({}, node, { cocuklar: yeniCocuklar });
  }

  // Agac modelini DUZ bir dugum+kenar listesine cevirir -- 'altsorgu' ve
  // 'katman_grubu' SARMALAYICILARINI GORMEDEN GECER (bunlarin ICINDEKI
  // gercek tablolari, en yakin gercek ata-tabloya BAGLAR). Swim-lane
  // gorunumu icin: burada onemli olan "hangi tablo hangi tabloyu besliyor",
  // ara sarmalayicilarin kendisi degil.
  function swimlaneVeriTopla(kok) {
    const dugumler = [];
    const kenarlar = [];
    function gercekMi(node) {
      return node.tip === 'kok' || node.tip === 'tablo' || node.tip === 'dongu' || node.tip === 'referans';
    }
    function dolas(node, enYakinGercekEbeveyn) {
      if (gercekMi(node)) {
        dugumler.push(node);
        if (enYakinGercekEbeveyn) kenarlar.push([enYakinGercekEbeveyn, node]);
        (node.cocuklar || []).forEach(function (c) { dolas(c, node); });
      } else {
        (node.cocuklar || []).forEach(function (c) { dolas(c, enYakinGercekEbeveyn); });
      }
    }
    dolas(kok, null);
    return { dugumler, kenarlar };
  }

  const SWIMLANE_SUTUNLAR = [
    { katman: 'LD', baslik: '🗄 LD — LOAD' },
    { katman: 'TR', baslik: '🔄 TR — TRANSFORM' },
    { katman: 'EX', baslik: '📥 EX — EXTRACT' },
    { katman: 'KAYNAK', baslik: '🌐 KAYNAK — OLTP/DIŞ SİSTEM' },
    { katman: 'DIGER', baslik: '❔ Diğer' },
  ];

  // "Rapor Adı" (Report Name) --> LD --> TR --> EX --> KAYNAK seklinde,
  // KATMANA GORE dikey seritlere (swim lane) ayrilmis bir gorunum -- agac
  // derinligi DEGIL, ETL islem sirasi esas alinir. Kullanicinin verdigi
  // ornek gorsele birebir uygun: her katman kendi dikey seridinde, basliklar
  // ustte, seritler arasi dikey ayrac cizgileri.
  function diyagramSwimlaneCiz(kok) {
    const { dugumler, kenarlar } = swimlaneVeriTopla(kok);
    dugumler.forEach(function (node, i) { node._diyId = 'd' + i; });
    diyagramTamBaglantiIndeksi = diyagramTamBaglantiIndeksiKur(dugumler, kenarlar);

    const kullanilanKatmanlar = new Set(dugumler.filter(n => n.tip !== 'kok').map(n => n.katman || 'DIGER'));
    const sutunlar = SWIMLANE_SUTUNLAR.filter(function (s) { return kullanilanKatmanlar.has(s.katman); });
    const sutunIndeks = {};
    sutunlar.forEach(function (s, i) { sutunIndeks[s.katman] = i + 1; });  // 0 = kok sutunu

    const SUTUN_GENISLIK = DIY_KUTU_GENISLIK, SUTUN_ARALIK = 70, UST_BOSLUK = 56;
    dugumler.forEach(function (node) {
      const sutun = node.tip === 'kok' ? 0 : (sutunIndeks[node.katman || 'DIGER'] || 1);
      node.x = sutun * (SUTUN_GENISLIK + SUTUN_ARALIK);
    });
    // her sutunda ayri bir dikey sayac ile Y ata (basitce sirayla -- swim
    // lane gorunumunde "ata dugum hizasi" onemli degil, sadece SIRA/GRUP onemli)
    const sutunSayaci = {};
    dugumler.forEach(function (node) {
      const s = node.tip === 'kok' ? 0 : (sutunIndeks[node.katman || 'DIGER'] || 1);
      const sayac = sutunSayaci[s] || 0;
      node.y = UST_BOSLUK + sayac * (DIY_KUTU_YUKSEKLIK + DIY_SATIR_ARALIK + 6);
      sutunSayaci[s] = sayac + 1;
    });

    const maxSutun = Math.max(0, sutunlar.length);
    const genislik = (maxSutun + 1) * (SUTUN_GENISLIK + SUTUN_ARALIK) + 40;
    const maxSayac = Math.max(1, ...Object.values(sutunSayaci));
    const yukseklik = UST_BOSLUK + maxSayac * (DIY_KUTU_YUKSEKLIK + DIY_SATIR_ARALIK + 6) + 30;

    let svg = `<svg width="${genislik}" height="${yukseklik}" viewBox="0 0 ${genislik} ${yukseklik}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Segoe UI',sans-serif;">`;

    // sutun ayrac cizgileri + basliklar
    sutunlar.forEach(function (s, i) {
      const x = (i + 1) * (SUTUN_GENISLIK + SUTUN_ARALIK) - SUTUN_ARALIK / 2;
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${yukseklik}" stroke="${KATMAN_RENKLERI[s.katman] || '#C7CEDB'}" stroke-width="1.2" stroke-opacity="0.45"/>`;
      const merkezX = (i + 1) * (SUTUN_GENISLIK + SUTUN_ARALIK) + SUTUN_GENISLIK / 2;
      svg += `<text x="${merkezX}" y="24" text-anchor="middle" font-size="12" font-weight="700" fill="${KATMAN_RENKLERI[s.katman] || '#8A6A1F'}">${kacisliMetin(s.baslik)}</text>`;
    });

    kenarlar.forEach(function ([ust, alt]) {
      const x1 = ust.x + SUTUN_GENISLIK, y1 = ust.y + DIY_KUTU_YUKSEKLIK / 2;
      const x2 = alt.x, y2 = alt.y + DIY_KUTU_YUKSEKLIK / 2;
      const ortaX = (x1 + x2) / 2;
      svg += `<path class="diyagram-kenar"${diyagramKenarAttrleri(ust, alt)} ` +
             `d="M ${x1} ${y1} C ${ortaX} ${y1}, ${ortaX} ${y2}, ${x2} ${y2}" ` +
             `stroke="#C7CEDB" stroke-width="1.6" fill="none" marker-end="url(#swimlaneOk)"/>`;
    });
    svg += `<defs><marker id="swimlaneOk" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">` +
           `<path d="M0,0 L6,3 L0,6 Z" fill="#9AA5B8"/></marker></defs>`;

    const renkler = {
      kok: { dolgu: '#0F2A20', metin: 'white', kenar: '#0F2A20' },
      tablo: { dolgu: 'white', metin: '#14171A', kenar: '#C9A961' },
      dongu: { dolgu: '#FBEAEE', metin: '#A24D5E', kenar: '#C17B89' },
      referans: { dolgu: '#F0F3FA', metin: '#5B6B8C', kenar: '#C7CEDB' },
    };
    dugumler.forEach(function (node) {
      let r = renkler[node.tip] || renkler.tablo;
      const rx = node.tip === 'kok' ? 17 : 8;
      svg += `<g class="diyagram-dugum-grup"${diyagramDugumAttrleri(node)} style="cursor:pointer;">` +
             `<rect class="diyagram-dugum-kutu" x="${node.x}" y="${node.y}" width="${SUTUN_GENISLIK}" height="${DIY_KUTU_YUKSEKLIK}" rx="${rx}" ` +
             `fill="${r.dolgu}" stroke="${r.kenar}" stroke-width="1.4"/>`;
      if (node.tip === 'tablo' && node.katman && KATMAN_RENKLERI[node.katman]) {
        svg += `<rect x="${node.x}" y="${node.y + 4}" width="${DIY_KATMAN_CUBUK_GENISLIK}" height="${DIY_KUTU_YUKSEKLIK - 8}" rx="3" fill="${KATMAN_RENKLERI[node.katman]}"/>`;
      }
      const etiketKisa = etiketiKisalt(node.etiket, 34);
      svg += `<title>${kacisliMetin(node.etiket)}</title>` +
             `<text x="${node.x + SUTUN_GENISLIK / 2}" y="${node.y + DIY_KUTU_YUKSEKLIK / 2 + 4}" ` +
             `text-anchor="middle" font-size="12.5" font-weight="${node.tip === 'kok' ? '700' : '600'}" fill="${r.metin}">` +
             `${kacisliMetin(etiketKisa)}</text>` +
             '</g>';
    });

    svg += '</svg>';
    return svg;
  }

  function diyagramRadialCiz(kok) {
    const dugumler = [];
    const kenarlar = [];
    const seviyeSayilari = {};

    function yaprakSay(node) {
      if (!node.cocuklar || node.cocuklar.length === 0 || node.tip === 'dongu' || node.tip === 'referans') return 1;
      return node.cocuklar.reduce(function (toplam, c) { return toplam + yaprakSay(c); }, 0);
    }

    function maksDerinlik(node, derinlik) {
      if (!node.cocuklar || node.cocuklar.length === 0) return derinlik;
      return Math.max.apply(null, node.cocuklar.map(function (c) { return maksDerinlik(c, derinlik + 1); }));
    }

    const yaprakToplam = Math.max(1, yaprakSay(kok));
    const derinlikToplam = Math.max(1, maksDerinlik(kok, 0));
    const RADIAL_MIN_NODE_MESAFE = 96;
    let yaprakIndex = 0;

    function derinlikleriSay(node, derinlik) {
      seviyeSayilari[derinlik] = (seviyeSayilari[derinlik] || 0) + 1;
      (node.cocuklar || []).forEach(function (c) { derinlikleriSay(c, derinlik + 1); });
    }

    derinlikleriSay(kok, 0);

    const orbitYaricaplari = [0];
    for (let d = 1; d <= derinlikToplam; d += 1) {
      const onceki = orbitYaricaplari[d - 1] || 0;
      const adet = seviyeSayilari[d] || 1;
      const okunabilirCevreYaricapi = (adet * RADIAL_MIN_NODE_MESAFE) / (Math.PI * 2);
      orbitYaricaplari[d] = Math.max(onceki + 152, d * 144, okunabilirCevreYaricapi);
    }
    function orbitYaricapi(derinlik) {
      return orbitYaricaplari[derinlik] || 0;
    }

    function aciAta(node, derinlik) {
      node._radDerinlik = derinlik;
      node._diyDerinlik = derinlik;
      if (!node.cocuklar || node.cocuklar.length === 0 || node.tip === 'dongu' || node.tip === 'referans') {
        node._radAci = -Math.PI / 2 + ((yaprakIndex + 0.5) / yaprakToplam) * Math.PI * 2;
        yaprakIndex += 1;
      } else {
        node.cocuklar.forEach(function (c) { aciAta(c, derinlik + 1); });
        node._radAci = (node.cocuklar[0]._radAci + node.cocuklar[node.cocuklar.length - 1]._radAci) / 2;
      }
    }

    aciAta(kok, 0);

    function aciNormalizePozitif(aci) {
      const tamTur = Math.PI * 2;
      return ((aci % tamTur) + tamTur) % tamTur;
    }

    function radialOrbitleriMinimumMesafeyeGoreBuyut() {
      const seviyeler = {};
      (function topla(node) {
        const d = node._radDerinlik || 0;
        seviyeler[d] = seviyeler[d] || [];
        seviyeler[d].push(node);
        (node.cocuklar || []).forEach(topla);
      })(kok);

      Object.keys(seviyeler).map(Number).filter(function (d) { return d > 0; }).forEach(function (d) {
        const liste = seviyeler[d];
        if (!liste || liste.length <= 1) return;
        const sirali = liste.slice().sort(function (a, b) {
          return aciNormalizePozitif(a._radAci) - aciNormalizePozitif(b._radAci);
        });
        let minBosluk = Math.PI * 2;
        for (let i = 0; i < sirali.length; i += 1) {
          const a1 = aciNormalizePozitif(sirali[i]._radAci);
          const a2 = aciNormalizePozitif(sirali[(i + 1) % sirali.length]._radAci) + (i === sirali.length - 1 ? Math.PI * 2 : 0);
          minBosluk = Math.min(minBosluk, a2 - a1);
        }
        if (!Number.isFinite(minBosluk) || minBosluk <= 0) return;
        const gerekenYaricap = RADIAL_MIN_NODE_MESAFE / Math.max(minBosluk, 0.018);
        orbitYaricaplari[d] = Math.max(orbitYaricaplari[d] || 0, gerekenYaricap);
      });
      for (let d = 1; d <= derinlikToplam; d += 1) {
        orbitYaricaplari[d] = Math.max(orbitYaricaplari[d] || 0, (orbitYaricaplari[d - 1] || 0) + 152);
      }
    }

    radialOrbitleriMinimumMesafeyeGoreBuyut();

    const maxYaricap = Math.max(190, orbitYaricaplari[derinlikToplam] || 190);
    const kenarBosluk = 330;
    const genislik = Math.max(980, maxYaricap * 2 + kenarBosluk * 2);
    const yukseklik = Math.max(860, maxYaricap * 2 + 360);
    const merkezX = genislik / 2;
    const merkezY = yukseklik / 2 + 18;

    function radialPozisyonGuncelle(node) {
      const r = orbitYaricapi(node._radDerinlik || 0);
      node.x = merkezX + Math.cos(node._radAci) * r;
      node.y = merkezY + Math.sin(node._radAci) * r;
    }

    (function pozisyonlariGuncelle(node) {
      radialPozisyonGuncelle(node);
      (node.cocuklar || []).forEach(pozisyonlariGuncelle);
    })(kok);

    (function topla(node) {
      node._diyId = 'd' + dugumler.length;
      dugumler.push(node);
      (node.cocuklar || []).forEach(function (c) {
        kenarlar.push([node, c]);
        topla(c);
      });
    })(kok);
    diyagramTamBaglantiIndeksi = diyagramTamBaglantiIndeksiKur(dugumler, kenarlar);

    const renkler = {
      kok: { dolgu: '#0F2A20', metin: '#0F2A20', kenar: '#0F2A20' },
      tablo: { dolgu: 'white', metin: '#14171A', kenar: '#C9A961' },
      altsorgu: { dolgu: '#FBF3E1', metin: '#8A6A1F', kenar: '#E4C878' },
      katman_grubu: { dolgu: '#FBF3E1', metin: '#8A6A1F', kenar: '#E4C878' },
      dongu: { dolgu: '#FBEAEE', metin: '#A24D5E', kenar: '#C17B89' },
      referans: { dolgu: '#F0F3FA', metin: '#5B6B8C', kenar: '#C7CEDB' },
    };

    let svg = `<svg class="diyagram-radial-svg" width="${genislik}" height="${yukseklik}" viewBox="0 0 ${genislik} ${yukseklik}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Segoe UI',sans-serif;">`;
    svg += `<defs><marker id="radialOk" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">` +
           `<path d="M0,0 L6,3 L0,6 Z" fill="#9AA5B8"/></marker></defs>`;

    for (let d = 1; d <= derinlikToplam; d += 1) {
      const r = orbitYaricapi(d);
      const onceki = orbitYaricapi(d - 1);
      const bandYaricap = (r + onceki) / 2;
      const bandKalinlik = Math.max(28, r - onceki);
      const bandRenk = d % 2 === 0 ? '#E9F5EF' : '#FFFFFF';
      const bandOpaklik = d % 2 === 0 ? 0.58 : 0.82;
      svg += `<circle cx="${merkezX}" cy="${merkezY}" r="${bandYaricap}" fill="none" ` +
             `stroke="${bandRenk}" stroke-width="${bandKalinlik}" stroke-opacity="${bandOpaklik}"/>`;
      svg += `<circle cx="${merkezX}" cy="${merkezY}" r="${r}" fill="none" ` +
             `stroke="#D8E0EA" stroke-width="1.15" stroke-dasharray="3,5" opacity="0.88"/>`;
    }

    kenarlar.forEach(function ([ust, alt]) {
      const ortaR = (orbitYaricapi(ust._radDerinlik) + orbitYaricapi(alt._radDerinlik)) / 2;
      const ortaX1 = merkezX + Math.cos(ust._radAci) * ortaR;
      const ortaY1 = merkezY + Math.sin(ust._radAci) * ortaR;
      const ortaX2 = merkezX + Math.cos(alt._radAci) * ortaR;
      const ortaY2 = merkezY + Math.sin(alt._radAci) * ortaR;
      const kenarRenk = (alt._radDerinlik || 0) % 2 === 0 ? '#7EAF9A' : '#C5A25A';
      svg += `<path class="diyagram-kenar"${diyagramKenarAttrleri(ust, alt)} ` +
             `d="M ${ust.x} ${ust.y} C ${ortaX1} ${ortaY1}, ${ortaX2} ${ortaY2}, ${alt.x} ${alt.y}" ` +
             `stroke="${kenarRenk}" stroke-width="1.28" stroke-opacity="0.62" ` +
             `fill="none" marker-end="url(#radialOk)"/>`;
    });

    dugumler.forEach(function (node) {
      let r = renkler[node.tip] || renkler.tablo;
      if (node.tip === 'katman_grubu' && node.katman) {
        const kr = KATMAN_RENKLERI[node.katman] || '#8A6A1F';
        r = { dolgu: KATMAN_ACIK_ZEMIN[node.katman] || '#FBF3E1', metin: kr, kenar: kr };
      }
      if (node.tip === 'tablo' && node.katman && KATMAN_RENKLERI[node.katman]) {
        r = { dolgu: 'white', metin: '#14171A', kenar: KATMAN_RENKLERI[node.katman] };
      }
      const yaricap = node.tip === 'kok' ? 20 : (node.tip === 'altsorgu' || node.tip === 'katman_grubu' ? 8 : 11);
      const kesikCizgi = (node.tip === 'altsorgu' || node.tip === 'katman_grubu') ? ' stroke-dasharray="3,2"' : '';
      const aciDerece = node._radAci * 180 / Math.PI;
      const solYarim = aciDerece > 90 || aciDerece < -90;
      const textAci = solYarim ? aciDerece + 180 : aciDerece;
      const etiketMesafe = yaricap + (node.cocuklar && node.cocuklar.length > 0 ? 15 : 21);
      const etiketX = node.tip === 'kok' ? node.x : node.x + Math.cos(node._radAci) * etiketMesafe;
      const etiketY = node.tip === 'kok' ? node.y + 42 : node.y + Math.sin(node._radAci) * etiketMesafe;
      const anchor = node.tip === 'kok' ? 'middle' : (solYarim ? 'end' : 'start');
      const etiketKisa = etiketiKisalt(node.etiket, node.tip === 'kok' ? 30 : (node.cocuklar && node.cocuklar.length > 0 ? 17 : 26));
      const textTransform = node.tip === 'kok' ? '' : ` transform="rotate(${textAci} ${etiketX} ${etiketY})"`;
      svg += `<g class="diyagram-dugum-grup"${diyagramDugumAttrleri(node)} style="cursor:pointer;">` +
             `<circle class="diyagram-dugum-kutu" cx="${node.x}" cy="${node.y}" r="${yaricap}" fill="${r.dolgu}" ` +
             `stroke="${r.kenar}" stroke-width="${node.tip === 'kok' ? 2.8 : 2}"${kesikCizgi}/>` +
             `<title>${kacisliMetin(node.etiket)}</title>` +
             `<text class="diyagram-radial-etiket" x="${etiketX}" y="${etiketY}"${textTransform} text-anchor="${anchor}" dominant-baseline="middle" ` +
             `font-size="${node.tip === 'kok' ? 14.5 : (node.cocuklar && node.cocuklar.length > 0 ? 11.5 : 12.5)}" ` +
             `font-weight="${node.tip === 'kok' ? '800' : '650'}" fill="${r.metin}">${kacisliMetin(etiketKisa)}</text>` +
             '</g>';
    });

    svg += '</svg>';
    return svg;
  }

  function diyagramFiltreliCiz() {
    if (!diyagramSonModel) return;
    diyagramBaglantiOzetGizle();
    diyagramPanelDurumlariniGuncelle();
    const gizliKatmanlar = new Set();
    document.querySelectorAll('.diyagram-filtre-secenek[data-katman]').forEach(function (lbl) {
      if (!lbl.querySelector('input').checked) gizliKatmanlar.add(lbl.dataset.katman);
    });
    let filtrelenmisModel = modelKatmanFiltrele(diyagramSonModel, gizliKatmanlar, true);
    if (document.getElementById('diyagramAltSorgusuzCheckbox').checked) {
      filtrelenmisModel = modelAltSorgulariGizle(filtrelenmisModel);
    }
    const ozet = document.getElementById('diyagramFiltreOzet');
    ozet.textContent = gizliKatmanlar.size > 0 ? '(' + Array.from(gizliKatmanlar).join(', ') + ' gizlendi)' : '';

    let cizim;
    if (diyagramGorunumModu === 'katman') cizim = diyagramSwimlaneCiz(filtrelenmisModel);
    else if (diyagramGorunumModu === 'radial') cizim = diyagramRadialCiz(filtrelenmisModel);
    else cizim = diyagramSvgCiz(filtrelenmisModel);
    diyagramGovde.innerHTML = diyagramSonUyari + cizim;
    const kameraUygulandi = diyagramKatmanKamerayiAyarla(diyagramKatmanKameraModu);
    diyagramKatmanKameraModu = null;
    if (!kameraUygulandi) diyagramZoomUygula();
    diyagramAramaUygula();
    diyagramRadialKokeGit();
    diyagramOverlayleriGuncelle();
  }

  document.querySelectorAll('.diyagram-filtre-secenek input').forEach(function (cb) {
    cb.addEventListener('change', diyagramFiltreliCiz);
  });

  document.querySelectorAll('.diyagram-gorunum-panel, .diyagram-katman-panel').forEach(function (panel) {
    panel.classList.add('diyagram-panel-kapali');
    panel.addEventListener('mouseenter', function () {
      panel.classList.remove('diyagram-panel-kapali');
    });
    panel.addEventListener('mouseleave', function () {
      panel.classList.add('diyagram-panel-kapali');
    });
    panel.addEventListener('focusin', function () {
      panel.classList.remove('diyagram-panel-kapali');
    });
    panel.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!panel.contains(document.activeElement)) panel.classList.add('diyagram-panel-kapali');
      }, 0);
    });
  });

  document.querySelectorAll('[data-diyagram-panel-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (window.matchMedia && window.matchMedia('(hover: hover)').matches) return;
      const panel = btn.closest('.diyagram-gorunum-panel, .diyagram-katman-panel');
      if (panel) panel.classList.toggle('diyagram-panel-kapali');
    });
  });

  document.getElementById('diyagramGorunumSecici').addEventListener('click', function (e) {
    const btn = e.target.closest('.diyagram-gorunum-btn');
    if (!btn) return;
    diyagramGorunumModu = btn.dataset.diyagramGorunum || 'agac';
    document.querySelectorAll('.diyagram-gorunum-btn').forEach(function (b) {
      b.classList.toggle('aktif', b === btn);
    });
    diyagramFiltreliCiz();
  });

  document.getElementById('diyagramYerlesimSecici').addEventListener('click', function (e) {
    const btn = e.target.closest('.diyagram-yerlesim-btn');
    if (!btn) return;
    diyagramAgacYerlesimModu = btn.dataset.diyagramYerlesim || 'parent';
    document.querySelectorAll('.diyagram-yerlesim-btn').forEach(function (b) {
      b.classList.toggle('aktif', b === btn);
    });
    if (diyagramGorunumModu !== 'agac') {
      diyagramGorunumModu = 'agac';
      document.querySelectorAll('.diyagram-gorunum-btn').forEach(function (b) {
        b.classList.toggle('aktif', b.dataset.diyagramGorunum === 'agac');
      });
    }
    diyagramFiltreliCiz();
  });

  document.getElementById('diyagramAramaInput').addEventListener('input', function () {
    diyagramAramaAktifIndex = 0;
    diyagramAramaUygula(true);
  });
  document.getElementById('diyagramAramaInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      diyagramAramadaGez(e.shiftKey ? -1 : 1);
    }
  });
  document.getElementById('diyagramAramaOnceki').addEventListener('click', function () { diyagramAramadaGez(-1); });
  document.getElementById('diyagramAramaSonraki').addEventListener('click', function () { diyagramAramadaGez(1); });
  diyagramGovde.addEventListener('scroll', function () {
    diyagramOverlayleriGuncelle();
  });

  diyagramGovde.addEventListener('wheel', function (e) {
    if (!diyagramGovde.querySelector('svg')) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const faktor = Math.exp(-e.deltaY * 0.002);
      diyagramZoomNoktadan(diyagramZoom * faktor, e.clientX, e.clientY);
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (e.shiftKey) {
      diyagramGovde.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  diyagramGovde.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || !diyagramGovde.querySelector('svg')) return;
    if (e.target.closest('button, input, label, .diyagram-dugum-grup, .diyagram-seviye-btn, .diyagram-genislet-btn')) return;
    diyagramPanBaslangic = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: diyagramGovde.scrollLeft,
      scrollTop: diyagramGovde.scrollTop,
    };
    diyagramGovde.classList.add('diyagram-pan-aktif');
    diyagramGovde.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  diyagramGovde.addEventListener('pointermove', function (e) {
    if (!diyagramPanBaslangic) return;
    diyagramGovde.scrollLeft = diyagramPanBaslangic.scrollLeft - (e.clientX - diyagramPanBaslangic.x);
    diyagramGovde.scrollTop = diyagramPanBaslangic.scrollTop - (e.clientY - diyagramPanBaslangic.y);
    diyagramOverlayleriGuncelle();
  });

  function diyagramPanBitir(e) {
    if (!diyagramPanBaslangic) return;
    diyagramPanBaslangic = null;
    diyagramGovde.classList.remove('diyagram-pan-aktif');
    try { diyagramGovde.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  diyagramGovde.addEventListener('pointerup', diyagramPanBitir);
  diyagramGovde.addEventListener('pointercancel', diyagramPanBitir);

  document.getElementById('diyagramZoomOutBtn').addEventListener('click', function () {
    diyagramZoomDegistir(diyagramZoom / 1.3, diyagramGorunumModu === 'radial');
  });
  document.getElementById('diyagramZoomResetBtn').addEventListener('click', function () {
    diyagramZoomDegistir(1, diyagramGorunumModu === 'radial');
  });
  document.getElementById('diyagramZoomInBtn').addEventListener('click', function () {
    diyagramZoomDegistir(diyagramZoom * 1.3, diyagramGorunumModu === 'radial');
  });
  document.getElementById('diyagramKokNavBtn').addEventListener('click', function () {
    diyagramKokuOrtala();
  });

  document.getElementById('diyagramBtn').addEventListener('click', async function () {
    const kokLi = agacAlani.querySelector(':scope > ul.agac > li');
    if (!kokLi) return;

    // TABLO modunda kok gercek bir table_id, RAPOR modunda gercek bir
    // rapor_id tasir -- ikisinde de TUM agaci (elle genisletme beklemeden)
    // TEK istekle sunucu tarafinda hesaplatiyoruz. KOLON modunda kok
    // gercek bir varlik degildir (arama metni) -- o zaman eskisi gibi,
    // o an DOM'da GORUNEN kismi cizeriz.
    const kokTableIdStr = kokLi.dataset.tableId;
    const kokRaporIdStr = kokLi.dataset.raporId;
    const kokAdSpan = kokLi.querySelector(':scope > .dugum-satir .tablo-adi, :scope > .dugum-satir .kok-rapor-etiket');

    diyagramModal.classList.add('acik');
    diyagramSonModel = null;
    diyagramSonUyari = '';
    diyagramKatmanOdak = null;
    diyagramKatmanKameraModu = null;
    diyagramKatmanOdakOncesiKamera = null;
    diyagramBaglantiOzetGizle();
    document.getElementById('diyagramAramaInput').value = '';
    document.getElementById('diyagramAramaSayac').textContent = '';
    diyagramAramaSonuclari = [];
    diyagramAramaAktifIndex = -1;
    diyagramAramaSayacGuncelle();
    diyagramZoomDegistir(1, false);

    if (kokTableIdStr || kokRaporIdStr) {
      const kokEtiket = kokAdSpan ? kokAdSpan.textContent.trim() : '';
      diyagramBaslikMetin.textContent = 'Hiyerarşi Diyagramı — ' + kokEtiket;
      diyagramGovde.innerHTML = '<div class="diyagram-yukleniyor">Tüm ağaç getiriliyor, lütfen bekleyin…</div>';
      // TEK istek -- tum agac sunucu tarafinda (HTTP gidis-donusu olmadan)
      // hesaplanip tek seferde donuyor. Eskiden yuzlerce ayri istek atiliyordu
      // (her seviye icin bir HTTP gidis-donusu) -- derin agaclarda bu, gercek
      // ag/DB gecikmesiyle carpilinca dakikalarca surebiliyordu.
      const url = kokTableIdStr
        ? '/api/tam_agac?table_id=' + kokTableIdStr
        : '/api/rapor_tam_agac?rapor_id=' + kokRaporIdStr;
      const { ok, veri } = await diyFetchZamanAsimliUzun(url);
      if (!ok || !veri || veri.hata) {
        diyagramGovde.innerHTML = '<div class="diyagram-uyari">⚠ Ağaç getirilemedi: ' + (veri && veri.hata ? veri.hata : 'sunucuya ulaşılamadı') + '</div>';
      } else {
        diyagramSonModel = veri.model;
        diyagramSonUyari = veri.kesildi
          ? '<div class="diyagram-uyari">⚠ Ağaç çok büyük/karmaşık olduğu için bir kısmı (' + veri.sayac + '+ düğüm sonrası) kesildi -- aşağıda gördüğünüz kısım tamamlanmamış olabilir.</div>'
          : '';
        diyagramFiltreliCiz();
      }
    } else {
      const model = domAgaciniModeleCevir(kokLi);
      if (!model) { diyagramModal.classList.remove('acik'); return; }
      diyagramBaslikMetin.textContent = 'Hiyerarşi Diyagramı — ' + model.etiket;
      diyagramSonModel = model;
      diyagramFiltreliCiz();
    }
  });

  document.getElementById('diyagramKapatBtn').addEventListener('click', function () {
    diyagramBaglantiOzetGizle();
    diyagramModal.classList.remove('acik');
  });
  diyagramModal.addEventListener('click', function (e) {
    if (e.target === diyagramModal) {
      diyagramBaglantiOzetGizle();
      diyagramModal.classList.remove('acik');
    }
  });

  document.getElementById('diyagramIndirBtn').addEventListener('click', function () {
    const svgEl = diyagramGovde.querySelector('svg');
    if (!svgEl) return;
    const genislik = parseInt(svgEl.getAttribute('width'), 10);
    const yukseklik = parseInt(svgEl.getAttribute('height'), 10);
    const svgVeri = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>' + svgVeri], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = genislik * 2; canvas.height = yukseklik * 2;  // netlik icin 2x
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'lineage-diyagram.png';
        a.click();
      });
    };
    img.src = url;
  });
</script>
</body>
</html>
"""


@app.route("/")
def index():
    return Response(HTML_SAYFA, mimetype="text/html")


@app.route("/kolon_etki")
def kolon_etki_sayfasi():
    return Response(HTML_SAYFA, mimetype="text/html")


HTML_YAPI_SAYFA = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>SQL Yapı Analizi</title>
<style>
  :root {
    --navy: #1D8A5C; --navy-dark: #0F2A20; --ice: #E3F3EA; --slate: #6B7280;
    --amber: #C99A44; --coral: #C17B89; --lightbg: #F5F6F8; --text: #14171A;
  }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; background: var(--lightbg); margin: 0; padding: 40px 20px; color: var(--text); }
  .kapsayici { max-width: 820px; margin: 0 auto; }
  h1 { color: var(--navy-dark); font-size: 24px; margin-bottom: 4px; }
  .aciklama { color: var(--slate); font-size: 14px; margin-bottom: 20px; }
  .aciklama a { color: var(--navy); font-weight: 600; }

  #sqlInput { width: 100%; height: 220px; padding: 12px 14px; font-size: 13px; font-family: 'Consolas', monospace;
              border: 1px solid var(--ice); border-radius: 6px; resize: vertical; }
  #analizButon { margin-top: 10px; padding: 10px 22px; font-size: 15px; background: var(--navy); color: white;
                 border: none; border-radius: 4px; cursor: pointer; }
  #analizButon:hover { background: var(--navy-dark); }

  #yapiAlani { margin-top: 24px; }
  .hata-mesaj { text-align: center; color: var(--coral); padding: 20px; background: white; border-radius: 18px; }
  .bilgi-mesaj { text-align: center; color: var(--slate); padding: 20px; font-size: 13px; }

  .seviye-blok { background: white; border-radius: 18px; padding: 12px 16px; margin-bottom: 10px;
                 box-shadow: 0 4px 20px rgba(15,42,32,0.08); border-left: 4px solid var(--navy); }
  .seviye-blok.derived { border-left-color: var(--amber); }
  .seviye-blok.subq { border-left-color: var(--coral); }
  .seviye-blok.cte { border-left-color: #2C8C6E; }
  .seviye-baslik { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .seviye-no { font-size: 11px; font-weight: bold; color: var(--slate); background: var(--lightbg); padding: 2px 8px; border-radius: 10px; }
  .seviye-tip { font-size: 12.5px; font-weight: 700; color: var(--navy-dark); }
  .seviye-alias { font-size: 12px; color: var(--slate); font-style: italic; }
  .tablolar-satiri { display: flex; flex-wrap: wrap; gap: 8px; }
  .tablo-kutu { background: var(--lightbg); border: 1px solid #E4E7F0; border-radius: 5px; padding: 4px 10px; font-size: 12.5px; font-weight: 600; color: var(--navy-dark); }
  .tablo-yok { font-size: 12px; color: var(--slate); font-style: italic; }
</style>
</head>
<body>
<div class="kapsayici">
  <h1>SQL Yapı Analizi</h1>
  <div class="aciklama">Bir INSERT/UPDATE/MERGE veya düz SELECT cümlesi yapıştırın — içindeki her subquery seviyesini, hangi tabloları doğrudan kullandığını göstersin.
  <br><a href="/">← Lineage Görüntüleyici'ye dön</a></div>

  <textarea id="sqlInput" placeholder="SQL cümlenizi buraya yapıştırın..."></textarea>
  <br>
  <button id="analizButon">Analiz Et</button>

  <div id="yapiAlani"></div>
</div>

<script>
  const sqlInput = document.getElementById('sqlInput');
  const analizButon = document.getElementById('analizButon');
  const yapiAlani = document.getElementById('yapiAlani');

  analizButon.addEventListener('click', analizEt);

  const SEVIYE_SINIF = {
    'ANA SORGU': '',
    'ALT SORGU (FROM içinde)': 'derived',
    'ALT SORGU (WHERE/EXISTS içinde)': 'subq',
    'CTE (WITH içinde)': 'cte',
  };

  async function analizEt() {
    const sql = sqlInput.value.trim();
    if (!sql) return;
    yapiAlani.innerHTML = '<div class="bilgi-mesaj">Ayrıştırılıyor...</div>';

    let veri;
    try {
      const yanit = await fetch('/api/yapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql }),
      });
      veri = await yanit.json();
      if (!yanit.ok) {
        yapiAlani.innerHTML = '<div class="hata-mesaj">' + (veri.hata || 'Bilinmeyen hata') + '</div>';
        return;
      }
    } catch (err) {
      yapiAlani.innerHTML = '<div class="hata-mesaj">Sunucuya ulaşılamadı: ' + err + '</div>';
      return;
    }

    render(veri);
  }

  function render(veri) {
    yapiAlani.innerHTML = '';
    if (!veri.seviyeler || veri.seviyeler.length === 0) {
      yapiAlani.innerHTML = '<div class="bilgi-mesaj">Analiz edilecek bir SELECT yapısı bulunamadı.</div>';
      return;
    }

    veri.seviyeler.forEach(function (s) {
      const blok = document.createElement('div');
      blok.className = 'seviye-blok ' + (SEVIYE_SINIF[s.tip] || '');
      blok.style.marginLeft = (s.seviye * 28) + 'px';

      const baslik = document.createElement('div');
      baslik.className = 'seviye-baslik';
      baslik.innerHTML =
        '<span class="seviye-no">SEVİYE ' + s.seviye + '</span>' +
        '<span class="seviye-tip">' + s.tip + '</span>' +
        (s.alias ? '<span class="seviye-alias">alias: ' + s.alias + '</span>' : '');
      blok.appendChild(baslik);

      const satir = document.createElement('div');
      satir.className = 'tablolar-satiri';
      if (s.tablolar.length === 0) {
        satir.innerHTML = '<span class="tablo-yok">bu seviyede doğrudan tablo yok (sadece alt sorgulara sarmalıyor)</span>';
      } else {
        s.tablolar.forEach(function (t) {
          const kutu = document.createElement('span');
          kutu.className = 'tablo-kutu';
          kutu.textContent = t;
          satir.appendChild(kutu);
        });
      }
      blok.appendChild(satir);

      yapiAlani.appendChild(blok);
    });
  }
</script>
</body>
</html>
"""


@app.route("/yapi")
def yapi_sayfasi():
    return Response(HTML_YAPI_SAYFA, mimetype="text/html")


@app.route("/alan_ara")
def alan_ara_yonlendirme():
    # Eski ayrı sayfa artık ana ekrandaki KOLON modu -- eski link/yer imleri
    # kırılmasın diye buraya yönlendiriyoruz.
    return redirect("/?mod=kolon")


if __name__ == "__main__":
    print("Sunucu başlıyor... Tarayıcıda şu adresi açın: http://localhost:5000")
    app.run(debug=False, port=5000, use_reloader=False, threaded=True)
