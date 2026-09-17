/**
 * Süreç haritası yapışkan notları (localStorage).
 *
 * Ne yapar: Not CRUD + boyut sabitleri. `ProcessFlowMap` canvas üzerinde gösterir.
 * Ne yapmaz: Sunucuya yazmaz (Faz 7: `process_map_note` hedefi).
 */
export type ProcessFlowNote = {
  id: string
  text: string
  x: number
  y: number
  width?: number
  height?: number
  collapsed?: boolean
  expandedWidth?: number
  expandedHeight?: number
}

function storageKey(processNo: string) {
  return `sd-process-flow-map:${processNo}`
}

export function readProcessFlowNotes(processNo: string): ProcessFlowNote[] {
  try {
    const raw = localStorage.getItem(storageKey(processNo))
    if (!raw) return []
    const parsed = JSON.parse(raw) as { notes?: ProcessFlowNote[] }
    if (!Array.isArray(parsed.notes)) return []
    return parsed.notes.filter(
      (n) => n && typeof n.id === 'string' && typeof n.text === 'string',
    )
  } catch {
    return []
  }
}

export function writeProcessFlowNotes(processNo: string, notes: ProcessFlowNote[]) {
  try {
    localStorage.setItem(storageKey(processNo), JSON.stringify({ notes }))
  } catch {
    /* quota */
  }
}

export const NOTE_DEFAULT_WIDTH = 168
export const NOTE_DEFAULT_HEIGHT = 108
export const NOTE_MIN_WIDTH = 64
export const NOTE_MIN_HEIGHT = 40
export const NOTE_MAX_WIDTH = 480
export const NOTE_MAX_HEIGHT = 360
export const NOTE_COLLAPSED_WIDTH = 52
export const NOTE_COLLAPSED_HEIGHT = 26
