import type { Node } from 'reactflow'
import { useNodesState } from 'reactflow'
import {
  NOTE_COLLAPSED_HEIGHT,
  NOTE_COLLAPSED_WIDTH,
  NOTE_DEFAULT_HEIGHT,
  NOTE_DEFAULT_WIDTH,
  readProcessFlowNotes,
  writeProcessFlowNotes,
  type ProcessFlowNote,
} from '../processFlowNotes.js'
import type { NoteNodeData } from './nodes.js'

export function notesFromNodes(list: Node[]): ProcessFlowNote[] {
  return list
    .filter((n) => n.type === 'processNote')
    .map((n) => {
      const data = n.data as NoteNodeData
      return {
        id: n.id,
        text: data.text ?? '',
        x: n.position.x,
        y: n.position.y,
        width: typeof n.width === 'number' ? n.width : undefined,
        height: typeof n.height === 'number' ? n.height : undefined,
        collapsed: data.collapsed ?? false,
        expandedWidth: data.expandedWidth,
        expandedHeight: data.expandedHeight,
      }
    })
}

export function noteActions(
  id: string,
  processNo: string,
  setNodes: ReturnType<typeof useNodesState>[1],
  persistNotes: () => void,
): Pick<NoteNodeData, 'onChange' | 'onRemove' | 'onResizeEnd' | 'onToggleCollapse'> {
  const persist = (rows: Node[]) => writeProcessFlowNotes(processNo, notesFromNodes(rows))
  return {
    onChange: (text) => {
      setNodes((rows) => {
        const next = rows.map((row) =>
          row.id === id ? { ...row, data: { ...(row.data as NoteNodeData), text } } : row,
        )
        persist(next)
        return next
      })
    },
    onRemove: () => {
      setNodes((rows) => {
        const next = rows.filter((row) => row.id !== id)
        persist(next)
        return next
      })
    },
    onResizeEnd: persistNotes,
    onToggleCollapse: () => {
      setNodes((rows) => {
        const next = rows.map((row) => {
          if (row.id !== id) return row
          const data = row.data as NoteNodeData
          if (data.collapsed) {
            return {
              ...row,
              width: data.expandedWidth ?? NOTE_DEFAULT_WIDTH,
              height: data.expandedHeight ?? NOTE_DEFAULT_HEIGHT,
              data: { ...data, collapsed: false },
            }
          }
          return {
            ...row,
            width: NOTE_COLLAPSED_WIDTH,
            height: NOTE_COLLAPSED_HEIGHT,
            data: {
              ...data,
              collapsed: true,
              expandedWidth: typeof row.width === 'number' ? row.width : NOTE_DEFAULT_WIDTH,
              expandedHeight: typeof row.height === 'number' ? row.height : NOTE_DEFAULT_HEIGHT,
            },
          }
        })
        persist(next)
        return next
      })
    },
  }
}

export function noteNodesFromStorage(processNo: string): Node[] {
  return readProcessFlowNotes(processNo).map((note) => {
    const collapsed = note.collapsed ?? false
    return {
      id: note.id,
      type: 'processNote' as const,
      position: { x: note.x, y: note.y },
      width: collapsed ? NOTE_COLLAPSED_WIDTH : (note.width ?? NOTE_DEFAULT_WIDTH),
      height: collapsed ? NOTE_COLLAPSED_HEIGHT : (note.height ?? NOTE_DEFAULT_HEIGHT),
      data: {
        text: note.text,
        collapsed,
        expandedWidth: note.expandedWidth,
        expandedHeight: note.expandedHeight,
        onChange: () => undefined,
        onRemove: () => undefined,
        onResizeEnd: () => undefined,
        onToggleCollapse: () => undefined,
      } satisfies NoteNodeData,
      draggable: true,
      selectable: true,
      zIndex: 6,
    }
  })
}
