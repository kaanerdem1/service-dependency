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
import os
from pathlib import Path
import psycopg2
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import build_scope, ScopeType

# ------------------------------------------------------------------
# PostgreSQL bağlantısı: .env veya ortam değişkenlerinden okunur.
# Şifreyi bu dosyaya yazmayın. Örnek için .env.example dosyasına bakın.
# ------------------------------------------------------------------
def _load_dotenv():
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


_load_dotenv()

PG_HOST = os.environ.get("PG_HOST", "localhost")
PG_PORT = int(os.environ.get("PG_PORT", "5432"))
PG_DBNAME = os.environ.get("PG_DBNAME", "postgres")
PG_USER = os.environ.get("PG_USER", "postgres")
PG_PASSWORD = os.environ.get("PG_PASSWORD", "")
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


def _like_escape(s: str) -> str:
    """LIKE / ILIKE için %, _ ve \\ karakterlerini kaçırır."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


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
        SELECT DISTINCT kt.table_id, kt.tablo_adi, kt.katman
        FROM stage.katalog_unit_statement us
        JOIN stage.katalog_statement_alt_sorgu als
             ON als.statement_id = us.statement_id AND als.ust_alt_sorgu_id IS NULL
        JOIN stage.katalog_statement_kaynak sk ON sk.alt_sorgu_id = als.alt_sorgu_id
        JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
        WHERE us.hedef_table_id = %s
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
        "direkt_tablolar": [{"table_id": r[0], "tablo_adi": r[1], "katman": r[2]} for r in direkt_rows],
        "alt_sorgu_gruplari": alt_sorgu_gruplari,
    }


def _alt_sorgu_getir_dahili(cur, alt_sorgu_id: int, dolu_harita: dict) -> dict:
    cur.execute(
        """
        SELECT DISTINCT kt.table_id, kt.tablo_adi, kt.katman
        FROM stage.katalog_statement_kaynak sk
        JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
        WHERE sk.alt_sorgu_id = %s
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
        "direkt_tablolar": [{"table_id": r[0], "tablo_adi": r[1], "katman": r[2]} for r in direkt_rows],
        "alt_sorgu_gruplari": alt_sorgu_gruplari,
    }


ALT_SORGU_ETIKET_PY = {
    "FROM_ALT_SORGU": "alt sorgu", "WHERE_ALT_SORGU": "alt sorgu", "CTE": "CTE",
    "UNION_DALI": "UNION dalı", "TABLO_FONKSIYONU": "tablo fonksiyonu",
}


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


def _tam_alt_sorgu_getir(cur, dolu_harita, alt_sorgu_id, alias, tip, atalar_yolu, derinlik, durum):
    etiket = "📦 " + ALT_SORGU_ETIKET_PY.get(tip, "alt sorgu") + (f" ({alias})" if alias else "")
    if alt_sorgu_id in durum["alt_sorgu_yolu"]:
        return {"etiket": etiket + " 🔁", "tip": "dongu", "cocuklar": []}
    if derinlik >= TAM_AGAC_MAKS_DERINLIK or durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
        durum["kesildi"] = True
        return {"etiket": etiket + " (…)", "tip": "altsorgu", "cocuklar": []}

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
        tablo_cocuklari.append(_tam_agac_getir(cur, dolu_harita, c["table_id"], c["tablo_adi"], atalar_yolu, derinlik + 1, durum, c.get("katman")))
    durum["alt_sorgu_yolu"].discard(alt_sorgu_id)
    return {"etiket": etiket, "tip": "altsorgu", "cocuklar": alt_cocuklar + _katmana_gore_grupla(tablo_cocuklari)}


def _tam_agac_getir(cur, dolu_harita, table_id, tablo_adi, atalar_yolu, derinlik, durum, katman=None):
    if table_id in atalar_yolu:
        return {"etiket": tablo_adi, "tip": "dongu", "katman": katman, "cocuklar": []}
    if table_id in durum["genel_ziyaret"]:
        return {"etiket": tablo_adi + " 🔗", "tip": "referans", "katman": katman, "cocuklar": []}
    if derinlik >= TAM_AGAC_MAKS_DERINLIK or durum["sayac"] >= TAM_AGAC_MAKS_TOPLAM:
        durum["kesildi"] = True
        return {"etiket": tablo_adi + " (…devamı var)", "tip": "tablo", "katman": katman, "cocuklar": []}
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
        tablo_cocuklari.append(_tam_agac_getir(cur, dolu_harita, c["table_id"], c["tablo_adi"], yeni_yol, derinlik + 1, durum, c.get("katman")))
    return {"etiket": tablo_adi, "tip": "tablo", "katman": katman, "cocuklar": alt_cocuklar + _katmana_gore_grupla(tablo_cocuklari)}


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
        cur.execute("SELECT tablo_adi, katman FROM stage.katalog_tablo WHERE table_id = %s", (table_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"hata": "tablo bulunamadı"}), 404
        tablo_adi, kok_katman = row

        dolu_harita = alt_sorgu_dolu_haritasi(cur)
        durum = {"sayac": 0, "kesildi": False, "genel_ziyaret": set(),
                  "alt_sorgu_yolu": set(), "cocuklar_onbellek": {}, "alt_sorgu_onbellek": {}}
        model = _tam_agac_getir(cur, dolu_harita, table_id, tablo_adi, [], 0, durum, kok_katman)
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
            SELECT DISTINCT kt.table_id, kt.tablo_adi, kt.katman
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
            _tam_agac_getir(cur, dolu_harita, tid, tadi, [], 0, durum, katman)
            for tid, tadi, katman in kaynak_tablolar
        ]
        cocuklar = _katmana_gore_grupla(cocuklar)
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    model = {"etiket": "📄 " + rapor_adi, "tip": "kok", "cocuklar": cocuklar}
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


@app.route("/api/tablo")
def api_tablo():
    """Tablo adını table_id'ye çözer -- kök düğümü başlatmak için."""
    ad = request.args.get("ad", "").strip().upper()
    if not ad:
        return jsonify({"hata": "ad parametresi gerekli"}), 400
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT table_id, tablo_adi, katman FROM stage.katalog_tablo WHERE tablo_adi = %s LIMIT 1", (ad,))
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    if not row:
        return jsonify({"bulundu": False, "aranan": ad})
    return jsonify({"bulundu": True, "table_id": row[0], "tablo_adi": row[1], "katman": row[2]})


