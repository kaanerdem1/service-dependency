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
const MAX_FOLDER_DEPTH = 4

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
  /** Akışın ne işe yaradığı, nerede kullanıldığı — info sayfası ve dal kartı. */
  summary?: string
  /**
   * Bu klasör bir "akış" (adım kabul ediyorsa) ise, parent içindeki adımlarla
   * AYNI sıralama havuzunu paylaşır — `order` steps'inkiyle karşılaştırılır.
   * Böylece bir alt akış, adımların arasına sürüklenip konumu değiştirilebilir
   * (bkz. `sequenceInFolder`). Aynı noktada art arda gelen birden çok alt akış,
   * info sayfasında birbirinin alternatifi (senaryo) tab'ları olarak görünür.
   */
  order?: number
}

export function isOrganizerFolder(folder?: WorkflowFolder): boolean {
  return folder?.icon === 'folder'
}

/** Girdi / Çıktı için önceden tanımlı alan. İleride DB'den (`service_field` benzeri) gelecek. */
export type WorkflowFieldDef = { key: string; label: string }

/** Geçici mock — gerçek alan seti servis DB'sinden gelene kadar. */
export const MOCK_INPUT_FIELD_DEFS: WorkflowFieldDef[] = [
  { key: 'hesapNo', label: 'Hesap No' },
  { key: 'basvuruId', label: 'Başvuru ID' },
  { key: 'musteriId', label: 'Müşteri ID' },
  { key: 'talepTutari', label: 'Talep Tutarı' },
  { key: 'kanal', label: 'Kanal' },
  { key: 'segment', label: 'Segment (Bireysel/Ticari)' },
]

export const MOCK_OUTPUT_FIELD_DEFS: WorkflowFieldDef[] = [
  { key: 'sonuc', label: 'Sonuç / Durum' },
  { key: 'hataKodu', label: 'Hata Kodu' },
  { key: 'onaylananTutar', label: 'Onaylanan Tutar' },
  { key: 'referansNo', label: 'Referans No' },
  { key: 'limit', label: 'Limit' },
]

/** Adım Girdi/Çıktı değeri: `alanAnahtarı -> değer`. */
export type WorkflowFieldMap = Record<string, string>

export type WorkflowStep = {
  id: string
  serviceId: string
  canonicalName: string
  folderId?: string
  order: number
  input?: WorkflowFieldMap
  output?: WorkflowFieldMap
  edgeCases?: string
  scenarios?: string
}

export type WorkflowStepDoc = {
  input?: WorkflowFieldMap
  output?: WorkflowFieldMap
  edgeCases?: string
  scenarios?: string
}

function optText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Eski serbest metin girdi/çıktıyı tek alanlı map'e taşır (geriye dönük uyumluluk). */
function optFieldMap(value: unknown): WorkflowFieldMap | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? { deger: trimmed } : undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const out: WorkflowFieldMap = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim()) {
      out[k.trim()] = v.trim()
    }
  }
  return Object.keys(out).length ? out : undefined
}

