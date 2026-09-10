import type { ProcessFlowGraph } from '../types'

function isDummy(id: string) {
  return id.startsWith('d:')
}

export type ProcessFlowSummary = {
  title: string
  subtitle: string
  statsLine: string
}

export function summarizeProcessFlow(graph: ProcessFlowGraph): ProcessFlowSummary {
  const reals = graph.nodes.filter((n) => n.kind !== 'dummy')
  const edges = graph.edges.filter((e) => !isDummy(e.from) && !isDummy(e.to))
  const decisionCount = reals.filter((n) => n.kind === 'decision').length
  const serviceCount = new Set(reals.flatMap((n) => n.services).filter(Boolean)).size

  const title = graph.descriptionTr || graph.label || graph.catalogNo || graph.no
  const parName = graph.parName || graph.no
  const catalogNo = graph.catalogNo || graph.no
  const subtitle = `${catalogNo} · ${parName}`

  const statsParts = [
    `${reals.length} adım`,
    `${edges.length} geçiş`,
  ]
  if (decisionCount > 0) statsParts.push(`${decisionCount} karar`)
  if (serviceCount > 0) statsParts.push(`${serviceCount} servis`)
  const statsLine = statsParts.join(' · ')

  return { title, subtitle, statsLine }
}
