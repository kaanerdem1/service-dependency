import { query, tableName } from './db.js'
import { getProcessCatalogSchema, hasNodeDescriptionsColumn } from './processCatalogSchema.js'

export type ProcessNodeDescriptionEntry = {
  title?: string
  text?: string
  transitions?: Record<string, string>
}

export type ProcessNodeDescriptionsDoc = {
  nodes?: Record<string, ProcessNodeDescriptionEntry>
}

export type NodeDescriptionPatch = {
  nodeKey: string
  title?: string | null
  text?: string | null
  delete?: boolean
}

const MAX_KEY_LEN = 200
const MAX_TITLE_LEN = 200
const MAX_TEXT_LEN = 12_000

function cleanKey(raw: string): string {
  const key = raw.trim()
  if (!key) throw new Error('node_key_required')
  if (key.length > MAX_KEY_LEN) throw new Error('node_key_too_long')
  return key
}

function cleanOptionalText(raw: string | null | undefined, max: number): string | undefined {
  if (raw == null) return undefined
  const t = raw.trim()
  if (!t) return undefined
  return t.slice(0, max)
}

export function normalizeNodeDescriptionsDoc(raw: unknown): ProcessNodeDescriptionsDoc {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return normalizeNodeDescriptionsDoc(JSON.parse(raw))
    } catch {
      return {}
    }
  }
  if (typeof raw !== 'object') return {}
  const nodesRaw = (raw as ProcessNodeDescriptionsDoc).nodes
  if (!nodesRaw || typeof nodesRaw !== 'object') return {}
  const nodes: Record<string, ProcessNodeDescriptionEntry> = {}
  for (const [key, value] of Object.entries(nodesRaw)) {
    if (!key.trim() || !value || typeof value !== 'object') continue
    const entry: ProcessNodeDescriptionEntry = {}
    const title = cleanOptionalText((value as ProcessNodeDescriptionEntry).title, MAX_TITLE_LEN)
    const text = cleanOptionalText((value as ProcessNodeDescriptionEntry).text, MAX_TEXT_LEN)
    if (title) entry.title = title
    if (text) entry.text = text
    const tr = (value as ProcessNodeDescriptionEntry).transitions
    if (tr && typeof tr === 'object') {
      const transitions: Record<string, string> = {}
      for (const [tk, tv] of Object.entries(tr)) {
        const note = cleanOptionalText(tv, MAX_TEXT_LEN)
        if (tk.trim() && note) transitions[tk.trim()] = note
      }
      if (Object.keys(transitions).length) entry.transitions = transitions
    }
    if (entry.title || entry.text || entry.transitions) {
      nodes[key.trim().slice(0, MAX_KEY_LEN)] = entry
    }
  }
  return Object.keys(nodes).length ? { nodes } : {}
}

export function applyNodeDescriptionPatch(
  doc: ProcessNodeDescriptionsDoc,
  patch: NodeDescriptionPatch,
): ProcessNodeDescriptionsDoc {
  const key = cleanKey(patch.nodeKey)
  const nodes = { ...(doc.nodes ?? {}) }

  if (patch.delete) {
    delete nodes[key]
    return Object.keys(nodes).length ? { nodes } : {}
  }

  const entry: ProcessNodeDescriptionEntry = { ...(nodes[key] ?? {}) }

  if (patch.title !== undefined) {
    const title = cleanOptionalText(patch.title, MAX_TITLE_LEN)
    if (title) entry.title = title
    else delete entry.title
  }
  if (patch.text !== undefined) {
    const text = cleanOptionalText(patch.text, MAX_TEXT_LEN)
    if (text) entry.text = text
    else delete entry.text
  }

  if (!entry.title && !entry.text && !entry.transitions) {
    delete nodes[key]
  } else {
    nodes[key] = entry
  }

  return Object.keys(nodes).length ? { nodes } : {}
}

function resolveProcessWhere(no: string, schema: 'legacy' | 'extended'): { sql: string; param: string } {
  if (schema === 'extended') {
    return { sql: 'p.status = 1 AND p.no = $1', param: no }
  }
  return { sql: 'p.status = 1 AND p.name = $1', param: no }
}

export async function patchProcessNodeDescriptions(
  processNo: string,
  patch: NodeDescriptionPatch,
): Promise<ProcessNodeDescriptionsDoc | undefined> {
  if (!(await hasNodeDescriptionsColumn())) {
    throw new Error('node_descriptions_unavailable')
  }
  const schema = await getProcessCatalogSchema()
  const where = resolveProcessWhere(processNo.trim(), schema)

  const { rows: currentRows } = await query<{ node_descriptions: unknown }>(
    `SELECT p.node_descriptions
     FROM ${tableName('process')} p
     WHERE ${where.sql}
     LIMIT 1`,
    [where.param],
  )
  const row = currentRows[0]
  if (!row) return undefined

  const next = applyNodeDescriptionPatch(normalizeNodeDescriptionsDoc(row.node_descriptions), patch)
  const jsonValue = Object.keys(next.nodes ?? {}).length ? JSON.stringify(next) : null

  await query(
    `UPDATE ${tableName('process')} p
     SET node_descriptions = $2::jsonb,
         update_date = now(),
         update_user = CURRENT_USER
     WHERE ${where.sql}`,
    [where.param, jsonValue],
  )

  return next
}
