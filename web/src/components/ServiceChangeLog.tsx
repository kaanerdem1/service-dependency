import { useCallback, useEffect, useMemo, useState } from 'react'
import { AutoHeight } from '../motion/AutoHeight'
import { MotionDrawer } from '../motion/MotionDrawer'
import { MotionList, MotionListItem } from '../motion/MotionList'
import { MotionPopover } from '../motion/MotionPopover'
import { Button, Field } from '../ui'

export const CHANGE_KINDS = [
  {
    id: 'input',
    label: 'Girdi',
    hint: 'Parametre, request alanı, zorunluluk',
    placeholder: 'Örn. limit 50 → 100; customerId opsiyonel oldu.',
  },
  {
    id: 'output',
    label: 'Çıktı',
    hint: 'Response alanı, format, boş durum',
    placeholder: 'Örn. totalAmount eklendi; eski status kodları duruyor.',
  },
  {
    id: 'function',
    label: 'Fonksiyon',
    hint: 'İç iş kuralı; sözleşme aynı kalabilir',
    placeholder: 'Örn. validasyon sıkılaştı; imza değişmedi.',
  },
  {
    id: 'contract',
    label: 'Sözleşme',
    hint: 'İmza, hata kodu, kırıcı değişiklik',
    placeholder: 'Örn. yeni zorunlu alan; 400 yerine 422.',
  },
  {
    id: 'behavior',
    label: 'Davranış',
    hint: 'Timeout, default, sıralama, limit',
    placeholder: 'Örn. timeout 3s → 8s; sıralama createdAt desc.',
  },
] as const

export type ChangeKindId = (typeof CHANGE_KINDS)[number]['id']

export type KindDetails = Partial<Record<ChangeKindId, string>>

export type ServiceChange = {
  id: string
  createdAt: string
  commit: string
  kinds: ChangeKindId[]
  kindDetails?: KindDetails
  note: string
}

type Draft = {
  commit: string
  kinds: ChangeKindId[]
  details: KindDetails
}

const emptyDraft = (): Draft => ({ commit: '', kinds: [], details: {} })

function changesStorageKey(serviceId: string) {
  return `sd-service-changes:${serviceId}`
}

function isKind(value: string): value is ChangeKindId {
  return CHANGE_KINDS.some((k) => k.id === value)
}

function kindMeta(id: ChangeKindId) {
  return CHANGE_KINDS.find((k) => k.id === id) ?? CHANGE_KINDS[0]
}

export function hydrateDetails(row: ServiceChange): KindDetails {
  if (row.kindDetails && Object.keys(row.kindDetails).length > 0) {
    return { ...row.kindDetails }
  }
  const details: KindDetails = {}
  for (const kind of row.kinds) {
    details[kind] = row.note
  }
  return details
}

