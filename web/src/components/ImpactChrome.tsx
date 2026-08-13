/** Ortak lejant + filtre ipucu — etki yolu / harita */

type LegendProps = {
  cascadeCount?: number
  truncated?: boolean
}

export function ImpactLegend({ cascadeCount, truncated }: LegendProps) {
  return (
    <div className="path-legend-block" role="note">
      <span className="path-legend-item">
        <span className="legend-swatch tree" aria-hidden />
        <span>
          <strong>Yeşil ok</strong> — ana etki yolu: değişen → etkilenen
          (çağıran tüketici)
        </span>
      </span>
      <span className="path-legend-item">
        <span className="legend-swatch cascade" aria-hidden />
        <span>
          <strong>Turuncu ok</strong> — yan bağ (tek yön; karşılıklı çağrı
          değil)
          {typeof cascadeCount === 'number' && cascadeCount > 0
            ? ` · ${cascadeCount}`
            : ''}
        </span>
      </span>
      <span className="path-legend-note">
        Ok ucu etkilenen servise bakar · üzerine gelince yalnız o düğümün
        bağları
        {truncated ? ' · görünüm kısaltıldı' : ''}
      </span>
    </div>
  )
}

type FilterHintProps = {
  filterLabel: string
  matchCount: number
  deepestHop: number
  bridgeCount: number
  hop1EmptyButDeeper: boolean
}

export function ProjectFilterHint({
  filterLabel,
  matchCount,
  deepestHop,
  bridgeCount,
  hop1EmptyButDeeper,
}: FilterHintProps) {
  if (matchCount === 0) {
    return (
      <p className="map-filter-hint empty">
        Bu etki zincirinde <strong>{filterLabel}</strong> altındaki etkilenen
        servis yok — başka proje seçin veya filtreyi kaldırın.
      </p>
    )
  }
  if (hop1EmptyButDeeper) {
    return (
      <p className="map-filter-hint">
        <strong>{filterLabel}</strong> altındaki servisler doğrudan (1.
        katman) etkilenmiyor. Etki <strong>{deepestHop}. katmanda</strong>{' '}
        görünüyor ({matchCount} servis). Kesik gri çerçeve = başka projedeki
        ara yol; kalın yeşil çerçeve = {filterLabel} eşleşen servis.
      </p>
    )
  }
  return (
    <p className="map-filter-hint">
      Yalnız <strong>{filterLabel}</strong> altındaki etkilenen servisler (
      {matchCount}
      {bridgeCount > 0 ? ` · ${bridgeCount} ara yol` : ''}).
    </p>
  )
}
