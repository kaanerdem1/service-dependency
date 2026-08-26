/**
 * Snapshot store — karar anının dondurulmuş kanıt paketi (bellekte mock).
 * PNG'ler JSON dışında ayrı bellekte; GET /api/snapshots/:id/image ile servis edilir.
 */
import { createHash } from 'node:crypto'
import { getDownstreamIds, getUpstreamIds, services } from './data.js'
import { IMPACT_VIEW, buildImpactGraph } from './impact.js'
import type {
  Snapshot,
  SnapshotClientPayload,
  SnapshotScreenshot,
  SnapshotType,
  ImpactRow,
} from './snapshotTypes.js'

export const CATALOG_REVISION = 'mock-catalog-v1'

let seq = 1
const store: Snapshot[] = []

type StoredImage = { buffer: Buffer; sha256: string; contentType: string }
const imageStore = new Map<string, StoredImage>()

function imageKey(snapshotId: string, surface: string) {
  return `${snapshotId}:${surface}`
}

function sha256(data: string | Buffer) {
  return createHash('sha256').update(data).digest('hex')
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/([a-z+]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) throw new Error('invalid_screenshot_data_url')
  return Buffer.from(match[2]!, 'base64')
}

function screenshotUrl(snapshotId: string, surface: SnapshotScreenshot['surface']) {
  return `/api/snapshots/${encodeURIComponent(snapshotId)}/image?surface=${encodeURIComponent(surface)}`
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
    deeper,
    upstream,
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
    files.push({
      name: `${shot.surface}.png`,
      sha256: shot.sha256,
      role: 'png',
    })
  }
  const packSha256 = sha256(files.map((f) => f.sha256).join(':'))
  return { ...snapshot, manifest: { files, packSha256 } }
}

function ingestScreenshots(
  snapshotId: string,
  uploads: SnapshotClientPayload['screenshots'],
): SnapshotScreenshot[] | undefined {
  if (!uploads?.length) return undefined

  const refs: SnapshotScreenshot[] = []
  for (const upload of uploads) {
    const buffer = decodeDataUrl(upload.dataUrl)
    const hash = upload.sha256 ?? sha256(buffer)
    const contentType =
      /^data:image\/([a-z+]+);base64,/i.exec(upload.dataUrl)?.[1] === 'png'
        ? 'image/png'
        : 'image/png'
    imageStore.set(imageKey(snapshotId, upload.surface), {
      buffer,
      sha256: hash,
      contentType,
    })
    refs.push({
      surface: upload.surface,
      capturedAt: upload.capturedAt,
      sha256: hash,
      url: screenshotUrl(snapshotId, upload.surface),
    })
  }
  return refs.length ? refs : undefined
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

  const id = `SN-${String(seq++).padStart(4, '0')}`
  const screenshots = ingestScreenshots(id, input.client.screenshots)

  const draft: Snapshot = {
    id,
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
    screenshots,
    approvals: input.approvals,
  }

  const snapshot = attachManifest(draft)
  store.unshift(snapshot)
  return snapshot
}

export function getSnapshot(id: string) {
  return store.find((s) => s.id === id)
}

export function getSnapshotImage(id: string, surface: string) {
  return imageStore.get(imageKey(id, surface))
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
