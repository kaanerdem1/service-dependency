# Faz 5 CSS bölme — görsel smoke checklist

Dosya taşıması only; class adları aynı. Hard refresh (`Cmd+Shift+R`). İki tema: **mixed** ve **white**.

## Yüksek risk (önce bak)

| Alan | Ne kontrol edilir | Regresyon belirtisi |
|------|-------------------|---------------------|
| **Masthead** | Yüzey switch, logo, tema, gelen kutusu rozeti | Hizalama kayması, switch pill kayık, inbox badge yok |
| **Sidebar rail** | Pin, favori/akış ikonları, hover tooltip | Rail 76px genişlik, tooltip kesilmesi, ikon soluk/kayboldu |
| **Drawer açılış** | Favoriler + İş akışları animasyonu | Panel alttan/yanlış yerden gelir, `prefers-reduced-motion` bozuk |
| **İş akışları drawer** | Süreç listesi, BPM rota grupları, filtre, satır yoğunluğu | `sc-process-*` / `sc-route-*` padding, rota sil/rename ikonları görünmez |
| **Klasör ağacı (sc-)** | Chevron, sürükle, satır hover, Akış Takibi rengi | Klasör girintisi, seçili satır arka planı, drag handle hizası |
| **Modül ağacı** | Proje/jar/servis renkleri, seçili satır | `.tree-row` renkleri sidebar’da soluk veya yanlış |
| **Süreç haritası** | Tam akış + rota modu, drawer, not, snapshot | PF layout/import eksik → düğüm/ok kayık, rota çubuğu kırpılır |
| **Servis sahnesi** | Harita, tablo, sekmeler, tam ekran harita | `.main.main-map` padding, stage tab alt çizgisi |
| **Rota dialogları** | Rename / sil onay (portal) | `sc-confirm-*`, `sc-route-rename-*` z-index veya kutu gölgesi yok |

## Orta risk

| Alan | Kontrol |
|------|---------|
| **Komut paleti (⌘K)** | Arama hit satırları, kısayol listesi |
| **Katalog özeti (grup/jar)** | `.ce-shell` gradient, kart grid |
| **Workflow info sayfası** | `.wf-info-stage` üst boşluk |
| **Dar ekran** | Sidebar collapse, drawer overlay, harita min genişlik |
| **DWH yüzeyi** | CSS taşınmadı; yine de yüzeye geç → lineage/harita açılır |

## Düşük risk (hızlı göz)

- Welcome ekranı mini preview
- Inbox / CR modal (App.css’te kaldı)
- Etki haritası radial layout, ilişki tablosu grid
- Servis işlevi / ekranlar / süreçler sekmeleri

## Import zinciri (bozulursa her şey etkilenir)

`App.css` sırası:

1. `process-flow.css`
2. `shell.css`
3. `workflows-drawer.css`

Eksik `@import` → ilgili bölüm tamamen stilsiz (en belirgin: drawer veya PF).

## Otomasyon

Şu an manuel. İleride: Playwright screenshot diff (masthead + drawer + PF) ayrı issue.
