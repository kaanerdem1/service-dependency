"""
katalog_parser.py
------------------
3 PL/SQL dosyasını (ld_order_payments_olax.txt, E_ORDER_PAYMENTS_OLAX.txt,
t_order_payments_olax.txt) okur, ayrıştırır ve sonucu PostgreSQL'deki
stage şemasındaki KATALOG_* tablolarına yazar.

Okuma: dosyadan (aynı klasördeki .txt dosyaları)
Yazma: PostgreSQL, stage şeması (psycopg2 ile)
"""

import re
import sqlglot
import psycopg2
from sqlglot import exp
from sqlglot.optimizer.scope import build_scope, ScopeType

DIALECT = "oracle"   # dosyalar Oracle PL/SQL -- sqlglot'a bunu söylüyoruz

TIP_ETIKETLERI = {
    ScopeType.ROOT: "ANA_SORGU",
    ScopeType.DERIVED_TABLE: "FROM_ALT_SORGU",
    ScopeType.SUBQUERY: "WHERE_ALT_SORGU",
    ScopeType.CTE: "CTE",
    ScopeType.UNION: "UNION_DALI",
    ScopeType.UDTF: "TABLO_FONKSIYONU",
}
DML_KEYWORDS = ("INSERT", "UPDATE", "MERGE", "DELETE")
DML_START_RE = re.compile(r"\b(INSERT|UPDATE|MERGE|DELETE)\b", re.IGNORECASE)
EXEC_IMMEDIATE_RE = re.compile(r"EXECUTE\s+IMMEDIATE\s+'truncate\s+table\s+([\w.]+)'", re.IGNORECASE)
HEADER_RE = re.compile(r"CREATE\s+OR\s+REPLACE\s+PROCEDURE\s+(?:(\w+)\.)?(\w+)\s*\(", re.IGNORECASE)
# PAKET (PACKAGE BODY) basligi -- HEADER_RE'nin YAKALAMADIGI bir durum. Bir
# PL/SQL dosyasi tek bir PROCEDURE degil de bir PACKAGE BODY ise (ornegin
# "CREATE OR REPLACE PACKAGE BODY SEMA.PAKET_ADI IS ..."), sema PAKET
# basligindan gelir -- ayri bir desenle yakalanmasi gerekir.
PACKAGE_HEADER_RE = re.compile(r"CREATE\s+OR\s+REPLACE\s+PACKAGE\s+BODY\s+(?:(\w+)\.)?(\w+)", re.IGNORECASE)
PROC_IN_PACKAGE_RE = re.compile(
    r"""(?:PROCEDURE|FUNCTION)\s+(\w+)
        \s*(?:/\*.*?\*/\s*)*
        (?:\([^)]*\))?
        \s*(?:/\*.*?\*/\s*)*
        (?:RETURN\s+[\w.%]+)?
        \s*(?:/\*.*?\*/\s*)*
        (?:IS|AS)\b""",
    re.IGNORECASE | re.VERBOSE | re.DOTALL,
)


# ====================================================================
# 1) OKUMA -- değişmedi, hâlâ dosyadan
# ====================================================================

def read_from_file(path: str) -> str:
    """Dosyayı okur -- Windows'ta farkli araclardan (SQL Developer, Notepad,
    Excel'den kopyala-yapistir vb.) export edilen .txt dosyalari SIK SIK
    UTF-8 DEGIL, UTF-16 ya da Windows-1254 (Turkce) kodlamasinda olabiliyor.
    Sirayla dener, ilk basarili olani kullanir -- boylece TEK bir dosyanin
    kodlamasi farkli diye butun batch calismasi CRASH OLMASIN."""
    denenecek_kodlamalar = ["utf-8", "utf-8-sig", "utf-16", "cp1254", "latin-1"]
    son_hata = None
    for kodlama in denenecek_kodlamalar:
        try:
            with open(path, "r", encoding=kodlama) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError) as e:
            son_hata = e
            continue
    # hicbiri calismadi -- son care: hatali baytlari yoksayarak oku (en azindan
    # islemeye devam edebilelim, veri kaybi riskini loglayalim)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        print(f"    (!) UYARI: {path} hicbir bilinen kodlamayla (utf-8/utf-16/cp1254/latin-1) "
              f"tam okunamadi, hatali karakterler '?' ile degistirildi (son hata: {son_hata})")
        return f.read()


# ====================================================================
# 2) BÖLME -- değişmedi
# ====================================================================

def extract_unit(plsql_text: str) -> dict:
    m = HEADER_RE.search(plsql_text)
    if m:
        owner, proc_name = m.group(1), m.group(2)
        return {"owner": owner, "paket_adi": proc_name, "procedure_adi": proc_name}
    # Duz bir PROCEDURE basligi yoksa -- belki de bu bir PACKAGE BODY
    # dosyasidir (ornegin split_package_body ile ISLENMEMIS, TUM dosya tek
    # bir unit olarak gecirilmis). Sema, PAKET basligindan gelir.
    m2 = PACKAGE_HEADER_RE.search(plsql_text)
    if m2:
        owner, paket_adi = m2.group(1), m2.group(2)
        return {"owner": owner, "paket_adi": paket_adi, "procedure_adi": paket_adi}
    raise ValueError("PROCEDURE/PACKAGE BODY başlığı bulunamadı")


def split_package_body(plsql_text: str) -> list[dict]:
    matches = list(PROC_IN_PACKAGE_RE.finditer(plsql_text))
    if not matches:
        return []
    parts = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(plsql_text)
        parts.append({"procedure_adi": m.group(1), "govde": plsql_text[start:end]})
    return parts


