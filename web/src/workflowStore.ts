import { resolveCatalogCanEdit } from './auth/catalogAccess'

export const STEP_MIME = 'application/x-sd-workflow-step'
export const FOLDER_MIME = 'application/x-sd-workflow-folder'

export const WORKFLOWS_CHANGED_EVENT = 'sd-workflows-changed'

const STORAGE_KEY = 'sd-service-workflows:v1'

export type WorkflowDragKind = 'step' | 'folder'
let workflowDragKind: WorkflowDragKind | null = null

export function beginWorkflowDrag(kind: WorkflowDragKind) {
  workflowDragKind = kind
}

export function endWorkflowDrag() {
  workflowDragKind = null
}

export function peekWorkflowDrag() {
  return workflowDragKind
}
const MAX_FOLDERS = 40
const MAX_STEPS = 120
const MAX_FOLDER_DEPTH = 2

export const WORKFLOW_FOLDER_ICONS = [
  'folder',
  'credit',
  'card',
  'apply',
  'flow',
] as const

export type WorkflowFolderIcon = (typeof WORKFLOW_FOLDER_ICONS)[number]

export type WorkflowFolder = {
  id: string
  name: string
  icon?: WorkflowFolderIcon
  parentId?: string
}

export function isOrganizerFolder(folder?: WorkflowFolder): boolean {
  return folder?.icon === 'folder'
}

export type WorkflowStep = {
  id: string
  serviceId: string
  canonicalName: string
  folderId?: string
  order: number
  input?: string
  output?: string
  edgeCases?: string
  scenarios?: string
}

export type WorkflowStepDoc = {
  input?: string
  output?: string
  edgeCases?: string
  scenarios?: string
}

function optText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stepDocFields(s: {
  input?: string
  output?: string
  edgeCases?: string
  scenarios?: string
}): WorkflowStepDoc {
  return {
    ...(optText(s.input) ? { input: s.input!.trim() } : {}),
    ...(optText(s.output) ? { output: s.output!.trim() } : {}),
    ...(optText(s.edgeCases) ? { edgeCases: s.edgeCases!.trim() } : {}),
    ...(optText(s.scenarios) ? { scenarios: s.scenarios!.trim() } : {}),
  }
}

export const WORKFLOW_EDGE_STATUSES = [
  'stable',
  'must-change',
  'watch',
  'note',
] as const

export type WorkflowEdgeStatus = (typeof WORKFLOW_EDGE_STATUSES)[number]

export type WorkflowEdge = {
  id: string
  fromStepId: string
  toStepId: string
  status: WorkflowEdgeStatus
  note?: string
}

export const WORKFLOW_EDGE_LABELS: Record<WorkflowEdgeStatus, string> = {
  stable: 'Değişmemeli',
  'must-change': 'Değişmeli',
  watch: 'Kontrol',
  note: 'Not',
}

export type WorkflowsStore = {
  folders: WorkflowFolder[]
  steps: WorkflowStep[]
  edges: WorkflowEdge[]
}

export function folderAcceptsSteps(
  store: WorkflowsStore,
  folder?: WorkflowFolder,
): boolean {
  if (!folder) return true
  if (folder.icon === 'folder') return false
  if (folder.icon && folder.icon !== 'folder') return true
  return store.folders.every((f) => f.parentId !== folder.id)
}

const EMPTY: WorkflowsStore = { folders: [], steps: [], edges: [] }

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function folderDepth(folders: WorkflowFolder[], folderId: string): number {
  let depth = 0
  let current = folders.find((f) => f.id === folderId)
  const seen = new Set<string>()
  while (current?.parentId) {
    if (seen.has(current.id)) break
    seen.add(current.id)
    depth += 1
    current = folders.find((f) => f.id === current?.parentId)
  }
  return depth
}

