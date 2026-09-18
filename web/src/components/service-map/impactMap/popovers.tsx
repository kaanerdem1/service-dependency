import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import {
  createServiceNote,
  deleteServiceNote,
  listServiceNotes,
} from '../../../api/client'
import type { MethodRef, NoteVisibility, ServiceNote } from '../../../types'
import { NOTE_BODY_MAX } from './constants'

/** Serviste başka yere çağrı yapan metodlar */
export function methodsWithOutgoing(list: MethodRef[]) {
  return list.filter((m) => m.calleeCount > 0)
}

/** Harita zoom’unu bozmayan taşınabilir metod penceresi (varsayılan yukarı) */
export function MethodPopover({
  serviceId,
  serviceName,
  methods,
  mapRef,
  onSelectMethod,
  onClose,
}: {
  serviceId: string
  serviceName: string
  methods: MethodRef[]
  mapRef: RefObject<HTMLDivElement | null>
  onSelectMethod: (serviceId: string, methodId: string) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origTop: number
    origLeft: number
  } | null>(null)
  const placedOnce = useRef(false)

  useEffect(() => {
    placedOnce.current = false
    setPos(null)
  }, [serviceId])

  useEffect(() => {
    if (placedOnce.current || !mapRef.current) return
    const root = mapRef.current
    const anchor =
      root.querySelector<HTMLElement>(`[data-id="mbadge-${serviceId}"]`) ??
      root.querySelector<HTMLElement>(`[data-id="${serviceId}"]`)
    if (!anchor) return
    const rootBox = root.getBoundingClientRect()
    const box = anchor.getBoundingClientRect()
    const popH = 280
    const popW = 240
    // Varsayılan: rozetin üstüne aç
    let top = box.top - rootBox.top - popH - 8
    if (top < 8) top = box.bottom - rootBox.top + 8
    let left = box.left - rootBox.left
    left = Math.max(8, Math.min(left, rootBox.width - popW - 8))
    setPos({ top, left })
    placedOnce.current = true
  }, [mapRef, serviceId, methods.length])

  const onDragStart = (e: ReactMouseEvent) => {
    if (!pos || (e.target as HTMLElement).closest('button, input')) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTop: pos.top,
      origLeft: pos.left,
    }
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      const root = mapRef.current
      if (!d || !root) return
      const rootBox = root.getBoundingClientRect()
      const nextTop = d.origTop + (ev.clientY - d.startY)
      const nextLeft = d.origLeft + (ev.clientX - d.startX)
      setPos({
        top: Math.max(4, Math.min(nextTop, rootBox.height - 80)),
        left: Math.max(4, Math.min(nextLeft, rootBox.width - 120)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const ranked = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return methodsWithOutgoing(methods)
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.className.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        `${a.className}.${a.name}`.localeCompare(
          `${b.className}.${b.name}`,
          'tr',
        ),
      )
  }, [methods, filter])

  if (!pos) return null

  return (
    <div
      className="method-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`${serviceName} method’ları`}
    >
      <header
        className="method-popover-head method-popover-drag"
        onMouseDown={onDragStart}
        title="Sürükleyerek taşı"
      >
        <div className="method-popover-title">
          <strong>{ranked.length} metod</strong>
          <span className="muted"> · {serviceName}</span>
          <span className="method-popover-drag-hint" aria-hidden>
            ⠿
          </span>
        </div>
        <button
          type="button"
          className="method-popover-close"
          onClick={onClose}
          aria-label="Method listesini kapat"
          title="Kapat"
        >
          ×
        </button>
      </header>
      <input
        type="search"
        className="method-popover-filter"
        placeholder="Filtre…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="method-popover-list">
        {ranked.length === 0 ? (
          <li className="method-popover-empty">Çağrı yapan metod yok</li>
        ) : (
          ranked.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelectMethod(serviceId, m.id)}
              >
                <span className="fly-class">{m.className}</span>
                <span className="fly-name">{m.name}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

/** Servis notları popup (method popover gibi sürüklenir) */
export function NotesPopover({
  serviceId,
  serviceName,
  sessionUserId,
  mapRef,
  onClose,
  onCountsChanged,
}: {
  serviceId: string
  serviceName: string
  sessionUserId: string
  mapRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  onCountsChanged: () => void
}) {
  const [notes, setNotes] = useState<ServiceNote[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>('team')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origTop: number
    origLeft: number
  } | null>(null)
  const placedOnce = useRef(false)

  const reload = useCallback(() => {
    setLoading(true)
    void listServiceNotes(serviceId, sessionUserId)
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [serviceId, sessionUserId])

  useEffect(() => {
    placedOnce.current = false
    setPos(null)
    setBody('')
    setError(null)
    reload()
  }, [serviceId, reload])

  useEffect(() => {
    if (placedOnce.current || !mapRef.current) return
    const root = mapRef.current
    const anchor = root.querySelector<HTMLElement>(`[data-id="${serviceId}"]`)
    if (!anchor) return
    const rootBox = root.getBoundingClientRect()
    const box = anchor.getBoundingClientRect()
    const popH = 320
    const popW = 280
    let top = box.top - rootBox.top - popH - 8
    if (top < 8) top = box.bottom - rootBox.top + 8
    let left = box.left - rootBox.left
    left = Math.max(8, Math.min(left, rootBox.width - popW - 8))
    setPos({ top, left })
    placedOnce.current = true
  }, [mapRef, serviceId, notes.length])

  const onDragStart = (e: ReactMouseEvent) => {
    if (!pos || (e.target as HTMLElement).closest('button, input, textarea, select'))
      return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTop: pos.top,
      origLeft: pos.left,
    }
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      const root = mapRef.current
      if (!d || !root) return
      const rootBox = root.getBoundingClientRect()
      setPos({
        top: Math.max(4, Math.min(d.origTop + (ev.clientY - d.startY), rootBox.height - 80)),
        left: Math.max(4, Math.min(d.origLeft + (ev.clientX - d.startX), rootBox.width - 120)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const submit = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      await createServiceNote({
        serviceId,
        authorId: sessionUserId,
        body: text,
        visibility,
      })
      setBody('')
      reload()
      onCountsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (noteId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteServiceNote(noteId, sessionUserId)
      reload()
      onCountsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setBusy(false)
    }
  }

  if (!pos) return null

  return (
    <div
      className="notes-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`${serviceName} notları`}
    >
      <header
        className="notes-popover-head notes-popover-drag"
        onMouseDown={onDragStart}
        title="Sürükleyerek taşı"
      >
        <div className="notes-popover-title">
          <strong>Notlar</strong>
          <span className="notes-popover-drag-hint" aria-hidden>
            ⠿
          </span>
        </div>
        <button
          type="button"
          className="method-popover-close"
          onClick={onClose}
          aria-label="Notları kapat"
          title="Kapat"
        >
          ×
        </button>
      </header>
      <ul className="notes-popover-list">
        {loading ? (
          <li className="notes-popover-empty">Yükleniyor…</li>
        ) : notes.length === 0 ? (
          <li className="notes-popover-empty">Henüz not yok</li>
        ) : (
          notes.map((n) => (
            <li
              key={n.id}
              className={
                n.authorRole === 'lead' ? 'notes-item is-lead' : 'notes-item'
              }
            >
              <div className="notes-item-meta">
                <span className="notes-item-author">
                  {n.authorName}
                  {n.authorRole === 'lead' ? (
                    <span className="notes-lead-tag">Lead</span>
                  ) : null}
                </span>
                <span className="notes-item-when">
                  {new Date(n.createdAt).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {n.visibility === 'all' ? ' · herkes' : ' · ekip'}
                </span>
              </div>
              <p className="notes-item-body">{n.body}</p>
              {n.authorId === sessionUserId && (
                <button
                  type="button"
                  className="notes-item-delete"
                  disabled={busy}
                  onClick={() => void remove(n.id)}
                >
                  Sil
                </button>
              )}
            </li>
          ))
        )}
      </ul>
      <div className="notes-popover-composer">
        <textarea
          rows={2}
          maxLength={NOTE_BODY_MAX}
          placeholder="Kısa not… (Enter gönder)"
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <div className="notes-composer-row">
          <select
            value={visibility}
            disabled={busy}
            onChange={(e) =>
              setVisibility(e.target.value === 'all' ? 'all' : 'team')
            }
            aria-label="Görünürlük"
          >
            <option value="team">Ekip</option>
            <option value="all">Herkes</option>
          </select>
          <span className="notes-char-count">
            {body.trim().length}/{NOTE_BODY_MAX}
          </span>
          <button
            type="button"
            className="notes-submit"
            disabled={busy || !body.trim()}
            onClick={() => void submit()}
          >
            Ekle
          </button>
        </div>
        {error && <p className="notes-error">{error}</p>}
      </div>
    </div>
  )
}