function stepDocFields(s: {
  input?: unknown
  output?: unknown
  edgeCases?: string
  scenarios?: string
}): WorkflowStepDoc {
  const input = optFieldMap(s.input)
  const output = optFieldMap(s.output)
  return {
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
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
          ...(typeof f.order === 'number' ? { order: f.order } : {}),
          ...(typeof f.summary === 'string' && f.summary.trim()
            ? { summary: f.summary.trim() }
            : {}),
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
      byId.set(from.id, { ...from, output: { deger: leftover } })
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

/** Adım kabul eden alt akışlar — parent'ın adım sırasına dahil olan klasörler. */
export function flowChildren(store: WorkflowsStore, parentId?: string): WorkflowFolder[] {
  return childFolders(store, parentId).filter((f) => folderAcceptsSteps(store, f))
}

/** Salt organizasyon klasörleri (icon='folder') — adım sırasına dahil olmaz, ayrı listelenir. */
export function pureOrganizerChildren(store: WorkflowsStore, parentId?: string): WorkflowFolder[] {
  return childFolders(store, parentId).filter((f) => !folderAcceptsSteps(store, f))
}

export type WorkflowSequenceItem =
  | { kind: 'step'; id: string; order: number; step: WorkflowStep }
  | { kind: 'folder'; id: string; order: number; folder: WorkflowFolder }

/**
 * Bir konteynerin (folderId) içindeki adımlar + alt akışlar TEK sıralamada.
 * Sürükle-bırakla adımların arasına bir alt akış (veya tam tersi) yerleştirilebilir.
 * Info sayfasında art arda gelen alt akış(lar) tab olarak, adımlar ise numaralı
 * kart olarak gösterilir (bkz. `WorkflowFlowCanvas`).
 */
export function sequenceInFolder(store: WorkflowsStore, folderId?: string): WorkflowSequenceItem[] {
  const steps: WorkflowSequenceItem[] = stepsInFolder(store, folderId).map((step) => ({
    kind: 'step',
    id: step.id,
    order: step.order,
    step,
  }))
  const folders: WorkflowSequenceItem[] = flowChildren(store, folderId).map((folder) => ({
    kind: 'folder',
    id: folder.id,
    order: folder.order ?? Number.MAX_SAFE_INTEGER,
    folder,
  }))
  return [...steps, ...folders].sort((a, b) => a.order - b.order)
}

function nextSequenceOrder(store: WorkflowsStore, parentId?: string): number {
  return sequenceInFolder(store, parentId).reduce((max, it) => Math.max(max, it.order), -1) + 1
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
        order: nextSequenceOrder(store, parentId),
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

export function setWorkflowFolderSummary(folderId: string, summary: string): WorkflowsStore {
  const store = readWorkflows()
  if (!store.folders.some((f) => f.id === folderId)) return store
  const trimmed = summary.trim()
  return writeWorkflows({
    ...store,
    folders: store.folders.map((f) => {
      if (f.id !== folderId) return f
      if (!trimmed) {
        const { summary: _drop, ...rest } = f
        return rest
      }
      return { ...f, summary: trimmed }
    }),
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
  const order = nextSequenceOrder(store, validFolder)
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

export function setWorkflowStepField(
  stepId: string,
  kind: 'input' | 'output',
  key: string,
  value: string,
): WorkflowsStore {
  const store = readWorkflows()
  const step = store.steps.find((s) => s.id === stepId)
  if (!step || !key.trim()) return store
  const nextMap: WorkflowFieldMap = { ...(step[kind] ?? {}), [key.trim()]: value }
  return updateWorkflowStepDoc(stepId, { [kind]: nextMap } as WorkflowStepDoc)
}

export function removeWorkflowStepField(
  stepId: string,
  kind: 'input' | 'output',
  key: string,
): WorkflowsStore {
  const store = readWorkflows()
  const step = store.steps.find((s) => s.id === stepId)
  if (!step) return store
  const nextMap: WorkflowFieldMap = { ...(step[kind] ?? {}) }
  delete nextMap[key]
  return updateWorkflowStepDoc(stepId, { [kind]: nextMap } as WorkflowStepDoc)
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

/**
 * Bir adımı veya alt akışı (kind), bir konteynerin (parentId) içinde belirli bir
 * sıra index'ine yerleştirir. Adımlar ve alt akışlar AYNI sıra havuzunu paylaşır,
 * bu yüzden bir alt akış adımların arasına, bir adım da alt akışların arasına
 * sürüklenip bırakılabilir.
 */
export function placeWorkflowItem(
  kind: 'step' | 'folder',
  id: string,
  parentId: string | undefined,
  index: number,
): WorkflowsStore {
  const store = readWorkflows()
  if (kind === 'step') {
    const step = store.steps.find((s) => s.id === id)
    if (!step) return store
    const dest = parentId ? store.folders.find((f) => f.id === parentId) : undefined
    const validParent = dest ? dest.id : undefined
    if (!folderAcceptsSteps(store, dest) && step.folderId !== validParent) return store
    if (
      store.steps.some(
        (s) => s.id !== id && s.serviceId === step.serviceId && s.folderId === validParent,
      )
    ) {
      return store
    }
  } else {
    const folder = store.folders.find((f) => f.id === id)
    if (!folder) return store
    if (parentId === id) return store
    if (parentId && isDescendantOf(store.folders, parentId, id)) return store
    if (parentId) {
      const parent = store.folders.find((f) => f.id === parentId)
      if (!parent) return store
      const newDepth =
        folderDepth(store.folders, parent.id) + 1 + subtreeExtraDepth(store.folders, id)
      if (newDepth > MAX_FOLDER_DEPTH) return store
    }
  }

  const siblings = sequenceInFolder(store, parentId).filter((it) => it.id !== id)
  const clamped = Math.max(0, Math.min(Math.floor(index), siblings.length))
  const withNew = [
    ...siblings.slice(0, clamped),
    { kind, id } as { kind: 'step' | 'folder'; id: string },
    ...siblings.slice(clamped),
  ]
  const orderById = new Map(withNew.map((it, i) => [it.id, i]))

  return writeWorkflows({
    ...store,
    steps: store.steps.map((s) => {
      if (s.id === id && kind === 'step') {
        return { ...s, folderId: parentId, order: orderById.get(id) ?? clamped }
      }
      const o = orderById.get(s.id)
      return o != null && s.folderId === parentId ? { ...s, order: o } : s
    }),
    folders: store.folders.map((f) => {
      if (f.id === id && kind === 'folder') {
        return { ...f, parentId, order: orderById.get(id) ?? clamped }
      }
      const o = orderById.get(f.id)
      return o != null && f.parentId === parentId ? { ...f, order: o } : f
    }),
  })
}

export function placeWorkflowStep(
  stepId: string,
  folderId: string | undefined,
  index: number,
): WorkflowsStore {
  return placeWorkflowItem('step', stepId, folderId, index)
}

export function moveWorkflowStep(stepId: string, folderId?: string): WorkflowsStore {
  const store = readWorkflows()
  const seq = sequenceInFolder(store, folderId)
  const alreadyHere = store.steps.some((s) => s.id === stepId && s.folderId === folderId)
  const index = alreadyHere ? seq.filter((it) => it.id !== stepId).length : seq.length
  return placeWorkflowItem('step', stepId, folderId, index)
}

export function placeWorkflowFolder(
  folderId: string,
  parentId: string | undefined,
  index: number,
): WorkflowsStore {
  return placeWorkflowItem('folder', folderId, parentId, index)
}

export function moveWorkflowFolder(folderId: string, parentId?: string): WorkflowsStore {
  const store = readWorkflows()
  const seq = sequenceInFolder(store, parentId)
  const alreadyHere = store.folders.some((f) => f.id === folderId && f.parentId === parentId)
  const index = alreadyHere ? seq.filter((it) => it.id !== folderId).length : seq.length
  return placeWorkflowItem('folder', folderId, parentId, index)
}

export type ServiceWorkflowHit = {
  folderId?: string
  name: string
  path: string
}

function folderPathLabel(folders: WorkflowFolder[], folder: WorkflowFolder): string {
  const parts = [folder.name]
  const seen = new Set<string>([folder.id])
  let current = folder.parentId
    ? folders.find((f) => f.id === folder.parentId)
    : undefined
  while (current) {
    parts.unshift(current.name)
    if (seen.has(current.id)) break
    seen.add(current.id)
    current = current.parentId
      ? folders.find((f) => f.id === current?.parentId)
      : undefined
  }
  return parts.join(' › ')
}

export function workflowsForService(
  serviceId: string,
  store: WorkflowsStore = readWorkflows(),
): ServiceWorkflowHit[] {
  const hits: ServiceWorkflowHit[] = []
  const seen = new Set<string>()
  for (const step of store.steps) {
    if (step.serviceId !== serviceId) continue
    const key = step.folderId ?? '__root'
    if (seen.has(key)) continue
    seen.add(key)
    if (!step.folderId) {
      hits.push({ name: 'Kök', path: 'Kök' })
      continue
    }
    const folder = store.folders.find((f) => f.id === step.folderId)
    if (!folder) continue
    hits.push({
      folderId: folder.id,
      name: folder.name,
      path: folderPathLabel(store.folders, folder),
    })
  }
  return hits
}