function normalize(raw: unknown): WorkflowsStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  const o = raw as Record<string, unknown>
  const folders = Array.isArray(o.folders)
    ? o.folders
        .filter(
          (f): f is WorkflowFolder =>
            typeof f === 'object' &&
            f != null &&
            typeof (f as WorkflowFolder).id === 'string' &&
            typeof (f as WorkflowFolder).name === 'string',
        )
        .map((f) => ({
          id: f.id,
          name: f.name,
          ...(WORKFLOW_FOLDER_ICONS.includes(f.icon as WorkflowFolderIcon)
            ? { icon: f.icon as WorkflowFolderIcon }
            : {}),
          ...(typeof f.parentId === 'string' ? { parentId: f.parentId } : {}),
        }))
        .slice(0, MAX_FOLDERS)
    : []
  const folderIds = new Set(folders.map((f) => f.id))
  const steps = Array.isArray(o.steps)
    ? o.steps
        .filter(
          (s): s is WorkflowStep =>
            typeof s === 'object' &&
            s != null &&
            typeof (s as WorkflowStep).id === 'string' &&
            typeof (s as WorkflowStep).serviceId === 'string' &&
            typeof (s as WorkflowStep).canonicalName === 'string',
        )
        .map((s, i) => ({
          id: s.id,
          serviceId: s.serviceId,
          canonicalName: s.canonicalName,
          folderId:
            typeof s.folderId === 'string' && folderIds.has(s.folderId)
              ? s.folderId
              : undefined,
          order: typeof s.order === 'number' ? s.order : i,
          ...stepDocFields(s),
        }))
        .slice(0, MAX_STEPS)
    : []
  const stepIds = new Set(steps.map((s) => s.id))
  const edges = Array.isArray(o.edges)
    ? o.edges
        .filter((e): e is WorkflowEdge => {
          if (!e || typeof e !== 'object') return false
          const row = e as WorkflowEdge
          return (
            typeof row.id === 'string' &&
            typeof row.fromStepId === 'string' &&
            typeof row.toStepId === 'string' &&
            stepIds.has(row.fromStepId) &&
            stepIds.has(row.toStepId) &&
            WORKFLOW_EDGE_STATUSES.includes(row.status as WorkflowEdgeStatus)
          )
        })
        .map((e) => ({
            id: e.id,
            fromStepId: e.fromStepId,
            toStepId: e.toStepId,
            status: e.status,
            ...(typeof e.note === 'string' && e.note.trim() ? { note: e.note.trim() } : {}),
          }))
    : []
  const byId = new Map(steps.map((s) => [s.id, s]))
  for (const e of Array.isArray(o.edges) ? o.edges : []) {
    if (!e || typeof e !== 'object') continue
    const row = e as WorkflowEdge & { handoff?: string; expectedOut?: string; expectedIn?: string }
    const leftover =
      optText(row.handoff) || optText(row.expectedOut) || optText(row.expectedIn)
    const from = leftover ? byId.get(row.fromStepId) : undefined
    if (from && leftover && !from.output) {
      byId.set(from.id, { ...from, output: leftover })
    }
  }
  return { folders, steps: [...byId.values()], edges }
}

export function readWorkflows(): WorkflowsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    return normalize(JSON.parse(raw))
  } catch {
    return { ...EMPTY }
  }
}

function writeWorkflows(store: WorkflowsStore): WorkflowsStore {
  if (!resolveCatalogCanEdit()) return readWorkflows()
  const next = normalize(store)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(WORKFLOWS_CHANGED_EVENT))
  return next
}

export function addWorkflowFolder(
  name: string,
  parentId?: string,
  icon?: WorkflowFolderIcon,
): WorkflowsStore {
  const store = readWorkflows()
  if (store.folders.length >= MAX_FOLDERS) return store
  if (parentId) {
    const parent = store.folders.find((f) => f.id === parentId)
    if (!parent) return store
    if (folderDepth(store.folders, parent.id) >= MAX_FOLDER_DEPTH) return store
  }
  return writeWorkflows({
    ...store,
    folders: [
      ...store.folders,
      {
        id: newId('wf'),
        name: name.trim() || 'Yeni klasör',
        ...(icon ? { icon } : {}),
        ...(parentId ? { parentId } : {}),
      },
    ],
  })
}

export function setWorkflowFolderIcon(
  folderId: string,
  icon: WorkflowFolderIcon,
): WorkflowsStore {
  const store = readWorkflows()
  return writeWorkflows({
    ...store,
    folders: store.folders.map((f) => (f.id === folderId ? { ...f, icon } : f)),
  })
}

