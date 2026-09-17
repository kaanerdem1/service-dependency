/**
 * Rota modu — seçili ziyaret adımları yatay şerit.
 * Kullanan: `ProcessFlowRouteBuilder.tsx`.
 */
import type { ProcessFlowGraph } from '../../types'
import type { RouteVisit } from './processUserRoute'

export function ProcessFlowRouteBar({
  graph,
  visits,
  selectedIndex,
  onSelect,
}: {
  graph: ProcessFlowGraph
  visits: RouteVisit[]
  selectedIndex?: number
  onSelect: (index: number) => void
}) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  return (
    <nav className="pf-route-bar" aria-label="Oluşturulan rota">
      {visits.map((visit, index) => (
        <span className="pf-route-bar-part" key={visit.visitId}>
          {index > 0 ? (
            visit.incomingLabel?.trim() ? (
              <span className="pf-route-bar-edge">{visit.incomingLabel.trim()}</span>
            ) : (
              <span className="pf-route-bar-sep" aria-hidden />
            )
          ) : null}
          <button
            type="button"
            className={`pf-route-bar-step${selectedIndex === index ? ' is-selected' : ''}`}
            onClick={() => onSelect(index)}
            title={byId.get(visit.nodeId)?.name ?? visit.nodeId}
          >
            <span>{index + 1}</span>
            {byId.get(visit.nodeId)?.name ?? visit.nodeId}
            {visit.ordinal > 1 ? <small>{visit.ordinal}. ziyaret</small> : null}
          </button>
        </span>
      ))}
    </nav>
  )
}
