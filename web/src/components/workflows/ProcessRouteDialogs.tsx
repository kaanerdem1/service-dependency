/**
 * Akış rotası için "yeniden adlandır" ve "sil" onay diyalogları.
 *
 * Ne yapar: `pendingRename` / `pendingDelete` dolu olduğunda `document.body`'ye
 *   portal ile bir modal basar (drawer'ın `overflow` kırpmasından etkilenmesin diye).
 * Ne yapmaz: localStorage'a yazmaz — asıl `renameProcessRoute` / `deleteProcessRoute`
 *   çağrıları `WorkflowsPanel` içindeki `onCommitRename` / `onConfirmDelete`
 *   callback'lerinde yapılır; bu bileşen yalnızca formu ve onayı gösterir.
 * İlgili ekran: Sol "İş akışları" drawer'ı, "AKIŞ ROTALARI" satır aksiyonları.
 */
import { createPortal } from 'react-dom'
import type { SavedProcessRoute } from '../../stores/processRouteStore'

type Props = {
  pendingRename?: SavedProcessRoute
  renameDraft: string
  onRenameDraftChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void

  pendingDelete?: SavedProcessRoute
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

export function ProcessRouteDialogs({
  pendingRename,
  renameDraft,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  pendingDelete,
  onConfirmDelete,
  onCancelDelete,
}: Props) {
  const trimmedDraft = renameDraft.trim()
  const canSaveRename = Boolean(
    pendingRename && trimmedDraft && trimmedDraft !== pendingRename.name,
  )

  return (
    <>
      {pendingRename
        ? createPortal(
            <div className="sc-confirm-backdrop" role="presentation" onMouseDown={onCancelRename}>
              <section
                className="sc-confirm-dialog sc-route-rename-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sc-route-rename-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <h2 id="sc-route-rename-title">Rota adını düzenle</h2>
                <p className="sc-route-rename-meta">
                  {pendingRename.processNo}
                  {pendingRename.processTitle ? ` · ${pendingRename.processTitle}` : ''}
                </p>
                <label className="sc-route-rename-field">
                  <span>Rota adı</span>
                  <input
                    autoFocus
                    type="text"
                    value={renameDraft}
                    maxLength={140}
                    placeholder="Örn. Bölge onay rotası"
                    onChange={(event) => onRenameDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && canSaveRename) {
                        event.preventDefault()
                        onCommitRename()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        onCancelRename()
                      }
                    }}
                  />
                </label>
                <div className="sc-confirm-actions">
                  <button type="button" onClick={onCancelRename}>
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    className="is-primary"
                    disabled={!canSaveRename}
                    onClick={onCommitRename}
                  >
                    Kaydet
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}

      {pendingDelete
        ? createPortal(
            <div className="sc-confirm-backdrop" role="presentation" onMouseDown={onCancelDelete}>
              <section
                className="sc-confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sc-route-delete-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <h2 id="sc-route-delete-title">Rotayı sil</h2>
                <p>“{pendingDelete.name}” rotası kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>
                <div className="sc-confirm-actions">
                  <button type="button" onClick={onCancelDelete}>
                    Vazgeç
                  </button>
                  <button type="button" className="is-danger" onClick={onConfirmDelete}>
                    Sil
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
