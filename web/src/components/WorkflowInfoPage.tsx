import { useEffect, useMemo, useState } from 'react'
import { WorkflowFolderGlyph } from './WorkflowIcons'
import { WorkflowFlowCanvas } from './WorkflowFlowCanvas'
import {
  WORKFLOWS_CHANGED_EVENT,
  childFolders,
  folderAcceptsSteps,
  readWorkflows,
  stepsInFolder,
  type WorkflowsStore,
} from '../workflowStore'

type Props = {
  folderId: string
  onSelectService: (serviceId: string) => void
  onOpenFolder: (folderId: string) => void
  onDismiss: () => void
  canEdit?: boolean
}

export function WorkflowInfoPage({
  folderId,
  onSelectService,
  onOpenFolder,
  onDismiss,
  canEdit = true,
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
              <p>
                {canEdit
                  ? 'Henüz adım yok. Drawer’dan bu akışın üzerine sürükleyin.'
                  : 'Henüz adım yok.'}
              </p>
            </div>
          ) : (
            <WorkflowFlowCanvas
              store={store}
              steps={steps}
              canEdit={canEdit}
              onStore={setStore}
              onSelectService={onSelectService}
            />
          )}
        </section>
      )}
    </article>
  )
}
