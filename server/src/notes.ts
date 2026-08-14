/**
 * Servis notları (MVP) — bellek içi store.
 * visibility: team = aynı ekip; all = herkes
 */
import { services, SESSION_USERS } from './data.js'

export type NoteVisibility = 'team' | 'all'

export type ServiceNote = {
  id: string
  serviceId: string
  authorId: string
  authorName: string
  authorTeam?: string
  authorRole?: 'lead' | 'member'
  body: string
  visibility: NoteVisibility
  createdAt: string
}

const notes: ServiceNote[] = []
let seq = 1

const MAX_BODY = 280

function canSee(note: ServiceNote, viewerId: string): boolean {
  if (note.visibility === 'all') return true
  const viewer = SESSION_USERS.find((u) => u.id === viewerId)
  if (!viewer) return false
  if (note.authorId === viewerId) return true
  return Boolean(
    viewer.team && note.authorTeam && viewer.team === note.authorTeam,
  )
}

export function listNotesForService(
  serviceId: string,
  viewerId: string,
): ServiceNote[] {
  if (!services[serviceId]) return []
  return notes
    .filter((n) => n.serviceId === serviceId && canSee(n, viewerId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Görünür servisler için sayım (viewer filtresiyle) */
export function noteCountsForServices(
  serviceIds: string[],
  viewerId: string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of serviceIds) {
    const n = listNotesForService(id, viewerId).length
    if (n > 0) out[id] = n
  }
  return out
}

export function createNote(input: {
  serviceId: string
  authorId: string
  body: string
  visibility?: NoteVisibility
}): ServiceNote {
  const svc = services[input.serviceId]
  if (!svc) throw new Error('service_not_found')
  const author = SESSION_USERS.find((u) => u.id === input.authorId)
  if (!author) throw new Error('unknown_user')
  const body = input.body.trim()
  if (!body) throw new Error('empty_body')
  if (body.length > MAX_BODY) throw new Error('body_too_long')

  const note: ServiceNote = {
    id: `note-${String(seq++).padStart(4, '0')}`,
    serviceId: input.serviceId,
    authorId: author.id,
    authorName: author.name,
    authorTeam: author.team,
    authorRole: author.role,
    body,
    visibility: input.visibility === 'all' ? 'all' : 'team',
    createdAt: new Date().toISOString(),
  }
  notes.push(note)
  return note
}

export function deleteNote(noteId: string, actorId: string): boolean {
  const i = notes.findIndex((n) => n.id === noteId)
  if (i < 0) return false
  const note = notes[i]!
  if (note.authorId !== actorId) {
    throw new Error('forbidden_not_author')
  }
  notes.splice(i, 1)
  return true
}

/** Demo: Payments lead’in bıraktığı örnek not */
function seed() {
  const pay = services['svc-payment']
  const author = SESSION_USERS.find((u) => u.id === 'o1')
  if (!pay || !author) return
  notes.push({
    id: `note-${String(seq++).padStart(4, '0')}`,
    serviceId: pay.id,
    authorId: author.id,
    authorName: author.name,
    authorTeam: author.team,
    authorRole: author.role,
    body: 'Bu sprint settlement path’ine dokunmayın — CR incelemede.',
    visibility: 'team',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  })
}
seed()
