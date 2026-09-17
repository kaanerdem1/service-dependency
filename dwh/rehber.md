# `dwh/` — veri ve legacy referans (repo kökü)

DWH **React yüzeyi** kodu burada değil → `web/src/dwh/`. Bu klasör örnek veri, eski Flask lineage demosu ve logo kaynağını tutar.

| Yol | İçerik |
|-----|--------|
| `artifacts/data.csv` | Örnek / referans CSV |
| `artifacts/ERdiagram.json` | ER diyagram JSON |
| `artifacts/dwh_stage.dump` | PostgreSQL stage dump (yerel restore) |
| `legacy/lineage_app_sample.py` | Eski kolon lineage Flask uygulaması (referans; prod UI değil) |
| `assets/dwh-logo.png` | Logo **kaynak** dosyası |

**Canlı logo:** Vite `web/public/dwh-logo.png` — masthead `/dwh-logo.png` ile yükler. Logo değişince `assets/` → `web/public/` kopyala.

**`netlify.toml`:** Repo kökünde kalır (Netlify build ayarı); DWH verisi değil.

Paket notları: `dwh_lineage_tasima_paketi/`.
