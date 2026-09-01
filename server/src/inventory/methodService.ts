/**
 * Inventory metod kataloğu + call_edge graph.
 */
import type { ConsistencyIssue } from '../methods.js'
import { IMPACT_VIEW } from '../impactGraph.js'
import { query, tableName } from './db.js'
import {
  getInventoryService,
  inventoryAffectsEdgesRecord,
  isGraphCatalogReady,
} from './graphService.js'
import { parseServiceId, serviceIdFromDb } from './serviceService.js'

export type InventoryMethodRef = {
  id: string
  serviceId: string
  serviceName: string
  className: string
  name: string
  signature: string
  callerCount: number
  calleeCount: number
}

export type InventoryMethodImpactGraph = {
  center: InventoryMethodRef
  nodes: { method: InventoryMethodRef; hop: number }[]
  edges: { fromId: string; toId: string; hop: number }[]
  hopsDrawn: number
  truncated: boolean
  reason?: string
}

const METHOD_LIST_LIMIT = 200
const NEIGHBOR_LIMIT = 100
const SEARCH_LIMIT = 40

let ready = false
const methodById = new Map<number, InventoryMethodRef>()
const callersOf = new Map<number, number[]>()
const calleesOf = new Map<number, number[]>()

function methodApiId(dbId: number | string): string {
  return `jm-${dbId}`
}

function parseMethodId(id: string): number | undefined {
  const m = /^jm-(\d+)$/.exec(id)
  if (!m) return undefined
  return Number(m[1])
}

function pushNum(map: Map<number, number[]>, key: number, value: number) {
  const list = map.get(key)
  if (list) {
    if (!list.includes(value)) list.push(value)
  } else {
    map.set(key, [value])
  }
}

export async function initMethodCatalog(): Promise<void> {
  if (ready) return

  const { rows: edges } = await query<{ caller_id: string; callee_id: string }>(
    `SELECT caller_id::text, callee_id::text FROM ${tableName('call_edge')}`,
  )

  for (const row of edges) {
    const caller = Number(row.caller_id)
    const callee = Number(row.callee_id)
    pushNum(callersOf, callee, caller)
    pushNum(calleesOf, caller, callee)
  }

  ready = true
  console.log(`[inventory-methods] ${edges.length} call_edge yüklendi`)
}

function toRef(row: {
  id: string
  service_definition_id: string | null
  class_name: string
  name: string
  descriptor: string
  service_name: string | null
}): InventoryMethodRef {
  const dbId = Number(row.id)
  const serviceDbId = row.service_definition_id
  const serviceId = serviceDbId ? serviceIdFromDb(serviceDbId) : 'unknown'
  return {
    id: methodApiId(dbId),
    serviceId,
    serviceName: row.service_name ?? getInventoryService(serviceId)?.name ?? serviceId,
    className: row.class_name,
    name: row.name,
    signature: row.descriptor,
    callerCount: callersOf.get(dbId)?.length ?? 0,
    calleeCount: calleesOf.get(dbId)?.length ?? 0,
  }
}

async function cacheMethod(dbId: number): Promise<InventoryMethodRef | undefined> {
  const cached = methodById.get(dbId)
  if (cached) return cached

  const { rows } = await query<{
    id: string
    service_definition_id: string | null
    class_name: string
    name: string
    descriptor: string
    service_name: string | null
  }>(
    `SELECT jm.id::text AS id,
            jm.service_definition_id::text AS service_definition_id,
            COALESCE(jc.simple_name, jc.fqcn) AS class_name,
            jm.name,
            jm.descriptor,
            sd.service_name
     FROM ${tableName('java_method')} jm
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     LEFT JOIN ${tableName('service_definition')} sd ON sd.id = jm.service_definition_id
     WHERE jm.id = $1`,
    [dbId],
  )
  const row = rows[0]
  if (!row) return undefined
  const ref = toRef(row)
  methodById.set(dbId, ref)
  return ref
}

