# DWH Lineage Tasima Paketi

Bu klasor, React/Express projesine tasinacak kritik DWH lineage dosyalarinin
kopyasidir. Orijinal proje dosyalarina dokunulmadan hazirlanmistir.

## Klasorler

- `parser/`
  - `katalog_parser.py`: Kullanilacak ana parser. Eski ama tutarli surum.
  - `rapor_parser.py`: Rapor SQL kataloglayici.
  - `postgres_kolon_metadata_yukle.py`: PostgreSQL `information_schema.columns`
    uzerinden kolon metadata yukleyici.

- `sql/`
  - `katalog_semasi.sql`: PostgreSQL `stage.katalog_*` ana semasi.
  - `katalog_kolon_kullanim_migration.sql`: Kolon kullanim tablosu migration'i.
  - `katalog_analiz_sorgulari.sql`: Manuel analiz ve dogrulama sorgulari.
  - `katalog_truncate.sql`: Katalog temizleme scripti.
  - `lineage_trace_postgres.sql`: Kolon lineage recursive sorgu ornegi.

- `etl_kaynaklari/`
  - Kataloglanacak PL/SQL/ETL `.txt` kaynak dosyalari.
  - `ReadMe.txt`, `gelistirme_onerileri.txt`, `asd.txt` buraya alinmadi.

- `raporlar/`
  - Kataloglanacak rapor `.sql` dosyalari.

- `docs/`
  - Mevcut proje dokumantasyonu ve tasarim notlari.

- `diagnostics/`
  - Belirsiz kolon CSV ciktilari. Parser iyilestirme ve kontrol icin saklandi.

- `legacy_reference/`
  - `lineage_app.py`: Yeni Express/React uygulamasina birebir tasinmayacak.
    Icindeki API query mantigi referans olarak kullanilacak.

## Hedef Projeye Onerilen Yerlestirme

```text
service-dependency-main/
  tools/dwh-parser/
    katalog_parser.py
    rapor_parser.py
    postgres_kolon_metadata_yukle.py
    etl_kaynaklari/
    raporlar/

  server/src/dwh/
    db.ts
    routes.ts
    tableService.ts
    columnService.ts
    reportService.ts
    sqlService.ts

  sql/dwh/
    katalog_semasi.sql
    katalog_kolon_kullanim_migration.sql
    katalog_truncate.sql
```

## Onemli Uyumluluk Notu

Secilen `parser/katalog_parser.py`, `stage.katalog_kolon_lineage` tablosuna
`donusum_ifadesi` kolonu ile yazmayi deniyor.

Bu paketteki mevcut `sql/katalog_semasi.sql` dosyasinda ise
`stage.katalog_kolon_lineage` icinde `donusum_ifadesi` kolonu yok.

Tasimadan once iki yoldan biri secilmeli:

1. Sema eski parser'a uydurulur ve `donusum_ifadesi TEXT` kolonu eklenir.
2. Parser insert sorgusu mevcut semaya uydurulur.

Read-only React/Express fazinda bu sorun yoktur; sorun parser/import job
calistirilirken ortaya cikar.

## Faz 1 Hedefi

Ilk hedef sadece mevcut PostgreSQL katalog verisini yeni React/Express
uygulamasinda read-only gostermektir. Parser otomasyonu ve Docker icinden import
calistirma sonraki faza birakilmalidir.
