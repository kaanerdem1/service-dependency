import { pingInventory } from '../src/inventory/db.ts'
import { getServiceById, searchServices } from '../src/inventory/serviceService.ts'
import { listModuleChildren, listModuleRoots } from '../src/inventory/treeService.ts'

async function main() {
  await pingInventory()
  const roots = await listModuleRoots()
  console.log('roots', roots.length, roots[0]?.name)

  const projects = await listModuleChildren(roots[0].id)
  console.log('projects', projects.items.length, projects.items[0]?.name)

  const arts = await listModuleChildren(projects.items[0].id)
  console.log('artifacts', arts.items.length)

  const proposalJar = arts.items.find((a) => a.name === 'CCSProposal.jar') ?? arts.items[0]
  if (proposalJar) {
    const svcs = await listModuleChildren(proposalJar.id)
    console.log('services', svcs.total, svcs.items[0]?.name?.slice(0, 48))
  }

  const hits = await searchServices('PROPOSAL_MAIN')
  console.log('search', hits[0]?.id, hits[0]?.name?.slice(0, 48))
  if (hits[0]) {
    const svc = await getServiceById(hits[0].id)
    console.log('detail', svc?.packageId, svc?.projectId)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