def split_dml_statements(plsql_text: str) -> list[dict]:
    statements = []
    for m in EXEC_IMMEDIATE_RE.finditer(plsql_text):
        line_no = plsql_text[: m.start()].count("\n") + 1
        raw_name = m.group(1).upper()
        if "." in raw_name:
            hedef_sema, hedef_tablo = raw_name.split(".", 1)
        else:
            hedef_sema, hedef_tablo = None, raw_name
        statements.append({"dml_tipi": "TRUNCATE", "hedef_tablo": hedef_tablo, "hedef_sema": hedef_sema,
                            "sql_metni": m.group(0), "satir_no": line_no})

    buf, start_pos = [], 0
    in_string = in_line_comment = in_block_comment = False
    i = 0
    n = len(plsql_text)
    while i < n:
        ch = plsql_text[i]
        ch2 = plsql_text[i:i + 2]

        if in_line_comment:
            buf.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue
        if in_block_comment:
            buf.append(ch)
            if ch2 == "*/":
                buf.append(plsql_text[i + 1])
                i += 2
                in_block_comment = False
                continue
            i += 1
            continue
        if in_string:
            if ch == "'" and i + 1 < n and plsql_text[i + 1] == "'":
                buf.append(ch); buf.append(plsql_text[i + 1]); i += 2
                continue
            buf.append(ch)
            if ch == "'":
                in_string = False
            i += 1
            continue

        # hiçbir moddayken değiliz -- yeni bir mod başlıyor mu bak
        if ch2 == "--":
            in_line_comment = True
            buf.append(ch); i += 1
            continue
        if ch2 == "/*":
            in_block_comment = True
            buf.append(ch); i += 1
            continue
        if ch == "'":
            in_string = True
            buf.append(ch); i += 1
            continue

        buf.append(ch)
        if ch == ";":
            stmt = "".join(buf).strip().rstrip(";").strip()
            if "EXECUTE IMMEDIATE" not in stmt.upper():
                m = DML_START_RE.search(stmt)
                if m:
                    line_no = plsql_text[:start_pos].count("\n") + 1
                    statements.append({"dml_tipi": m.group(1).upper(), "sql_metni": stmt[m.start():],
                                        "satir_no": line_no})
            buf, start_pos = [], i + 1
        i += 1
    return statements


# ====================================================================
# 3) ANALİZ -- değişmedi
# ====================================================================

def split_table_dblink(full_name: str) -> tuple[str, str | None]:
    if "@" in full_name:
        tbl, link = full_name.split("@", 1)
        return tbl.upper(), link.upper()
    return full_name.upper(), None


def resolve_table(t: exp.Table) -> dict:
    name, dblink = split_table_dblink(t.name)
    return {"schema": t.db.upper() if t.db else None, "tablo": name, "dblink": dblink}


# --- KATMAN (ETL katmanı) tahmini -------------------------------------------
# Öncelik sırası: 1) isim deseni (EX/TR)  2) beyaz listedeki dblink (KAYNAK)
# 3) hiçbiri değilse -- toplu işlem sonunda ayrı bir adımla -- LD (varsayılan/
# yük tabloları; ayrı bir "AMBAR" kategorisi YOK, geriye kalan her şey LD'dir).
#
# EX/TR icin ALT CIZGI SINIRLI eslesme kullanilir (duz "icinde geciyor mu"
# DEGIL) -- ornegin "ATRIUM" gibi bir tablo adinda TAM KELIME OLMAYAN bir
# "TR" gecmesi yanlislikla eslesmesin diye.
_EX_DESENI = re.compile(r"(^|_)EX(_|$)", re.IGNORECASE)
_TR_DESENI = re.compile(r"(^|_)TR(_|$)", re.IGNORECASE)

# Sadece bu 5 dblink -- baska bir dblink (ornegin DR/yedek ortama giden)
# KAYNAK sayilmaz, kasitli olarak beyaz liste (whitelist).
KAYNAK_DBLINK_ADLARI = {"CBRAS_PRODUX", "PRODUX_LINK", "PRODUX", "CN_CBRAS_ON_PRODUX", "PROD"}


def katman_tahmin_et(tablo_adi: str, dblink: str | None = None) -> str | None:
    """Bir tablonun ETL katmanini (EX/TR/KAYNAK) TAHMIN eder -- LD'ye
    HİÇ karar vermez (bu fonksiyon None donerse, cagiran taraf ya daha
    sonra baska bir sinyalle tekrar dener ya da toplu islem sonunda
    finalize_katmanlar() ile LD'ye dusurur)."""
    if _EX_DESENI.search(tablo_adi):
        return "EX"
    if _TR_DESENI.search(tablo_adi):
        return "TR"
    if dblink and dblink.upper() in KAYNAK_DBLINK_ADLARI:
        return "KAYNAK"
    return None


def finalize_katmanlar(cursor) -> int:
    """TÜM dosyalar/prosedürler işlendikten SONRA, EN SONDA bir kez
    çağrılmalıdır (write_unit_to_katalog'un İÇİNDE DEĞİL -- yoksa henüz
    işlenmemiş bir dosyada KAYNAK/EX/TR olarak ortaya çıkacak bir tablo,
    erken kapanıp yanlışlıkla LD'ye düşebilir). EX/TR/KAYNAK hiçbirine
    uymayan (katman IS NULL) tüm tabloları LD yapar -- geriye "AMBAR" ya
    da sınıflandırılmamış bir kategori BIRAKMAZ."""
    cursor.execute("UPDATE stage.katalog_tablo SET katman = 'LD' WHERE katman IS NULL")
    return cursor.rowcount


def bagimsiz_select_koklerini_bul(dugum) -> list:
    """Bir DML ifadesinin (INSERT/UPDATE/DELETE/MERGE) içinde -- SET, WHERE,
    USING gibi FARKLI dallara dağılmış olsalar bile -- birbirine gömülü
    OLMAYAN tüm exp.Select köklerini bulur. UPDATE/DELETE/MERGE'de subquery'ler
    tek bir ana SELECT altında toplanmaz (ör. UPDATE'in hem SET'inde hem
    WHERE'inde bağımsız birer subquery olabilir); build_scope() tek bir kök
    beklediği için önce bu bağımsız kökleri ayrı ayrı bulmak gerekiyor."""
    tum_selectler = list(dugum.find_all(exp.Select))
    id_kumesi = {id(s) for s in tum_selectler}
    kokler = []
    for s in tum_selectler:
        p = s.parent
        gomulu = False
        while p is not None:
            if id(p) in id_kumesi:
                gomulu = True
                break
            p = p.parent
        if not gomulu:
            kokler.append(s)
    return kokler