export function renameWorkflowFolder(folderId: string, name: string): WorkflowsStore {
  const store = readWorkflows()
  const trimmed = name.trim()
  if (!trimmed) return store
  return writeWorkflows({
    ...store,
    folders: store.folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)),
  })
}

export function deleteWorkflowFolder(folderId: string): WorkflowsStore {
  const store = readWorkflows()
  const removeIds = new Set<string>([folderId])
  for (const f of store.folders) {
    if (f.parentId && removeIds.has(f.parentId)) removeIds.add(f.id)
  }
  const nextSteps = store.steps.filter((s) => !s.folderId || !removeIds.has(s.folderId))
  const keep = new Set(nextSteps.map((s) => s.id))
  return writeWorkflows({
    folders: store.folders.filter((f) => !removeIds.has(f.id)),
    steps: nextSteps,
    edges: store.edges.filter((e) => keep.has(e.fromStepId) && keep.has(e.toStepId)),
  })
}

export function addWorkflowStep(
  serviceId: string,
  canonicalName: string,
  folderId?: string,
): WorkflowsStore {
  const store = readWorkflows()
  if (!serviceId.startsWith('sd-')) return store
  if (store.steps.length >= MAX_STEPS) return store
  const validFolder =
    folderId && store.folders.some((f) => f.id === folderId) ? folderId : undefined
  if (
    store.steps.some(
      (s) => s.serviceId === serviceId && s.folderId === validFolder,
    )
  ) {
    return store
  }
  const siblings = store.steps.filter((s) => s.folderId === validFolder)
  const order = siblings.reduce((max, s) => Math.max(max, s.order), -1) + 1
  return writeWorkflows({
    ...store,
    steps: [
      ...store.steps,
      {
        id: newId('ws'),
        serviceId,
        canonicalName: canonicalName.trim() || serviceId,
        folderId: validFolder,
        order,
      },
    ],
  })
}

export function removeWorkflowStep(stepId: string): WorkflowsStore {
  const store = readWorkflows()
  return writeWorkflows({
    ...store,
    steps: store.steps.filter((s) => s.id !== stepId),
    edges: store.edges.filter((e) => e.fromStepId !== stepId && e.toStepId !== stepId),
  })
}

export function edgeBetween(
  store: WorkflowsStore,
  fromStepId: string,
  toStepId: string,
): WorkflowEdge | undefined {
  return store.edges.find((e) => e.fromStepId === fromStepId && e.toStepId === toStepId)
}

export function upsertWorkflowEdge(
  fromStepId: string,
  toStepId: string,
  patch: {
    status: WorkflowEdgeStatus
    note?: string
  },
): WorkflowsStore {
  const store = readWorkflows()
  const ids = new Set(store.steps.map((s) => s.id))
  if (!ids.has(fromStepId) || !ids.has(toStepId) || fromStepId === toStepId) return store
  const note = patch.note?.trim()
  const next: WorkflowEdge = {
    id: edgeBetween(store, fromStepId, toStepId)?.id ?? newId('we'),
    fromStepId,
    toStepId,
    status: patch.status,
    ...(note ? { note } : {}),
  }
  const rest = store.edges.filter(
    (e) => !(e.fromStepId === fromStepId && e.toStepId === toStepId),
  )
  return writeWorkflows({ ...store, edges: [...rest, next] })
}

export function removeWorkflowEdge(fromStepId: string, toStepId: string): WorkflowsStore {
  const store = readWorkflows()
  return writeWorkflows({
    ...store,
    edges: store.edges.filter(
      (e) => !(e.fromStepId === fromStepId && e.toStepId === toStepId),
    ),
  })
}

export function updateWorkflowStepDoc(
  stepId: string,
  patch: WorkflowStepDoc,
): WorkflowsStore {
  const store = readWorkflows()
  if (!store.steps.some((s) => s.id === stepId)) return store
  return writeWorkflows({
    ...store,
    steps: store.steps.map((s) => {
      if (s.id !== stepId) return s
      const { input: _i, output: _o, edgeCases: _e, scenarios: _s, ...rest } = s
      return { ...rest, ...stepDocFields({ ...s, ...patch }) }
    }),
  })
}

