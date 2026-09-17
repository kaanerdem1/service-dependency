/**
 * İş akışları drawer arama kutusu ve sonuç listesi.
 *
 * Ne yapar: Servis/süreç metin araması UI’si; en az 2 karakterde sonuç gösterir.
 * Ne yapmaz: API çağırmaz — `hits` / `processHits` üstten gelir.
 * İlgili: workflows/rehber.md
 */
import type { RefObject } from 'react'
import { SearchHitLabel } from '../search/SearchHitLabel'
import { TreeKindIcon } from '../sidebar/TreeKindIcon'
import type { ProcessCatalogItem, Service } from '../../types'

type Props = {
  searchRef: RefObject<HTMLInputElement | null>
  query: string
  onQueryChange: (value: string) => void
  searching: boolean
  hits: Service[]
  processHits: ProcessCatalogItem[]
  canEdit: boolean
  onOpenProcess: (processNo: string) => void
  onOpenService: (serviceId: string) => void
  onAddToRoot: (serviceId: string, name: string) => void
}

export function WorkflowsSearch({
  searchRef,
  query,
  onQueryChange,
  searching,
  hits,
  processHits,
  canEdit,
  onOpenProcess,
  onOpenService,
  onAddToRoot,
}: Props) {
  const searchingMode = query.trim().length >= 2
  return (
    <>
        <div className="shortcuts-drawer-search">
          <svg className="sc-search-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.35" />
            <path d="M10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Servis veya süreç ara…"
            aria-label="Servis veya süreç ara"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="sc-search-clear"
              aria-label="Aramayı temizle"
              onClick={() => onQueryChange('')}
            >
              ×
            </button>
          ) : null}
        </div>

        {searchingMode ? (
          <div className="sc-search-hits" role="listbox" aria-label="Arama sonuçları">
            <p className="sc-search-status">
              {canEdit
                ? '+ köke ekler; sonra bir akışın üzerine bırakın'
                : 'Sonuçtan servisi açın'}
            </p>
            {searching ? (
              <p className="sc-search-status">Aranıyor…</p>
            ) : hits.length === 0 && processHits.length === 0 ? (
              <p className="sc-search-status">Sonuç yok</p>
            ) : (
              <>
                {processHits.length > 0 ? (
                  <>
                    <p className="sc-search-status">Süreçler</p>
                    {processHits.map((p) => (
                      <div key={p.no} className="sc-hit-row">
                        <button
                          type="button"
                          className="sc-hit-main"
                          title={p.descriptionTr || p.name || p.no}
                          onClick={() => onOpenProcess(p.no)}
                        >
                          <TreeKindIcon kind="process" size={13} />
                          <SearchHitLabel
                            name={p.descriptionTr || p.name || p.no}
                            query={query}
                            id={p.no}
                          />
                        </button>
                      </div>
                    ))}
                  </>
                ) : null}
                {hits.length > 0 ? (
                  <>
                    {processHits.length > 0 ? <p className="sc-search-status">Servisler</p> : null}
                    {hits.map((s) => (
                      <div key={s.id} className="sc-hit-row">
                        <button
                          type="button"
                          className="sc-hit-main"
                          title={s.name}
                          onClick={() => onOpenService(s.id)}
                        >
                          <TreeKindIcon kind="service" size={13} />
                          <SearchHitLabel name={s.name} query={query} id={s.id} />
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            className="sc-fav-btn"
                            title="Köke ekle"
                            aria-label="Köke ekle"
                            onClick={() => onAddToRoot(s.id, s.name)}
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

    </>
  )
}