def alt_sorgu_agacini_cikar(select_kismi, hedef_tablo: str) -> list[dict]:
    """Bir SELECT (veya UNION) gövdesindeki her subquery seviyesini --
    ana sorgu dahil (seviye 0) -- kendine referans veren bir ağaç olarak
    çıkarır. Her düğüm: {gecici_id, ust_gecici_id, seviye, alias, tip,
    tablolar: [{schema, tablo, dblink}]} -- o düğümde DOĞRUDAN (iç
    subquery'lere inmeden) geçen tablolar. hedef_tablo kendisi (ör.
    MERGE'ün hedefi) bu listelerden hariç tutulur."""
    if not hasattr(select_kismi, "selects"):
        return []
    try:
        root_scope = build_scope(select_kismi)
    except Exception:
        return []
    if root_scope is None:
        return []

    def derinlik(scope):
        d, s = 0, scope
        while s.parent is not None:
            d += 1
            s = s.parent
        return d

    scope_to_gecici_id = {id(scope): i for i, scope in enumerate(root_scope.traverse(), start=1)}

    sonuc = []
    for scope in root_scope.traverse():
        gecici_id = scope_to_gecici_id[id(scope)]
        ust_gecici_id = scope_to_gecici_id.get(id(scope.parent)) if scope.parent else None
        alias = None
        if scope.expression.parent is not None and hasattr(scope.expression.parent, "alias"):
            alias = scope.expression.parent.alias or None

        tablolar = []
        for s in scope.sources.values():
            if isinstance(s, exp.Table):
                info = resolve_table(s)
                if info["tablo"] == hedef_tablo:
                    continue
                tablolar.append(info)

        sonuc.append({
            "gecici_id": gecici_id,
            "ust_gecici_id": ust_gecici_id,
            "seviye": derinlik(scope),
            "alias": alias,
            "tip": TIP_ETIKETLERI.get(scope.scope_type, "FROM_ALT_SORGU"),
            "tablolar": tablolar,
        })
    return sonuc


def infer_column_alias(ifade) -> str | None:
    """SELECT listesindeki bir ifadenin sonuç kolon adını çıkarmaya çalışır --
    INSERT'te açık kolon listesi YOKSA kullanılan son çare. Açık alias varsa
    onu ('opp.oid id_number' -> 'id_number'), ifade düz bir kolon referansıysa
    kolonun kendi adını ('i.institution_code' -> 'institution_code') kullanır.
    Alias'sız karmaşık bir ifadeyse (fonksiyon/literal) çözemez, None döner --
    Oracle'da INSERT...SELECT alias'a göre değil POZİSYONA göre eşleşir, bu
    yüzden bu bir tahmin/en-iyi-çaba yöntemidir, kesin garanti değildir."""
    if isinstance(ifade, exp.Alias):
        return ifade.alias
    if isinstance(ifade, exp.Column):
        return ifade.name
    return None


def _subquery_soy(node):
    """'(SELECT ...)' gibi PARANTEZE ALINMIŞ bir ifade, sqlglot'ta doğrudan
    exp.Select/exp.Union DEĞİL, onu saran bir exp.Subquery olarak gelir --
    bu fonksiyon varsa bu sarmalı (art arda birden fazla parantez olsa bile)
    soyup gerçek Select/Union'a iner. Sarmal yoksa node'u olduğu gibi döner."""
    while isinstance(node, exp.Subquery):
        node = node.this
    return node


def _deger_kolonlarini_bul(node) -> list:
    """Bir ifadenin İÇİNDEKİ kolonları toplar -- ama find_all(exp.Column)'un
    aksine, CASE WHEN'in KOŞUL (WHEN ...) tarafına HİÇ İNMEZ, sadece
    THEN/ELSE (gerçek DEĞER) tarafındaki kolonları sayar.

    Örnek: SUM(CASE WHEN A.AS_OF_DATE BETWEEN YILBASI AND PDATE
                     THEN A.FAIZ_DISI_GELIR_KREDI ELSE 0 END)
    Burada A.AS_OF_DATE/YILBASI/PDATE birer FİLTRE (hangi satırın
    dahil edileceğini belirliyor) -- A.FAIZ_DISI_GELIR_KREDI ise
    gerçek KAYNAK. Eskiden find_all(exp.Column) İKİSİNİ DE lineage
    kaynağı sayıyordu -- gerçek bir vakada 'FAIZ_DISI_GELIR_KREDİ, neden
    AS_OF_DATE/PDATE'den geliyor görünüyor' diye fark edildi. Artık
    sadece THEN/ELSE'e iniyoruz."""
    sonuc: list = []
    if isinstance(node, exp.Column):
        sonuc.append(node)
        return sonuc
    if isinstance(node, exp.Case):
        # ONCE sadece THEN/ELSE (deger) tarafina bak -- WHEN kosuluna
        # (if_node.this) hic inmeden.
        deger_kolonlari: list = []
        for if_node in node.args.get("ifs", []) or []:
            deger = if_node.args.get("true")
            if deger is not None:
                deger_kolonlari.extend(_deger_kolonlarini_bul(deger))
        varsayilan = node.args.get("default")
        if varsayilan is not None:
            deger_kolonlari.extend(_deger_kolonlarini_bul(varsayilan))
        if deger_kolonlari:
            return deger_kolonlari
        # GERI DUSUS: THEN/ELSE tarafinda HIC gercek kolon yoksa (hepsi
        # sabit deger, ör. "WHEN A.TIP='RK' THEN '1' ... ELSE '0' END" gibi
        # bir SINIFLANDIRMA/ESLEME durumu) -- o zaman cikti DEGERI zaten
        # SADECE kosuldaki kolonlara bagli, onlari saymamak yanlis olurdu
        # (gercek bir vaka: IS_PUBLIC_PRIVATE, main/sub/detail_establishment_
        # type kolonlarina gore '1'/'0' donduruyor -- bu ucu de gercek kaynak).
        kosul_kolonlari: list = []
        for if_node in node.args.get("ifs", []) or []:
            kosul_kolonlari.extend(_deger_kolonlarini_bul(if_node.this))
        return kosul_kolonlari
    for cocuk in node.args.values():
        if isinstance(cocuk, exp.Expression):
            sonuc.extend(_deger_kolonlarini_bul(cocuk))
        elif isinstance(cocuk, list):
            for alt in cocuk:
                if isinstance(alt, exp.Expression):
                    sonuc.extend(_deger_kolonlarini_bul(alt))
    return sonuc


