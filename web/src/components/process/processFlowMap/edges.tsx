import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  type EdgeTypes,
} from 'reactflow'
import { classifyRoute, kitEdgePath } from './edgeGeometry.js'
import type { ProcessEdgeData } from './types.js'

function ProcessEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  label,
  data,
}: EdgeProps<ProcessEdgeData>) {
  const route = data?.route ?? classifyRoute(sourceX, targetX)
  const bandMinY = data?.bandMinY ?? Math.min(sourceY, targetY)
  const bandMaxY = data?.bandMaxY ?? Math.max(sourceY, targetY)
  const { path: edgePath, labelX, labelY } = kitEdgePath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    route,
    data?.originalId ?? id,
    data?.railY,
    bandMinY,
    bandMaxY,
    data?.lane ?? 0,
    data?.slot ?? 0,
  )
  const active = !!data?.active
  const dim = !!data?.dim
  const stroke = active
    ? '#2f6fed'
    : route === 'back'
      ? '#e05b4f'
      : route === 'jump'
        ? '#2f6fed'
        : '#a8b0bc'
  const dash = active ? undefined : route === 'direct' ? undefined : '5 4'
  const width = active ? 2.5 : route === 'direct' ? 1.5 : 1.3
  const opacity = active ? 1 : dim ? 0.16 : route === 'direct' ? 1 : 0.55
  const stateClass = active ? ' is-onpath' : dim ? ' is-dim' : ''
  // Akış yönünü belirtmek için label'ın hemen öncesine ve sonrasına küçük
  // ok işaretleri koyulur — "akan" animasyon yerine sabit, okunması kolay
  // bir yön ipucu. Ray tabanlı (jump/back) rotalarda etiketin durduğu segment
  // her zaman yataydır; 'direct' rotada ise gerçek eğime göre döndürülür ki
  // eğik bir çizgide yatay ok görünmesin.
  const dirSign = targetX >= sourceX ? 1 : -1
  const angleDeg =
    route === 'direct'
      ? (Math.atan2(targetY - sourceY, targetX - sourceX) * 180) / Math.PI
      : dirSign > 0
        ? 0
        : 180
  const angleRad = (angleDeg * Math.PI) / 180
  const ux = Math.cos(angleRad)
  const uy = Math.sin(angleRad)
  const span = Math.abs(targetX - sourceX) + Math.abs(targetY - sourceY)
  const showChevrons = !!label && span > 70
  const chevronGap = 20
  const preChevron = { x: labelX - ux * chevronGap, y: labelY - uy * chevronGap }
  const postChevron = { x: labelX + ux * chevronGap, y: labelY + uy * chevronGap }
  const labelTitle = [
    typeof label === 'string' ? label : undefined,
    data?.transitionServices?.length
      ? `Geçiş servisi: ${data.transitionServices.join(', ')}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={active ? 'url(#pf-arrow-active)' : `url(#pf-arrow-${route})`}
        style={{ ...style, stroke, strokeWidth: width, strokeDasharray: dash, opacity }}
        interactionWidth={28}
      />
      {label ? (
        <EdgeLabelRenderer>
          {showChevrons ? (
            <span
              className={`pf-edge-chevron${stateClass}`}
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                color: stroke,
                transform: `translate(-50%, -50%) translate(${preChevron.x}px, ${preChevron.y}px) rotate(${angleDeg}deg)`,
              }}
              aria-hidden
            >
              ›
            </span>
          ) : null}
          <div
            className={`pf-edge-label${stateClass}${data?.transitionServices?.length ? ' has-transition-svc' : ''}`}
            title={labelTitle || undefined}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
          {showChevrons ? (
            <span
              className={`pf-edge-chevron${stateClass}`}
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                color: stroke,
                transform: `translate(-50%, -50%) translate(${postChevron.x}px, ${postChevron.y}px) rotate(${angleDeg}deg)`,
              }}
              aria-hidden
            >
              ›
            </span>
          ) : null}
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
export const processFlowEdgeTypes: EdgeTypes = { processEdge: memo(ProcessEdge) }

export function EdgeMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
      <defs>
        <marker id="pf-arrow-direct" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a8b0bc" />
        </marker>
        <marker id="pf-arrow-jump" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f6fed" />
        </marker>
        <marker id="pf-arrow-back" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#e05b4f" />
        </marker>
        <marker id="pf-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f6fed" />
        </marker>
      </defs>
    </svg>
  )
}

export function FullscreenGlyph({ expanded }: { expanded: boolean }) {
  return (
    <span className="tl-zoom-glyph" aria-hidden>
      {expanded ? (
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path
            d="M4.5 1.5H1.5v3M7.5 1.5h3v3M1.5 7.5v3h3M10.5 7.5v3h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path
            d="M1.5 4.5V1.5h3M10.5 4.5V1.5h-3M1.5 7.5v3h3M10.5 7.5v3h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  )
}