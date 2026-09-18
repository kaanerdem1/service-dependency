import { memo } from 'react'
import {
  BaseEdge,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Position,
} from 'reactflow'
import {
  RADIAL_DOT_R,
  RADIAL_EDGE_END_GAP,
  radialEdgeGeometry,
} from '../../../impact/mapLayout'
import type { FanEdgeData } from './types'

/**
 * Dar alanda çoklu kenar: boşluğa (sağa / yayılı) soft fan.
 * Aynı kolon → sağa büyük yay; kolonlar arası → eğrilik ofseti.
 */
function FanEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<FanEdgeData>) {
  const fan = data?.fanIndex ?? 0
  const fanCount = Math.max(1, data?.fanCount ?? 1)
  const mid = (fanCount - 1) / 2
  const spread = (fan - mid) * 26
  const sameCol =
    data?.sameColumn === true || Math.abs(sourceX - targetX) < 28

  let edgePath: string
  if (sameCol) {
    // Tek yön ok (yalnız markerEnd) — sağ boşluğa yumuşak yay
    const bulge =
      Math.max(sourceX, targetX) + 118 + fan * 38 + Math.abs(spread) * 0.45
    const y1 = sourceY + spread * 0.28
    const y2 = targetY + spread * 0.28
    edgePath = `M ${sourceX},${sourceY} C ${bulge},${y1} ${bulge},${y2} ${targetX},${targetY}`
  } else {
    const curvature = 0.52 + Math.abs(fan - mid) * 0.04
    const [path] = getBezierPath({
      sourceX,
      sourceY: sourceY + spread * 0.2,
      targetX,
      targetY: targetY + spread * 0.2,
      sourcePosition,
      targetPosition,
      curvature,
    })
    edgePath = path
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
      interactionWidth={28}
    />
  )
}

/** Radial: eğri + yön oku — React Flow handle koordinatları sürüklemede güncellenir */
function RadialEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
}: EdgeProps<FanEdgeData>) {
  const tr = data?.tr ?? RADIAL_DOT_R
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const tx = targetX - ux * (tr + RADIAL_EDGE_END_GAP)
  const ty = targetY - uy * (tr + RADIAL_EDGE_END_GAP)
  const geom = radialEdgeGeometry(sourceX, sourceY, tx, ty, 0, 0)
  const fill = (style?.stroke as string) || '#6e6e6e'
  return (
    <>
      <BaseEdge
        id={id}
        path={geom.path}
        style={style}
        interactionWidth={28}
      />
      <polygon
        className="dd-radial-mid-arrow"
        points="-9,-7 16,0 -9,7 -2,0"
        fill={fill}
        transform={`translate(${geom.mx},${geom.my}) rotate(${(geom.angle * 180) / Math.PI})`}
        pointerEvents="none"
      />
    </>
  )
}

export const impactMapEdgeTypes = { fan: memo(FanEdge), radial: memo(RadialEdge) }

/** Hover/focus kenarında hop rozeti */
export function FocusEdgeHopChip({
  edge,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: {
  edge: Edge
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition?: Position
  targetPosition?: Position
}) {
  const hop = (edge.data as FanEdgeData | undefined)?.hop
  if (hop == null) return null
  const mx = (sourceX + targetX) / 2
  const my = (sourceY + targetY) / 2
  const kind = (edge.data as FanEdgeData | undefined)?.kind
  return (
    <div
      className={`map-edge-hop-chip${kind === 'cascade' ? ' is-cascade' : ''}`}
      style={{
        transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)`,
      }}
    >
      {hop}. katman
    </div>
  )
}
