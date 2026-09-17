import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { AutoHeight } from '../../motion/AutoHeight'
import { layoutSpring } from '../../motion/config'
import { TreeKindIcon } from '../sidebar/TreeKindIcon'
import { WorkflowFolderGlyph } from './WorkflowIcons'
import { searchServices } from '../../api/client'
import { rankServiceHits, SearchHitLabel } from '../search/SearchHitLabel'
import {
  CHANGE_KINDS,
  hydrateDetails,
  latestServiceChange,
} from '../catalog/ServiceChangeLog'
import { Button, Field } from '../../ui'
import {
  MOCK_INPUT_FIELD_DEFS,
  MOCK_OUTPUT_FIELD_DEFS,
  WORKFLOW_EDGE_LABELS,
  WORKFLOW_EDGE_STATUSES,
  addWorkflowStep,
  deleteWorkflowFolder,
  edgeBetween,
  removeWorkflowEdge,
  removeWorkflowStep,
  removeWorkflowStepField,
  sequenceInFolder,
  setWorkflowFolderSummary,
  setWorkflowStepField,
  updateWorkflowStepDoc,
  upsertWorkflowEdge,
  type WorkflowEdge,
  type WorkflowEdgeStatus,
  type WorkflowFieldDef,
  type WorkflowFieldMap,
  type WorkflowFolder,
  type WorkflowSequenceItem,
  type WorkflowStep,
  type WorkflowStepDoc,
  type WorkflowsStore,
} from '../../stores/workflowStore'
import type { Service } from '../../types'

type Props = {
  store: WorkflowsStore
  items: WorkflowSequenceItem[]
  canEdit: boolean
  onStore: (next: WorkflowsStore) => void
  onSelectService: (serviceId: string) => void
  /** Görünen kartların 0 tabanlı başlangıç numarası — iç/dış akış aynı zinciri paylaşır. */
  startIndex?: number
}

function countStepsDeep(store: WorkflowsStore, items: WorkflowSequenceItem[]): number {
  let n = 0
  for (const it of items) {
    if (it.kind === 'step') n += 1
    else n += countStepsDeep(store, sequenceInFolder(store, it.folder.id))
  }
  return n
}

const STEP_FIELDS: {
  id: keyof WorkflowStepDoc & ('edgeCases' | 'scenarios')
  label: string
  hint: string
  placeholder: string
}[] = [
  {
    id: 'edgeCases',
    label: 'Kenar durumlar',
    hint: 'Boş, timeout, kısmi sonuç, yetki yok, tekrar deneme.',
    placeholder: 'Örn. kayıt yoksa 404; timeout’ta retry yok',
  },
  {
    id: 'scenarios',
    label: 'Senaryolar',
    hint: 'Hangi durumda bu adım çalışır, ne gerekir.',
    placeholder: 'Örn. yalnızca onaylı hesap; gece batch’te atlanır',
  },
]

function catalogHint(prev: WorkflowStep, next: WorkflowStep): string | null {
  const prevChange = latestServiceChange(prev.serviceId)
  const nextChange = latestServiceChange(next.serviceId)
  if (!prevChange && !nextChange) return null
  const prevOut = prevChange?.kinds.includes('output')
  const nextIn = nextChange?.kinds.includes('input')
  if (prevOut && !nextIn) return 'Katalog: çıktı notu var, sonraki girdide yok'
  if (prevOut && nextIn) return 'Katalog: çıktı ve girdi notu var'
  const kinds = CHANGE_KINDS.filter(
    (k) => prevChange?.kinds.includes(k.id) || nextChange?.kinds.includes(k.id),
  )
  if (kinds.length === 0) return null
  return `Katalog: ${kinds.map((k) => k.label).join(' · ')}`
}

function catalogDetail(prev: WorkflowStep, next: WorkflowStep): string | null {
  const prevChange = latestServiceChange(prev.serviceId)
  const nextChange = latestServiceChange(next.serviceId)
  const prevDetails = prevChange ? hydrateDetails(prevChange) : {}
  const nextDetails = nextChange ? hydrateDetails(nextChange) : {}
  return nextDetails.input?.trim() || prevDetails.output?.trim() || null
}

