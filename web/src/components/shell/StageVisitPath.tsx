/**
 * Servis haritası üstündeki “ziyaret yolu” (breadcrumb).
 *
 * Ne yapar: Geri/ileri yığınındaki servis adlarını tıklanabilir gösterir.
 * Ne yapmaz: Geçmişi tutmaz — `onSelect(index)` App/`useVisitHistory`’ye gider.
 * İlgili: shell/rehber.md
 */
import type { VisitPathStep } from '../../navigation/useVisitHistory'

export function StageVisitPath({
  steps,
  currentIndex,
  onSelect,
}: {
  steps: VisitPathStep[]
  currentIndex: number
  onSelect: (index: number) => void
}) {
  if (steps.length === 0) return null

  return (
    <nav className="stage-visit-path" aria-label="Ziyaret yolu">
      <span className="stage-visit-path-label">Ziyaret yolu</span>
      <ol className="stage-visit-path-list">
        {steps.map((step, i) => {
          const current = i === currentIndex
          return (
            <li key={`${step.id}-${i}`} className="stage-visit-path-item">
              {i > 0 && (
                <span className="stage-visit-path-sep" aria-hidden>
                  /
                </span>
              )}
              <button
                type="button"
                className={`stage-visit-path-btn${current ? ' is-current' : ''}`}
                title={step.name}
                aria-current={current ? 'page' : undefined}
                onClick={() => onSelect(i)}
              >
                {step.name}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