@app.route("/api/tablo_oner")
def api_tablo_oner():
    """Tablo adı autocomplete. Min 2 karakter; prefix önce, sonra contains;
    en fazla 15 öneri + toplam eşleşme sayısı döner."""
    q = request.args.get("q", "").strip()
    limit = 15
    if len(q) < 2:
        return jsonify({"oneriler": [], "toplam": 0, "q": q, "limit": limit})

    q_norm = q.upper()
    escaped = _like_escape(q_norm)
    prefix = escaped + "%"
    contains = "%" + escaped + "%"

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*)
            FROM stage.katalog_tablo
            WHERE UPPER(tablo_adi) LIKE %s ESCAPE '\\'
            """,
            (contains,),
        )
        toplam = cur.fetchone()[0]

        # Öncelik: 0=prefix, 1=contains; sonra kısa isim, sonra alfabetik.
        # Hedef olarak geçen tablolar (statement yazan) hafifçe öne alınır.
        cur.execute(
            """
            SELECT t.schema_adi, t.tablo_adi, t.katman, t.table_id,
                   CASE WHEN UPPER(t.tablo_adi) LIKE %s ESCAPE '\\' THEN 0 ELSE 1 END AS oncelik,
                   LENGTH(t.tablo_adi) AS uzunluk,
                   COALESCE(h.hedef_adet, 0) AS hedef_adet
            FROM stage.katalog_tablo t
            LEFT JOIN (
                SELECT hedef_table_id, COUNT(*) AS hedef_adet
                FROM stage.katalog_unit_statement
                WHERE hedef_table_id IS NOT NULL
                GROUP BY hedef_table_id
            ) h ON h.hedef_table_id = t.table_id
            WHERE UPPER(t.tablo_adi) LIKE %s ESCAPE '\\'
            ORDER BY oncelik, hedef_adet DESC, uzunluk, t.tablo_adi
            LIMIT %s
            """,
            (prefix, contains, limit),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    oneriler = [
        {
            "etiket": r[1],
            "alt": r[0] or "—",
            "rozet": r[2],
            "schema_adi": r[0],
            "tablo_adi": r[1],
            "katman": r[2],
            "table_id": r[3],
            "prefix": r[4] == 0,
        }
        for r in rows
    ]
    return jsonify({
        "oneriler": oneriler,
        "toplam": toplam,
        "q": q,
        "limit": limit,
    })


@app.route("/api/kolon_oner")
def api_kolon_oner():
    """Kolon adı autocomplete (benzersiz kolon_adi). Min 2 karakter; LIMIT 15."""
    q = request.args.get("q", "").strip()
    limit = 15
    if len(q) < 2:
        return jsonify({"oneriler": [], "toplam": 0, "q": q, "limit": limit})

    escaped = _like_escape(q.upper())
    prefix = escaped + "%"
    contains = "%" + escaped + "%"

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(DISTINCT kolon_adi)
            FROM stage.katalog_kolon
            WHERE UPPER(kolon_adi) LIKE %s ESCAPE '\\'
            """,
            (contains,),
        )
        toplam = cur.fetchone()[0]

        cur.execute(
            """
            SELECT kolon_adi,
                   COUNT(*) AS tablo_adet,
                   CASE WHEN UPPER(kolon_adi) LIKE %s ESCAPE '\\' THEN 0 ELSE 1 END AS oncelik,
                   LENGTH(kolon_adi) AS uzunluk
            FROM stage.katalog_kolon
            WHERE UPPER(kolon_adi) LIKE %s ESCAPE '\\'
            GROUP BY kolon_adi
            ORDER BY oncelik, tablo_adet DESC, uzunluk, kolon_adi
            LIMIT %s
            """,
            (prefix, contains, limit),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    oneriler = [
        {
            "etiket": r[0],
            "alt": f"{r[1]} tabloda",
            "rozet": None,
            "kolon_adi": r[0],
            "tablo_adet": r[1],
            "prefix": r[2] == 0,
        }
        for r in rows
    ]
    return jsonify({
        "oneriler": oneriler,
        "toplam": toplam,
        "q": q,
        "limit": limit,
    })


@app.route("/api/rapor_oner")
def api_rapor_oner():
    """Rapor adı autocomplete. Min 2 karakter; LIMIT 15."""
    q = request.args.get("q", "").strip()
    limit = 15
    if len(q) < 2:
        return jsonify({"oneriler": [], "toplam": 0, "q": q, "limit": limit})

    escaped = _like_escape(q)
    prefix = escaped + "%"
    contains = "%" + escaped + "%"

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*)
            FROM stage.katalog_rapor
            WHERE rapor_adi ILIKE %s ESCAPE '\\'
            """,
            (contains,),
        )
        toplam = cur.fetchone()[0]

        cur.execute(
            """
            SELECT rapor_id, rapor_adi,
                   CASE WHEN rapor_adi ILIKE %s ESCAPE '\\' THEN 0 ELSE 1 END AS oncelik,
                   LENGTH(rapor_adi) AS uzunluk
            FROM stage.katalog_rapor
            WHERE rapor_adi ILIKE %s ESCAPE '\\'
            ORDER BY oncelik, uzunluk, rapor_adi
            LIMIT %s
            """,
            (prefix, contains, limit),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({"hata": f"Veritabanı hatası: {e}"}), 500

    oneriler = [
        {
            "etiket": r[1],
            "alt": None,
            "rozet": "RAPOR",
            "rapor_id": r[0],
            "rapor_adi": r[1],
            "prefix": r[2] == 0,
        }
        for r in rows
    ]
    return jsonify({
        "oneriler": oneriler,
        "toplam": toplam,
        "q": q,
        "limit": limit,
    })


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
            WITH RECURSIVE etki (seviye, tablo_id, yol) AS (
                SELECT 1, us.hedef_table_id, ARRAY[%s, us.hedef_table_id]
                FROM stage.katalog_statement_kaynak sk
                JOIN stage.katalog_unit_statement us ON us.statement_id = sk.statement_id
                WHERE sk.kaynak_table_id = %s AND us.hedef_table_id IS NOT NULL
                UNION ALL
                SELECT e.seviye + 1, us.hedef_table_id, e.yol || us.hedef_table_id
                FROM etki e
                JOIN stage.katalog_statement_kaynak sk ON sk.kaynak_table_id = e.tablo_id
                JOIN stage.katalog_unit_statement us ON us.statement_id = sk.statement_id
                WHERE e.seviye < 10 AND us.hedef_table_id IS NOT NULL
                      AND NOT (us.hedef_table_id = ANY(e.yol))
            )
            SELECT DISTINCT e.seviye, kt.tablo_adi, kt.schema_adi, e.tablo_id
            FROM etki e
            JOIN stage.katalog_tablo kt ON kt.table_id = e.tablo_id
            ORDER BY e.seviye, kt.tablo_adi
            """,
            (table_id, table_id),
        )
        rows = cur.fetchall()

        # Bu tabloyu VEYA aşağı yönde etkilenen herhangi bir tabloyu KAYNAK
        # olarak kullanan raporlar -- raporlar zaten "zincirin sonu" (başka
        # bir şeyi beslemiyorlar), bu yüzden recursive değil, tek ek sorgu.
        tum_etkilenen_table_idler = list({table_id} | {r[3] for r in rows})
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

    etkilenenler = [{"seviye": r[0], "tablo_adi": r[1], "schema_adi": r[2]} for r in rows]
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
                SELECT DISTINCT kt.table_id, kt.tablo_adi, kt.katman
                FROM stage.katalog_unit_statement us
                JOIN stage.katalog_statement_kaynak sk ON sk.statement_id = us.statement_id
                JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
                WHERE us.hedef_table_id = %s
                ORDER BY kt.tablo_adi
                """,
                (table_id,),
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
            return jsonify({"tablolar": [{"table_id": r[0], "tablo_adi": r[1], "katman": r[2]} for r in rows]})

        cur.execute(
            """
            SELECT DISTINCT kt.table_id, kt.tablo_adi, kt.katman
            FROM stage.katalog_unit_statement us
            JOIN stage.katalog_statement_alt_sorgu als
                 ON als.statement_id = us.statement_id AND als.ust_alt_sorgu_id IS NULL
            JOIN stage.katalog_statement_kaynak sk ON sk.alt_sorgu_id = als.alt_sorgu_id
            JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
            WHERE us.hedef_table_id = %s
            ORDER BY kt.tablo_adi
            """,
            (table_id,),
        )
        direkt_rows = cur.fetchall()
        direkt_isimler = {r[1] for r in direkt_rows}

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
        "direkt_tablolar": [{"table_id": r[0], "tablo_adi": r[1], "katman": r[2]} for r in direkt_rows],
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
            SELECT DISTINCT kt.table_id, kt.tablo_adi, kt.katman
            FROM stage.katalog_statement_kaynak sk
            JOIN stage.katalog_tablo kt ON kt.table_id = sk.kaynak_table_id
            WHERE sk.alt_sorgu_id = %s
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
        "direkt_tablolar": [{"table_id": r[0], "tablo_adi": r[1], "katman": r[2]} for r in direkt_rows],
        "alt_sorgu_gruplari": alt_sorgu_gruplari,
    })


HTML_SAYFA = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Katalog Lineage Görüntüleyici</title>
<style>
  :root {
    --navy: #1D8A5C; --navy-dark: #0F2A20; --ice: #E3F3EA; --slate: #6B7280;
    --amber: #C99A44; --coral: #C17B89; --teal: #1D8A5C; --lightbg: #F5F6F8; --text: #14171A;
  }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; background: var(--lightbg); margin: 0; padding: 0; color: var(--text); }
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
  .kriter-arama-sarici { position: relative; width: 340px; }
  #kriterInput { width: 100%; padding: 10px 18px; font-size: 14px; border: 1px solid #E4E7EC; border-radius: 999px;
                 background: white; }
  #kriterInput:focus { outline: none; border-color: #B8C4D6; box-shadow: 0 0 0 3px rgba(20,27,71,0.06); }
  .tablo-oner-liste { display: none; position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 50;
                       background: white; border: 1px solid #E4E7EC; border-radius: 14px;
                       box-shadow: 0 10px 28px rgba(15,42,32,0.12); max-height: 320px; overflow-y: auto;
                       padding: 6px 0; }
  .tablo-oner-liste.acik { display: block; }
  .tablo-oner-satir { display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer;
                       font-size: 13px; color: var(--text); }
  .tablo-oner-satir:hover, .tablo-oner-satir.aktif { background: var(--ice); }
  .tablo-oner-ad { font-weight: 700; color: var(--navy-dark); flex: 1; min-width: 0;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tablo-oner-schema { font-size: 11px; color: var(--slate); flex: none; max-width: 110px;
                        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tablo-oner-katman { font-size: 10px; font-weight: 700; color: var(--amber); background: #FBF3E4;
                        border-radius: 999px; padding: 2px 8px; flex: none; }
  .tablo-oner-alt { padding: 8px 14px 6px 14px; font-size: 11.5px; color: var(--slate); font-style: italic;
                     border-top: 1px solid #F0F2F6; margin-top: 2px; }
  .tablo-oner-bos { padding: 12px 14px; font-size: 12.5px; color: var(--slate); font-style: italic; }
  #kriterAraButon { padding: 10px 24px; font-size: 14px; background: var(--navy-dark); color: white; border: none;
                     border-radius: 999px; cursor: pointer; font-weight: 700; }
  #kriterAraButon:hover { background: #081A13; }

  .aciklama { color: var(--slate); font-size: 12.5px; margin-bottom: 14px; }
  .agac-ust-secenekler { display: flex; align-items: center; justify-content: space-between; gap: 10px;
                          margin-bottom: 10px; }
  .basit-secenek { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--slate);
                    cursor: pointer; user-select: none; }
  .basit-secenek input { cursor: pointer; }
  .diyagram-btn { font-size: 11.5px; font-weight: 700; color: var(--navy-dark); background: white;
                   border: 1px solid #E4E7EC; border-radius: 999px; padding: 5px 12px; cursor: pointer;
                   white-space: nowrap; }
  .diyagram-btn:hover { background: var(--ice); }

  .diyagram-modal-arkaplan { display: none; position: fixed; inset: 0; background: rgba(10,20,16,0.55);
                              z-index: 1000; align-items: center; justify-content: center; }
  .diyagram-modal-arkaplan.acik { display: flex; }
  .diyagram-modal-kutu { background: white; border-radius: 18px; width: 92vw; height: 88vh;
                          display: flex; flex-direction: column; overflow: hidden;
                          box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
  .diyagram-modal-baslik { display: flex; align-items: center; justify-content: space-between;
                            padding: 14px 20px; border-bottom: 1px solid #ECEFF4; }
  .diyagram-modal-baslik span { font-size: 15px; font-weight: 700; color: var(--navy-dark); }
  .diyagram-filtre-satiri { display: flex; align-items: center; gap: 14px; padding: 10px 20px;
                             border-bottom: 1px solid #ECEFF4; background: var(--lightbg); flex-wrap: wrap; }
  .diyagram-filtre-baslik { font-size: 12px; font-weight: 700; color: var(--slate); }
  .diyagram-filtre-secenek { display: flex; align-items: center; gap: 5px; font-size: 12.5px;
                              font-weight: 600; color: var(--text); cursor: pointer; user-select: none; }
  .diyagram-filtre-secenek input { cursor: pointer; }
  .diyagram-filtre-ozet { margin-left: auto; font-size: 11.5px; color: var(--slate); font-style: italic; }
  .diyagram-filtre-ayrac { width: 1px; height: 16px; background: #D8DCE6; }
  #diyagramSwimlaneSecenek { font-weight: 700; color: var(--navy-dark); }
  .diyagram-modal-araclar { display: flex; gap: 8px; }
  .diyagram-arac-btn { font-size: 12px; font-weight: 600; color: var(--navy-dark); background: var(--lightbg);
                        border: 1px solid #E4E7EC; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
  .diyagram-arac-btn:hover { background: var(--ice); }
  .diyagram-arac-btn.diyagram-kapat { background: white; }
  .diyagram-modal-govde { flex: 1; overflow: auto; background: repeating-linear-gradient(0deg, #FAFBFD, #FAFBFD 24px, #F3F5F9 24px, #F3F5F9 25px),
                                                     repeating-linear-gradient(90deg, transparent, transparent 24px, #F3F5F9 24px, #F3F5F9 25px);
                           padding: 30px; }
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
  .diyagram-dugum-secili-cerceve { stroke: #14171A !important; stroke-width: 2.6 !important; }
  .diyagram-uyari { background: #FBEAEE; color: #A24D5E; border: 1px solid #E9BFC8; border-radius: 10px;
                     padding: 10px 14px; font-size: 12.5px; margin-bottom: 14px; }

  .genel-bilgi-seridi { display: block; background: white; border-radius: 18px; padding: 12px 18px; margin-bottom: 16px;
                         box-shadow: 0 4px 20px rgba(15,42,32,0.08); border-left: 4px solid var(--amber); }
  .gbs-baslik { font-size: 15px; font-weight: 700; color: var(--navy-dark); margin-bottom: 6px; }
  .gbs-satirlar { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12.5px; color: var(--slate); }
  .gbs-satirlar b { color: var(--text); }
  .gbs-bos { font-size: 13px; color: var(--slate); font-style: italic; }
  .gbs-sql-onizleme { font-family: 'Consolas', monospace; font-size: 11px; color: var(--slate);
                       margin-top: 6px; background: var(--lightbg); padding: 6px 10px; border-radius: 8px; }

  .ana-alan { display: flex; gap: 20px; align-items: flex-start; }
  .agac-panel { flex: none; width: 560px; }
  .detay-panel-sarici { flex: 1; min-width: 0; }

  .agac-kutu { background: white; border-radius: 18px; padding: 14px 10px 18px 10px; box-shadow: 0 4px 20px rgba(15,42,32,0.08);
               min-height: 400px; max-height: calc(100vh - 160px); overflow: auto; position: sticky; top: 20px; }
  #agacAlani { min-height: 60px; }
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

  .altsorgu-satir { background: #FBF3E4; border: 1px dashed #E8C87A; }
  .altsorgu-satir .toggle-ikon { color: var(--amber); }
  .altsorgu-etiket { font-size: 12.5px; font-weight: 700; color: #8A5D00; padding: 3px 10px; border-radius: 4px; }
  .altsorgu-tip { font-size: 10px; color: var(--slate); font-style: italic; }

  .tablo-adi { font-size: 13.5px; font-weight: 600; color: var(--navy-dark); padding: 3px 8px; border-radius: 4px; border: 1px solid transparent; cursor: pointer; }
  .tablo-adi:hover { background: var(--ice); }
  .tablo-adi-secili { background: var(--amber) !important; color: white !important; }
  .kok .tablo-adi { font-size: 16px; background: var(--navy-dark); color: white; padding: 7px 16px; border-radius: 999px; }
  .dongu .tablo-adi { color: var(--coral); background: #FBEAE6; border-color: #F0C4B8; cursor: default; }
  .dongu .tablo-adi:hover { background: #FBEAE6; }
  .yaprak .tablo-adi { border: 1px solid #E4E7F0; background: var(--lightbg); }

  /* KOLON modu agac dugumleri */
  .kok-kolon-etiket { font-size: 16px; font-weight: 700; background: var(--amber); color: white;
                       padding: 7px 16px; border-radius: 999px; }
  /* RAPOR modu agac kokü */
  .kok-rapor-etiket { font-size: 16px; font-weight: 700; background: var(--coral); color: white;
                       padding: 7px 16px; border-radius: 999px; }
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
                 padding: 0; box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
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
  .inspector-sql-secici { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px;
                           border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; overflow: hidden; }
  .inspector-sql-secenek { padding: 6px 10px; font-size: 11.5px; cursor: pointer; color: #D8DEEF; }
  .inspector-sql-secenek:hover { background: rgba(255,255,255,0.06); }
  .inspector-sql-secenek.aktif { background: var(--amber); color: white; font-weight: 700; }
  .inspector-sql-alan { border-top: 1px solid rgba(255,255,255,0.12); padding-top: 10px; }
  .inspector-rol-yazan { font-size: 9px; font-weight: 700; color: #2C8C6E; background: rgba(44,140,110,0.15);
                          border-radius: 999px; padding: 2px 8px; margin-right: 2px; }
  .inspector-rol-kullanilan { font-size: 9px; font-weight: 700; color: var(--amber); background: rgba(201,154,68,0.15);
                               border-radius: 999px; padding: 2px 8px; margin-right: 2px; }

  .inspector-gorunum-secici { display: flex; gap: 6px; margin: 10px 0 8px 0; }
  .inspector-gorunum-btn { padding: 5px 12px; font-size: 11px; color: var(--slate); cursor: pointer;
                            border-radius: 14px; background: rgba(255,255,255,0.06); }
  .inspector-gorunum-btn:hover { background: rgba(255,255,255,0.12); color: #E8ECFB; }
  .inspector-gorunum-btn.aktif { background: var(--amber); color: white; font-weight: 700; }

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
  .soykutuk-kutusu { border: 1px solid rgba(201,154,68,0.35); border-radius: 12px; padding: 10px 12px;
                      margin-bottom: 14px; background: rgba(201,154,68,0.05); }
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
    <div class="kriter-arama-sarici">
      <input type="text" id="kriterInput" placeholder="Örn: ORDER_PAYMENTS (yazınca öneri gelir)" autofocus autocomplete="off">
      <div id="tabloOnerListe" class="tablo-oner-liste" role="listbox" aria-label="Tablo önerileri"></div>
    </div>
    <button id="kriterAraButon">Ara</button>
  </div>

  <div class="aciklama" id="aciklamaMetni">Bir tablo adı girin, sonra düğümlere tıklayarak kaynaklarını istediğiniz derinliğe kadar açın (▶). Bir tablonun adına tıklayarak sağdaki panelde detaylarını inceleyin. Bir tabloyu ayrı pencerede kendi kökü olarak incelemek için üzerine gelip ↗ ikonuna tıklayın.</div>

  <div id="genelBilgiSeridi" class="genel-bilgi-seridi"><div class="gbs-bos">Bir arama yapın -- sonuç özeti burada görünecek.</div></div>

  <div class="ana-alan">
    <div class="agac-panel">
      <div class="agac-kutu">
        <div class="agac-ust-secenekler">
          <label class="basit-secenek">
            <input type="checkbox" id="basitCheckbox">
            Basit görünüm (alt sorgu ayrımı olmadan, düz liste)
          </label>
          <button id="diyagramBtn" class="diyagram-btn" title="Bu ağacı görsel bir diyagram olarak göster">
            🌳 Diyagram Görünümü
          </button>
        </div>
        <div id="agacAlani"></div>
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
        <span class="diyagram-filtre-baslik">Katman:</span>
        <label class="diyagram-filtre-secenek" data-katman="EX"><input type="checkbox" checked> 📥 EX</label>
        <label class="diyagram-filtre-secenek" data-katman="TR"><input type="checkbox" checked> 🔄 TR</label>
        <label class="diyagram-filtre-secenek" data-katman="KAYNAK"><input type="checkbox" checked> 🌐 KAYNAK</label>
        <label class="diyagram-filtre-secenek" data-katman="LD"><input type="checkbox" checked> 🗄 LD</label>
        <label class="diyagram-filtre-secenek" data-katman="DIGER"><input type="checkbox" checked> ❔ Diğer</label>
        <span class="diyagram-filtre-ayrac"></span>
        <label class="diyagram-filtre-secenek" id="diyagramSwimlaneSecenek">
          <input type="checkbox" id="diyagramSwimlaneCheckbox"> 🔀 Gruplanmış gösterim (katman bazlı)
        </label>
        <span id="diyagramFiltreOzet" class="diyagram-filtre-ozet"></span>
      </div>
      <div id="diyagramGovde" class="diyagram-modal-govde"></div>
    </div>
  </div>
</div>

<script>
  const kriterInput = document.getElementById("kriterInput");
  const kriterAraButon = document.getElementById("kriterAraButon");
  const agacAlani = document.getElementById('agacAlani');
  const basitCheckbox = document.getElementById('basitCheckbox');

  // --- Inspector Panel: artik SAYFANIN NORMAL BIR PARCASI (yuzen degil),
  // her zaman gorunur. Bir tablonun ADINA tiklaninca icerigi guncellenir.
  const detayPanelSarici = document.querySelector('.detay-panel-sarici');
  const inspector = document.createElement('div');
  inspector.className = 'inspector-panel';
  inspector.innerHTML = '<div class="inspector-bos-durum">← Soldaki ağaçtan bir tablo adına tıklayın</div>';
  detayPanelSarici.appendChild(inspector);
  const genelBilgiSeridi = document.getElementById('genelBilgiSeridi');
  setTimeout(panelYuksekliginiAyarla, 0);  // fonksiyon asagida tanimli, hoisting sayesinde guvenli

  const inspectorOnbellek = {};       // table_id -> /api/tablo_detay sonucu
  const inspectorKolonOnbellek = {};  // table_id -> /api/kolonlar sonucu
  const inspectorLineageOnbellek = {};// table_id -> /api/kolon_lineage sonucu
  const inspectorEtkiOnbellek = {};   // table_id -> /api/etki sonucu
  const inspectorSoykutukOnbellek = {};  // "table_id::kolon_adi" -> /api/kolon_soykutugu sonucu
  let inspectorTableId = null;
  let inspectorTabloAdi = null;
  let inspectorAktifSekme = 'sql';
  let inspectorSeciliStatementId = null;
  let inspectorSqlGorunumModu = 'sade';   // 'sade' | 'tam'
  let inspectorAktifSpan = null;
  let inspectorLineageFiltre = '';
  let inspectorVurgulananKolon = null;   // Kolon modundan gelindiyse: SQL'de ve Kolonlar listesinde sari vurgulanacak alan

  async function inspectorAc(tableId, tabloAdi, span, vurgulananKolon) {
    if (inspectorAktifSpan) inspectorAktifSpan.classList.remove('tablo-adi-secili');
    inspectorTableId = tableId;
    inspectorTabloAdi = tabloAdi;
    inspectorAktifSekme = 'sql';
    inspectorSeciliStatementId = null;
    inspectorSqlGorunumModu = 'sade';
    inspectorLineageFiltre = '';
    inspectorVurgulananKolon = vurgulananKolon || null;
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
        '<span><b>' + yazanlar.length + '</b> dolduran statement</span>' +
        '<span><b>' + kullanilanlar.length + '</b> kaynak olarak kullanıldığı statement</span>' +
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
    if (sekme === 'lineage' && inspectorVurgulananKolon) {
      await inspectorSoykutukGetir();
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

  function sekmeButonu(anahtar, etiket, devreDisi) {
    const aktifMi = inspectorAktifSekme === anahtar;
    const sinif = 'inspector-sekme' + (aktifMi ? ' aktif' : '') + (devreDisi ? ' devre-disi' : '');
    return '<span class="' + sinif + '" data-sekme="' + anahtar + '">' + etiket + '</span>';
  }

  function inspectorSqlHtml(veri) {
    const entries = veri.entries || [];
    if (entries.length === 0) {
      return '<div class="inspector-bos">Bu tablo için kayıtlı bir SQL bulunamadı.</div>';
    }
    if (inspectorSeciliStatementId === null) inspectorSeciliStatementId = entries[0].statement_id;
    const secili = entries.find(e => e.statement_id === inspectorSeciliStatementId) || entries[0];

    let html = '';
    if (entries.length > 1) {
      html += '<div class="inspector-sql-secici">';
      entries.forEach(function (e) {
        const aktifMi = e.statement_id === secili.statement_id;
        const rolEtiket = e.rol === 'yazan'
          ? '<span class="inspector-rol-yazan">DOLDURAN</span>'
          : '<span class="inspector-rol-kullanilan">KAYNAK</span>';
        const baglam = e.rol === 'yazan'
          ? kacisliMetin(e.paket_adi) + '.' + kacisliMetin(e.procedure_adi)
          : kacisliMetin(e.paket_adi) + '.' + kacisliMetin(e.procedure_adi) + ' → ' + kacisliMetin(e.iliskili_tam_ad);
        html += '<div class="inspector-sql-secenek' + (aktifMi ? ' aktif' : '') + '" data-statement-id="' + e.statement_id + '">' +
                  rolEtiket + ' ' + baglam +
                  ' <span class="inspector-genel-dml">(' + e.dml_tipi + ')</span>' +
                '</div>';
      });
      html += '</div>';
    }

    html += '<div class="inspector-sql-alan">';
    if (secili.rol === 'kullanilan') {
      html += '<div class="inspector-genel-satir"><b>Hedef:</b> ' + kacisliMetin(secili.iliskili_tam_ad) + '</div>';
    }
    html += '<div class="inspector-genel-satir"><b>Procedure:</b> ' + kacisliMetin(secili.procedure_adi) +
              ' &nbsp; <b>Statement:</b> ' + kacisliMetin(secili.dml_tipi) + '</div>';
    if ((secili.kaynaklar || []).length > 0) {
      html += '<div class="inspector-genel-alt-baslik">Kaynaklar:</div>';
      secili.kaynaklar.forEach(function (k) {
        html += '<div class="inspector-genel-liste-satir">• ' + kacisliMetin(k) + '</div>';
      });
    }

    const sadeVarMi = !!secili.sql_sade;
    if (sadeVarMi) {
      html += '<div class="inspector-gorunum-secici">' +
                '<span class="inspector-gorunum-btn' + (inspectorSqlGorunumModu === 'sade' ? ' aktif' : '') + '" data-gorunum="sade">Sade Görünüm</span>' +
                '<span class="inspector-gorunum-btn' + (inspectorSqlGorunumModu === 'tam' ? ' aktif' : '') + '" data-gorunum="tam">Tam SQL</span>' +
              '</div>';
    }
    const gosterilecekMetin = (sadeVarMi && inspectorSqlGorunumModu === 'sade') ? secili.sql_sade : secili.sql_metni;
    html += '<pre class="sql-tooltip-govde">' + sqlRenkli(gosterilecekMetin, inspectorTabloAdi, inspectorVurgulananKolon) + '</pre></div>';
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
  window.addEventListener('resize', panelYuksekliginiAyarla);

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
    if (inspectorVurgulananKolon) {
      html += inspectorSoykutukHtml();
    }
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

  function inspectorEtkiHtml() {
    const veri = inspectorEtkiOnbellek[inspectorTableId];
    if (!veri) return '<div class="inspector-bos">Yükleniyor...</div>';
    if (veri.hata) return '<div class="inspector-bos">' + kacisliMetin(veri.hata) + '</div>';
    const etkilenenler = veri.etkilenenler || [];
    const etkilenenRaporlar = veri.etkilenen_raporlar || [];

    let html = '';
    if (etkilenenler.length === 0) {
      html += '<div class="inspector-bos">Bu tabloyu kaynak olarak kullanan başka bir tablo bulunamadı.</div>';
    } else {
      html += '<div class="cl-ozet">Bu tabloyu değiştirirseniz, aşağıdaki ' + etkilenenler.length +
                 ' tablo (dolaylı olarak) etkilenebilir:</div>';
      let sonSeviye = null;
      etkilenenler.forEach(function (e) {
        if (e.seviye !== sonSeviye) {
          html += '<div class="etki-seviye-baslik">Seviye ' + e.seviye + '</div>';
          sonSeviye = e.seviye;
        }
        const tamAd = (e.schema_adi ? e.schema_adi + '.' : '') + e.tablo_adi;
        html += '<div class="etki-satir">• ' + kacisliMetin(tamAd) + '</div>';
      });
    }

    html += '<div class="etki-seviye-baslik">📄 Etkilenen Raporlar</div>';
    if (etkilenenRaporlar.length === 0) {
      html += '<div class="inspector-bos">Bu tabloyu (veya yukarıdaki etkilenen tabloları) kaynak olarak kullanan kayıtlı bir rapor bulunamadı.</div>';
    } else {
      html += '<div class="cl-ozet">Bu tabloyu değiştirirseniz, ' + etkilenenRaporlar.length + ' rapor etkilenebilir:</div>';
      etkilenenRaporlar.forEach(function (r) {
        html += '<div class="etki-satir">📄 ' + kacisliMetin(r.rapor_adi) +
                  ' <span class="inspector-genel-dml">(' + kacisliMetin(r.tablo_adi) + ' üzerinden)</span></div>';
      });
    }
    return html;
  }

  // olay delegasyonu -- innerHTML her cizimde silindigi icin tek seferlik,
  // panelin KENDISINE baglanan kalici dinleyiciler kullanilir
  inspector.addEventListener('click', function (e) {
    if (e.target.classList.contains('inspector-sekme') && !e.target.classList.contains('devre-disi')) {
      inspectorSekmeSec(e.target.dataset.sekme);
    } else if (e.target.classList.contains('inspector-sql-secenek')) {
      inspectorSeciliStatementId = parseInt(e.target.dataset.statementId, 10);
      inspectorCiz();
    } else if (e.target.classList.contains('inspector-gorunum-btn')) {
      inspectorSqlGorunumModu = e.target.dataset.gorunum;
      inspectorCiz();
    }
  });

  inspector.addEventListener('input', function (e) {
    if (e.target.classList.contains('inspector-filtre')) {
      inspectorLineageFiltre = e.target.value;
      inspectorCiz();
    }
  });

  function kacisliMetin(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
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
    modTabloBtn.classList.toggle('aktif', yeniMod === 'tablo');
    modKolonBtn.classList.toggle('aktif', yeniMod === 'kolon');
    modRaporBtn.classList.toggle('aktif', yeniMod === 'rapor');
    if (yeniMod === 'tablo') {
      kriterEtiket.textContent = 'TABLO ADI';
      kriterInput.placeholder = 'Örn: ORDER_PAYMENTS (yazınca öneri gelir)';
      aciklamaMetni.textContent = 'Bir tablo adı girin, sonra düğümlere tıklayarak kaynaklarını istediğiniz derinliğe kadar açın (▶). Bir tablonun adına tıklayarak sağdaki panelde detaylarını inceleyin. Bir tabloyu ayrı pencerede kendi kökü olarak incelemek için üzerine gelip ↗ ikonuna tıklayın.';
    } else if (yeniMod === 'kolon') {
      kriterEtiket.textContent = 'KOLON / ALAN ADI';
      kriterInput.placeholder = 'Örn: AS_OF_DATE (yazınca öneri gelir; virgülle birden fazla)';
      aciklamaMetni.textContent = 'Bir alan/kolon adı girin -- hem DWH tablolarında hem mevcut raporlarda bu alanın olup olmadığını gösterir. Bir tablo eşlemesine tıklayarak sağdaki panelde detaylarını inceleyin, "İncele" ile Tablo moduna geçip o tabloyu tam olarak açın.';
    } else {
      kriterEtiket.textContent = 'RAPOR ADI';
      kriterInput.placeholder = 'Örn: DuzenliOdemeler (yazınca öneri gelir)';
      aciklamaMetni.textContent = 'Bir rapor adı girin -- raporun doğrudan okuduğu tabloları kök altında görürsünüz. Bu tablolara tıklayarak sağdaki panelde detaylarını inceleyin, ok (▶) ile kendi kaynaklarına doğru derinleşin -- rapor bu şekilde ETL zincirinin tamamına bağlanır.';
    }
    kriterOneriKapat();
    // Mod degisince ONCEKI modun kriteri/sonuclari TASINMAZ -- bir moddaki
    // aramayi baska bir modda otomatik tekrar denemek ("...katalogda kayitli
    // degil" gibi) kafa karistirici oluyordu. Her mod gecisinde bombos baslar.
    if (temizle) {
      kriterInput.value = '';
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

  // --- Autocomplete: TABLO / KOLON / RAPOR (sunucu tarafı, LIMIT 15) ---
  const tabloOnerListe = document.getElementById('tabloOnerListe');
  let kriterOneriTimer = null;
  let kriterOneriAbort = null;
  let kriterOneriSonuc = [];
  let kriterOneriIndex = -1;
  let kriterOneriAcik = false;

  const ONERI_API = { tablo: '/api/tablo_oner', kolon: '/api/kolon_oner', rapor: '/api/rapor_oner' };
  const ONERI_BOS = { tablo: 'Eşleşen tablo yok', kolon: 'Eşleşen kolon yok', rapor: 'Eşleşen rapor yok' };

  function kriterOneriKapat() {
    kriterOneriAcik = false;
    kriterOneriIndex = -1;
    kriterOneriSonuc = [];
    tabloOnerListe.classList.remove('acik');
    tabloOnerListe.innerHTML = '';
    if (kriterOneriTimer) { clearTimeout(kriterOneriTimer); kriterOneriTimer = null; }
    if (kriterOneriAbort) { kriterOneriAbort.abort(); kriterOneriAbort = null; }
  }

  // Kolon modunda virgüllü çoklu arama: son terimi öneri için kullan.
  function kriterOneriParcala() {
    const full = kriterInput.value;
    if (mevcutMod === 'kolon') {
      const idx = full.lastIndexOf(',');
      if (idx >= 0) {
        return { onceki: full.slice(0, idx + 1) + ' ', q: full.slice(idx + 1).trim() };
      }
    }
    return { onceki: '', q: full.trim() };
  }

  function kriterOneriAktifGuncelle() {
    const satirlar = tabloOnerListe.querySelectorAll('.tablo-oner-satir');
    satirlar.forEach((el, i) => el.classList.toggle('aktif', i === kriterOneriIndex));
    if (kriterOneriIndex >= 0 && satirlar[kriterOneriIndex]) {
      satirlar[kriterOneriIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function kriterOneriSec(item) {
    if (!item) return;
    const { onceki } = kriterOneriParcala();
    kriterInput.value = onceki + (item.etiket || '');
    kriterOneriKapat();
    ara();
  }

  function kriterOneriCiz(veri) {
    kriterOneriSonuc = veri.oneriler || [];
    kriterOneriIndex = kriterOneriSonuc.length ? 0 : -1;
    if (!kriterOneriSonuc.length) {
      tabloOnerListe.innerHTML = '<div class="tablo-oner-bos">' + (ONERI_BOS[mevcutMod] || 'Sonuç yok') + '</div>';
      tabloOnerListe.classList.add('acik');
      kriterOneriAcik = true;
      return;
    }
    let html = '';
    for (const o of kriterOneriSonuc) {
      const alt = o.alt ? kacisliMetin(o.alt) : '';
      const rozet = o.rozet ? kacisliMetin(o.rozet) : '';
      html += '<div class="tablo-oner-satir" role="option">' +
                '<span class="tablo-oner-ad">' + kacisliMetin(o.etiket || '') + '</span>' +
                (alt ? '<span class="tablo-oner-schema">' + alt + '</span>' : '') +
                (rozet ? '<span class="tablo-oner-katman">' + rozet + '</span>' : '') +
              '</div>';
    }
    const fazla = (veri.toplam || 0) - kriterOneriSonuc.length;
    if (fazla > 0) {
      html += '<div class="tablo-oner-alt">+' + fazla + ' sonuç daha — yazmaya devam edin</div>';
    }
    tabloOnerListe.innerHTML = html;
    tabloOnerListe.querySelectorAll('.tablo-oner-satir').forEach((el, i) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        kriterOneriSec(kriterOneriSonuc[i]);
      });
    });
    tabloOnerListe.classList.add('acik');
    kriterOneriAcik = true;
    kriterOneriAktifGuncelle();
  }

  async function kriterOneriGetir(q) {
    const api = ONERI_API[mevcutMod];
    if (!api || q.length < 2) { kriterOneriKapat(); return; }
    if (kriterOneriAbort) kriterOneriAbort.abort();
    kriterOneriAbort = new AbortController();
    try {
      const yanit = await fetch(api + '?q=' + encodeURIComponent(q), { signal: kriterOneriAbort.signal });
      const veri = await yanit.json();
      if (!yanit.ok) { kriterOneriKapat(); return; }
      if (kriterOneriParcala().q !== q) return;
      kriterOneriCiz(veri);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      kriterOneriKapat();
    }
  }

  function kriterOneriPlanla() {
    const { q } = kriterOneriParcala();
    if (kriterOneriTimer) clearTimeout(kriterOneriTimer);
    if (!ONERI_API[mevcutMod] || q.length < 2) { kriterOneriKapat(); return; }
    kriterOneriTimer = setTimeout(() => kriterOneriGetir(q), 250);
  }

  async function ara() {
    kriterOneriKapat();
    if (mevcutMod === 'tablo') await tabloAra();
    else if (mevcutMod === 'kolon') await kolonAra();
    else await raporAra();
  }

  kriterAraButon.addEventListener('click', ara);
  kriterInput.addEventListener('input', kriterOneriPlanla);
  kriterInput.addEventListener('keydown', (e) => {
    if (kriterOneriAcik) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!kriterOneriSonuc.length) return;
        kriterOneriIndex = (kriterOneriIndex + 1) % kriterOneriSonuc.length;
        kriterOneriAktifGuncelle();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!kriterOneriSonuc.length) return;
        kriterOneriIndex = (kriterOneriIndex - 1 + kriterOneriSonuc.length) % kriterOneriSonuc.length;
        kriterOneriAktifGuncelle();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        kriterOneriKapat();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (kriterOneriIndex >= 0 && kriterOneriSonuc[kriterOneriIndex]) {
          kriterOneriSec(kriterOneriSonuc[kriterOneriIndex]);
        } else {
          ara();
        }
        return;
      }
    }
    if (e.key === 'Enter') ara();
  });
  document.addEventListener('mousedown', (e) => {
    if (!kriterOneriAcik) return;
    if (e.target.closest('.kriter-arama-sarici')) return;
    kriterOneriKapat();
  });
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

  async function tabloAra(kolonFiltre) {
    const ad = kriterInput.value.trim();
    if (!ad) return;
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
    const kokLi = dugumOlustur(veri.table_id, veri.tablo_adi, [veri.table_id], true);
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
    const sqlOnizleme = (detay.sql_metni || '').split('\\n').slice(0, 2).join(' ').slice(0, 140);
    genelBilgiSeridi.innerHTML =
      '<div class="gbs-baslik">📄 ' + kacisliMetin(detay.rapor_adi) + '</div>' +
      '<div class="gbs-satirlar">' +
        '<span><b>' + detay.kaynak_tablolar.length + '</b> doğrudan kaynak tablo</span>' +
        (detay.dosya_adi ? '<span>' + kacisliMetin(detay.dosya_adi) + '</span>' : '') +
      '</div>' +
      (sqlOnizleme ? '<div class="gbs-sql-onizleme">' + kacisliMetin(sqlOnizleme) + (detay.sql_metni.length > 140 ? '…' : '') + '</div>' : '');

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
        cocukUl.appendChild(dugumOlustur(t.table_id, t.tablo_adi, [t.table_id], false, t.katman));
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

  function dugumOlustur(tableId, tabloAdi, atalarYolu, kokMu, katman) {
    const li = document.createElement('li');
    li.dataset.tableId = tableId;

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
      ad.style.borderLeft = '3px solid ' + AGAC_KATMAN_RENKLERI[katman];
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
        const dsatir = document.createElement('div');
        dsatir.className = 'dugum-satir dongu';
        dsatir.innerHTML = '<span class="toggle-bos"></span>' +
                            '<span class="tablo-adi">' + c.tablo_adi + '</span>' +
                            '<span class="dongu-etiket">&nbsp;🔁 döngü — yukarıda zaten var</span>';
        dli.appendChild(dsatir);
        cocukUl.appendChild(dli);
      } else {
        const yeniYol = atalarYolu.concat([c.table_id]);
        cocukUl.appendChild(dugumOlustur(c.table_id, c.tablo_adi, yeniYol, false, c.katman));
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

  // Bir "alt sorgu grubu" düğümü -- gerçek bir tablo değil, bir subquery'yi
  // temsil eder. Tıklanınca /api/alt_sorgu ile İÇİNDEKİ tabloları (ve varsa
  // İÇ İÇE alt sorgu gruplarını) getirir. atalarYolu, üst tablo düğümünden
  // OLDUĞU GİBİ devralınır -- bir subquery grubu kendi başına "atası" sayılmaz,
  // sadece içindeki tabloların döngü kontrolü için taşıyıcıdır.
  function altSorguDugumuOlustur(altSorguId, alias, tip, atalarYolu) {
    const li = document.createElement('li');

    const satir = document.createElement('div');
    satir.className = 'dugum-satir altsorgu-satir';

    const toggle = document.createElement('span');
    toggle.className = 'toggle-ikon';
    toggle.textContent = '▶';
    satir.appendChild(toggle);

    const etiket = document.createElement('span');
    etiket.className = 'altsorgu-etiket';
    etiket.textContent = '📦 ' + (ALTSORGU_ETIKET[tip] || 'alt sorgu') + (alias ? ' (' + alias + ')' : '');
    satir.appendChild(etiket);

    li.appendChild(satir);

    let acildiMi = false;
    let cocukUl = null;

    satir.addEventListener('click', tikla);

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
        bos.textContent = 'bu alt sorguda tablo bulunamadı';
        cocukUl.appendChild(bos);
      } else {
        veri.alt_sorgu_gruplari.forEach(function (a) {
          cocukUl.appendChild(altSorguDugumuOlustur(a.alt_sorgu_id, a.alias, a.tip, atalarYolu));
        });
        renderTabloListesi(cocukUl, veri.direkt_tablolar, atalarYolu);
      }

      li.appendChild(cocukUl);
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

  // ETL katmanina gore vurgu rengi -- 'tablo' dugumlerinde sol kenarda ince
  // bir serit, 'katman_grubu'/swimlane basliklarinda ise kutunun kendi rengi
  // olarak kullanilir. LD (butun tablolar arasinda en kalabalik/en az
  // "ilginc" katman -- her seye uyan varsayilan) kasitli olarak notr/soluk
  // birakildi, digerleri (EX/TR/KAYNAK -- ozellikle dis sisteme isaret eden
  // KAYNAK) daha belirgin. HEM agac-tarzi diyagramda HEM swimlane
  // gorunumunde AYNI palet kullanilir -- tutarlilik icin modul seviyesinde.
  const KATMAN_RENKLERI = { LD: '#ADB5C4', TR: '#5B7FD9', EX: '#2C8C6E', KAYNAK: '#8B5FBF' };
  const KATMAN_ACIK_ZEMIN = { LD: '#F2F3F6', TR: '#EAEEFB', EX: '#E5F3EE', KAYNAK: '#F1EBF8' };

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
    return { etiket, tip, cocuklar };
  }

  // Her dugume (x, y, yukseklik) atar -- x = seviye (derinlik) * sutun
  // araligi, y = DFS sirasiyla biriken "yaprak sayaci" * satir araligi.
  // Bir dugumun dusey merkezi, cocuklarinin dusey merkezlerinin ortalamasidir
  // (klasik agac-cizim algoritmasi) -- boylece baglantilar duzgun gorunur.
  function diyagramYerlesimiHesapla(node, derinlik, yaprakSayaci) {
    node.x = derinlik * (DIY_KUTU_GENISLIK + DIY_SUTUN_ARALIK);
    if (node.cocuklar.length === 0 || node.tip === 'dongu') {
      node.y = yaprakSayaci.deger * (DIY_KUTU_YUKSEKLIK + DIY_SATIR_ARALIK);
      yaprakSayaci.deger += 1;
    } else {
      node.cocuklar.forEach(function (c) { diyagramYerlesimiHesapla(c, derinlik + 1, yaprakSayaci); });
      const ilk = node.cocuklar[0].y, son = node.cocuklar[node.cocuklar.length - 1].y;
      node.y = (ilk + son) / 2;
    }
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

    let maxX = 0, maxY = 0;
    const dugumler = [];
    const kenarlar = [];
    (function topla(node) {
      maxX = Math.max(maxX, node.x + DIY_KUTU_GENISLIK);
      maxY = Math.max(maxY, node.y + DIY_KUTU_YUKSEKLIK);
      node._diyId = 'd' + dugumler.length;
      dugumler.push(node);
      node.cocuklar.forEach(function (c) {
        kenarlar.push([node, c]);
        topla(c);
      });
    })(kok);

    const genislik = maxX + 40;
    const yukseklik = maxY + 40;
    const renkler = {
      kok: { dolgu: '#0F2A20', metin: 'white', kenar: '#0F2A20' },
      tablo: { dolgu: 'white', metin: '#14171A', kenar: '#C9A961' },
      altsorgu: { dolgu: '#FBF3E1', metin: '#8A6A1F', kenar: '#E4C878' },
      dongu: { dolgu: '#FBEAEE', metin: '#A24D5E', kenar: '#C17B89' },
      referans: { dolgu: '#F0F3FA', metin: '#5B6B8C', kenar: '#C7CEDB' },
    };

    let svg = `<svg width="${genislik}" height="${yukseklik}" viewBox="0 0 ${genislik} ${yukseklik}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Segoe UI',sans-serif;">`;

    // ONCE kenarlar (kutularin ALTINDA kalsin diye once cizilir) -- her
    // biri dik-acili (elbow) bir bağlantı çizgisi, org-chart gorunumu icin.
    // data-ust/data-alt: bir dugume tiklayinca giren/cikan oklari bulmak icin.
    kenarlar.forEach(function ([ust, alt]) {
      const x1 = ust.x + DIY_KUTU_GENISLIK, y1 = ust.y + DIY_KUTU_YUKSEKLIK / 2;
      const x2 = alt.x, y2 = alt.y + DIY_KUTU_YUKSEKLIK / 2;
      const ortaX = (x1 + x2) / 2;
      svg += `<path class="diyagram-kenar" data-ust="${ust._diyId}" data-alt="${alt._diyId}" ` +
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
      svg += `<g class="diyagram-dugum-grup" data-dugum="${node._diyId}" style="cursor:pointer;">` +
             `<rect class="diyagram-dugum-kutu" x="${node.x}" y="${node.y}" width="${DIY_KUTU_GENISLIK}" height="${DIY_KUTU_YUKSEKLIK}" rx="${rx}" ` +
             `fill="${r.dolgu}" stroke="${r.kenar}" stroke-width="1.4"${kesikCizgi}/>`;
      // 'tablo' dugumlerinde -- kutunun kendi rengini degistirmeden -- sol
      // kenarda ince bir katman-rengi seridi (KOK ve gruplar haric).
      if (node.tip === 'tablo' && node.katman && KATMAN_RENKLERI[node.katman]) {
        svg += `<rect x="${node.x}" y="${node.y + 4}" width="4" height="${DIY_KUTU_YUKSEKLIK - 8}" rx="2" ` +
               `fill="${KATMAN_RENKLERI[node.katman]}"/>`;
      }
      const etiketKisa = etiketiKisalt(node.etiket, 34);
      const fontAgirlik = node.tip === 'kok' ? '700' : '600';
      const fontBoyut = (node.tip === 'altsorgu' || node.tip === 'katman_grubu') ? 11 : 12.5;
      svg += `<title>${kacisliMetin(node.etiket)}</title>` +
             `<text x="${node.x + DIY_KUTU_GENISLIK / 2}" y="${node.y + DIY_KUTU_YUKSEKLIK / 2 + 4}" ` +
             `text-anchor="middle" font-size="${fontBoyut}" font-weight="${fontAgirlik}" fill="${r.metin}">` +
             `${kacisliMetin(etiketKisa)}</text>`;
      if (node.tip === 'dongu') {
        svg += `<text x="${node.x + DIY_KUTU_GENISLIK - 8}" y="${node.y + 14}" text-anchor="end" font-size="11">🔁</text>`;
      }
      svg += '</g>';
    });

    svg += '</svg>';
    return svg;
  }

  const diyagramModal = document.getElementById('diyagramModal');
  const diyagramGovde = document.getElementById('diyagramGovde');
  const diyagramBaslikMetin = document.getElementById('diyagramBaslikMetin');
  const DIY_MAKS_DERINLIK = 25;      // guvenlik siniri -- pathological derin zincire karsi
  const DIY_MAKS_TOPLAM_CAGRI = 900; // guvenlik siniri (artik onbellekli oldugu icin -- tekrarlar SAYILMIYOR -- daha yuksek tutulabilir)
  const DIY_FETCH_ZAMAN_ASIMI_MS = 8000; // tek bir istek TAKILIRSA (backend'de sorun varsa) sonsuza kadar beklemeyelim

  // Bir duguma tiklayinca, ona GIREN (kaynaklarindan gelen -- yesil, akan)
  // ve ondan CIKAN (kendisinin besledigi ust tabloya giden -- turuncu, akan)
  // oklari vurgular, alakasiz her seyi soluklastirir. diyagramGovde HER
  // ZAMAN AYNI KONTEYNER (sadece innerHTML degisiyor) -- bu yuzden dinleyici
  // BIR KEZ, event delegation ile baglaniyor; her yeniden cizimde tekrar
  // eklemeye gerek yok.
  diyagramGovde.addEventListener('click', function (e) {
    const svg = diyagramGovde.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('.diyagram-kenar').forEach(function (p) {
      p.classList.remove('diyagram-kenar-gelen', 'diyagram-kenar-giden', 'diyagram-kenar-soluk');
    });
    svg.querySelectorAll('.diyagram-dugum-kutu').forEach(function (r) {
      r.classList.remove('diyagram-dugum-secili-cerceve');
    });
    svg.querySelectorAll('.diyagram-dugum-grup').forEach(function (g) {
      g.classList.remove('diyagram-dugum-soluk');
    });

    const grup = e.target.closest('.diyagram-dugum-grup');
    if (!grup || grup.dataset.secili === '1') {
      if (grup) grup.dataset.secili = '';
      return;   // bos alana ya da ZATEN SECILI duguma tiklandi -- sadece temizle
    }
    svg.querySelectorAll('.diyagram-dugum-grup').forEach(function (g) { g.dataset.secili = ''; });
    grup.dataset.secili = '1';
    grup.querySelector('.diyagram-dugum-kutu').classList.add('diyagram-dugum-secili-cerceve');

    const seciliId = grup.dataset.dugum;
    let ilgiliVarMi = false;
    svg.querySelectorAll('.diyagram-kenar').forEach(function (p) {
      if (p.dataset.ust === seciliId) { p.classList.add('diyagram-kenar-gelen'); ilgiliVarMi = true; }
      else if (p.dataset.alt === seciliId) { p.classList.add('diyagram-kenar-giden'); ilgiliVarMi = true; }
      else { p.classList.add('diyagram-kenar-soluk'); }
    });
    if (ilgiliVarMi) {
      svg.querySelectorAll('.diyagram-dugum-grup').forEach(function (g) {
        if (g !== grup) g.classList.add('diyagram-dugum-soluk');
      });
    }
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
    const etiket = '📦 ' + (ALTSORGU_ETIKET[tip] || 'alt sorgu') + (alias ? ' (' + alias + ')' : '');
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
      svg += `<path class="diyagram-kenar" data-ust="${ust._diyId}" data-alt="${alt._diyId}" ` +
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
      svg += `<g class="diyagram-dugum-grup" data-dugum="${node._diyId}" style="cursor:pointer;">` +
             `<rect class="diyagram-dugum-kutu" x="${node.x}" y="${node.y}" width="${SUTUN_GENISLIK}" height="${DIY_KUTU_YUKSEKLIK}" rx="${rx}" ` +
             `fill="${r.dolgu}" stroke="${r.kenar}" stroke-width="1.4"/>`;
      if (node.tip === 'tablo' && node.katman && KATMAN_RENKLERI[node.katman]) {
        svg += `<rect x="${node.x}" y="${node.y + 4}" width="4" height="${DIY_KUTU_YUKSEKLIK - 8}" rx="2" fill="${KATMAN_RENKLERI[node.katman]}"/>`;
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

  function diyagramFiltreliCiz() {
    if (!diyagramSonModel) return;
    const gizliKatmanlar = new Set();
    document.querySelectorAll('.diyagram-filtre-secenek[data-katman]').forEach(function (lbl) {
      if (!lbl.querySelector('input').checked) gizliKatmanlar.add(lbl.dataset.katman);
    });
    const filtrelenmisModel = modelKatmanFiltrele(diyagramSonModel, gizliKatmanlar, true);
    const ozet = document.getElementById('diyagramFiltreOzet');
    ozet.textContent = gizliKatmanlar.size > 0 ? '(' + Array.from(gizliKatmanlar).join(', ') + ' gizlendi)' : '';

    const swimlaneMi = document.getElementById('diyagramSwimlaneCheckbox').checked;
    const cizim = swimlaneMi ? diyagramSwimlaneCiz(filtrelenmisModel) : diyagramSvgCiz(filtrelenmisModel);
    diyagramGovde.innerHTML = diyagramSonUyari + cizim;
  }

  document.querySelectorAll('.diyagram-filtre-secenek input').forEach(function (cb) {
    cb.addEventListener('change', diyagramFiltreliCiz);
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
    diyagramModal.classList.remove('acik');
  });
  diyagramModal.addEventListener('click', function (e) {
    if (e.target === diyagramModal) diyagramModal.classList.remove('acik');
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