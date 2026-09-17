/**
 * Map düğüm kartında servis satırı (+N).
 * Kullanan: `ProcessFlowMap` node renderer.
 */
export function ProcessNodeServicePreview({ services }: { services: string[] }) {
  if (services.length === 0) return null
  const title = services.join(', ')
  const extra = services.length - 1
  return (
    <span className="pf-node-svc-row">
      <span className="pf-node-svc" title={title}>
        {services[0]}
      </span>
      {extra > 0 ? (
        <span className="pf-node-svc-more" title={title}>
          +{extra} servis
        </span>
      ) : null}
    </span>
  )
}
