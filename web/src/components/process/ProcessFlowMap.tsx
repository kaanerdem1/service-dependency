/**
 * Tam BPM akışı canvas — React Flow.
 *
 * Uygulama: `processFlowMap/ProcessFlowMapCore.tsx` + parçalar.
 * İlgili: [rehber.md](./rehber.md)
 */
import { ReactFlowProvider } from 'reactflow'
import { ProcessFlowMapCore } from './processFlowMap/ProcessFlowMapCore.js'
import type { ProcessFlowMapProps } from './processFlowMap/types.js'

export type { ProcessFlowMapProps } from './processFlowMap/types.js'

export function ProcessFlowMap(props: ProcessFlowMapProps) {
  return (
    <ReactFlowProvider>
      <ProcessFlowMapCore key={props.graph.no} {...props} />
    </ReactFlowProvider>
  )
}