def analyze_statement(stmt: dict, known_table_columns: dict[str, list[str]] | None = None) -> dict:
    known_table_columns = known_table_columns or {}
    sql_metni = stmt["sql_metni"]

    if stmt["dml_tipi"] == "TRUNCATE":
        stmt["kaynak_tablolar"] = []
        stmt["kolon_lineage"] = []
        stmt["alt_sorgu_agaci"] = []
        return stmt

    try:
        parsed = sqlglot.parse_one(sql_metni, dialect=DIALECT)
    except Exception as e:
        stmt["parse_hatasi"] = str(e)
        stmt["hedef_tablo"] = None
        stmt["kaynak_tablolar"] = []
        stmt["kolon_lineage"] = []
        stmt["alt_sorgu_agaci"] = []
        return stmt

    hedef = None
    if isinstance(parsed, exp.Insert):
        hedef = parsed.this
        if isinstance(hedef, exp.Schema):
            hedef = hedef.this
    elif isinstance(parsed, (exp.Update, exp.Delete, exp.Merge)):
        hedef = parsed.this

    hedef_info = resolve_table(hedef) if isinstance(hedef, exp.Table) else None
    stmt["hedef_tablo"] = hedef_info["tablo"] if hedef_info else stmt.get("hedef_tablo")
    stmt["hedef_sema"] = hedef_info["schema"] if hedef_info else None

    alias_to_table = {}
    kaynaklar = {}
    for t in parsed.find_all(exp.Table):
        info = resolve_table(t)
        alias = t.alias or info["tablo"]
        alias_to_table[alias] = info["tablo"]
        if info["tablo"] == stmt["hedef_tablo"]:
            continue
        kaynaklar[info["tablo"]] = info
    stmt["kaynak_tablolar"] = list(kaynaklar.values())
    tek_kaynak = stmt["kaynak_tablolar"][0]["tablo"] if len(stmt["kaynak_tablolar"]) == 1 else None

    # YENİ: subquery ağacı -- SADECE INSERT/MERGE için kurulur (bunlarda
    # gerçek bir "ana sorgu gövdesi" var, FROM içinde iç içe SELECT'ler o
    # gövdeye bağlı olarak anlamlı bir hiyerarşi oluşturur). UPDATE/DELETE
    # için KURULMAZ. Statement'ın TEK, doğal kökü (INSERT için .expression,
    # MERGE için USING) kullanılır -- build_scope() zaten UNION ALL'ı
    # (dallarını kardeş UNION_DALI olarak) doğru işliyor; bunu "bağımsız
    # kökler" mantığıyla parçalamak (eskiden UPDATE için eklenmişti) UNION
    # dallarını birbirinden KOPARIP ayrı ağaçlara bölüyordu -- YANLIŞ.
    stmt["alt_sorgu_agaci"] = []
    select_kismi = None
    if isinstance(parsed, exp.Insert):
        select_kismi = parsed.expression
    elif isinstance(parsed, exp.Merge):
        using_ifade = parsed.args.get("using")
        if isinstance(using_ifade, exp.Subquery):
            select_kismi = using_ifade.this
        elif isinstance(using_ifade, exp.Select):
            select_kismi = using_ifade
    if select_kismi is not None:
        stmt["alt_sorgu_agaci"] = alt_sorgu_agacini_cikar(select_kismi, stmt["hedef_tablo"])

    # GÜVENLİK AĞI: yukarıda ağaç kurulmayan (UPDATE/DELETE) ya da ağacın
    # SELECT gerektirmediği için yakalayamadığı (ör. "MERGE ... USING
    # tablo_adi b ON ..." gibi çıplak tablo referansı) kaynaklar, eski düz
    # kaynak_tablolar listesiyle karşılaştırılıp kaçırılan varsa "seviye 0
    # / ANA_SORGU" düğümüne eklenir -- hiçbir kaynak sessizce kaybolmaz.
    agactaki_isimler = {t["tablo"] for n in stmt["alt_sorgu_agaci"] for t in n["tablolar"]}
    kacirilan = [k for k in stmt["kaynak_tablolar"] if k["tablo"] not in agactaki_isimler]
    if kacirilan:
        kok_node = next((n for n in stmt["alt_sorgu_agaci"] if n["ust_gecici_id"] is None), None)
        if kok_node is None:
            id_kaydirma = max((n["gecici_id"] for n in stmt["alt_sorgu_agaci"]), default=0) + 1
            kok_node = {"gecici_id": id_kaydirma, "ust_gecici_id": None, "seviye": 0,
                        "alias": None, "tip": "ANA_SORGU", "tablolar": []}
            stmt["alt_sorgu_agaci"].append(kok_node)
        kok_node["tablolar"].extend(kacirilan)

    stmt["kolon_lineage"] = []
    hedef_kolonlar = None
    hedef_kolon_kaynagi = None
    if isinstance(parsed, exp.Insert):
        if isinstance(parsed.this, exp.Schema):
            hedef_kolonlar = [c.name for c in parsed.this.expressions]
            hedef_kolon_kaynagi = "SQL'de açık liste"
        elif isinstance(parsed.this, exp.Table) and stmt["hedef_tablo"] in known_table_columns:
            hedef_kolonlar = known_table_columns[stmt["hedef_tablo"]]
            hedef_kolon_kaynagi = "known_table_columns"
        elif isinstance(parsed.this, exp.Table) and isinstance(_subquery_soy(parsed.expression), (exp.Select, exp.Union)):
            # SON ÇARE: kolon listesi ne SQL'de ne known_table_columns'ta yazılı --
            # SELECT listesinin kendi alias'larından tahmin et (best-effort).
            # UNION ise İLK dalın alias'ları kullanılır -- alias'lar normalde
            # sadece UNION'un ilk SELECT'inde yazılır, sonraki dallar aynı
            # pozisyondaki ifadeyi (alias'sız) tekrarlar. _subquery_soy,
            # "INSERT INTO x (SELECT ...)" gibi PARANTEZE ALINMIŞ bir
            # SELECT'i (sqlglot'ta exp.Subquery olarak gelir) de soyar --
            # yoksa bu dal hiç calismiyordu (gercek bir vakada yakalandi).
            ilk_dal = _subquery_soy(parsed.expression)
            while isinstance(ilk_dal, exp.Union):
                ilk_dal = _subquery_soy(ilk_dal.this)
            hedef_kolonlar = [infer_column_alias(e) for e in ilk_dal.expressions] if isinstance(ilk_dal, exp.Select) else None
            hedef_kolon_kaynagi = "SELECT alias'larından tahmin"
        stmt["hedef_kolon_kaynagi"] = hedef_kolon_kaynagi

        select_expr = parsed.expression

        # UNION (ALL) ise TÜM dallarını (iç içe olanlar dahil) düz bir listeye
        # açıyoruz -- ESKİDEN sadece düz bir SELECT'te (UNION YOKSA) kolon
        # lineage çıkarılıyordu, UNION'lu bir INSERT'te (ör. çoğu rapor ya da
        # "gerçek veri + varsayılan/DUAL satırı" deseni kullanan ETL'ler)
        # BU BLOK HİÇ ÇALIŞMIYORDU. Her dal, AYNI hedef_kolonlar listesine
        # karşı KENDİ ifadeleriyle ayrı ayrı eşlenir -- bir dal literal
        # değerler döndürüyorsa (ör. UNION ALL SELECT 'X', 1 FROM DUAL) o
        # dal zaten "gerçek kolon yok" diye atlanır, diğer dal(lar) etkilenmez.
        #
        # SONRADAN BULUNAN HATA: "INSERT INTO x (kolonlar) (SELECT ...)"
        # gibi PARANTEZE ALINMIŞ bir SELECT, sqlglot'ta dogrudan exp.Select
        # DEGIL, onu saran bir exp.Subquery olarak gelir -- bu da
        # asagidaki "isinstance(dal, exp.Select)" kontrolüne takılıp
        # SESSİZCE atlanıyordu, yani boyle sarmalanmis HER statement'ta
        # kolon_lineage HİÇ ÇIKARILMIYORDU (gerçek bir vakada: 107 açık
        # hedef kolonu olan bir INSERT'te KATALOG_KOLON tamamen boş
        # kalmıştı). Şimdi Subquery'i de UNION gibi soyup içine iniyoruz.
        def _union_dallarini_duzlestir(govde):
            if isinstance(govde, exp.Subquery):
                return _union_dallarini_duzlestir(govde.this)
            if isinstance(govde, exp.Union):
                return _union_dallarini_duzlestir(govde.this) + _union_dallarini_duzlestir(govde.expression)
            return [govde]

        select_dallari = _union_dallarini_duzlestir(select_expr) if select_expr is not None else []

        if hedef_kolonlar:
            for dal in select_dallari:
                if not isinstance(dal, exp.Select):
                    continue
                kaynak_ifadeler = dal.expressions
                if len(hedef_kolonlar) != len(kaynak_ifadeler):
                    continue  # bu dal beklenmeyen sayida ifade donduruyor -- guvenlik icin atla

                # Bu DALIN KENDİ tabloları -- SADECE doğrudan FROM/JOIN'i
                # (global tek_kaynak, TÜM dalların tablolarını topladığı için
                # UNION'da hep None çıkardı; find_all(exp.Table) ise WHERE
                # içindeki bir alt sorgunun tablosunu da yakalayıp yanlışlıkla
                # "birden fazla tablo var" sanabilirdi -- o yüzden İÇ İÇE
                # SORGULARA İNMEDEN sadece bu SELECT'in kendi FROM/JOIN'i)
                dal_tablolari = set()
                from_ifade = dal.args.get("from_")
                if from_ifade is not None and isinstance(from_ifade.this, exp.Table):
                    dal_tablolari.add(resolve_table(from_ifade.this)["tablo"])
                for j in dal.args.get("joins", []):
                    if isinstance(j.this, exp.Table):
                        dal_tablolari.add(resolve_table(j.this)["tablo"])
                dal_tek_kaynak = next(iter(dal_tablolari)) if len(dal_tablolari) == 1 else tek_kaynak

                for hedef_kol, ifade in zip(hedef_kolonlar, kaynak_ifadeler):
                    if hedef_kol is None:
                        continue  # bu pozisyonun adı tahmin edilemedi, atla
                    cols_in_expr = _deger_kolonlarini_bul(ifade)
                    if not cols_in_expr:
                        # sabit değer (literal/SYSDATE/vb.) -- gerçek bir kaynak
                        # kolon yok, bağlanacak bir şey yok, satır üretme
                        continue
                    donusum = "DIREKT_KOPYA" if (
                        isinstance(ifade, exp.Column) or
                        (isinstance(ifade, exp.Alias) and isinstance(ifade.this, exp.Column))
                    ) else "TURETILMIS"

                    kaynak_detay = []
                    gorulen = set()
                    for c in cols_in_expr:
                        kaynak_tablo = alias_to_table.get(c.table) if c.table else dal_tek_kaynak
                        anahtar = (kaynak_tablo, c.name)
                        if anahtar in gorulen:
                            continue  # aynı ifadede (ör. CASE WHEN içinde) tekrar eden kolon -- bir kez say
                        gorulen.add(anahtar)
                        kaynak_detay.append({"kolon": c.name, "tablo": kaynak_tablo})

                    # Hedef kolonun TAM ifadesini de -- "AS alias" sarmalı
                    # OLMADAN (zaten hedef_kol'u ayrıca tutuyoruz, tekrar
                    # gösterip kalabalık etmesin) -- yakalayıp saklıyoruz.
                    # Bu, panelde "🔍 SQL" ikonuna tıklayınca gösterilecek
                    # per-kolon hesaplama özetinin kaynağıdır.
                    ic_ifade = ifade.this if isinstance(ifade, exp.Alias) else ifade
                    try:
                        ifade_metni = ic_ifade.sql(dialect=DIALECT, pretty=True)
                    except Exception:
                        ifade_metni = None

                    stmt["kolon_lineage"].append({
                        "hedef_kolon": hedef_kol,
                        "kaynak_kolonlar": kaynak_detay,
                        "donusum_tipi": donusum,
                        "donusum_ifadesi": ifade_metni,
                    })
    return stmt


