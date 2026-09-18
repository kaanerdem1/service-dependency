import { memo } from 'react'
import {
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
  type NodeTypes,
} from 'reactflow'
import { ProcessNodeServicePreview } from '../ProcessNodeServicePreview.js'
import {
  NOTE_MAX_HEIGHT,
  NOTE_MAX_WIDTH,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
} from '../processFlowNotes.js'
import { KIND_LABEL } from './constants.js'
import type { ProcessNodeData } from './types.js'

export type NoteNodeData = {
  text: string
  collapsed: boolean
  expandedWidth?: number
  expandedHeight?: number
  onChange: (text: string) => void
  onRemove: () => void
  onResizeEnd: () => void
  onToggleCollapse: () => void
}


function Ports() {
  return (
    <>
      <Handle id="l" type="target" position={Position.Left} className="pf-h" />
      <Handle id="r" type="source" position={Position.Right} className="pf-h" />
      <Handle id="ti" type="target" position={Position.Top} className="pf-h" />
      <Handle id="b" type="source" position={Position.Bottom} className="pf-h" style={{ left: '62%' }} />
      <Handle id="bi" type="target" position={Position.Bottom} className="pf-h" style={{ left: '38%' }} />
    </>
  )
}

function ProcessStepNode({ data, selected }: NodeProps<ProcessNodeData>) {
  if (data.kind === 'start' || data.kind === 'end') {
    return (
      <div className={`pf-node pf-node-event is-${data.kind}${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-event-kicker">{KIND_LABEL[data.kind]}</span>
        <div className="pf-event-circle" />
        <strong className="pf-event-label">{data.label}</strong>
      </div>
    )
  }

  if (data.kind === 'subprocess') {
    return (
      <div className={`pf-node is-subprocess${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-node-icon">↳</span>
        <span className="pf-node-kind">{KIND_LABEL.subprocess}</span>
        <strong className="pf-node-title">{data.label}</strong>
        {data.subProcessNo ? (
          <span className="pf-node-subproc" title={`Alt süreç: ${data.subProcessNo}`}>
            {data.subProcessNo}
          </span>
        ) : null}
        <ProcessNodeServicePreview services={data.services} />
      </div>
    )
  }

  if (data.kind === 'decision') {
    return (
      <div className={`pf-node pf-node-gateway is-decision${selected ? ' is-selected' : ''}`}>
        <Ports />
        <span className="pf-event-kicker">{KIND_LABEL.decision}</span>
        <div className="pf-gateway-diamond">
          <span className="pf-gateway-mark">✕</span>
        </div>
        <strong className="pf-gateway-label">{data.label}</strong>
        <ProcessNodeServicePreview services={data.services} />
      </div>
    )
  }

  return (
    <div className={`pf-node is-${data.kind}${selected ? ' is-selected' : ''}`}>
      <Ports />
      {data.kind === 'service' ? <span className="pf-node-icon">⚙</span> : null}
      <span className="pf-node-kind">{KIND_LABEL[data.kind]}</span>
      <strong className="pf-node-title">{data.label}</strong>
      <ProcessNodeServicePreview services={data.services} />
    </div>
  )
}

function NoteNode({ data, selected }: NodeProps<NoteNodeData>) {
  if (data.collapsed) {
    const hint = data.text.trim() ? data.text : 'Açmak için tıkla'
    return (
      <div className="pf-note pf-note-collapsed" title={hint}>
        <span className="pf-note-chip">Not</span>
      </div>
    )
  }

  return (
    <div className={`pf-note${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={NOTE_MIN_WIDTH}
        minHeight={NOTE_MIN_HEIGHT}
        maxWidth={NOTE_MAX_WIDTH}
        maxHeight={NOTE_MAX_HEIGHT}
        color="#e3b341"
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 10, height: 10, borderRadius: 2 }}
        onResizeEnd={() => data.onResizeEnd()}
      />
      <div className="pf-note-toolbar">
        <button
          type="button"
          className="pf-note-del"
          onClick={(e) => {
            e.stopPropagation()
            data.onRemove()
          }}
        >
          Sil
        </button>
        <button
          type="button"
          className="pf-note-collapse"
          onClick={(e) => {
            e.stopPropagation()
            data.onToggleCollapse()
          }}
          aria-label="Notu kapat"
          title="Kapat"
        >
          −
        </button>
      </div>
      <textarea
        value={data.text}
        placeholder="Not…"
        onChange={(e) => data.onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

export const processFlowNodeTypes: NodeTypes = {
  processStep: memo(ProcessStepNode),
  processNote: memo(NoteNode),
}