export function latestServiceChange(serviceId: string): ServiceChange | undefined {
  const rows = [...readChanges(serviceId)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  return rows[0]
}

function readChanges(serviceId: string): ServiceChange[] {
  try {
    const raw = localStorage.getItem(changesStorageKey(serviceId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row): row is ServiceChange => {
      if (!row || typeof row !== 'object') return false
      const r = row as ServiceChange
      return (
        typeof r.id === 'string' &&
        typeof r.createdAt === 'string' &&
        typeof r.commit === 'string' &&
        typeof r.note === 'string' &&
        Array.isArray(r.kinds) &&
        r.kinds.every((k) => typeof k === 'string' && isKind(k))
      )
    })
  } catch {
    return []
  }
}

function writeChanges(serviceId: string, rows: ServiceChange[]) {
  localStorage.setItem(changesStorageKey(serviceId), JSON.stringify(rows))
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

function kindLabel(id: ChangeKindId) {
  return kindMeta(id).label
}

function sortKinds(kinds: ChangeKindId[]): ChangeKindId[] {
  return CHANGE_KINDS.map((k) => k.id).filter((id) => kinds.includes(id))
}

function shortCommit(hash: string) {
  const t = hash.trim()
  return t.length > 8 ? t.slice(0, 8) : t
}

function composeNote(kinds: ChangeKindId[], details: KindDetails) {
  return kinds
    .map((kind) => {
      const text = details[kind]?.trim()
      return text ? `${kindLabel(kind)}: ${text}` : null
    })
    .filter(Boolean)
    .join('\n')
}

type Props = {
  serviceId: string
}

export function ServiceChangeLog({ serviceId }: Props) {
  const [rows, setRows] = useState<ServiceChange[]>([])
  const [openId, setOpenId] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState<string | null>(null)
  const [kindMenuOpen, setKindMenuOpen] = useState(false)

  useEffect(() => {
    setRows(readChanges(serviceId))
    setOpenId(null)
    setDraft(emptyDraft())
    setError(null)
    setKindMenuOpen(false)
  }, [serviceId])

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [rows],
  )

  const remainingKinds = CHANGE_KINDS.filter((k) => !draft.kinds.includes(k.id))
  const formOpen = openId !== null
  const isNew = openId === 'new'
  const viewing = openId !== null && openId !== 'new'
  const viewedRow = viewing ? rows.find((row) => row.id === openId) : undefined
  const drawerTitle = isNew ? 'Değişiklik notu' : 'Değişiklik kaydı'

  const persist = (next: ServiceChange[]) => {
    setRows(next)
    writeChanges(serviceId, next)
  }

  const closeDrawer = useCallback(() => {
    setOpenId(null)
    setError(null)
    setKindMenuOpen(false)
  }, [])

  const openNew = () => {
    setOpenId('new')
    setDraft(emptyDraft())
    setError(null)
    setKindMenuOpen(false)
  }

  const openRow = (row: ServiceChange) => {
    setOpenId(row.id)
    setDraft({
      commit: row.commit,
      kinds: sortKinds(row.kinds),
      details: hydrateDetails(row),
    })
    setError(null)
  }

  const addKind = (id: ChangeKindId) => {
    setDraft((prev) =>
      prev.kinds.includes(id)
        ? prev
        : {
            ...prev,
            kinds: sortKinds([...prev.kinds, id]),
            details: { ...prev.details, [id]: prev.details[id] ?? '' },
          },
    )
    setKindMenuOpen(false)
    setError(null)
  }

  const removeKind = (id: ChangeKindId) => {
    setDraft((prev) => {
      const details = { ...prev.details }
      delete details[id]
      return { ...prev, kinds: prev.kinds.filter((k) => k !== id), details }
    })
  }

  const setDetail = (id: ChangeKindId, value: string) => {
    setDraft((prev) => ({
      ...prev,
      details: { ...prev.details, [id]: value },
    }))
  }

  const save = () => {
    const commit = draft.commit.trim()
    if (!commit) {
      setError('Commit zorunlu.')
      return
    }
    const kinds = sortKinds(draft.kinds)
    if (kinds.length === 0) {
      setError('En az bir değişiklik türü seçin.')
      return
    }
    const missing = kinds.find((kind) => !draft.details[kind]?.trim())
    if (missing) {
      setError(`${kindLabel(missing)} için detay yazın.`)
      return
    }

    const kindDetails: KindDetails = {}
    for (const kind of kinds) {
      kindDetails[kind] = draft.details[kind]?.trim() ?? ''
    }
    const note = composeNote(kinds, kindDetails)

    if (openId !== 'new') return
    persist([
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        commit,
        kinds,
        kindDetails,
        note,
      },
      ...rows,
    ])
    closeDrawer()
    setDraft(emptyDraft())
  }

  const remove = () => {
    if (!openId || openId === 'new') return
    persist(rows.filter((row) => row.id !== openId))
    closeDrawer()
    setDraft(emptyDraft())
  }

  return (
    <div className="svc-changes">
      {sorted.length === 0 ? (
        <p className="svc-changes-empty">
          Kayıt yok. Servis sahibi, kod değişince buraya not düşer.
        </p>
      ) : (
        <MotionList className="svc-changes-list">
          {sorted.map((row, index) => (
            <MotionListItem
              key={row.id}
              id={row.id}
              index={index}
              className={`svc-changes-item${openId === row.id ? ' is-open' : ''}`}
            >
              <button
                type="button"
                className="svc-changes-row"
                onClick={() => openRow(row)}
                aria-expanded={openId === row.id}
                title={hydrateDetails(row)[sortKinds(row.kinds)[0]] ?? row.note}
              >
                <span className="svc-changes-date">{formatDate(row.createdAt)}</span>
                <span className="svc-changes-commit">{shortCommit(row.commit)}</span>
                <span className="svc-changes-kinds">
                  {sortKinds(row.kinds).map((k) => kindLabel(k)).join(' · ')}
                </span>
              </button>
            </MotionListItem>
          ))}
        </MotionList>
      )}

      <div className="svc-changes-toolbar">
        <Button variant="ghost" compact onClick={openNew}>
          + Not ekle
        </Button>
      </div>

      <MotionDrawer open={formOpen} title={drawerTitle} onClose={closeDrawer}>
        {viewing ? (
          <div className="svc-changes-form is-readonly">
            <p className="svc-changes-readonly-meta">
              {viewedRow ? formatDate(viewedRow.createdAt) : ''}
            </p>
            <Field
              id={`svc-change-commit-view-${serviceId}`}
              label="Commit"
              value={draft.commit}
              readOnly
            />
            <div className="svc-changes-kinds-field">
              <p className="svc-changes-kind-label">Ne değişti</p>
              <ul className="svc-changes-detail-list">
                {sortKinds(draft.kinds).map((kind) => {
                  const meta = kindMeta(kind)
                  return (
                    <li key={kind} className="svc-changes-detail-card">
                      <div className="svc-changes-detail-head">
                        <span className="svc-changes-detail-badge">{meta.label}</span>
                        <span className="svc-changes-detail-hint">{meta.hint}</span>
                      </div>
                      <p className="svc-changes-detail-text">
                        {draft.details[kind] || '—'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </div>
            <p className="svc-changes-kind-hint">
              Kayıt kilitli. Düzeltmek için silip yeni not ekleyin.
            </p>
            <div className="svc-changes-form-actions">
              <Button variant="ghost" compact onClick={remove}>
                Sil
              </Button>
              <Button variant="primary" compact onClick={closeDrawer}>
                Kapat
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="svc-changes-form"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <Field
              id={`svc-change-commit-${serviceId}`}
              label="Commit"
              required
              value={draft.commit}
              onChange={(e) => setDraft((p) => ({ ...p, commit: e.target.value }))}
              placeholder="abc1234"
              autoComplete="off"
              spellCheck={false}
            />

            <div className="svc-changes-kinds-field">
              <p className="svc-changes-kind-label" id={`svc-change-kind-${serviceId}`}>
                Ne değişti <span className="ui-req">*</span>
              </p>
              <MotionPopover
                open={kindMenuOpen && remainingKinds.length > 0}
                onOpenChange={setKindMenuOpen}
                placement="bottom"
                label="Değişiklik türü"
                className="svc-changes-kind-dd"
                panelClassName="svc-changes-kind-dd-panel"
                trigger={
                  <button
                    type="button"
                    className="svc-changes-kind-trigger"
                    aria-labelledby={`svc-change-kind-${serviceId}`}
                    aria-expanded={kindMenuOpen}
                    disabled={remainingKinds.length === 0}
                    onClick={() => setKindMenuOpen((open) => !open)}
                  >
                    <span>
                      {remainingKinds.length === 0 ? 'Tüm türler eklendi' : 'Tür seçin'}
                    </span>
                    <span className="svc-changes-kind-caret" aria-hidden>
                      ▾
                    </span>
                  </button>
                }
              >
                <ul className="svc-changes-kind-menu" role="listbox">
                  {remainingKinds.map((kind) => (
                    <li key={kind.id}>
                      <button
                        type="button"
                        className="svc-changes-kind-option"
                        role="option"
                        onClick={() => addKind(kind.id)}
                      >
                        <span className="svc-changes-kind-option-label">{kind.label}</span>
                        <span className="svc-changes-kind-option-hint">{kind.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </MotionPopover>

              <AutoHeight deps={[draft.kinds.join(',')]} className="svc-changes-detail-stack">
                {draft.kinds.length === 0 ? (
                  <p className="svc-changes-kind-hint">
                    Dropdown’dan tür ekleyin; her türün kendi detayı olur.
                  </p>
                ) : (
                  <ul className="svc-changes-detail-list">
                    {sortKinds(draft.kinds).map((kind) => {
                      const meta = kindMeta(kind)
                      return (
                        <li key={kind} className="svc-changes-detail-card">
                          <div className="svc-changes-detail-head">
                            <span className="svc-changes-detail-badge">{meta.label}</span>
                            <span className="svc-changes-detail-hint">{meta.hint}</span>
                            <button
                              type="button"
                              className="svc-changes-detail-remove"
                              onClick={() => removeKind(kind)}
                            >
                              Kaldır
                            </button>
                          </div>
                          <textarea
                            id={`svc-change-detail-${serviceId}-${kind}`}
                            className="ui-textarea svc-changes-detail-input"
                            rows={3}
                            required
                            value={draft.details[kind] ?? ''}
                            onChange={(e) => setDetail(kind, e.target.value)}
                            placeholder={meta.placeholder}
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </AutoHeight>
            </div>

            {error ? <p className="svc-changes-error">{error}</p> : null}

            <div className="svc-changes-form-actions">
              <span />
              <Button variant="ghost" compact onClick={closeDrawer}>
                İptal
              </Button>
              <Button variant="primary" compact type="submit">
                Kaydet
              </Button>
            </div>
          </form>
        )}
      </MotionDrawer>
    </div>
  )
}
