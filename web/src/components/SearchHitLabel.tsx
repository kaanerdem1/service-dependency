import type { Service } from '../types'

export function rankServiceHits(rows: Service[], query: string): Service[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return [...rows].sort((a, b) => {
    const d = scoreName(a.name, q) - scoreName(b.name, q)
    return d !== 0 ? d : a.name.localeCompare(b.name)
  })
}

function scoreName(name: string, q: string): number {
  const n = name.toLowerCase()
  if (n.startsWith(q)) return 0
  if (n.includes(q)) return 1
  return 2
}

export function SearchHitLabel({
  name,
  query,
  id,
}: {
  name: string
  query: string
  id?: string
}) {
  return (
    <span className="sc-hit-copy">
      <span className="sc-hit-name">{highlightQuery(name, query)}</span>
      {id ? <span className="sc-hit-id">{id}</span> : null}
    </span>
  )
}

function highlightQuery(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}
