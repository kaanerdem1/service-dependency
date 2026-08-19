/**
 * Snapshot store — karar anının dondurulmuş kanıt paketi (bellekte mock).
 */
import { createHash } from 'node:crypto'
import { getDownstreamIds, getUpstreamIds, services } from './data.js'
import { IMPACT_VIEW, buildImpactGraph } from './impact.js'
import type {
  Snapshot,
  SnapshotClientPayload,
  SnapshotType,
  ImpactRow,
} from './snapshotTypes.js'

export const CATALOG_REVISION = 'mock-catalog-v1'

let seq = 1
const store: Snapshot[] = []

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function buildImpact(centerServiceId: string, visibleMaxHop: number) {
  const graph = buildImpactGraph(
    centerServiceId,
    IMPACT_VIEW.maxNodesAdvanced,
    Math.max(1, visibleMaxHop),
  )

  const hop1: ImpactRow[] = getDownstreamIds(centerServiceId)
    .map((id) => services[id])
    .filter(Boolean)
    .map((s) => ({
      id: s!.id,
      label: s!.name,
      hop: 1,
      direction: 'caller' as const,
      edgeKind: 'tree' as const,
      ownerId: s!.owner?.id,
    }))

  const deeper: ImpactRow[] =
    graph?.nodes
      .filter((n) => n.hop > 1 && n.hop <= visibleMaxHop)
      .map((n) => ({
        id: n.service.id,
        label: n.service.name,
        hop: n.hop,
        direction: 'caller' as const,
        edgeKind: 'tree' as const,
        ownerId: n.service.owner?.id,
      })) ?? []

  const upstream: ImpactRow[] = getUpstreamIds(centerServiceId)
    .map((id) => services[id])
    .filter(Boolean)
    .map((s) => ({
      id: s!.id,
      label: s!.name,
      hop: 1,
      direction: 'callee' as const,
      edgeKind: 'tree' as const,
      ownerId: s!.owner?.id,
    }))

  return {
    hop1,
    deeper: [...deeper, ...upstream.filter((u) => !deeper.some((d) => d.id === u.id))],
    cascadeEdges: [] as Snapshot['impact']['cascadeEdges'],
  }
}

function attachManifest(snapshot: Snapshot): Snapshot {
  const core = { ...snapshot, manifest: undefined as Snapshot['manifest'] }
  const jsonSha = sha256(JSON.stringify(core))
  const files: NonNullable<Snapshot['manifest']>['files'] = [
    { name: 'snapshot.json', sha256: jsonSha, role: 'json' },
  ]
  for (const shot of snapshot.screenshots ?? []) {
    const hash = shot.sha256 ?? sha256(shot.dataUrl)
    shot.sha256 = hash
    files.push({
      name: `${shot.surface}.png`,
      sha256: hash,
      role: 'png',
    })
  }
  const packSha256 = sha256(files.map((f) => f.sha256).join(':'))
  return { ...snapshot, manifest: { files, packSha256 } }
}

export function createSnapshot(input: {
  type: SnapshotType
  actor: { userId: string; displayName?: string }
  changeRequestId?: string
  relatedRequestIds?: string[]
  batchId?: string
  client: SnapshotClientPayload
  approvals?: Snapshot['approvals']
}): Snapshot {
  const centerId = input.client.focus.serviceId
  if (!services[centerId]) {
    throw new Error('focus_service_not_found')
  }

  const screenshots = (input.client.screenshots ?? []).map((s) => ({
    ...s,
    sha256: s.sha256 ?? sha256(s.dataUrl),
  }))

  const mapShot = screenshots.find((s) => s.surface === 'map')

  const draft: Snapshot = {
    id: `SN-${String(seq++).padStart(4, '0')}`,
    type: input.type,
    createdAt: new Date().toISOString(),
    actor: input.actor,
    changeRequestId: input.changeRequestId,
    relatedRequestIds: input.relatedRequestIds,
    batchId: input.batchId,
    catalogRevision: CATALOG_REVISION,
    focus: input.client.focus,
    navigationTrail: input.client.navigationTrail,
    uiChrome: input.client.uiChrome,
    viewState: input.client.viewState,
    impact: buildImpact(centerId, input.client.viewState.visibleMaxHop),
    changeSummary: input.client.changeSummary,
    imageUrl: mapShot?.dataUrl,
    screenshots: screenshots.length ? screenshots : undefined,
    approvals: input.approvals,
  }

  const snapshot = attachManifest(draft)
  store.unshift(snapshot)
  return snapshot
}

export function getSnapshot(id: string) {
  return store.find((s) => s.id === id)
}

export function listSnapshotsForRequest(changeRequestId: string) {
  return store.filter(
    (s) =>
      s.changeRequestId === changeRequestId ||
      s.relatedRequestIds?.includes(changeRequestId),
  )
}

export function listSnapshots() {
  return [...store]
}