def process_unit(source_text: str, procedure_adi_override: str | None = None,
                  known_table_columns: dict | None = None) -> dict:
    try:
        unit = extract_unit(source_text)
    except ValueError:
        unit = {"owner": None, "paket_adi": None, "procedure_adi": procedure_adi_override}
    if procedure_adi_override:
        unit["procedure_adi"] = procedure_adi_override
    statements = [analyze_statement(s, known_table_columns) for s in split_dml_statements(source_text)]
    return {"unit": unit, "statements": statements}


# ====================================================================
# 4) YAZMA -- artık psycopg2 / PostgreSQL sözdizimiyle
# ====================================================================

_table_id_cache: dict[tuple, int] = {}
_column_id_cache: dict[tuple, int] = {}


def get_or_create_table(cursor, schema_adi: str | None, tablo_adi: str, katman: str | None = None) -> int:
    key = (schema_adi, tablo_adi)
    if key in _table_id_cache:
        table_id = _table_id_cache[key]
        # onbellekte olsa bile, bu cagri YENI bir katman bilgisi tasiyorsa
        # (ornegin bu tablo simdi dblink ile KAYNAK olarak goruluyor) VE
        # veritabaninda hala katman NULL ise, DOLDUR -- ama var olan bir
        # katmanin (ornegin isim deseninden gelen EX/TR) UZERINE YAZMA.
        if katman:
            cursor.execute(
                "UPDATE stage.katalog_tablo SET katman = %s WHERE table_id = %s AND katman IS NULL",
                (katman, table_id),
            )
        return table_id

    cursor.execute(
        "SELECT table_id, katman FROM stage.katalog_tablo WHERE tablo_adi = %s AND COALESCE(schema_adi,'-') = COALESCE(%s,'-')",
        (tablo_adi, schema_adi),
    )
    row = cursor.fetchone()
    if row:
        _table_id_cache[key] = row[0]
        if katman and row[1] is None:
            cursor.execute(
                "UPDATE stage.katalog_tablo SET katman = %s WHERE table_id = %s AND katman IS NULL",
                (katman, row[0]),
            )
        return row[0]

    # ŞEMASIZ bir arama tam eşleşme bulamadıysa -- aynı isimde (herhangi bir
    # şemayla) TEK bir kayıt zaten varsa, yeni (belirsiz, şemasız) bir satır
    # açıp tabloyu bölmek yerine o var olan kaydı kullan. Birden fazla farklı
    # şemalı aday varsa (gerçek belirsizlik) yine de yeni satır açılır.
    if schema_adi is None:
        cursor.execute("SELECT table_id FROM stage.katalog_tablo WHERE tablo_adi = %s", (tablo_adi,))
        adaylar = cursor.fetchall()
        if len(adaylar) == 1:
            _table_id_cache[key] = adaylar[0][0]
            return adaylar[0][0]
    else:
        # ŞEMALI bir arama tam eşleşme bulamadıysa -- daha önce (sırası
        # gereği önce işlenmiş) aynı isimde YETİM (şemasız) bir kayıt
        # açılmış olabilir. Başka hiçbir şemalı aday yoksa, o yetim kaydı
        # yeni satır açmak yerine bu şemaya YÜKSELT (UPDATE) ve kullan --
        # ilk kez şeması öğreniliyor demektir.
        cursor.execute(
            "SELECT table_id FROM stage.katalog_tablo WHERE tablo_adi = %s AND schema_adi IS NULL",
            (tablo_adi,),
        )
        yetim = cursor.fetchone()
        if yetim:
            cursor.execute(
                "SELECT COUNT(*) FROM stage.katalog_tablo WHERE tablo_adi = %s",
                (tablo_adi,),
            )
            toplam = cursor.fetchone()[0]
            if toplam == 1:  # tek aday da bu yetim kayıt, başka şema yok -- güvenle yükselt
                cursor.execute(
                    "UPDATE stage.katalog_tablo SET schema_adi = %s WHERE table_id = %s",
                    (schema_adi, yetim[0]),
                )
                _table_id_cache[key] = yetim[0]
                _table_id_cache[(None, tablo_adi)] = yetim[0]  # eski şemasız anahtarı da aynı id'ye işaretle
                return yetim[0]

    cursor.execute(
        """
        INSERT INTO stage.katalog_tablo (schema_adi, tablo_adi, katman)
        VALUES (%s, %s, %s)
        RETURNING table_id
        """,
        (schema_adi, tablo_adi, katman),
    )
    new_id = cursor.fetchone()[0]
    _table_id_cache[key] = new_id
    return new_id


