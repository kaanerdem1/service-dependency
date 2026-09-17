/**
 * Süreç düğümü sağ drawer — detay, geçişler, düğüm notu (PATCH API).
 * Kullanan: `ProcessFlowMap`, `ProcessFlowRouteBuilder`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { patchProcessNodeDescriptions, resolveProcessRefs, resolveServiceNames } from '../../api/client'
import type {
  ProcessDecisionInfo,
  ProcessFlowNodeKind,
  ProcessIncomingTransition,
  ProcessNodeDescriptionsDoc,
  ProcessNodeDetails,
  ProcessDetailGroup,
  ProcessOutgoingTransition,
  ProcessRefResolve,
  ServiceNameResolve,
  ServiceScreenLink,
} from '../../types'
import { collectScreenNamesFromDetails, matchProcessScreens } from './processFlowDrawerNav'

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  subprocess: 'Alt süreç',
  dummy: 'Adım',
  other: 'Adım',
}

function noteSectionTitle(kind: ProcessFlowNodeKind): string {
  return `${KIND_LABEL[kind]} açıklaması`
}

const CRITERIA_LABEL: Record<string, string> = {
  organization: 'Organizasyon',
  organizationType: 'Org. tipi',
  organizationGroup: 'Org. grubu',
  profile: 'Profil',
  channelCode: 'Kanal',
  unit: 'Birim',
}

function formatCriteria(criteria: Record<string, string>): string {
  return Object.entries(criteria)
    .map(([k, v]) => `${CRITERIA_LABEL[k] ?? k}: ${v}`)
    .join(' · ')
}

import type { ProcessPathSnapshotStep as ProcessPathStep } from '../../snapshot/processPathSnapshot'
import { transitionCaption } from './processUserRoute'
import {
  allTransitionServiceCodes,
  detailGroupsWithoutTransitionServices,
  servicesForOutgoingLabel,
} from './processFlowTransitionServices'

export type { ProcessPathStep }

function DetailGroups({ groups }: { groups: ProcessDetailGroup[] }) {
  if (groups.length === 0) return null
  return groups.map((group) => (
    <section key={group.title} className="pf-detail-section">
      <h3 className="pf-detail-section-title">{group.title}</h3>
      <dl className="pf-detail-dl">
        {group.rows.map((row) => (
          <div key={`${group.title}-${row.label}-${row.value}`} className="pf-detail-dl-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  ))
}

function DrawerNodeJump({
  nodeId,
  nodeName,
  kind,
  jumpable,
  onFocusNode,
}: {
  nodeId: string
  nodeName: string
  kind: ProcessFlowNodeKind
  jumpable: boolean
  onFocusNode?: (nodeId: string) => void
}) {
  if (jumpable && onFocusNode) {
    return (
      <button
        type="button"
        className="pf-detail-node-jump"
        title="Haritada göster"
        onClick={() => onFocusNode(nodeId)}
      >
        <span className="pf-detail-incoming-kind">{KIND_LABEL[kind]}</span>
        {nodeName}
      </button>
    )
  }
  return (
    <span className="pf-detail-incoming-from">
      <span className="pf-detail-incoming-kind">{KIND_LABEL[kind]}</span>
      {nodeName}
    </span>
  )
}

type Props = {
  open: boolean
  nodeId: string
  nodeName: string
  kind: ProcessFlowNodeKind
  details?: ProcessNodeDetails
  decisionInfo?: ProcessDecisionInfo
  services: string[]
  subProcessNo?: string
  incoming?: ProcessIncomingTransition[]
  outgoing?: ProcessOutgoingTransition[]
  /** Rota kurucusunda yalnız bu rotadaki geliş/çıkış gösterilir. */
  routeScoped?: boolean
  /** start'tan bu düğüme kadar sıralı kanonik yol — Snapshot export'u için. */
  path?: ProcessPathStep[]
  onSnapshot?: () => void
  snapshotBusy?: boolean
  onClose: () => void
  onOpenService?: (serviceName: string, serviceId?: string) => void
  onOpenSubProcess?: (processNo: string) => void
  /** Süreç `screen_process` listesi — XML Ekran satırı ile eşleştirilir. */
  processScreens?: ServiceScreenLink[]
  onHighlightScreen?: (screenOid: string) => void
  /** Haritada düğüme git + drawer değiştir (tam akış / rota). */
  onFocusNode?: (nodeId: string) => void
  jumpableNodeIds?: ReadonlySet<string>
  processNo?: string
  nodeDescriptions?: ProcessNodeDescriptionsDoc
  canEditCatalog?: boolean
  onNodeDescriptionsChange?: (doc: ProcessNodeDescriptionsDoc) => void
}

