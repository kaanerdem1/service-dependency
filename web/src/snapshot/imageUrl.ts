import type { Snapshot, SnapshotScreenshot } from '../types'

export function snapshotImageUrl(
  snapshotId: string,
  surface: SnapshotScreenshot['surface'] = 'map',
) {
  return `/api/snapshots/${encodeURIComponent(snapshotId)}/image?surface=${encodeURIComponent(surface)}`
}

export function mapScreenshot(snap: Snapshot): SnapshotScreenshot | undefined {
  return snap.screenshots?.find((s) => s.surface === 'map')
}

export function snapshotHasMapImage(snap: Snapshot) {
  return Boolean(mapScreenshot(snap))
}
