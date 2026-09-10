import type { ProcessFlowGraph } from '../types'

export type ProcessFlowSummary = {
  title: string
  subtitle: string
  statsLine: string
}

export function summarizeProcessFlow(graph: ProcessFlowGraph): ProcessFlowSummary {
  const reals = graph.nodes.filter((n) => n.kind !== 'dummy')
  const decisionCount = reals.filter((n) => n.kind === 'decision').length
  const serviceCount = new Set(reals.flatMap((n) => n.services).filter(Boolean)).size

  const title = graph.descriptionTr || graph.label || graph.catalogNo || graph.no
  const parName = graph.parName || graph.no
  const catalogNo = graph.catalogNo || graph.no
  const subtitle = `${catalogNo} · ${parName}`

  const statsParts: string[] = []
  if (decisionCount > 0) statsParts.push(`${decisionCount} karar`)
  if (serviceCount > 0) statsParts.push(`${serviceCount} servis`)
  const statsLine = statsParts.join(' · ')

  return { title, subtitle, statsLine }
}
