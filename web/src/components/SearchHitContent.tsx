export type SearchHitKind = 'service' | 'method' | 'action'

const TAG_LABEL: Record<SearchHitKind, string> = {
  service: 'Servis',
  method: 'Metod',
  action: 'Eylem',
}

type Props = {
  title: string
  kind: SearchHitKind
  metaId?: string
  subtitle?: string
  tip?: string
}

/** Sidebar dropdown + ⌘K ortak satır düzeni */
export function SearchHitContent({ title, kind, metaId, subtitle, tip }: Props) {
  return (
    <>
      <span className="search-hit-main">
        <span
          className={`search-hit-text${tip ? ' name-tip is-short' : ''}`}
          {...(tip ? { 'data-tip': tip } : {})}
        >
          <strong>{title}</strong>
        </span>
        <span className="search-hit-accessory">
          {metaId ? <span className="search-hit-id">{metaId}</span> : null}
          <span className={`hit-tag hit-tag-${kind}`}>
            {TAG_LABEL[kind]}
          </span>
        </span>
      </span>
      {subtitle ? (
        <span
          className={`search-hit-sub method-hit-svc${tip && kind === 'method' ? '' : ''}`}
          {...(kind === 'method' && subtitle ? { title: subtitle } : {})}
        >
          {subtitle}
        </span>
      ) : null}
    </>
  )
}
