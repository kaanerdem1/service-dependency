/**
 * Eski POC: KTF için iframe/HTML, diğer süreçler için keşif canvas.
 * Üretim tam akış: `ProcessFlowMap` / `processFlowMap/buildGraph.ts`.
 */
import { ProcessFlowCanvas } from './ProcessFlowCanvas'
import type { ProcessFlowGraph } from '../../types'

type Props = { graph: ProcessFlowGraph }

/** 105116: onaylı HTML SVG diyagram birebir. Diğer POC süreçler mevcut canvas. */
export function ProcessDiagram({ graph }: Props) {
  if (graph.no === '105116') {
    return (
      <iframe
        className="pf-html-frame"
        title="KTF Düzenleme süreç akışı"
        src="/ktf-duzenleme-surec-akisi.html"
      />
    )
  }
  return <ProcessFlowCanvas key={graph.no} graph={graph} />
}
