/**
 * Süreç kataloğu listesi — İş akışları drawer'ının üst bölümü.
 *
 * Ne yapar: Öne çıkan (featured) süreçleri veya arama sonucu dönen süreçleri
 *   tıklanabilir bir liste olarak gösterir; seçili süreç `is-active` vurgulanır.
 * Ne yapmaz: Veri çekmez (liste üstten `processes` prop'u ile gelir),
 *   arama/filtre mantığı içermez — o iş `WorkflowsPanel` üstündeki arama kutusunda.
 * İlgili ekran: Sol "İş akışları" drawer'ı, "SÜREÇLER" bölümü.
 */
import { TreeKindIcon } from '../TreeKindIcon'
import type { ProcessCatalogItem } from '../../types'

type Props = {
  processes: ProcessCatalogItem[]
  activeProcessNo?: string
  onOpenProcess: (processNo: string) => void
}

export function ProcessCatalogList({ processes, activeProcessNo, onOpenProcess }: Props) {
  return (
    <div className="sc-process-block sc-process-catalog-block">
      <div className="sc-section-label">Süreçler</div>
      {processes.length === 0 ? (
        <p className="sc-process-hint">Liste yüklenemedi veya boş.</p>
      ) : (
        <ul className="sc-process-list">
          {processes.map((p) => (
            <li key={p.no}>
              <button
                type="button"
                className={`sc-process-item${activeProcessNo === p.no ? ' is-active' : ''}`}
                onClick={() => onOpenProcess(p.no)}
              >
                <TreeKindIcon kind="process" size={14} title="Süreç" />
                <span className="sc-process-item-copy">
                  <span className="sc-process-item-name">
                    {p.descriptionTr || p.name || p.no}
                  </span>
                  <span className="sc-process-item-no">{p.no}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
