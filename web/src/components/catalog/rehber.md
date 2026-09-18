# `catalog/` — servis **detay sekmelerinin** içeriği

**Ekranda:** Soldan bir **servis** (veya üst seviye jar/grup) seçince orta alandaki **Genel bakış, Ekranlar, Tablo, Değişiklikler** gibi sekmelerin gövdesi. Sekme çubuğu ve iskelet → `shell/ServiceStage.tsx`.

Harita sekmesi **bu klasörde değil** → [service-map/rehber.md](../service-map/rehber.md).

| Dosya | Ekranda hangi sekme / parça | Ne gösterir |
|-------|----------------------------|-------------|
| `ServiceOverview.tsx` | Genel bakış | Özet kartlar, kısa meta |
| `CatalogEntityOverview.tsx` | Grup veya jar seçiliyken | Jar/grup düzeyi özet |
| `ServiceCatalogPanels.tsx` | Ekranlar / süreçler listeleri | Servise bağlı ekran ve süreç satırları |
| `RelationshipTable.tsx` | Tablo sekmesi | Komşu / ilişki tablosu |
| `ServiceChangeLog.tsx` | Değişiklik geçmişi | Changelog satırları |
| `ServiceWorkflowChip.tsx` | Overview veya listelerde chip | İlgili kayıtlı iş akışına link |
| `CatalogHelp.tsx` | Yardım metni | Katalog alanı açıklaması |
| `DetailPanel.tsx` | Yan detay | Seçili satır ek bilgisi |

Boş liste mesajları: [shared/EmptyState](../shared/EmptyState.tsx). Stil: `catalog.css`, `catalog-detail.css`, `catalog-bento.css`.
