import type { ProcessFlowGraph } from '../types'

export type ProcessFlowSummary = {
  title: string
  subtitle: string
  metaLine: string
  statsLine: string
}

function formatUpdatedAt(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function summarizeProcessFlow(graph: ProcessFlowGraph): ProcessFlowSummary {
  const reals = graph.nodes.filter((n) => n.kind !== 'dummy')
  const decisionCount = reals.filter((n) => n.kind === 'decision').length
  const serviceCount = new Set(reals.flatMap((n) => n.services).filter(Boolean)).size

  const title = graph.descriptionTr || graph.label || graph.catalogNo || graph.no
  const parName = graph.parName || graph.no
  const catalogNo = graph.catalogNo || graph.no
  const processType = graph.processType?.trim() || 'BPM'
  const subtitle = `${catalogNo} · ${parName} · ${processType}`

  const metaParts: string[] = []
  if (graph.processOwnerIt?.trim()) metaParts.push(`IT sahibi: ${graph.processOwnerIt.trim()}`)
  if (graph.processOwnerBusiness?.trim()) {
    metaParts.push(`İş sahibi: ${graph.processOwnerBusiness.trim()}`)
  }
  const updated = formatUpdatedAt(graph.updatedAt)
  if (updated) metaParts.push(`Son güncelleme: ${updated}`)
  const metaLine = metaParts.join(' · ')

  const statsParts: string[] = []
  if (decisionCount > 0) statsParts.push(`${decisionCount} karar`)
  if (serviceCount > 0) statsParts.push(`${serviceCount} servis`)
  const statsLine = statsParts.join(' · ')

  return { title, subtitle, metaLine, statsLine }
}