def get_or_create_column(cursor, table_id: int, kolon_adi: str) -> int:
    key = (table_id, kolon_adi)
    if key in _column_id_cache:
        return _column_id_cache[key]

    cursor.execute(
        "SELECT column_id FROM stage.katalog_kolon WHERE table_id = %s AND kolon_adi = %s",
        (table_id, kolon_adi),
    )
    row = cursor.fetchone()
    if row:
        _column_id_cache[key] = row[0]
        return row[0]

    cursor.execute("SELECT COALESCE(MAX(kolon_sira), 0) + 1 FROM stage.katalog_kolon WHERE table_id = %s", (table_id,))
    kolon_sira = cursor.fetchone()[0]

    cursor.execute(
        """
        INSERT INTO stage.katalog_kolon (table_id, kolon_adi, kolon_sira)
        VALUES (%s, %s, %s)
        RETURNING column_id
        """,
        (table_id, kolon_adi, kolon_sira),
    )
    new_id = cursor.fetchone()[0]
    _column_id_cache[key] = new_id
    return new_id


def find_table_id(cursor, schema_adi: str | None, tablo_adi: str) -> int | None:
    key = (schema_adi, tablo_adi)
    if key in _table_id_cache:
        return _table_id_cache[key]
    cursor.execute(
        "SELECT table_id FROM stage.katalog_tablo WHERE tablo_adi = %s AND COALESCE(schema_adi,'-') = COALESCE(%s,'-')",
        (tablo_adi, schema_adi),
    )
    row = cursor.fetchone()
    if row:
        _table_id_cache[key] = row[0]
        return row[0]
    return None


def find_column_id(cursor, table_id: int, kolon_adi: str) -> int | None:
    key = (table_id, kolon_adi)
    if key in _column_id_cache:
        return _column_id_cache[key]
    cursor.execute(
        "SELECT column_id FROM stage.katalog_kolon WHERE table_id = %s AND kolon_adi = %s",
        (table_id, kolon_adi),
    )
    row = cursor.fetchone()
    if row:
        _column_id_cache[key] = row[0]
        return row[0]
    return None