export async function listMethodRefsForService(serviceId: string): Promise<InventoryMethodRef[]> {
  const dbId = parseServiceId(serviceId)
  if (dbId === undefined) return []

  const { rows } = await query<{
    id: string
    service_definition_id: string | null
    class_name: string
    name: string
    descriptor: string
    service_name: string | null
  }>(
    `SELECT jm.id::text AS id,
            jm.service_definition_id::text AS service_definition_id,
            COALESCE(jc.simple_name, jc.fqcn) AS class_name,
            jm.name,
            jm.descriptor,
            sd.service_name
     FROM ${tableName('java_method')} jm
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     LEFT JOIN ${tableName('service_definition')} sd ON sd.id = jm.service_definition_id
     WHERE jm.class_id IN (
       SELECT class_id FROM ${tableName('java_method')} WHERE service_definition_id = $1
     )
     ORDER BY jc.simple_name, jm.name
     LIMIT $2`,
    [dbId, METHOD_LIST_LIMIT],
  )

  const svc = getInventoryService(serviceId)
  return rows.map((row) => {
    const ref = toRef(row)
    if (svc) {
      ref.serviceId = serviceId
      ref.serviceName = svc.name
    }
    methodById.set(Number(row.id), ref)
    return ref
  })
}

export async function getMethodRef(methodId: string): Promise<InventoryMethodRef | undefined> {
  const dbId = parseMethodId(methodId)
  if (dbId === undefined) return undefined
  return cacheMethod(dbId)
}

export async function getCallerRefs(
  methodId: string,
  limit = NEIGHBOR_LIMIT,
): Promise<InventoryMethodRef[]> {
  const dbId = parseMethodId(methodId)
  if (dbId === undefined) return []
  const refs: InventoryMethodRef[] = []
  for (const id of (callersOf.get(dbId) ?? []).slice(0, limit)) {
    const ref = await cacheMethod(id)
    if (ref) refs.push(ref)
  }
  return refs
}

export async function getCalleeRefs(
  methodId: string,
  limit = NEIGHBOR_LIMIT,
): Promise<InventoryMethodRef[]> {
  const dbId = parseMethodId(methodId)
  if (dbId === undefined) return []
  const refs: InventoryMethodRef[] = []
  for (const id of (calleesOf.get(dbId) ?? []).slice(0, limit)) {
    const ref = await cacheMethod(id)
    if (ref) refs.push(ref)
  }
  return refs
}

export async function searchInventoryMethods(queryText: string): Promise<InventoryMethodRef[]> {
  const q = queryText.trim()
  if (!q) return []
  const pattern = `%${q}%`
  const { rows } = await query<{
    id: string
    service_definition_id: string | null
    class_name: string
    name: string
    descriptor: string
    service_name: string | null
  }>(
    `SELECT jm.id::text AS id,
            jm.service_definition_id::text AS service_definition_id,
            COALESCE(jc.simple_name, jc.fqcn) AS class_name,
            jm.name,
            jm.descriptor,
            sd.service_name
     FROM ${tableName('java_method')} jm
     JOIN ${tableName('java_class')} jc ON jc.id = jm.class_id
     LEFT JOIN ${tableName('service_definition')} sd ON sd.id = jm.service_definition_id
     WHERE jm.name ILIKE $1
        OR jc.simple_name ILIKE $1
        OR jc.fqcn ILIKE $1
        OR sd.service_name ILIKE $1
     ORDER BY sd.service_name NULLS LAST, jc.simple_name, jm.name
     LIMIT $2`,
    [pattern, SEARCH_LIMIT],
  )
  return rows.map((row) => {
    const ref = toRef(row)
    methodById.set(Number(row.id), ref)
    return ref
  })
}

export async function methodImpactSummary(methodId: string, maxDepth = 6) {
  const root = await getMethodRef(methodId)
  if (!root) return undefined
  const dbId = parseMethodId(methodId)!
  const methodIds = new Set<string>()
  const serviceIds = new Set<string>()
  let frontier = [dbId]

  for (let d = 1; d <= maxDepth; d++) {
    const next: number[] = []
    for (const id of frontier) {
      for (const callerId of callersOf.get(id) ?? []) {
        const key = methodApiId(callerId)
        if (methodIds.has(key)) continue
        methodIds.add(key)
        const ref = await cacheMethod(callerId)
        if (ref?.serviceId) serviceIds.add(ref.serviceId)
        next.push(callerId)
      }
    }
    if (next.length === 0) break
    frontier = next
  }

  return {
    methodId,
    methodCount: methodIds.size,
    serviceCount: serviceIds.size,
    serviceIds: [...serviceIds],
    methodIds: [...methodIds],
  }
}

