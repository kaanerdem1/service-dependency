import { useCallback } from 'react'
import { captureSnapshotScreenshots } from './capture'
import { useSnapshotTrail } from './trail'
import type { SnapshotClientPayload } from '../types'

export function useSnapshotPack() {
  const trail = useSnapshotTrail()

  const buildClientPayload = useCallback(
    async (opts: {
      mapEl?: HTMLElement | null
      workspaceEl?: HTMLElement | null
      watermarkLines: string[]
      includeFullApp?: boolean
    }): Promise<SnapshotClientPayload> => {
      const base = trail.getClientPayload()
      const screenshots = await captureSnapshotScreenshots({
        mapRoot: opts.mapEl,
        workspaceRoot: opts.includeFullApp ? opts.workspaceEl : null,
        watermark: opts.watermarkLines,
      })
      return { ...base, screenshots }
    },
    [trail],
  )

  return { trail, buildClientPayload }
}

export function snapshotWatermarkLines(extra: string[] = []) {
  const now = new Date().toLocaleString('tr-TR')
  return [`Service Dependency · ${now}`, ...extra]
}
