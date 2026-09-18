import { memo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { layoutSpring, listItemTransition } from '../../../motion/config'
import {
  radialAnchorOffset,
  radialLabelDomStyle,
  radialLabelSide,
  radialNodeHitStyle,
  wrapRadialName,
} from '../../../impact/mapLayout'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { MethodBadgeData, RingGuideData, ServiceNodeData } from './types'

function radialHopLine(
  data: ServiceNodeData,
  isCenter: boolean,
  isCollapsed: boolean,
): string | null {
  if (isCenter) return null
  if (data.kind === 'cluster') return null
  if (isCollapsed) return `Aç · ${data.count ?? 0} servis daha`
  if (data.bridge) return 'Ara yol · filtre dışı'
  if (data.match) return `${data.hop}. katman · eşleşen`
  if (data.hop <= 1) return null
  return `${data.hop}. katman`
}

function RingGuideView({ data }: NodeProps<RingGuideData>) {
  return (
    <div
      className="map-radial-ring"
      style={{ width: data.radius * 2, height: data.radius * 2 }}
      aria-hidden
    />
  )
}

function ServiceNodeView({ id, data, xPos, yPos }: NodeProps<ServiceNodeData>) {
  const reduced = useReducedMotion()
  const isCenter = data.kind === 'center'
  const isCollapsed = data.kind === 'collapsed' || data.kind === 'cluster'
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
  const noteCount = data.noteCount ?? 0
  const showNoteBadge =
    !radial &&
    !isCollapsed &&
    (isCenter || data.kind === 'service')
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
  const hopLine = radial ? radialHopLine(data, isCenter, isCollapsed) : null
  const radialLabelStyle =
    radial && labelSide
      ? radialLabelDomStyle(
          labelSide,
          data.label || data.fullLabel,
          isCenter,
          hopLine,
          data.radialLabelGapBoost ?? 0,
          data.hop ?? 1,
        )
      : undefined

  const reveal =
    data.revealIndex !== undefined && !reduced
  const nodeClass = [
    'dd-node',
    `size-${data.size}`,
    isCenter && 'center',
    isCollapsed && 'collapsed',
    data.kind === 'cluster' && 'cluster',
    data.bridge && 'bridge',
    data.match && 'match',
    !data.bridge && !data.match && data.hop > 1 && 'indirect',
    radial && 'radial-dot',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.div
      className={nodeClass}
      style={radial ? { width: 'auto', height: 'auto', overflow: 'visible' } : undefined}
      data-motion={reveal ? 'node-layer-reveal' : undefined}
      initial={reveal ? { opacity: 0, y: 14, scale: 0.94 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reveal ? listItemTransition(data.revealIndex!) : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="dd-handle"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in-top"
        className="dd-handle dir"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="in-right"
        className="dd-handle dir"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="in-bottom"
        className="dd-handle dir"
      />
      {isCenter ? (
        <motion.div
          className="dd-node-ring"
          layoutId="impact-pivot-ring"
          transition={layoutSpring}
        />
      ) : (
        <div className="dd-node-ring" />
      )}
      {showNoteBadge && (
        <button
          type="button"
          className={`dd-note-badge nodrag nopan${noteCount > 0 ? ' has-count' : ''}`}
          title={noteCount > 0 ? `${noteCount} not` : 'Not ekle'}
          aria-label={noteCount > 0 ? `${noteCount} not` : 'Not ekle'}
          onClick={(e) => {
            e.stopPropagation()
            window.dispatchEvent(
              new CustomEvent('map-open-notes', {
                detail: { serviceId: id },
              }),
            )
          }}
        >
          {noteCount > 0 ? <span>{noteCount}</span> : <span aria-hidden>+</span>}
        </button>
      )}
      <div className="dd-node-body">
        {!radial && (
          <>
            {label}
            {!isCenter && !isCollapsed && (
              <span className="dd-node-hop">
                {data.bridge
                  ? 'ara yol · filtre dışı'
                  : data.match
                    ? `${data.hop}. katman · eşleşen`
                    : `${data.hop}. katman`}
              </span>
            )}
            {isCollapsed && (
              <span className="dd-node-hop dd-node-open-radial">
                Radial&apos;da aç · +{data.count} servis
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
              {wrapRadialName(data.fullLabel || data.label, 24, 2).map(
                (line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ),
              )}
            </span>
          ) : (
            <span
              className={[
                'dd-radial-label',
                labelSide === 'west' && 'is-west',
                labelSide === 'east' && 'is-east',
                data.showTip && 'name-tip is-short',
              ]
                .filter(Boolean)
                .join(' ')}
              style={radialLabelStyle}
              data-tip={data.showTip ? data.fullLabel : undefined}
            >
              {hopLine
                ? wrapRadialName(hopLine, 16).map((line, i) => (
                    <span key={`hop-${i}-${line}`} className="dd-radial-hop">
                      {line}
                    </span>
                  ))
                : null}
              {wrapRadialName(
                data.kind === 'cluster'
                  ? `+${data.count ?? 0} servis`
                  : data.fullLabel || data.label,
                labelSide === 'west' ? 18 : 36,
                2,
              ).map((line, i) => (
                <span key={`${i}-${line}`} className="dd-radial-label-line">
                  {line}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="dd-handle"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="out-top"
        className="dd-handle dir"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="out-left"
        className="dd-handle dir"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        className="dd-handle dir"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="side-out"
        className="dd-handle side"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="side-in"
        className="dd-handle side"
      />
    </motion.div>
  )
}

function MethodBadgeView({ data }: NodeProps<MethodBadgeData>) {
  return (
    <div
      className={`dd-method-badge ${data.expanded ? 'expanded' : ''}`}
      title={`${data.count} metod çağırıyor — listeyi aç`}
    >
      {data.count} metod
    </div>
  )
}

export const impactMapNodeTypes = {
  serviceNode: memo(ServiceNodeView),
  methodBadge: memo(MethodBadgeView),
  radialRing: memo(RingGuideView),
}
