import { useEffect, useMemo, useState } from 'react'
import {
  CHANGE_KINDS,
  hydrateDetails,
  latestServiceChange,
} from './ServiceChangeLog'
import { WorkflowFolderGlyph } from './WorkflowIcons'
import { WorkflowStepReorder } from './WorkflowStepReorder'
import {
  WORKFLOWS_CHANGED_EVENT,
  childFolders,
  folderAcceptsSteps,
  placeWorkflowStep,
  readWorkflows,
  removeWorkflowStep,
  stepsInFolder,
  type WorkflowStep,
  type WorkflowsStore,
} from '../workflowStore'

type Props = {
  folderId: string
  onSelectService: (serviceId: string) => void
  onOpenFolder: (folderId: string) => void
  onDismiss: () => void
}

function excerpt(text?: string) {
  const t = text?.trim()
  if (!t) return null
  return t.length > 88 ? `${t.slice(0, 85)}…` : t
}

function handshake(
  prev: WorkflowStep,
  next: WorkflowStep,
): { status: 'ok' | 'watch'; title: string; detail?: string } | null {
  const prevChange = latestServiceChange(prev.serviceId)
  const nextChange = latestServiceChange(next.serviceId)
  const prevDetails = prevChange ? hydrateDetails(prevChange) : {}
  const nextDetails = nextChange ? hydrateDetails(nextChange) : {}
  const prevOut = prevChange?.kinds.includes('output')
  const nextIn = nextChange?.kinds.includes('input')

  if (prevOut && nextIn) {
    return {
      status: 'ok',
      title: 'Çıktı → girdi notu var',
      detail: excerpt(nextDetails.input) ?? excerpt(prevDetails.output) ?? undefined,
    }
  }
  if (prevOut && !nextIn) {
    return {
      status: 'watch',
      title: 'Çıktı notu var, sonraki girdide not yok',
      detail: excerpt(prevDetails.output) ?? undefined,
    }
  }
  return null
}

export function WorkflowInfoPage({
  folderId,
  onSelectService,
  onOpenFolder,
  onDismiss,
}: Props) {
  const [store, setStore] = useState<WorkflowsStore>(() => readWorkflows())

  useEffect(() => {
    const refresh = () => setStore(readWorkflows())
    refresh()
    window.addEventListener(WORKFLOWS_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(WORKFLOWS_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [folderId])

  const folder = store.folders.find((f) => f.id === folderId)
  const parent = folder?.parentId
    ? store.folders.find((f) => f.id === folder.parentId)
    : undefined
  const nested = useMemo(
    () => (folder ? childFolders(store, folder.id) : []),
    [folder, store],
  )
  const steps = useMemo(
    () => (folder ? stepsInFolder(store, folder.id) : []),
    [folder, store],
  )

  if (!folder) {
    return (
      <article className="wf-info">
        <header className="wf-info-hero">
          <p className="wf-info-lede">Bu kayıt silindi veya bulunamadı.</p>
          <button type="button" className="ce-dismiss" onClick={onDismiss}>
            Kapat
          </button>
        </header>
      </article>
    )
  }

  const folderMode = !folderAcceptsSteps(store, folder)

  return (
    <article className="wf-info">
      <header className="wf-info-hero">
        <div className="wf-info-hero-main">
          {parent ? (
            <button
              type="button"
              className="wf-info-crumb"
              onClick={() => onOpenFolder(parent.id)}
            >
              {parent.name}
            </button>
          ) : (
            <p className="wf-info-kicker">{folderMode ? 'Klasör' : 'İş akışı'}</p>
          )}
          <div className="wf-info-title-row">
            <span className="wf-info-mark" aria-hidden>
              <WorkflowFolderGlyph icon={folder.icon ?? 'flow'} size={20} />
            </span>
            <h1 className="wf-info-title">{folder.name}</h1>
          </div>
        </div>
        <div className="wf-info-hero-side">
          <button type="button" className="ce-dismiss" onClick={onDismiss}>
            Kapat
          </button>
        </div>
      </header>

      {nested.length > 0 ? (
        <section className="wf-info-block">
          <div className="wf-info-block-head">
            <h2 className="wf-info-h">Alt akışlar</h2>
          </div>
          <ul className="wf-info-cards">
            {nested.map((child) => {
              const childSteps = stepsInFolder(store, child.id)
              const childNested = childFolders(store, child.id)
              return (
                <li key={child.id}>
                  <button
                    type="button"
                    className="wf-info-card"
                    onClick={() => onOpenFolder(child.id)}
                  >
                    <WorkflowFolderGlyph icon={child.icon ?? 'flow'} size={16} />
                    <span className="wf-info-card-copy">
                      <strong>{child.name}</strong>
                      <span>
                        {childNested.length > 0
                          ? `${childNested.length} alt öge`
                          : `${childSteps.length} adım`}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {folderMode ? null : (
        <section className="wf-info-block">
          <div className="wf-info-block-head">
            <h2 className="wf-info-h">Sıra</h2>
          </div>
          {steps.length === 0 ? (
            <div className="wf-info-blank">
              <p>Henüz adım yok. Drawer’dan bu akışın üzerine sürükleyin.</p>
            </div>
          ) : (
            <WorkflowStepReorder
              folderId={folder.id}
              steps={steps}
              variant="info"
              onPlace={(id, fid, index) => setStore(placeWorkflowStep(id, fid, index))}
              onSelect={onSelectService}
              onRemove={(id) => setStore(removeWorkflowStep(id))}
              afterRow={(step) => {
                const i = steps.findIndex((s) => s.id === step.id)
                const next = i >= 0 ? steps[i + 1] : undefined
                if (!next) return null
                const link = handshake(step, next)
                if (!link) return null
                const change = latestServiceChange(step.serviceId)
                const kinds = CHANGE_KINDS.filter((k) => change?.kinds.includes(k.id))
                return (
                  <div className={`wf-info-link is-${link.status} is-compact`}>
                    {kinds.length > 0 ? (
                      <span className="wf-info-chips">
                        {kinds.map((k) => (
                          <span key={k.id} className={`wf-info-chip is-${k.id}`}>
                            {k.label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className="wf-info-link-label">{link.title}</span>
                    {link.detail ? <span className="wf-info-link-detail">{link.detail}</span> : null}
                  </div>
                )
              }}
            />
          )}
        </section>
      )}
    </article>
  )
}