/** İki adım arası kontrat kontrolü: önceki çıktı değerlerinden hiçbiri sonraki girdide yoksa uyar. */
function contractMismatch(from: WorkflowStep, to: WorkflowStep): boolean {
  const outValues = new Set(
    Object.values(from.output ?? {})
      .map((v) => v.trim())
      .filter(Boolean),
  )
  const inValues = new Set(
    Object.values(to.input ?? {})
      .map((v) => v.trim())
      .filter(Boolean),
  )
  if (outValues.size === 0 || inValues.size === 0) return false
  for (const v of outValues) {
    if (inValues.has(v)) return false
  }
  return true
}

function FlowArrow() {
  return (
    <span className="wf-canvas-arrow" aria-hidden>
      <span className="wf-canvas-arrow-shaft" />
      <span className="wf-canvas-arrow-head" />
    </span>
  )
}

function DocField({
  stepId,
  field,
  value,
  canEdit,
  onStore,
}: {
  stepId: string
  field: (typeof STEP_FIELDS)[number]
  value?: string
  canEdit: boolean
  onStore: (next: WorkflowsStore) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  if (!canEdit) {
    if (!value?.trim()) return null
    return (
      <div className="wf-canvas-doc">
        <h3 className="wf-canvas-doc-label">{field.label}</h3>
        <p className="wf-canvas-doc-body">{value}</p>
      </div>
    )
  }

  return (
    <label className="wf-canvas-doc">
      <span className="wf-canvas-doc-label">{field.label}</span>
      <span className="wf-canvas-doc-hint">{field.hint}</span>
      <textarea
        rows={3}
        value={draft}
        placeholder={field.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if ((value ?? '') === draft) return
          onStore(updateWorkflowStepDoc(stepId, { [field.id]: draft }))
        }}
      />
    </label>
  )
}