export async function buildInventoryMethodImpactGraph(
  methodId: string,
  maxNodes = IMPACT_VIEW.maxNodesAdvanced,
  maxHops = 6,
): Promise<InventoryMethodImpactGraph | undefined> {
  const dbId = parseMethodId(methodId)
  if (dbId === undefined) return undefined
  const center = await cacheMethod(dbId)
  if (!center) return undefined

  const nodes: InventoryMethodImpactGraph['nodes'] = []
  const edges: InventoryMethodImpactGraph['edges'] = []
  const depth = new Map<string, number>([[methodId, 0]])
  let frontier = [dbId]
  let hopsDrawn = 0
  let truncated = false
  let reason: string | undefined

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextIds: number[] = []
    const seenThisHop = new Set<number>()

    for (const fromId of frontier) {
      const fromKey = methodApiId(fromId)
      for (const callerId of callersOf.get(fromId) ?? []) {
        edges.push({ fromId: fromKey, toId: methodApiId(callerId), hop })
        if (depth.has(methodApiId(callerId)) || seenThisHop.has(callerId)) continue
        seenThisHop.add(callerId)
        nextIds.push(callerId)
      }
    }

    if (nextIds.length === 0) break

    let admit = [...nextIds].sort((a, b) => {
      const am = methodById.get(a)
      const bm = methodById.get(b)
      const al = am ? `${am.className}.${am.name}` : String(a)
      const bl = bm ? `${bm.className}.${bm.name}` : String(b)
      return al.localeCompare(bl, 'tr')
    })

    if (hop === 1 && nodes.length + admit.length > maxNodes) {
      truncated = true
      const cap = Math.min(IMPACT_VIEW.partialHop1Cap, Math.max(1, maxNodes - nodes.length))
      admit = admit.slice(0, cap)
      reason = `${nextIds.length} caller; haritada ${admit.length} gösteriliyor.`
    } else if (nodes.length + admit.length > maxNodes) {
      truncated = true
      reason = `${hop}. katman eklenmedi — görünüm bütçesi (~${maxNodes} düğüm).`
      break
    }

    for (const id of admit) {
      const ref = await cacheMethod(id)
      if (!ref) continue
      depth.set(ref.id, hop)
      nodes.push({ method: ref, hop })
    }

    if (hop === 1 && truncated && nextIds.length > admit.length) {
      frontier = admit
      hopsDrawn = hop
      break
    }

    frontier = admit
    hopsDrawn = hop
  }

  return { center, nodes, edges, hopsDrawn, truncated, reason }
}

export async function checkInventoryCallGraphConsistency(limit = 50): Promise<ConsistencyIssue[]> {
  if (!isGraphCatalogReady()) return []
  const affects = inventoryAffectsEdgesRecord()
  const issues: ConsistencyIssue[] = []

  const { rows } = await query<{
    caller_svc: string
    callee_svc: string
  }>(
    `SELECT DISTINCT
       sd_caller.id::text AS caller_svc,
       sd_callee.id::text AS callee_svc
     FROM ${tableName('call_edge')} ce
     JOIN ${tableName('java_method')} mc ON mc.id = ce.caller_id
     JOIN ${tableName('java_method')} md ON md.id = ce.callee_id
     JOIN ${tableName('service_definition')} sd_caller ON sd_caller.id = mc.service_definition_id
     JOIN ${tableName('service_definition')} sd_callee ON sd_callee.id = md.service_definition_id
     WHERE sd_caller.id <> sd_callee.id
       AND sd_caller.status = 1 AND sd_callee.status = 1
     LIMIT $1`,
    [limit * 20],
  )

  for (const row of rows) {
    const callee = serviceIdFromDb(row.callee_svc)
    const caller = serviceIdFromDb(row.caller_svc)
    const affected = affects[callee] ?? []
    if (!affected.includes(caller)) {
      issues.push({
        code: 'cross_call_missing_affects',
        message: `${caller} → ${callee} metod çağrısı var; rollup eksik`,
      })
      if (issues.length >= limit) break
    }
  }

  return issues
}

export { parseMethodId, methodApiId }
