/**
 * Tek iş akışı klasörü bilgi / adım özeti sayfası.
 * Kullanan: `ServicesMainStage.tsx`. Store: `workflowStore.ts`.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui'
import { WorkflowFolderGlyph } from './WorkflowIcons'
import { WorkflowFlowCanvas } from './WorkflowFlowCanvas'
import {
  WORKFLOWS_CHANGED_EVENT,
  childFolders,
  folderAcceptsSteps,
  pureOrganizerChildren,
  readWorkflows,
  sequenceInFolder,
  setWorkflowFolderSummary,
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
  const [editing, setEditing] = useState(false)
  const writable = Boolean(canEdit && editing)

  useEffect(() => {
    setEditing(false)
  }, [folderId])

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
  const folderMode = folder ? !folderAcceptsSteps(store, folder) : false
  const nested = useMemo(
    () =>
      folder
        ? folderMode
          ? childFolders(store, folder.id)
          : pureOrganizerChildren(store, folder.id)
        : [],
    [folder, folderMode, store],
  )
  const sequence = useMemo(
    () => (folder ? sequenceInFolder(store, folder.id) : []),
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
          {folderMode ? null : writable ? (
            <label className="wf-info-summary">
              <span className="wf-info-summary-label">Akış özeti</span>
              <textarea
                rows={3}
                value={folder.summary ?? ''}
                placeholder="Bu akış nerede kullanılır, ne işe yarar? (ör. bireysel kredi başvurusunda limit ve belge kontrolü)"
                onChange={(e) => setStore(setWorkflowFolderSummary(folder.id, e.target.value))}
              />
            </label>
          ) : folder.summary ? (
            <p className="wf-info-lede">{folder.summary}</p>
          ) : null}
        </div>
        <div className="wf-info-hero-side">
          {canEdit ? (
            editing ? (
              <Button variant="primary" compact onClick={() => setEditing(false)}>
                Bitir
              </Button>
            ) : (
              <Button variant="ghost" compact onClick={() => setEditing(true)}>
                Düzenle
              </Button>
            )
          ) : null}
          <button
            type="button"
            className="ce-dismiss"
            onClick={() => (parent ? onOpenFolder(parent.id) : onDismiss())}
          >
            Geri
          </button>
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
                        {child.summary?.trim()
                          ? child.summary
                          : childNested.length > 0
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
          {sequence.length === 0 ? (
            <div className="wf-info-blank">
              <p>
                {writable
                  ? 'Henüz adım yok. Drawer’dan bu akışın üzerine sürükleyin.'
                  : 'Henüz adım yok.'}
              </p>
            </div>
          ) : (
            <WorkflowFlowCanvas
              store={store}
              items={sequence}
              canEdit={writable}
              onStore={setStore}
              onSelectService={onSelectService}
            />
          )}
        </section>
      )}
    </article>
  )
}
