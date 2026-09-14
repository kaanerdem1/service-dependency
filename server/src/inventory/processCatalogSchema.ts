import { INVENTORY_SCHEMA, query } from './db.js'

export type ProcessCatalogSchema = 'legacy' | 'extended'

let cached: ProcessCatalogSchema | null = null
let cachedHasDefinition: boolean | null = null
let cachedHasNodeDescriptions: boolean | null = null

/** extended = `no` kolonu var (PAR import sonrası); legacy = süreç numarası `name` kolonunda. */
export async function getProcessCatalogSchema(): Promise<ProcessCatalogSchema> {
  if (cached) return cached
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'process' AND column_name = 'no'
     ) AS ok`,
    [INVENTORY_SCHEMA],
  )
  cached = rows[0]?.ok ? 'extended' : 'legacy'
  return cached
}

export async function hasProcessDefinitionColumn(): Promise<boolean> {
  if (cachedHasDefinition != null) return cachedHasDefinition
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'process' AND column_name = 'process_definition'
     ) AS ok`,
    [INVENTORY_SCHEMA],
  )
  cachedHasDefinition = rows[0]?.ok ?? false
  return cachedHasDefinition
}

export async function hasNodeDescriptionsColumn(): Promise<boolean> {
  if (cachedHasNodeDescriptions != null) return cachedHasNodeDescriptions
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'process' AND column_name = 'node_descriptions'
     ) AS ok`,
    [INVENTORY_SCHEMA],
  )
  cachedHasNodeDescriptions = rows[0]?.ok ?? false
  return cachedHasNodeDescriptions
}
