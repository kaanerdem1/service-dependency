# `web/src/dwh/` — **DWH** sekmesi (veri ambarı lineage)

**Ekranda:** Üst masthead’den **DWH**’ye geçince açılan tamamen ayrı yüzey — tablo/kolon ağacı, lineage haritası, SQL metni, kolon upstream/downstream, DWH favorileri. Servis ağacı bu modda yok.

| Dosya | Ekranda nereye karşılık gelir | Ne gösterir / yapar |
|-------|------------------------------|---------------------|
| `DwhPage.tsx` | DWH ana sayfa | Sekmeler, layout orchestrator |
| `DwhLineageTree.tsx` | Sol veya panel ağacı | Şema / tablo hiyerarşisi |
| `DwhLineageMap.tsx` | Lineage harita canvas | Tablo/kolon ilişki grafiği |
| `DwhMapChrome.tsx` | Harita üst kontroller | Zoom, filtre (servis haritasına benzer) |
| `DwhColumnLineagePanel.tsx` | Kolon seçince yan panel | Up/down lineage listesi |
| `DwhSqlCode.tsx` | SQL bloğu | Sadeleştirilmiş / ham SQL |
| `DwhFavoritesPanel.tsx` | Favori tablolar | Pinlediğin DWH nesneleri |
| `DwhSearchHitsPortal.tsx` | DWH arama sonuçları | Portal liste |
| `api.ts`, `types.ts` | (görünmez) | `/api/dwh` istekleri |
| `dwhNavPersist.ts` | Sekme yenileme | Son DWH seçimi |
| `DwhPage.css` | Tüm DWH görünümü | Stiller |

Örnek dump / eski Python demo repo kökünde → [dwh/rehber.md](../../../dwh/rehber.md). Geçiş: `shell/SurfaceSwitch.tsx`.
