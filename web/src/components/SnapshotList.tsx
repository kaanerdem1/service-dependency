import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import {
  SNAPSHOT_TYPE_LABEL,
  type Snapshot,
} from '../types'
import {
  downloadSnapshotJson,
  downloadSnapshotPng,
} from '../snapshot/capture'
import {
  formatHop1Summary,
  formatHop1Title,
  formatTrailSummary,
  formatViewStateSummary,
} from '../snapshot/formatTrail'
import { mapScreenshot, snapshotHasMapImage } from '../snapshot/imageUrl'
import { listSnapshotsForRequest } from '../api/client'
import { MotionListItem } from '../motion/MotionList'
import { SkeletonShimmer } from '../motion/SkeletonShimmer'

type Props = {
  requestId: string
}

export function SnapshotList({ requestId }: Props) {
  const [items, setItems] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listSnapshotsForRequest(requestId)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows)
          setError(undefined)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Snapshot listesi yüklenemedi')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [requestId])

  if (loading) return <SkeletonShimmer lines={3} />
  if (error) return <p className="form-error">{error}</p>
  if (items.length === 0) {
    return (
      <p className="hint-sm">
        Henüz snapshot yok. Talep açılışı ve onay anında otomatik kaydedilir.
      </p>
    )
  }

  return (
    <>
      <p className="hint-sm">
        Talep ve onay anında otomatik kaydedilir. Küçük resme tıklayın veya PNG
        ile indirin.
      </p>
      <ul className="snapshot-list" data-motion="snapshot-list">
      <AnimatePresence initial={false}>
      {items.map((snap, i) => {
        const when = new Date(snap.createdAt).toLocaleString('tr-TR')
        const hop1Summary = formatHop1Summary(snap)
        const hop1Title = formatHop1Title(snap)
        const trailLines = formatTrailSummary(snap.navigationTrail)
        const viewSummary = formatViewStateSummary(snap)
        const mapShot = mapScreenshot(snap)
        const hasMap = snapshotHasMapImage(snap)
        return (
          <MotionListItem key={snap.id} id={snap.id} index={i} className="snapshot-item">
            <div className="snapshot-item-head">
              <strong>{snap.id}</strong>
              <span className="snapshot-type">
                {SNAPSHOT_TYPE_LABEL[snap.type]}
              </span>
              <time dateTime={snap.createdAt}>{when}</time>
            </div>
            <p className="snapshot-item-meta">
              {snap.focus.label} · Katman {snap.viewState.visibleMaxHop}/
              {snap.viewState.maxHopAvailable}
              {snap.uiChrome.activeTab === 'affected'
                ? ' · İlişkiler'
                : snap.uiChrome.activeTab === 'overview'
                  ? ' · Servis işlevi'
                  : ' · Harita'}
              {snap.uiChrome.drawerOpen ? ' · özet açık' : ' · özet kapalı'}
            </p>
            <p className="snapshot-item-meta" title={hop1Title}>
              {hop1Summary} · Gezinme: {snap.navigationTrail.length} adım
            </p>
            {trailLines.length > 0 && (
              <details className="snapshot-trail-details">
                <summary className="hint-sm">Gezinme özeti (metin)</summary>
                <p className="snapshot-item-meta">{viewSummary}</p>
                <ol className="snapshot-trail-list">
                  {trailLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </details>
            )}
            {hasMap && mapShot && (
              <img
                className="snapshot-thumb"
                src={mapShot.url}
                alt={`${snap.id} harita görüntüsü`}
              />
            )}
            <div className="snapshot-item-actions">
              <button
                type="button"
                className="btn ghost compact"
                onClick={() => downloadSnapshotJson(snap, `${snap.id}.json`)}
              >
                JSON
              </button>
              {hasMap && mapShot && (
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={() =>
                    downloadSnapshotPng(mapShot.url, `${snap.id}.png`)
                  }
                >
                  PNG
                </button>
              )}
            </div>
          </MotionListItem>
        )
      })}
      </AnimatePresence>
      </ul>
    </>
  )
}
