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
}

export type WorkflowsStore = {
  folders: WorkflowFolder[]
  steps: WorkflowStep[]
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

const EMPTY: WorkflowsStore = { folders: [], steps: [] }

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
        }))
        .slice(0, MAX_STEPS)
    : []
  return { folders, steps }
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
  return writeWorkflows({
    folders: store.folders.filter((f) => !removeIds.has(f.id)),
    steps: store.steps.filter((s) => !s.folderId || !removeIds.has(s.folderId)),
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
