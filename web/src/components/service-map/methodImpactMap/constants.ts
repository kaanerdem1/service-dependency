import { MarkerType } from 'reactflow'

export const LEFT_X = 40
export const MAX_VISIBLE_PER_LAYER = 4
export const RADIAL_HOP1_CAP = 8
export const MIN_COLLAPSE_COUNT = 3

export const EDGE_COLOR = '#2f6f55'
export const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
  color: EDGE_COLOR,
} as const
