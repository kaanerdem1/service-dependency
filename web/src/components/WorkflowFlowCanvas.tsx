import { useEffect, useMemo, useState } from 'react'
import { TreeKindIcon } from './TreeKindIcon'
import {
  CHANGE_KINDS,
  hydrateDetails,
  latestServiceChange,
} from './ServiceChangeLog'
import { Button, Field } from '../ui'
import {
  WORKFLOW_EDGE_LABELS,
  WORKFLOW_EDGE_STATUSES,
  edgeBetween,
  removeWorkflowEdge,
  removeWorkflowStep,
  updateWorkflowStepDoc,
  upsertWorkflowEdge,
  type WorkflowEdge,
  type WorkflowEdgeStatus,
  type WorkflowStep,
  type WorkflowStepDoc,
  type WorkflowsStore,
} from '../workflowStore'

type Props = {
  store: WorkflowsStore
  steps: WorkflowStep[]
  canEdit: boolean
  onStore: (next: WorkflowsStore) => void
  onSelectService: (serviceId: string) => void
}

const STEP_FIELDS: {
  id: keyof WorkflowStepDoc
  label: string
  hint: string
  placeholder: string
}[] = [
  {
    id: 'input',
    label: 'Girdi',
    hint: 'Bu servisin aldığı parametre, kayıt, dosya veya çağrı.',
    placeholder: 'Örn. hesap no, silme nedeni, imza',
  },
  {
    id: 'output',
    label: 'Çıktı',
    hint: 'Bu servisin ürettiği sonuç veya sonraki adıma verdiği sözleşme.',
    placeholder: 'Örn. silindi bayrağı, hata kodu',
  },
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

function contractMismatch(from: WorkflowStep, to: WorkflowStep): boolean {
  const out = from.output?.trim()
  const inn = to.input?.trim()
  return Boolean(out && inn && out !== inn)
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
  const filled = STEP_FIELDS.filter((f) => step[f.id]?.trim())
  const showGrid = canEdit || filled.length > 0

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
          {STEP_FIELDS.filter((field) => canEdit || step[field.id]?.trim()).map(
            (field) => (
              <DocField
                key={field.id}
                stepId={step.id}
                field={field}
                value={step[field.id]}
                canEdit={canEdit}
                onStore={onStore}
              />
            ),
          )}
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

export function WorkflowFlowCanvas({
  store,
  steps,
  canEdit,
  onStore,
  onSelectService,
}: Props) {
  const [openKey, setOpenKey] = useState<string>()
  const pairs = useMemo(() => {
    const rows: { from: WorkflowStep; to: WorkflowStep }[] = []
    for (let i = 0; i < steps.length - 1; i++) {
      rows.push({ from: steps[i]!, to: steps[i + 1]! })
    }
    return rows
  }, [steps])

  return (
    <div className="wf-canvas">
      {steps.map((step, index) => {
        const next = steps[index + 1]
        const pairKey = next ? `${step.id}→${next.id}` : undefined
        return (
          <div key={step.id} className="wf-canvas-block">
            <StepCard
              step={step}
              index={index}
              canEdit={canEdit}
              onStore={onStore}
              onSelectService={onSelectService}
            />
            {next && pairKey ? (
              <EdgeEditor
                key={pairKey}
                from={step}
                to={next}
                edge={edgeBetween(store, step.id, next.id)}
                canEdit={canEdit}
                expanded={openKey === pairKey}
                onToggle={() =>
                  setOpenKey((cur) => (cur === pairKey ? undefined : pairKey))
                }
                onStore={onStore}
              />
            ) : null}
          </div>
        )
      })}
      {pairs.length === 0 ? (
        <p className="wf-canvas-one">Tek adım. Geçiş notu en az iki serviste görünür.</p>
      ) : null}
    </div>
  )
}