def resolve_ambiguous_kaynak(cursor, kolon_adi: str, kaynak_tablolar: list[dict]) -> tuple[int, int] | None:
    """Alias'sız bir kolonun kaynağını, aday tabloların KATALOG_KOLON'da
    ZATEN KAYITLI kolon listesine bakarak çözer. Tam 1 tabloda bulunursa
    kesin kabul eder; hiçbirinde yoksa veya birden fazlasında varsa None döner."""
    bulunanlar = []
    for k in kaynak_tablolar:
        table_id = find_table_id(cursor, k["schema"], k["tablo"])
        if table_id is None:
            continue
        column_id = find_column_id(cursor, table_id, kolon_adi)
        if column_id is not None:
            bulunanlar.append((table_id, column_id))
    if len(bulunanlar) == 1:
        return bulunanlar[0]
    return None


def delete_existing_unit(cursor, owner: str | None, paket_adi: str | None, procedure_adi: str | None) -> int:
    """Aynı (owner, paket_adi, procedure_adi) için daha önce yazılmış unit
    ve ona bağlı TÜM alt kayıtları (statement, kaynak, kolon lineage) siler.
    KATALOG_TABLO/KATALOG_KOLON'a HİÇ dokunmaz -- onlar paylaşılan referans
    veri, silinmemeli. Bu sayede script'i tekrar tekrar çalıştırmak eski
    kaydı çoğaltmak yerine günceller. Silinen unit sayısını döner."""
    cursor.execute(
        """
        SELECT unit_id FROM stage.katalog_unit
        WHERE COALESCE(owner,'-') = COALESCE(%s,'-')
          AND COALESCE(paket_adi,'-') = COALESCE(%s,'-')
          AND COALESCE(procedure_adi,'-') = COALESCE(%s,'-')
        """,
        (owner, paket_adi, procedure_adi),
    )
    unit_ids = [r[0] for r in cursor.fetchall()]
    if not unit_ids:
        return 0

    cursor.execute(
        "SELECT statement_id FROM stage.katalog_unit_statement WHERE unit_id = ANY(%s)",
        (unit_ids,),
    )
    statement_ids = [r[0] for r in cursor.fetchall()]

    if statement_ids:
        cursor.execute("DELETE FROM stage.katalog_kolon_lineage WHERE statement_id = ANY(%s)", (statement_ids,))
        cursor.execute("DELETE FROM stage.katalog_statement_kaynak WHERE statement_id = ANY(%s)", (statement_ids,))
        cursor.execute("DELETE FROM stage.katalog_statement_alt_sorgu WHERE statement_id = ANY(%s)", (statement_ids,))
        cursor.execute("DELETE FROM stage.katalog_unit_statement WHERE unit_id = ANY(%s)", (unit_ids,))
    cursor.execute("DELETE FROM stage.katalog_unit WHERE unit_id = ANY(%s)", (unit_ids,))
    return len(unit_ids)


