# `components/` — arayüz parçalarının haritası

Tarayıcıda gördüğün **Servis kataloğu** ekranının tamamı bu klasörün alt klasörlerinden gelir. “Hangi düğme nerede?” sorusuna cevap: aşağıdaki **ekran → klasör** tablosu; detay için ilgili alt klasördeki `rehber.md`.

State (seçili servis, açık drawer, süreç no) çoğunlukla `App.tsx` + `navigation/` içindedir; buradaki dosyalar **görünümü** çizer.

Özet tablo: [docs/web-module-layout.md](../../../docs/web-module-layout.md) · Giriş: [README.md](./README.md)

## Ekranda ne görüyorsan → hangi klasör?

| Ekranda gördüğün | Nerede duruyor | Kod klasörü |
|------------------|----------------|-------------|
| Üst şerit: logo, **Servis / DWH** geçişi, tema, inbox rozeti | Sayfanın en üstü | `shell/` |
| Sol sütun: proje→jar→servis **ağacı**, pin, daraltma | Sol panel | `shell/` + `sidebar/` |
| Sol panelden açılan **Favoriler** veya **İş akışları** çekmecesi | Aynı sol kolon, overlay drawer | `sidebar/` + `workflows/` |
| Ortada hiçbir şey seçili değilken **hoş geldin / tur** | Orta alan | `welcome/` |
| Bir **servis** seçince: sekmeler (Genel bakış, Harita, Tablo, …) | Orta alan | `shell/ServiceStage` → `catalog/` + `service-map/` |
| **Harita** sekmesindeki servis/metod baloncukları | Harita sekmesi | `service-map/` |
| İş akışlarından açılan **BPM süreç** canvas’ı (tam akış veya rota) | Orta alan, süreç modu | `process/` |
| Sol drawer’dan seçilen **kayıtlı iş akışı** tam sayfa editörü | Orta alan | `workflow-stage/` |
| **⌘K** (Mac) / Ctrl+K arama paleti | Ekran ortası modal | `search/` |
| **Inbox**, değişiklik talebi, talep detayı pencereleri | Modal katman | `overlays/` |
| “Liste boş”, snapshot listesi gibi tekrar eden küçük bloklar | Birçok sekmede | `shared/` |

## Klasör ağacı (kısa)

```
shell/           Üst bar + sol iskelet + orta sahneyi birleştirir
sidebar/         Ağaç satırları, yıldız, favoriler içeriği
workflows/       İş akışları drawer’ının listeleri ve araması
welcome/         Seçim yokken orta ekran
workflow-stage/  Kayıtlı iş akışı tam sayfa
process/         BPM haritası ve rota oluşturucu
service-map/     Servis etki haritası
catalog/         Servis detay sekmelerinin içerikleri
search/          Komut paleti
overlays/        CR / inbox modalları
shared/          Ortak küçük parçalar
```

## Veri nasıl geliyor?

```
Tarayıcı → api/client (HTTP)
         → navigation/* (ne seçili, hangi drawer açık)
         → shell/* (sayfa iskeleti)
         → domain klasörleri (harita, süreç, katalog…)
```

Kalıcı kullanıcı verisi (favoriler, rotalar): [stores/rehber.md](../stores/rehber.md). Sekme yenileyince seçim: `appNavPersist.ts`.

## Alt rehberler

| Klasör | rehber |
|--------|--------|
| `shell/` | [shell/rehber.md](./shell/rehber.md) |
| `sidebar/` | [sidebar/rehber.md](./sidebar/rehber.md) |
| `workflows/` | [workflows/rehber.md](./workflows/rehber.md) |
| `welcome/` | [welcome/rehber.md](./welcome/rehber.md) |
| `workflow-stage/` | [workflow-stage/rehber.md](./workflow-stage/rehber.md) |
| `process/` | [process/rehber.md](./process/rehber.md) |
| `service-map/` | [service-map/rehber.md](./service-map/rehber.md) |
| `catalog/` | [catalog/rehber.md](./catalog/rehber.md) |
| `search/` | [search/rehber.md](./search/rehber.md) |
| `overlays/` | [overlays/rehber.md](./overlays/rehber.md) |
| `shared/` | [shared/rehber.md](./shared/rehber.md) |

## CSS (ekran parçası → stil dosyası)

| Ekranda | Stil |
|---------|------|
| Üst bar, sol panel iskeleti | `styles/shell.css` |
| İş akışları drawer | `styles/workflows-drawer.css` |
| Servis / süreç haritaları | `styles/service-map.css`, `process-flow.css` |
| ⌘K | `styles/cmdk.css` |
| Servis sekmeleri | `styles/stage.css`, `catalog.css`, `catalog-detail.css` |

Tam liste: [styles/rehber.md](../styles/rehber.md).
