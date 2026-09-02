/**
 * Sprint 3–5 smoke: hub impact, neighbors, locations, non-service methods, consistency.
 * Gereksinim: CATALOG_SOURCE=inventory + INVENTORY_* env + DB erişimi.
 */
import { initInventoryCatalog } from '../src/inventory/catalog.ts'
import { buildInventoryImpactGraph, getInventoryDownstreamIds, sampleServicesByDownstreamDegree } from '../src/inventory/graphService.ts'
import { listServiceLocations } from '../src/inventory/serviceService.ts'
import { searchServices } from '../src/inventory/serviceService.ts'
import { UNLOCATED_NODE_ID, listModuleChildren, listModuleRoots, listNonServiceMethodsForArtifact, parseNodeId } from '../src/inventory/treeService.ts'
import { checkInventoryCallGraphConsistency } from '../src/inventory/methodService.ts'
import { IMPACT_VIEW } from '../src/impactGraph.ts'

function ok(label, pass, detail = '') {
  const mark = pass ? '✓' : '✗'
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`)
  return pass
}

async function main() {
  await initInventoryCatalog()

  const hits = await searchServices('PROPOSAL_MAIN_GET')
  const hub = hits.find((s) => s.name === 'PROPOSAL_MAIN_GET') ?? hits[0]
  if (!hub) throw new Error('PROPOSAL_MAIN_GET not found')

  const downstream = getInventoryDownstreamIds(hub.id)
  const graph = buildInventoryImpactGraph(hub.id, IMPACT_VIEW.maxNodesAdvanced)
  if (!graph) throw new Error('impact graph missing')

  let passed = 0
  let total = 0
  const check = (label, pass, detail) => {
    total += 1
    if (ok(label, pass, detail)) passed += 1
  }

  // Sprint 3
  check('S3 hub downstream >= 200', downstream.length >= 200, `${downstream.length}`)
  check('S3 impact truncated', graph.truncated === true)
  check('S3 totalHop1 set', (graph.totalHop1 ?? 0) >= 200, String(graph.totalHop1))
  check('S3 shownHop1 all hop-1', (graph.shownHop1 ?? 0) === downstream.length, String(graph.shownHop1))
  check('S3 banner reason', Boolean(graph.reason?.includes('Tablo')))

  const consistency = await checkInventoryCallGraphConsistency(20)
  check('S3 call-graph consistency sample', consistency.length === 0, `${consistency.length} issues`)

  // Sprint 4
  const locations = await listServiceLocations(hub.id)
  check('S4 locations >= 1', locations.length >= 1, `${locations.length} jar`)

  const roots = await listModuleRoots()
  const arts = await listModuleChildren(roots[0].id)
  const jar = arts.items.find((a) => a.name.includes('.jar')) ?? arts.items[0]
  const parsed = parseNodeId(jar.id)
  check('S4 group→jar skip project', parsed?.prefix === 'art', jar?.name)
  if (parsed?.prefix === 'art') {
    const nonSvc = await listNonServiceMethodsForArtifact(parsed.id, 10, 0)
    check('S4 non-service methods query', Array.isArray(nonSvc), `${nonSvc.length} rows`)
  }

  const unlocatedRoot = roots.find((r) => r.id === UNLOCATED_NODE_ID)
  check('F1 konumsuz bucket', Boolean(unlocatedRoot), unlocatedRoot?.name)

  const samples = sampleServicesByDownstreamDegree([3, 5, 7, 10, 15, 20])
  console.log('\nHop-1 test servisleri:')
  for (const row of samples) {
    console.log(`  ${row.target} bağ → ${row.name} (${row.degree})  ${row.id}`)
  }

  console.log(`\n${passed}/${total} checks passed`)
  if (passed < total) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
