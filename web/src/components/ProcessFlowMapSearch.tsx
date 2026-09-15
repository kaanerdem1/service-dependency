type Props = {
  query: string
  onQueryChange: (value: string) => void
  matchCount: number
  matchIndex: number
  onPrev: () => void
  onNext: () => void
  placeholder?: string
}

export function ProcessFlowMapSearch({
  query,
  onQueryChange,
  matchCount,
  matchIndex,
  onPrev,
  onNext,
  placeholder = 'Süreçte Ara',
}: Props) {
  return (
    <div className="pf-map-search" role="search" aria-label="Süreçte ara">
      <svg className="pf-map-search-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.35" />
        <path d="M10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          if (event.shiftKey) onPrev()
          else onNext()
        }}
      />
      {query ? (
        <button
          type="button"
          className="pf-map-search-clear"
          aria-label="Aramayı temizle"
          title="Aramayı temizle"
          onClick={() => onQueryChange('')}
        >
          ×
        </button>
      ) : null}
      {query.trim() ? (
        <span className="pf-map-search-count" aria-live="polite">
          {matchCount ? Math.min(matchIndex + 1, matchCount) : 0} / {matchCount}
        </span>
      ) : null}
      <button
        type="button"
        className="pf-map-search-nav"
        aria-label="Önceki eşleşme"
        title="Önceki eşleşme (Shift+Enter)"
        disabled={matchCount === 0}
        onClick={onPrev}
      >
        ↑
      </button>
      <button
        type="button"
        className="pf-map-search-nav"
        aria-label="Sonraki eşleşme"
        title="Sonraki eşleşme (Enter)"
        disabled={matchCount === 0}
        onClick={onNext}
      >
        ↓
      </button>
    </div>
  )
}