export function placeWorkflowStep(
  stepId: string,
  folderId: string | undefined,
  index: number,
): WorkflowsStore {
  const store = readWorkflows()
  const step = store.steps.find((s) => s.id === stepId)
  if (!step) return store
  const dest = folderId ? store.folders.find((f) => f.id === folderId) : undefined
  const validFolder = dest ? dest.id : undefined
  if (!folderAcceptsSteps(store, dest) && step.folderId !== validFolder) return store
  if (
    store.steps.some(
      (s) =>
        s.id !== stepId &&
        s.serviceId === step.serviceId &&
        s.folderId === validFolder,
    )
  ) {
    return store
  }
  const siblings = store.steps
    .filter((s) => s.id !== stepId && s.folderId === validFolder)
    .sort((a, b) => a.order - b.order)
  const clamped = Math.max(0, Math.min(Math.floor(index), siblings.length))
  const nextOrder = [
    ...siblings.slice(0, clamped),
    { ...step, folderId: validFolder },
    ...siblings.slice(clamped),
  ]
  const orderById = new Map(nextOrder.map((s, i) => [s.id, i]))
  return writeWorkflows({
    ...store,
    steps: store.steps.map((s) => {
      const order = orderById.get(s.id)
      if (s.id === stepId) {
        return { ...s, folderId: validFolder, order: order ?? clamped }
      }
      if (order != null && s.folderId === validFolder) {
        return { ...s, order }
      }
      return s
    }),
  })
}

export function moveWorkflowStep(stepId: string, folderId?: string): WorkflowsStore {
  const store = readWorkflows()
  const siblings = store.steps.filter((s) => s.folderId === folderId).length
  const alreadyHere = store.steps.some(
    (s) => s.id === stepId && s.folderId === folderId,
  )
  const index = alreadyHere
    ? store.steps.filter((s) => s.folderId === folderId && s.id !== stepId).length
    : siblings
  return placeWorkflowStep(stepId, folderId, index)
}

export function stepsInFolder(store: WorkflowsStore, folderId?: string): WorkflowStep[] {
  return store.steps
    .filter((s) => s.folderId === folderId)
    .sort((a, b) => a.order - b.order)
}

export function childFolders(
  store: WorkflowsStore,
  parentId?: string,
): WorkflowFolder[] {
  return store.folders.filter((f) => f.parentId === parentId)
}

export function isDescendantOf(
  folders: WorkflowFolder[],
  maybeChildId: string,
  ancestorId: string,
): boolean {
  const seen = new Set<string>()
  let current = folders.find((f) => f.id === maybeChildId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    if (seen.has(current.id)) break
    seen.add(current.id)
    current = folders.find((f) => f.id === current?.parentId)
  }
  return false
}

function subtreeExtraDepth(folders: WorkflowFolder[], folderId: string): number {
  const kids = folders.filter((f) => f.parentId === folderId)
  if (kids.length === 0) return 0
  return 1 + Math.max(...kids.map((k) => subtreeExtraDepth(folders, k.id)))
}

export function canNestUnder(store: WorkflowsStore, parentId: string): boolean {
  return folderDepth(store.folders, parentId) < MAX_FOLDER_DEPTH
}

export function moveWorkflowFolder(
  folderId: string,
  parentId?: string,
): WorkflowsStore {
  const store = readWorkflows()
  const folder = store.folders.find((f) => f.id === folderId)
  if (!folder) return store
  if (parentId === folderId) return store
  if (parentId && isDescendantOf(store.folders, parentId, folderId)) return store
  let nextParent: string | undefined
  if (parentId) {
    const parent = store.folders.find((f) => f.id === parentId)
    if (!parent) return store
    const newDepth = folderDepth(store.folders, parent.id) + 1 + subtreeExtraDepth(store.folders, folderId)
    if (newDepth > MAX_FOLDER_DEPTH) return store
    nextParent = parentId
  }
  return writeWorkflows({
    ...store,
    folders: store.folders.map((f) => {
      if (f.id !== folderId) return f
      if (nextParent) return { ...f, parentId: nextParent }
      return {
        id: f.id,
        name: f.name,
        ...(f.icon ? { icon: f.icon } : {}),
      }
    }),
  })
}