export function ProcessFlowDetailDrawer({
  open,
  nodeId,
  nodeName,
  kind,
  details,
  decisionInfo,
  services,
  subProcessNo,
  incoming = [],
  outgoing = [],
  routeScoped: _routeScoped = false,
  path = [],
  onSnapshot,
  snapshotBusy = false,
  onClose,
  onOpenService,
  onOpenSubProcess,
  processScreens = [],
  onHighlightScreen,
  onFocusNode,
  jumpableNodeIds,
  processNo,
  nodeDescriptions,
  canEditCatalog = false,
  onNodeDescriptionsChange,
}: Props) {
  const hasPath = path.length > 1
  const rules = decisionInfo?.rules ?? []
  const detailGroups = details?.groups ?? []
  const xmlGroupsWithoutTransitions = useMemo(
    () => detailGroupsWithoutTransitionServices(detailGroups),
    [detailGroups],
  )
  const decisionDetailGroups = kind === 'decision' ? xmlGroupsWithoutTransitions : []
  const taskDetailGroups = kind === 'decision' ? [] : xmlGroupsWithoutTransitions
  const hasRules = rules.length > 0
  const hasSubProcess = Boolean(subProcessNo?.trim())
  const hasIncoming = incoming.length > 0
  const hasOutgoing = outgoing.length > 0
  // "Geçiş: X" grupları (details.groups) zaten kendi servisini "Servis: Y"
  // satırıyla gösteriyor. Aşağıdaki düz "Servisler" listesi TÜM node
  // servislerini (hangi geçişe ait olduğu belirtilmeden) tekrar gösterirse,
  // hem tekrar hem de "bu servisler hangi oka ait?" karışıklığı yaratıyordu
  // — ekrandaki oklarla eşleşmeyen servisler varmış gibi görünüyordu. Bu
  // yüzden burada sadece HİÇBİR "Geçiş:" grubunda geçmeyen (adım seviyesi,
  // belirli bir çıkışa bağlı olmayan) servisler kalır.
  const transitionServiceCodeList = useMemo(
    () => allTransitionServiceCodes(details),
    [details],
  )
  const transitionServiceCodes = useMemo(
    () => new Set(transitionServiceCodeList),
    [transitionServiceCodeList],
  )
  const otherServices = useMemo(
    () => services.filter((s) => !transitionServiceCodes.has(s)),
    [services, transitionServiceCodes],
  )
  const hasServices = otherServices.length > 0
  const serviceSummary =
    services.length > 0
      ? transitionServiceCodeList.length > 0
        ? `${transitionServiceCodeList.length} geçiş servisi · ${otherServices.length} adım servisi`
        : `${services.length} servis (adım düzeyinde)`
      : null
  const catalogServiceCodes = useMemo(
    () => [...new Set([...otherServices, ...transitionServiceCodeList])],
    [otherServices, transitionServiceCodeList],
  )
  const [resolved, setResolved] = useState<ServiceNameResolve[]>([])
  const [subProcessMeta, setSubProcessMeta] = useState<ProcessRefResolve | null>(null)

  const savedNote = nodeDescriptions?.nodes?.[nodeId]
  const hasSavedNote = Boolean(savedNote?.title?.trim() || savedNote?.text?.trim())
  const showNoteSection = canEditCatalog || hasSavedNote
  const [draftTitle, setDraftTitle] = useState('')
  const [draftText, setDraftText] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteError, setNoteError] = useState<string>()
  const [noteEditing, setNoteEditing] = useState(false)

  useEffect(() => {
    if (!open) return
    setNoteEditing(false)
    setDraftTitle(savedNote?.title ?? '')
    setDraftText(savedNote?.text ?? '')
    setNoteError(undefined)
  }, [open, nodeId])

  useEffect(() => {
    if (!open || noteEditing) return
    setDraftTitle(savedNote?.title ?? '')
    setDraftText(savedNote?.text ?? '')
  }, [open, noteEditing, savedNote?.title, savedNote?.text])

  const closeNoteEditing = useCallback(() => {
    setDraftTitle(savedNote?.title ?? '')
    setDraftText(savedNote?.text ?? '')
    setNoteError(undefined)
    setNoteEditing(false)
  }, [savedNote?.text, savedNote?.title])

  const persistNote = useCallback(
    async (patch: { title?: string | null; text?: string | null; delete?: boolean }) => {
      if (!processNo?.trim()) return
      const nodeKey = nodeId.trim()
      if (!nodeKey) {
        setNoteError('Düğüm kimliği yok; kaydedilemedi.')
        return
      }
      setNoteBusy(true)
      setNoteError(undefined)
      try {
        const res = await patchProcessNodeDescriptions(processNo, { nodeKey, ...patch })
        onNodeDescriptionsChange?.(res.nodeDescriptions)
        const saved = res.nodeDescriptions.nodes?.[nodeKey]
        setDraftTitle(saved?.title ?? '')
        setDraftText(saved?.text ?? '')
        setNoteError(undefined)
        setNoteEditing(false)
      } catch (e) {
        setNoteError(e instanceof Error ? e.message : 'Kaydedilemedi')
      } finally {
        setNoteBusy(false)
      }
    },
    [nodeId, onNodeDescriptionsChange, processNo],
  )

  const serviceKey = useMemo(() => catalogServiceCodes.join('\0'), [catalogServiceCodes])

  useEffect(() => {
    if (!open || catalogServiceCodes.length === 0) {
      setResolved([])
      return
    }
    let cancelled = false
    void resolveServiceNames(catalogServiceCodes)
      .then((rows) => {
        if (!cancelled) setResolved(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(
            catalogServiceCodes.map((serviceName) => ({
              serviceName,
              id: null,
              descriptionTr: null,
            })),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [catalogServiceCodes, open, serviceKey])

  const resolvedByName = useMemo(
    () => new Map(resolved.map((row) => [row.serviceName, row])),
    [resolved],
  )

  useEffect(() => {
    if (!open || !hasSubProcess || !subProcessNo) {
      setSubProcessMeta(null)
      return
    }
    let cancelled = false
    void resolveProcessRefs([subProcessNo])
      .then((rows) => {
        if (!cancelled) setSubProcessMeta(rows[0] ?? null)
      })
      .catch(() => {
        if (!cancelled) setSubProcessMeta(null)
      })
    return () => {
      cancelled = true
    }
  }, [hasSubProcess, open, subProcessNo])

  const subProcessKnown = Boolean(subProcessMeta?.descriptionTr || subProcessMeta?.name)

  const matchedScreens = useMemo(
    () => matchProcessScreens(collectScreenNamesFromDetails(details), processScreens),
    [details, processScreens],
  )
  const canJump = useCallback(
    (id: string) => Boolean(onFocusNode && jumpableNodeIds?.has(id)),
    [jumpableNodeIds, onFocusNode],
  )

  return (
    <aside
      className={`pf-detail-drawer${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="pf-detail-drawer-title"
      aria-hidden={!open}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="pf-detail-drawer-head">
        <div className="pf-detail-drawer-head-copy">
          <span className="pf-detail-drawer-kind">{KIND_LABEL[kind]}</span>
          <h2 id="pf-detail-drawer-title" className="pf-detail-drawer-title">
            {nodeName}
          </h2>
          {nodeId.trim() !== nodeName.trim() ? (
            <p className="pf-detail-drawer-id" title="XML düğüm adı">
              {nodeId}
            </p>
          ) : null}
          {serviceSummary ? <p className="pf-detail-meta">{serviceSummary}</p> : null}
        </div>
        <div className="pf-detail-drawer-head-actions">
          {onSnapshot ? (
            <button
              type="button"
              className="pf-detail-drawer-snapshot"
              onClick={onSnapshot}
              disabled={!hasPath || snapshotBusy}
              title={
                hasPath
                  ? 'Buraya kadar gelen yolun PDF snapshot\u2019ını indir'
                  : 'Yol bilgisi yok'
              }
              aria-label="Snapshot indir (PDF)"
            >
              {snapshotBusy ? (
                '…'
              ) : (
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
                  <path
                    d="M8 1.5v8.4M8 9.9 5 6.9M8 9.9l3-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2.5 10.8v2c0 .66.54 1.2 1.2 1.2h8.6c.66 0 1.2-.54 1.2-1.2v-2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ) : null}
          <button type="button" className="pf-detail-drawer-close" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>
      </header>
      <div className="pf-detail-drawer-body">
        {showNoteSection ? (
          <section className="pf-detail-section pf-detail-note-section">
            <div className="pf-detail-note-head">
              <h3 className="pf-detail-section-title">{noteSectionTitle(kind)}</h3>
              {canEditCatalog && processNo ? (
                <button
                  type="button"
                  className="pf-detail-note-edit-toggle"
                  disabled={noteBusy}
                  onClick={() => (noteEditing ? closeNoteEditing() : setNoteEditing(true))}
                >
                  {noteEditing ? 'Kapat' : 'Düzenle'}
                </button>
              ) : null}
            </div>
            {noteEditing && canEditCatalog && processNo ? (
              <>
                <p className="pf-detail-lead">
                  XML dışı katalog notu — ekip geneli görür (sunucu veritabanı).
                </p>
                <label className="pf-detail-note-field">
                  <span>Kısa başlık (isteğe bağlı)</span>
                  <input
                    type="text"
                    value={draftTitle}
                    maxLength={200}
                    disabled={noteBusy}
                    onChange={(e) => setDraftTitle(e.target.value)}
                  />
                </label>
                <label className="pf-detail-note-field">
                  <span>Açıklama</span>
                  <textarea
                    value={draftText}
                    rows={5}
                    maxLength={12000}
                    disabled={noteBusy}
                    placeholder="Bu adımda ne olur? Kim onaylar? Hangi dal ne anlama gelir?"
                    onChange={(e) => setDraftText(e.target.value)}
                  />
                </label>
                {noteError ? <p className="pf-detail-note-error">{noteError}</p> : null}
                <div className="pf-detail-note-actions">
                  <button
                    type="button"
                    className="pf-detail-note-save"
                    disabled={noteBusy || !draftText.trim()}
                    onClick={() =>
                      void persistNote({
                        title: draftTitle.trim() || null,
                        text: draftText.trim() || null,
                      })
                    }
                  >
                    {noteBusy ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                  {hasSavedNote ? (
                    <button
                      type="button"
                      className="pf-detail-note-delete"
                      disabled={noteBusy}
                      onClick={() => {
                        setDraftTitle('')
                        setDraftText('')
                        void persistNote({ delete: true })
                      }}
                    >
                      Sil
                    </button>
                  ) : null}
                </div>
              </>
            ) : hasSavedNote ? (
              <dl className="pf-detail-dl pf-detail-note-read">
                {savedNote?.title?.trim() ? (
                  <div className="pf-detail-dl-row">
                    <dt>Başlık</dt>
                    <dd>{savedNote.title.trim()}</dd>
                  </div>
                ) : null}
                {savedNote?.text?.trim() ? (
                  <div className="pf-detail-dl-row">
                    <dt>Açıklama</dt>
                    <dd>{savedNote.text.trim()}</dd>
                  </div>
                ) : null}
              </dl>
            ) : canEditCatalog ? (
              <p className="pf-detail-lead pf-detail-note-empty">
                Henüz {noteSectionTitle(kind)} yok.
              </p>
            ) : null}
          </section>
        ) : null}

        {matchedScreens.length > 0 ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">Bu adımın ekranı</h3>
            <p className="pf-detail-lead">
              XML onaycı/ekran adı, süreçteki ilgili ekran listesiyle eşleştirildi.
            </p>
            <ul className="pf-detail-screen-links">
              {matchedScreens.map((screen) => (
                <li key={screen.oid} className="pf-detail-screen-link">
                  <span className="pf-detail-screen-link-name">{screen.name}</span>
                  {screen.descriptionTr ? (
                    <span className="pf-detail-screen-link-desc">{screen.descriptionTr}</span>
                  ) : null}
                  {onHighlightScreen ? (
                    <button
                      type="button"
                      className="pf-detail-screen-link-go"
                      onClick={() => onHighlightScreen(screen.oid)}
                    >
                      Üst listede göster
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasIncoming ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">Bu adıma geliş</h3>
            <ul className="pf-detail-incoming-list">
              {incoming.map((row, i) => (
                <li
                  key={`${row.fromId}:${row.label ?? ''}:${i}`}
                  className="pf-detail-incoming"
                >
                  <DrawerNodeJump
                    nodeId={row.fromId}
                    nodeName={row.fromName}
                    kind={row.fromKind}
                    jumpable={canJump(row.fromId)}
                    onFocusNode={onFocusNode}
                  />
                  {transitionCaption(row.label) ? (
                    <>
                      <span className="pf-detail-incoming-arrow" aria-hidden>
                        →
                      </span>
                      <span className="pf-detail-incoming-label">
                        {transitionCaption(row.label)}
                      </span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasOutgoing ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">Bu adımdan çıkış</h3>
            <p className="pf-detail-lead">
              Her satır haritadaki bir ok. Geçiş servisi varsa, o dal seçildiğinde çalışır.
            </p>
            <ul className="pf-detail-outgoing-list">
              {outgoing.map((row, i) => {
                const branchServices = servicesForOutgoingLabel(details, row.label)
                const branchLabel = transitionCaption(row.label) ?? 'Adsız geçiş'
                return (
                  <li key={`${row.toId}:${row.label ?? ''}:${i}`} className="pf-detail-outgoing-block">
                    <div className="pf-detail-incoming pf-detail-outgoing-head">
                      {transitionCaption(row.label) ? (
                        <>
                          <span className="pf-detail-incoming-label">{branchLabel}</span>
                          <span className="pf-detail-incoming-arrow" aria-hidden>
                            →
                          </span>
                        </>
                      ) : (
                        <span className="pf-detail-incoming-label">Geçiş</span>
                      )}
                      <DrawerNodeJump
                        nodeId={row.toId}
                        nodeName={row.toName}
                        kind={row.toKind}
                        jumpable={canJump(row.toId)}
                        onFocusNode={onFocusNode}
                      />
                    </div>
                    {branchServices.length > 0 ? (
                      <ul className="pf-detail-service-cards pf-detail-outgoing-services">
                        {branchServices.map((serviceName) => {
                          const meta = resolvedByName.get(serviceName)
                          const labelTr = meta?.descriptionTr?.trim()
                          const canGo = Boolean(onOpenService && meta?.id)
                          return (
                            <li key={serviceName} className="pf-detail-service-card">
                              <p className="pf-detail-service-label">
                                {labelTr || 'Türkçe açıklama yok'}
                              </p>
                              <p className="pf-detail-service-code">{serviceName}</p>
                              {onOpenService ? (
                                <button
                                  type="button"
                                  className="pf-detail-service-go"
                                  disabled={!canGo}
                                  title={canGo ? undefined : 'Katalogda eşleşen servis bulunamadı'}
                                  onClick={() => onOpenService(serviceName, meta?.id ?? undefined)}
                                >
                                  Servise git
                                </button>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="pf-detail-outgoing-no-svc">Bu dalda geçiş servisi yok.</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <DetailGroups groups={decisionDetailGroups} />

        {hasRules ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">Geçiş kuralları</h3>
            {decisionInfo?.handlerClass ? (
              <p className="pf-detail-meta">Handler: {decisionInfo.handlerClass}</p>
            ) : null}
            <p className="pf-detail-lead">
              İstek sahibinin bilgilerine göre hangi ok seçilir?
            </p>
            <ul className="pf-detail-rule-list">
              {rules.map((r) => (
                <li key={r.transition} className="pf-detail-rule">
                  <span className="pf-detail-rule-key">{r.transition}</span>
                  <span className="pf-detail-rule-val">
                    {Object.keys(r.criteria).length
                      ? formatCriteria(r.criteria)
                      : 'kriter yok (diğer / varsayılan)'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {taskDetailGroups.length > 0 ? <DetailGroups groups={taskDetailGroups} /> : null}

        {hasSubProcess && subProcessNo ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">Alt süreç</h3>
            <div className="pf-detail-service-card">
              <p className="pf-detail-service-label">
                {subProcessMeta?.descriptionTr?.trim() ||
                  subProcessMeta?.name?.trim() ||
                  'Süreç açıklaması yok'}
              </p>
              <p className="pf-detail-service-code">{subProcessNo}</p>
              {onOpenSubProcess ? (
                <button
                  type="button"
                  className="pf-detail-service-go"
                  disabled={!subProcessKnown}
                  title={subProcessKnown ? undefined : 'Katalogda eşleşen süreç bulunamadı'}
                  onClick={() => onOpenSubProcess(subProcessNo)}
                >
                  Sürece git
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {hasServices ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">
              Diğer servisler{otherServices.length > 1 ? ` (${otherServices.length})` : ''}
            </h3>
            <p className="pf-detail-lead">
              Belirli bir geçişe/oka bağlı değil — adımın kendisiyle ilgili (örn. atama, bildirim) servisler.
            </p>
            <ul className="pf-detail-service-cards">
              {otherServices.map((serviceName) => {
                const meta = resolvedByName.get(serviceName)
                const labelTr = meta?.descriptionTr?.trim()
                const canGo = Boolean(onOpenService && meta?.id)
                return (
                  <li key={serviceName} className="pf-detail-service-card">
                    <p className="pf-detail-service-label">
                      {labelTr || 'Türkçe açıklama yok'}
                    </p>
                    <p className="pf-detail-service-code">{serviceName}</p>
                    {onOpenService ? (
                      <button
                        type="button"
                        className="pf-detail-service-go"
                        disabled={!canGo}
                        title={canGo ? undefined : 'Katalogda eşleşen servis bulunamadı'}
                        onClick={() => onOpenService(serviceName, meta?.id ?? undefined)}
                      >
                        Servise git
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {!hasRules &&
        detailGroups.length === 0 &&
        !hasServices &&
        !hasSubProcess &&
        !hasIncoming &&
        !hasOutgoing &&
        !showNoteSection ? (
          <p className="pf-detail-empty">Bu adım için dolu XML alanı yok.</p>
        ) : null}
      </div>
    </aside>
  )
}
