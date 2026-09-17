# Katalog ve servis detay — modül grubu

Seçili servis veya jar/grup için **sekmeler** (ekranlar, süreçler, tablo, changelog). Orchestrator: `shell/ServiceStage.tsx`.

Kaynak dosyalar bu klasörde. Boş durum: [shared/EmptyState](../shared/EmptyState.tsx).

## Dosya → rol

| Dosya | Rol | Sekme / bağlam |
|-------|-----|----------------|
| `ServiceCatalogPanels.tsx` | Ekranlar / süreçler listesi verisi | Katalog sekmeleri |
| `CatalogEntityOverview.tsx` | Grup veya jar özeti | Pivot grup/jar |
| `CatalogHelp.tsx` | Katalog yardım metni | Yardım |
| `RelationshipTable.tsx` | İlişki tablosu | Tablo sekmesi |
| `ServiceOverview.tsx` | Servis özet kartı | Overview |
| `DetailPanel.tsx` | Yan detay paneli | Çeşitli |
| `ServiceChangeLog.tsx` | Değişiklik geçmişi | Changelog |
| `ServiceWorkflowChip.tsx` | İlgili iş akışı chip’i | Overview / liste |

Harita ve metod görünümleri: [service-map/rehber.md](../service-map/rehber.md) (`MethodImpactMap`, `MethodCallTree`).

## Stil

Çoğu kural `App.css` içinde; kabuk spacing `shell.css`.