def write_unit_to_katalog(cursor, unit: dict, statements: list[dict]) -> None:
    silinen = delete_existing_unit(cursor, unit["owner"], unit["paket_adi"], unit["procedure_adi"])
    if silinen:
        print(f"    (i) daha önce yazılmış {silinen} kayıt silinip yenisiyle değiştirildi")

    cursor.execute(
        """
        INSERT INTO stage.katalog_unit (owner, paket_adi, procedure_adi)
        VALUES (%s, %s, %s)
        RETURNING unit_id
        """,
        (unit["owner"], unit["paket_adi"], unit["procedure_adi"]),
    )
    unit_id = cursor.fetchone()[0]
    varsayilan_sema = unit.get("owner")  # Oracle: şemasız isim -> paket sahibinin şeması

    def sema_coz(sema):
        return sema if sema else varsayilan_sema

    for stmt in statements:
        if stmt.get("parse_hatasi") or not stmt.get("hedef_tablo"):
            print(f"    !! atlandi (parse hatasi/hedef yok): {stmt.get('sql_metni', '')[:60]}")
            continue

        # şemasız kaynak tablo referanslarını da aynı varsayılana normalize et
        for k in stmt.get("kaynak_tablolar", []):
            k["schema"] = sema_coz(k["schema"])

        hedef_table_id = get_or_create_table(
            cursor, sema_coz(stmt.get("hedef_sema")), stmt["hedef_tablo"],
            katman_tahmin_et(stmt["hedef_tablo"]),
        )

        if stmt.get("hedef_kolon_kaynagi") == "SELECT alias'larından tahmin":
            print(f"    (!) hedef kolon adları SELECT alias'larından TAHMİN edildi "
                  f"({stmt['hedef_tablo']}) -- Oracle pozisyona göre eşleşir, alias'a göre değil; "
                  f"gerçek tablo yapısıyla teyit edilene kadar bu satırları temkinli okuyun")
        guven_seviyesi = "TAHMIN" if stmt.get("hedef_kolon_kaynagi") == "SELECT alias'larından tahmin" else "KESIN"

        cursor.execute(
            """
            INSERT INTO stage.katalog_unit_statement (unit_id, hedef_table_id, dml_tipi, satir_no, sql_metni)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING statement_id
            """,
            (unit_id, hedef_table_id, stmt["dml_tipi"], stmt.get("satir_no"), stmt.get("sql_metni")),
        )
        statement_id = cursor.fetchone()[0]

        # Alt sorgu ağacını yaz -- önce SEVİYEYE göre sırala (ebeveyn her
        # zaman çocuğundan önce eklensin ki ust_alt_sorgu_id FK'si çözülsün).
        gecici_to_real_id = {}
        agac = sorted(stmt.get("alt_sorgu_agaci", []), key=lambda n: n["seviye"])
        for node in agac:
            ust_real_id = gecici_to_real_id.get(node["ust_gecici_id"]) if node["ust_gecici_id"] is not None else None
            cursor.execute(
                """
                INSERT INTO stage.katalog_statement_alt_sorgu
                    (statement_id, ust_alt_sorgu_id, seviye, alias, tip)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING alt_sorgu_id
                """,
                (statement_id, ust_real_id, node["seviye"], node["alias"], node["tip"]),
            )
            gecici_to_real_id[node["gecici_id"]] = cursor.fetchone()[0]

            for t in node["tablolar"]:
                kaynak_table_id = get_or_create_table(
                    cursor, sema_coz(t["schema"]), t["tablo"],
                    katman_tahmin_et(t["tablo"], t.get("dblink")),
                )
                cursor.execute(
                    """
                    INSERT INTO stage.katalog_statement_kaynak (statement_id, kaynak_table_id, alt_sorgu_id)
                    VALUES (%s, %s, %s)
                    """,
                    (statement_id, kaynak_table_id, gecici_to_real_id[node["gecici_id"]]),
                )

        for kl in stmt.get("kolon_lineage", []):
            hedef_column_id = get_or_create_column(cursor, hedef_table_id, kl["hedef_kolon"])
            for kaynak in kl["kaynak_kolonlar"]:
                if kaynak["tablo"]:
                    kaynak_table_id = get_or_create_table(
                        cursor, sema_coz(None), kaynak["tablo"],
                        katman_tahmin_et(kaynak["tablo"]),
                    )
                    kaynak_column_id = get_or_create_column(cursor, kaynak_table_id, kaynak["kolon"])
                else:
                    cozum = resolve_ambiguous_kaynak(cursor, kaynak["kolon"], stmt.get("kaynak_tablolar", []))
                    if cozum is None:
                        print(f"    !! kolon kaynağı belirsiz kaldı: {kl['hedef_kolon']} <- {kaynak['kolon']} "
                              f"(KATALOG_KOLON'da adaylardan hiçbirinde/birden fazlasında bulunamadı -- atlandı)")
                        continue
                    kaynak_table_id, kaynak_column_id = cozum

                cursor.execute(
                    """
                    INSERT INTO stage.katalog_kolon_lineage
                        (statement_id, kaynak_column_id, hedef_column_id, donusum_tipi, guven_seviyesi, donusum_ifadesi)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (statement_id, kaynak_column_id, hedef_column_id, kl["donusum_tipi"], guven_seviyesi,
                     kl.get("donusum_ifadesi")),
                )

    print(f"  yazildi: unit_id={unit_id}  ({len(statements)} statement)")


# ====================================================================
# ÇALIŞTIR
# ====================================================================

if __name__ == "__main__":
    # ------------------------------------------------------------------
    # BURAYI DOLDURUN (PostgreSQL kurarken belirlediğiniz şifre)
    # ------------------------------------------------------------------
    PG_HOST = "localhost"
    PG_PORT = 5432
    PG_DBNAME = "postgres"
    PG_USER = "postgres"
    PG_PASSWORD = "12345Cs*"
    # ------------------------------------------------------------------

    # Klasördeki (script ile aynı dizin) TÜM .txt dosyalarını otomatik bulur.
    # ReadMe.txt gibi gerçek PL/SQL içermeyen dosyaları hariç tutmak için
    # HARIC_TUTULACAKLAR listesine ekleyin.
    import glob
    import os

    HARIC_TUTULACAKLAR = {"readme.txt"}  # küçük harfle karşılaştırılır

    dosyalar = []
    for path in sorted(glob.glob("*.txt")):
        if path.lower() in HARIC_TUTULACAKLAR:
            continue
        proc_adi = os.path.splitext(os.path.basename(path))[0]
        dosyalar.append((path, proc_adi))

    print(f"{len(dosyalar)} dosya bulundu: {', '.join(d[0] for d in dosyalar)}\n")

    known_table_columns = {
        "T_ORDER_PAYMENTS_QA": [
            "as_of_date", "id_number", "order_date", "institution_code",
            "institution_short_name", "protocol_start_date", "protocol_end_date",
            "inst_cus_no", "inst_org_code", "inst_account_code", "cus_no",
            "profit_center_code", "profit_segment_code", "account_code",
            "product_type", "payment_amount", "deduction_amount", "currency_code",
            "payment_day_of_month", "blocked_day_count", "blocked_day_type",
            "updated_by", "status", "personnel_status", "is_active",
            "has_promotion", "payment_reference_id", "order_oid",
            "register_no", "voucher_desc", "payment_type_code",
            "customer_protocol_date",
        ]
    }

    print("PostgreSQL'e bağlanılıyor...")
    connection = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_DBNAME,
                                   user=PG_USER, password=PG_PASSWORD,
                                   client_encoding="UTF8")
    cursor = connection.cursor()
    print("Bağlantı başarılı.\n")

    basarisiz_dosyalar = []
    for fname, proc_adi in dosyalar:
        print(f"--- {fname} okunuyor ---")
        try:
            source_text = read_from_file(fname)
            result = process_unit(source_text, procedure_adi_override=proc_adi,
                                   known_table_columns=known_table_columns)
            write_unit_to_katalog(cursor, result["unit"], result["statements"])
        except FileNotFoundError:
            print(f"  !! DOSYA BULUNAMADI: '{fname}' script ile aynı klasörde mi?\n")
            basarisiz_dosyalar.append((fname, "dosya bulunamadı"))
            continue
        except Exception as e:
            # TEK bir dosyadaki BEKLENMEYEN bir hata (parse, encoding, DB vb.)
            # TUM batch'i DURDURMASIN -- hatayi logla, bu dosyayi atla, kalan
            # TUM dosyalari islemeye devam et. connection.rollback() ile bu
            # dosyanin YARIM KALMIS islemlerini geri alip transaction'i
            # temiz bir duruma getiriyoruz (yoksa sonraki dosyalarin
            # INSERT'leri deayni bozuk transaction'a girip hata verebilirdi).
            connection.rollback()
            print(f"  !! BEKLENMEYEN HATA, bu dosya ATLANDI: {type(e).__name__}: {e}\n")
            basarisiz_dosyalar.append((fname, f"{type(e).__name__}: {e}"))
            continue

    if basarisiz_dosyalar:
        print(f"\n(!) {len(basarisiz_dosyalar)} dosya işlenemedi:")
        for f, sebep in basarisiz_dosyalar:
            print(f"    - {f}: {sebep}")

    # TUM dosyalar (yukaridaki dongu) bittikten SONRA, bir kez -- katman
    # (EX/TR/KAYNAK) hicbirine uymayan tablolari LD'ye dusurur. Erken
    # cagirilirsa, henuz islenmemis bir dosyada KAYNAK/EX/TR olarak ortaya
    # cikacak bir tablo yanlislikla LD'ye kilitlenebilirdi -- bu yuzden
    # dongunun ICINDE degil, DISINDA.
    guncellenen = finalize_katmanlar(cursor)
    if guncellenen:
        print(f"\n(i) {guncellenen} tablo, hicbir katmana (EX/TR/KAYNAK) uymadigi icin LD yapildi.")

    connection.commit()
    cursor.close()
    connection.close()
    print("\nBitti, değişiklikler kaydedildi (COMMIT).")
