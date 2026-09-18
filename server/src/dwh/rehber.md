# `server/src/dwh` — **DWH sekmesi** API’si

**Ekranda:** Masthead’den DWH’ye geçince tablo ağacı, lineage haritası, kolon paneli — hepsi `/api/dwh/...` ile buradan gelir. Stage PostgreSQL (`PGSCHEMA=stage` vb.).

| Dosya | UI’da karşılığı |
|-------|-----------------|
| `routes.ts` | Tüm DWH HTTP uçları |
| `treeService.ts` | Sol DWH ağacı |
| `tableService.ts` | Tablo meta |
| `columnLineageService.ts` | Kolon upstream/downstream paneli |
| `graphService.ts` | Lineage harita verisi |
| `sqlService.ts` | SQL metni |
| `reportService.ts` | Rapor uçları |

React tarafı: [web/src/dwh/rehber.md](../../../web/src/dwh/rehber.md). Servis katalog route’ları → [routes/rehber.md](../routes/rehber.md).
