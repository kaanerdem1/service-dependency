import type { ProcessFlowNodeKind } from '../../../types'

export const RAIL_PAD = 36
export const RAIL_GAP = 28
export const CORNER = 36

export const RANK_SEP = 250
export const NODE_SEP = 108
export const FAN_GAP = 122
export const COL_GAP = 112
export const NODE_W = 168
export const NODE_H = 76
export const GATEWAY_H = 108

export const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  subprocess: 'Alt süreç',
  dummy: 'Adım',
  other: 'Adım',
}

export const SINK_COPY_GAP_X = 40
export const SINK_COPY_OFFSET_Y = -52
