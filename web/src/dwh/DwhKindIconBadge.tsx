export type DwhKind = 'table' | 'report' | 'subquery'

export const DWH_KIND_ICONS = {
  table: new URL('../assets/table.png', import.meta.url).href,
  report: new URL('../assets/file.png', import.meta.url).href,
  subquery: new URL('../assets/sql-server.png', import.meta.url).href,
}

export function DwhKindIconBadge({ kind }: { kind: DwhKind }) {
  return (
    <span className={`dwh-kind-badge is-dwh-${kind}`} aria-hidden>
      <img src={DWH_KIND_ICONS[kind]} alt="" aria-hidden />
    </span>
  )
}
