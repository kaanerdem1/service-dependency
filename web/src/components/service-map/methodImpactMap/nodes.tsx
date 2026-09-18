import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import {
  radialAnchorOffset,
  radialLabelDomStyle,
  radialLabelSide,
  radialNodeHitStyle,
  wrapRadialName,
} from '../../../impact/mapLayout'
import type { MapNodeData } from './types'

function MapNodeView({ data, xPos, yPos }: NodeProps<MapNodeData>) {
  const isCenter = data.kind === 'center'
  const isCollapsed = data.kind === 'collapsed'
  const radial = Boolean(data.radialDot)
  const liveAngle = (() => {
    if (!radial || isCenter) return data.radialAngle ?? 0
    if (typeof data.radialCx === 'number' && typeof data.radialCy === 'number') {
      const mid = radialAnchorOffset(false)
      return Math.atan2(yPos + mid.y - data.radialCy, xPos + mid.x - data.radialCx)
    }
    return data.radialAngle ?? 0
  })()
  const labelSide = radial
    ? data.radialLabelSide ?? radialLabelSide(liveAngle, isCenter)
    : null
  const label = (
    <span
      className={`dd-node-label${data.showTip ? ' name-tip is-short' : ''}`}
      data-tip={data.showTip ? data.fullLabel : undefined}
    >
      {data.label}
    </span>
  )
  const radialHit = radial
    ? { ...radialNodeHitStyle(isCenter), position: 'relative' as const, overflow: 'visible' as const }
    : undefined
  const hopLine =
    radial && !isCenter && !isCollapsed
      ? `${data.hop}. katman`
      : radial && isCollapsed
        ? `Aç · ${data.count ?? 0} öğe daha`
        : null
  const radialLabelStyle =
    radial && labelSide
      ? radialLabelDomStyle(
          labelSide,
          data.fullLabel || data.label,
          isCenter,
          hopLine,
          data.radialLabelGapBoost ?? 0,
          data.hop ?? 1,
        )
      : undefined

  return (
    <div
      className={[
        'dd-node method-map-node',
        `size-${data.size}`,
        isCenter && 'center',
        isCollapsed && 'collapsed',
        data.kind === 'service' && 'svc-agg',
        radial && 'radial-dot',
      ]
        .filter(Boolean)
        .join(' ')}
      style={radial ? { width: 'auto', height: 'auto', overflow: 'visible' } : undefined}
    >
      <Handle type="target" position={Position.Left} id="in" className="dd-handle" />
      <div className="dd-node-ring" />
      <div className="dd-node-body">
        {!radial && (
          <>
            {label}
            <span className="dd-node-hop">{data.sub}</span>
            {!isCenter && !isCollapsed && (
              <span className="dd-node-hop">{data.hop}. katman</span>
            )}
            {isCollapsed && (
              <span className="dd-node-hop">
                Aç · {data.count} öğe daha
              </span>
            )}
          </>
        )}
      </div>
      {radial && (
        <div className="dd-radial-shell" style={radialHit}>
          <span
            className={`dd-radial-core${isCenter ? ' is-center' : ''}`}
            aria-hidden
          />
          {isCenter ? (
            <span
              className="dd-radial-label is-center-label"
              style={radialLabelDomStyle(
                'below',
                data.fullLabel || data.label,
                true,
                'Merkez',
              )}
            >
              <span className="dd-radial-kicker is-center-badge">Merkez</span>
              {wrapRadialName(data.fullLabel || data.label).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          ) : (
            <span
              className={[
                'dd-radial-label',
                data.showTip && 'name-tip is-short',
              ]
                .filter(Boolean)
                .join(' ')}
              style={radialLabelStyle}
              data-tip={data.showTip ? data.fullLabel : undefined}
            >
              {hopLine ? (
                <span className="dd-radial-hop">{hopLine}</span>
              ) : null}
              {wrapRadialName(data.fullLabel || data.label).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="out" className="dd-handle" />
    </div>
  )
}

export const methodImpactNodeTypes = { methodNode: memo(MapNodeView) }
