/**
 * Akış Rotaları paneli — İş akışları drawer'ının "kayıtlı rota" bölümü.
 *
 * Ne yapar:
 *   - Kayıtlı akış rotalarını süreç (BPM) numarasına göre gruplar gösterir.
 *   - Grup başlığına tıklayınca açılır/kapanır (varsayılan: yalnızca aktif
 *     sürecin grubu açık — bkz. `WorkflowsPanel` içindeki `expandedRouteGroups`).
 *   - Rota adı / süreç no'ya göre serbest metin filtre sağlar.
 *   - Her rota satırında "aç", "yeniden adlandır", "sil" aksiyonlarını sunar
 *     (asıl silme/yeniden adlandırma onayı `ProcessRouteDialogs` içinde).
 *
 * Ne yapmaz:
 *   - localStorage okuma/yazma yapmaz (bkz. `processRouteStore.ts`).
 *   - Grupları veya filtre metnini kendi state'inde tutmaz; state
 *     `WorkflowsPanel`'de merkezi kalır ki drawer açılıp kapanınca veya
 *     aktif süreç değişince "hangi grup açık" kararını tek yerden yönetelim.
 *
 * İlgili ekran: Sol "İş akışları" drawer'ı, "AKIŞ ROTALARI" bölümü.
 */
import { TreeKindIcon } from '../sidebar/TreeKindIcon'
import { GitBranchIcon } from '../workflow-stage/WorkflowIcons'
import type { ProcessRouteBpmGroup, SavedProcessRoute } from '../../stores/processRouteStore'

function RouteRenameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
      <path
        d="M4 20h4.2L18.2 9.8 14.2 5.8 4 16V20z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M13 7.2l3.8 3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

function RouteDeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
      <path
        d="M5.5 7.5h13M10 7.5V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M9 7.5l.65 11h4.7L15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProcessRouteListItem({
  route,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  route: SavedProcessRoute
  active: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <li className="sc-process-route-row">
      <button
        type="button"
        className={`sc-process-item${active ? ' is-active' : ''}`}
        onClick={onOpen}
      >
        <span className="sc-process-route-glyph" aria-hidden>
          <GitBranchIcon />
        </span>
        <span className="sc-process-item-copy">
          <span className="sc-process-item-name">{route.name}</span>
        </span>
      </button>
      <span className="sc-process-route-actions">
        <button
          type="button"
          className="sc-process-route-action is-rename"
          title="Adı düzenle"
          aria-label={`${route.name} rotasının adını düzenle`}
          onClick={(event) => {
            event.stopPropagation()
            onRename()
          }}
        >
          <RouteRenameIcon />
        </button>
        <button
          type="button"
          className="sc-process-route-action is-delete"
          title="Rotayı sil"
          aria-label={`${route.name} rotasını sil`}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <RouteDeleteIcon />
        </button>
      </span>
    </li>
  )
}

type Props = {
  /** Toplam kayıtlı rota sayısı — 0 ise "hiç rota yok" mesajı gösterilir. */
  totalRouteCount: number
  /** Filtre uygulanmış, BPM'e göre gruplanmış rotalar (sıra: ilk görülme sırası). */
  groups: ProcessRouteBpmGroup[]
  /** Şu an açık olan süreç veya rota üzerinden çıkarılan aktif BPM no'su. */
  activeProcessNo?: string
  activeRouteId?: string
  filter: string
  onFilterChange: (value: string) => void
  isGroupExpanded: (processNo: string) => boolean
  onToggleGroup: (processNo: string) => void
  onOpenProcess: (processNo: string) => void
  onOpenRoute: (routeId: string) => void
  onRequestRename: (route: SavedProcessRoute) => void
  onRequestDelete: (route: SavedProcessRoute) => void
}

export function ProcessRoutesPanel({
  totalRouteCount,
  groups,
  activeProcessNo,
  activeRouteId,
  filter,
  onFilterChange,
  isGroupExpanded,
  onToggleGroup,
  onOpenProcess,
  onOpenRoute,
  onRequestRename,
  onRequestDelete,
}: Props) {
  const activeProcessHasRoutes =
    !activeProcessNo || groups.some((group) => group.processNo === activeProcessNo)

  return (
    <div className="sc-process-block sc-process-routes-block">
      <div className="sc-section-label">Akış Rotaları</div>

      {totalRouteCount > 0 ? (
        <label className="sc-route-filter">
          <span className="visually-hidden">Akış rotası ara</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Rota adı veya süreç no…"
            aria-label="Akış rotası ara"
            autoComplete="off"
          />
          {filter ? (
            <button
              type="button"
              className="sc-route-filter-clear"
              aria-label="Rotayı filtrelemeyi temizle"
              onClick={() => onFilterChange('')}
            >
              ×
            </button>
          ) : null}
        </label>
      ) : null}

      {totalRouteCount === 0 ? (
        <p className="sc-process-hint">
          Henüz kaydedilmiş rota yok. Bir süreçte akış rotası oluşturup kaydedin.
        </p>
      ) : groups.length === 0 ? (
        <p className="sc-process-hint">Filtreye uyan rota yok.</p>
      ) : (
        <>
          {!activeProcessHasRoutes ? (
            <p className="sc-process-hint">
              Bu süreç için kayıtlı rota yok. Akış ekranında rota oluşturup kaydedin.
            </p>
          ) : null}
          <div className="sc-route-bpm-groups" role="tree" aria-label="Süreç bazlı akış rotaları">
            {groups.map((group) => {
              const expanded = isGroupExpanded(group.processNo)
              const panelId = `sc-route-bpm-${group.processNo}`
              return (
                <section
                  key={group.processNo}
                  className={`sc-route-bpm-group${expanded ? ' is-expanded' : ''}${
                    activeProcessNo === group.processNo ? ' is-active-process' : ''
                  }`}
                  role="treeitem"
                  aria-expanded={expanded}
                >
                  <div className="sc-route-bpm-head">
                    <button
                      type="button"
                      className="sc-route-bpm-chev-btn"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => onToggleGroup(group.processNo)}
                    >
                      <span className="sc-folder-chev" aria-hidden>
                        {expanded ? '▾' : '▸'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="sc-route-bpm-toggle"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => onToggleGroup(group.processNo)}
                    >
                      <TreeKindIcon kind="process" size={13} title="Süreç" />
                      <span className="sc-route-bpm-copy">
                        <span className="sc-route-bpm-title">{group.processTitle}</span>
                        <span className="sc-route-bpm-meta">
                          {group.processNo}
                          <span className="sc-route-bpm-count">{group.routes.length} rota</span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="sc-route-bpm-open"
                      title="Süreci aç"
                      aria-label={`${group.processTitle} sürecini aç`}
                      onClick={() => onOpenProcess(group.processNo)}
                    >
                      Aç
                    </button>
                  </div>
                  {expanded ? (
                    <ul id={panelId} className="sc-process-list sc-route-bpm-routes wf-tree-body">
                      {group.routes.map((route) => (
                        <ProcessRouteListItem
                          key={route.id}
                          route={route}
                          active={activeRouteId === route.id}
                          onOpen={() => onOpenRoute(route.id)}
                          onRename={() => onRequestRename(route)}
                          onDelete={() => onRequestDelete(route)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