function FieldAddDropdown({
  label,
  options,
  onPick,
}: {
  label: string
  options: WorkflowFieldDef[]
  onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="wf-canvas-dd" ref={rootRef}>
      <button
        type="button"
        className={`wf-canvas-dd-btn${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label} alanı seç`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Alan seç…</span>
        <span className="wf-canvas-dd-chev" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <ul className="wf-canvas-dd-menu" role="listbox">
          {options.map((d) => (
            <li key={d.key} role="presentation">
              <button
                type="button"
                role="option"
                className="wf-canvas-dd-opt"
                onClick={() => {
                  onPick(d.key)
                  setOpen(false)
                }}
              >
                <span className="wf-canvas-dd-opt-label">{d.label}</span>
                <span className="wf-canvas-dd-opt-key">{d.key}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Girdi / Çıktı — önceden tanımlı (mock; ileride DB) alan seti üzerinden key-value düzenleyici. */
function FieldMapEditor({
  stepId,
  kind,
  label,
  hint,
  defs,
  value,
  canEdit,
  onStore,
}: {
  stepId: string
  kind: 'input' | 'output'
  label: string
  hint: string
  defs: WorkflowFieldDef[]
  value?: WorkflowFieldMap
  canEdit: boolean
  onStore: (next: WorkflowsStore) => void
}) {
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const entries = Object.entries(value ?? {})
  const usedKeys = new Set(entries.map(([k]) => k))
  const available = defs.filter((d) => !usedKeys.has(d.key))
  const labelFor = (key: string) => defs.find((d) => d.key === key)?.label ?? key

  const addField = (key: string) => {
    onStore(setWorkflowStepField(stepId, kind, key, ''))
    setJustAdded(key)
  }

  if (!canEdit && entries.length === 0) return null

  return (
    <div className="wf-canvas-doc">
      {canEdit ? (
        <>
          <span className="wf-canvas-doc-label">{label}</span>
          <span className="wf-canvas-doc-hint">{hint}</span>
        </>
      ) : (
        <h3 className="wf-canvas-doc-label">{label}</h3>
      )}
      <div className="wf-canvas-fields">
        {entries.length > 0 ? (
          <div className="wf-canvas-kv-head" aria-hidden>
            <span>Alan</span>
            <span>Değer</span>
          </div>
        ) : null}
        {entries.map(([k, v]) => (
          <div key={k} className={`wf-canvas-field-row${canEdit ? '' : ' is-static'}`}>
            <span className="wf-canvas-field-key" title={k}>
              {labelFor(k)}
            </span>
            {canEdit ? (
              <input
                type="text"
                className="wf-canvas-field-value"
                value={v}
                placeholder="Değer"
                autoFocus={justAdded === k}
                onFocus={() => {
                  if (justAdded === k) setJustAdded(null)
                }}
                onChange={(e) => onStore(setWorkflowStepField(stepId, kind, k, e.target.value))}
              />
            ) : (
              <span className="wf-canvas-field-value is-read">{v.trim() ? v : '—'}</span>
            )}
            {canEdit ? (
              <button
                type="button"
                className="sc-icon-btn sc-icon-btn-danger"
                aria-label={`${labelFor(k)} alanını kaldır`}
                onClick={() => onStore(removeWorkflowStepField(stepId, kind, k))}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {canEdit && available.length > 0 ? (
          <FieldAddDropdown label={label} options={available} onPick={addField} />
        ) : null}
        {canEdit && available.length === 0 && entries.length > 0 ? (
          <p className="wf-canvas-field-add-done">Listedeki alanlar eklendi.</p>
        ) : null}
      </div>
    </div>
  )
}

function StepCard({
  step,
  index,
  canEdit,
  onStore,
  onSelectService,
}: {
  step: WorkflowStep
  index: number
  canEdit: boolean
  onStore: (next: WorkflowsStore) => void
  onSelectService: (serviceId: string) => void
}) {
  const filledDocs = STEP_FIELDS.filter((f) => step[f.id]?.trim())
  const hasInput = Object.keys(step.input ?? {}).length > 0
  const hasOutput = Object.keys(step.output ?? {}).length > 0
  const showGrid = canEdit || filledDocs.length > 0 || hasInput || hasOutput

  return (
    <article className="wf-canvas-node">
      <div className="wf-canvas-node-head">
        <span className="wf-canvas-index">{index + 1}</span>
        <button
          type="button"
          className="wf-canvas-node-main"
          title={step.canonicalName}
          onClick={() => onSelectService(step.serviceId)}
        >
          <TreeKindIcon kind="service" size={16} />
          <span className="wf-canvas-node-name">{step.canonicalName}</span>
          <span className="wf-info-service-go">Aç</span>
        </button>
        {canEdit ? (
          <button
            type="button"
            className="sc-icon-btn sc-icon-btn-danger"
            title="Akıştan kaldır"
            aria-label="Akıştan kaldır"
            onClick={() => onStore(removeWorkflowStep(step.id))}
          >
            ×
          </button>
        ) : null}
      </div>
      {showGrid ? (
        <div className="wf-canvas-docs">
          <FieldMapEditor
            stepId={step.id}
            kind="input"
            label="Girdi"
            hint="Bu adımın aldığı alanlar (önceden tanımlı liste)."
            defs={MOCK_INPUT_FIELD_DEFS}
            value={step.input}
            canEdit={canEdit}
            onStore={onStore}
          />
          <FieldMapEditor
            stepId={step.id}
            kind="output"
            label="Çıktı"
            hint="Bu adımın ürettiği alanlar (önceden tanımlı liste)."
            defs={MOCK_OUTPUT_FIELD_DEFS}
            value={step.output}
            canEdit={canEdit}
            onStore={onStore}
          />
          {STEP_FIELDS.filter((field) => canEdit || step[field.id]?.trim()).map((field) => (
            <DocField
              key={field.id}
              stepId={step.id}
              field={field}
              value={step[field.id]}
              canEdit={canEdit}
              onStore={onStore}
            />
          ))}
        </div>
      ) : (
        <p className="wf-canvas-docs-empty">Bu adım için girdi / çıktı yazılmamış.</p>
      )}
    </article>
  )
}

function EdgeEditor({
  from,
  to,
  edge,
  canEdit,
  expanded,
  onToggle,
  onStore,
}: {
  from: WorkflowStep
  to: WorkflowStep
  edge?: WorkflowEdge
  canEdit: boolean
  expanded: boolean
  onToggle: () => void
  onStore: (next: WorkflowsStore) => void
}) {
  const [status, setStatus] = useState<WorkflowEdgeStatus>(edge?.status ?? 'note')
  const [note, setNote] = useState(edge?.note ?? '')
  const hint = catalogHint(from, to)
  const hintDetail = catalogDetail(from, to)
  const mismatch = contractMismatch(from, to)

  const open = () => {
    setStatus(edge?.status ?? 'note')
    setNote(edge?.note ?? '')
    onToggle()
  }

  const save = () => {
    onStore(
      upsertWorkflowEdge(from.id, to.id, {
        status,
        note,
      }),
    )
    onToggle()
  }

  const clear = () => {
    onStore(removeWorkflowEdge(from.id, to.id))
    onToggle()
  }

  const extras = (
    <>
      {mismatch ? (
        <p className="wf-canvas-mismatch">
          Üstteki çıktı ile alttaki girdi aynı değil — geçiş notunda açıkla.
        </p>
      ) : null}
      {hint ? (
        <p className="wf-canvas-catalog">
          {hint}
          {hintDetail ? ` · ${hintDetail}` : ''}
        </p>
      ) : null}
    </>
  )

  if (!expanded) {
    if (!edge) {
      return (
        <div className="wf-canvas-edge">
          <FlowArrow />
          {canEdit ? (
            <button type="button" className="wf-canvas-edge-empty" onClick={open}>
              Geçiş notu
            </button>
          ) : (
            <span className="wf-canvas-edge-empty is-static">Geçiş notu yok</span>
          )}
          {extras}
        </div>
      )
    }
    return (
      <div className={`wf-canvas-edge is-${edge.status}`}>
        <FlowArrow />
        <button
          type="button"
          className={`wf-canvas-chip is-${edge.status}`}
          onClick={open}
        >
          {WORKFLOW_EDGE_LABELS[edge.status]}
        </button>
        {edge.note ? <p className="wf-canvas-edge-note">{edge.note}</p> : null}
        {extras}
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className={`wf-canvas-edge is-open is-${edge?.status ?? 'note'}`}>
        <FlowArrow />
        <div className="wf-canvas-edge-form">
          <p className={`wf-canvas-chip is-${edge?.status ?? 'note'}`}>
            {edge ? WORKFLOW_EDGE_LABELS[edge.status] : 'Not'}
          </p>
          {edge?.note ? <p className="wf-canvas-edge-note">{edge.note}</p> : null}
          {extras}
          <Button variant="ghost" compact onClick={onToggle}>
            Kapat
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`wf-canvas-edge is-open is-${status}`}>
      <FlowArrow />
      <form
        className="wf-canvas-edge-form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="wf-canvas-status" role="radiogroup" aria-label="Geçiş durumu">
          {WORKFLOW_EDGE_STATUSES.map((id) => (
            <label key={id} className={`wf-canvas-status-opt${status === id ? ' is-on' : ''}`}>
              <input
                type="radio"
                name={`edge-${from.id}-${to.id}`}
                checked={status === id}
                onChange={() => setStatus(id)}
              />
              {WORKFLOW_EDGE_LABELS[id]}
            </label>
          ))}
        </div>
        <Field
          id={`edge-note-${from.id}`}
          label="Geçiş notu"
          hint="Sadece bu iki adım arasındaki kilit, değişiklik veya kontrol."
          multiline
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Sözleşme değişmemeli / şu alanda değişecek / canlıda kontrol et."
        />
        {extras}
        <div className="wf-canvas-edge-actions">
          {edge ? (
            <Button variant="ghost" compact type="button" onClick={clear}>
              Notu sil
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" compact type="button" onClick={onToggle}>
            İptal
          </Button>
          <Button variant="primary" compact type="submit">
            Kaydet
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Bir dalın (senaryo klasörünün) içine servis eklemek için mini arama. */
function AddBranchStep({
  folderId,
  onStore,
}: {
  folderId: string
  onStore: (next: WorkflowsStore) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchServices(q)
        .then((rows) => {
          if (!cancelled) setHits(rankServiceHits(rows, q).slice(0, 8))
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="wf-branch-add-step">
      <input
        type="text"
        className="wf-branch-add-step-input"
        value={query}
        placeholder="Bu dala servis ara ve ekle…"
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Dala servis ekle"
      />
      {query.trim().length >= 2 ? (
        <div className="sc-search-hits wf-branch-search-hits">
          {searching ? (
            <p className="sc-search-status">Aranıyor…</p>
          ) : hits.length === 0 ? (
            <p className="sc-search-status">Sonuç yok</p>
          ) : (
            hits.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sc-hit-main"
                onClick={() => {
                  onStore(addWorkflowStep(s.id, s.name, folderId))
                  setQuery('')
                  setHits([])
                }}
              >
                <TreeKindIcon kind="service" size={13} />
                <SearchHitLabel name={s.name} query={query} id={s.id} />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Ortak adımlardan sonra art arda gelen alt akışlar. Seçilen sütun satırı
 * kaplar, diğerleri kapanır; kapatınca eski bölünmüş haline döner.
 * İç akış açık olmasa da alttaki ortak (bağımsız) adımlar numaralı görünür.
 */
function BranchGroup({
  anchorStep,
  branches,
  tail,
  startIndex,
  store,
  canEdit,
  onStore,
  onSelectService,
}: {
  anchorStep?: WorkflowStep
  branches: WorkflowFolder[]
  tail: WorkflowSequenceItem[]
  startIndex: number
  store: WorkflowsStore
  canEdit: boolean
  onStore: (next: WorkflowsStore) => void
  onSelectService: (serviceId: string) => void
}) {
  const [openId, setOpenId] = useState<string>()
  const [entryOpen, setEntryOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)

  const openFolder = branches.find((b) => b.id === openId)
  const openSequence = useMemo(
    () => (openFolder ? sequenceInFolder(store, openFolder.id) : []),
    [openFolder, store],
  )
  const openSteps = useMemo(
    () => openSequence.filter((it): it is Extract<WorkflowSequenceItem, { kind: 'step' }> => it.kind === 'step'),
    [openSequence],
  )
  const firstOpenStep = openSteps[0]?.step
  const lastOpenStep = openSteps[openSteps.length - 1]?.step
  const mergeStep = tail.find((it): it is Extract<WorkflowSequenceItem, { kind: 'step' }> => it.kind === 'step')?.step
  const innerCount = openFolder ? countStepsDeep(store, openSequence) : 0
  const forkIndex = startIndex
  const tailStart = startIndex + 1 + innerCount

  return (
    <div className="wf-fork">
      <div className="wf-fork-stem" aria-hidden>
        <span className="wf-fork-stem-line" />
        <span className="wf-fork-stem-head" />
      </div>
      <div className="wf-fork-y" aria-hidden>
        <svg viewBox="0 0 100 28" preserveAspectRatio="none">
          <path d="M50 0 V10 C50 18 8 18 8 28" />
          <path d="M50 10 C50 18 92 18 92 28" />
        </svg>
      </div>

      <div className={`wf-fork-lanes${openId ? ' is-picked' : ''}`} role="tablist" aria-label="Alt akışlar">
        {branches.map((b) => {
          const selected = openId === b.id
          const collapsed = Boolean(openId && !selected)
          return (
            <motion.div
              key={b.id}
              layout
              initial={false}
              animate={{
                flexGrow: collapsed ? 0 : 1,
                flexBasis: collapsed ? 0 : '0%',
                opacity: collapsed ? 0 : 1,
              }}
              transition={layoutSpring}
              className={`wf-fork-lane${selected ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
              role="tab"
              aria-selected={selected}
              aria-hidden={collapsed}
            >
              <div className="wf-fork-lane-top">
                <span className="wf-canvas-index">{forkIndex + 1}</span>
                <span className="wf-fork-lane-mark" aria-hidden>
                  <WorkflowFolderGlyph icon={b.icon ?? 'flow'} size={16} />
                </span>
                <strong className="wf-fork-lane-name">{b.name}</strong>
                {canEdit ? (
                  <button
                    type="button"
                    className="sc-icon-btn sc-icon-btn-danger wf-fork-lane-remove"
                    title="Akışı sil"
                    aria-label={`${b.name} akışını sil`}
                    onClick={() => {
                      onStore(deleteWorkflowFolder(b.id))
                      if (openId === b.id) setOpenId(undefined)
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {canEdit ? (
                <textarea
                  className="wf-fork-lane-summary"
                  rows={3}
                  value={b.summary ?? ''}
                  placeholder="Bu akış nerede kullanılır, ne işe yarar?"
                  onChange={(e) => onStore(setWorkflowFolderSummary(b.id, e.target.value))}
                />
              ) : b.summary ? (
                <p className="wf-fork-lane-summary is-static">{b.summary}</p>
              ) : (
                <p className="wf-fork-lane-hint">Bu akış için henüz açıklama yok.</p>
              )}
              <p className="wf-fork-lane-hint">
                {selected
                  ? 'Bu senaryonun adımları aşağıda. Kapatınca diğer akışlar geri gelir.'
                  : 'Bu senaryodan devam etmek için seç.'}
              </p>
              <button
                type="button"
                className={`wf-fork-continue${selected ? ' is-close' : ''}`}
                onClick={() => setOpenId((cur) => (cur === b.id ? undefined : b.id))}
              >
                {selected ? 'Kapat' : 'Bu akıştan devam et'}
              </button>
            </motion.div>
          )
        })}
      </div>

      <AutoHeight open={Boolean(openFolder)} deps={[openId, openSequence.length]} className="wf-branch-body">
        {openFolder ? (
          <>
            {anchorStep && firstOpenStep ? (
              <EdgeEditor
                from={anchorStep}
                to={firstOpenStep}
                edge={edgeBetween(store, anchorStep.id, firstOpenStep.id)}
                canEdit={canEdit}
                expanded={entryOpen}
                onToggle={() => setEntryOpen((v) => !v)}
                onStore={onStore}
              />
            ) : (
              <FlowArrow />
            )}

            {openSequence.length > 0 ? (
              <WorkflowFlowCanvas
                store={store}
                items={openSequence}
                startIndex={startIndex + 1}
                canEdit={canEdit}
                onStore={onStore}
                onSelectService={onSelectService}
              />
            ) : (
              <p className="wf-canvas-docs-empty">
                {canEdit
                  ? 'Henüz adım yok. Aşağıdan servis arayıp bu akışa ekleyin.'
                  : 'Henüz adım yok.'}
              </p>
            )}

            {canEdit ? <AddBranchStep folderId={openFolder.id} onStore={onStore} /> : null}

            <p className="wf-fork-end">{openFolder.name} akışı sonu</p>

            {lastOpenStep && mergeStep ? (
              <EdgeEditor
                from={lastOpenStep}
                to={mergeStep}
                edge={edgeBetween(store, lastOpenStep.id, mergeStep.id)}
                canEdit={canEdit}
                expanded={exitOpen}
                onToggle={() => setExitOpen((v) => !v)}
                onStore={onStore}
              />
            ) : null}
          </>
        ) : null}
      </AutoHeight>

      {!openFolder && tail.length > 0 ? (
        <div className="wf-fork-resume">
          <span className="wf-fork-resume-line" aria-hidden />
          <span className="wf-fork-resume-label">Ortak adımlar aşağıda devam eder</span>
          <span className="wf-fork-resume-head" aria-hidden />
        </div>
      ) : null}

      {tail.length > 0 ? (
        <WorkflowFlowCanvas
          store={store}
          items={tail}
          startIndex={tailStart}
          canEdit={canEdit}
          onStore={onStore}
          onSelectService={onSelectService}
        />
      ) : null}
    </div>
  )
}

export function WorkflowFlowCanvas({
  store,
  items,
  canEdit,
  onStore,
  onSelectService,
  startIndex = 0,
}: Props) {
  const [openKey, setOpenKey] = useState<string>()
  const blocks: ReactNode[] = []
  let stepCount = 0
  let i = 0

  while (i < items.length) {
    const item = items[i]
    if (item.kind === 'step') {
      const index = startIndex + stepCount
      stepCount += 1
      const next = items[i + 1]
      const nextStep = next?.kind === 'step' ? next.step : undefined
      const pairKey = nextStep ? `${item.id}→${nextStep.id}` : undefined
      blocks.push(
        <div key={item.id} className="wf-canvas-block">
          <StepCard
            step={item.step}
            index={index}
            canEdit={canEdit}
            onStore={onStore}
            onSelectService={onSelectService}
          />
          {nextStep && pairKey ? (
            <EdgeEditor
              key={pairKey}
              from={item.step}
              to={nextStep}
              edge={edgeBetween(store, item.id, nextStep.id)}
              canEdit={canEdit}
              expanded={openKey === pairKey}
              onToggle={() => setOpenKey((cur) => (cur === pairKey ? undefined : pairKey))}
              onStore={onStore}
            />
          ) : null}
        </div>,
      )
      i += 1
      continue
    }

    const runStart = i
    const branchFolders: WorkflowFolder[] = []
    while (i < items.length && items[i].kind === 'folder') {
      branchFolders.push((items[i] as Extract<WorkflowSequenceItem, { kind: 'folder' }>).folder)
      i += 1
    }
    const prevItem = items[runStart - 1]
    const anchorStep = prevItem?.kind === 'step' ? prevItem.step : undefined
    const tail = items.slice(i)
    blocks.push(
      <BranchGroup
        key={`branch-${branchFolders.map((f) => f.id).join('-')}`}
        anchorStep={anchorStep}
        branches={branchFolders}
        tail={tail}
        startIndex={startIndex + stepCount}
        store={store}
        canEdit={canEdit}
        onStore={onStore}
        onSelectService={onSelectService}
      />,
    )
    break
  }

  return (
    <div className="wf-canvas">
      {blocks}
      {stepCount <= 1 && items.every((it) => it.kind !== 'folder') && startIndex === 0 ? (
        <p className="wf-canvas-one">Tek adım. Geçiş notu en az iki serviste görünür.</p>
      ) : null}
    </div>
  )
}
