import { useCallback, useEffect, useMemo, useState } from 'react'
import { patchProcessNodeDescriptions, resolveProcessRefs, resolveServiceNames } from '../api/client'
import type {
  ProcessDecisionInfo,
  ProcessFlowNodeKind,
  ProcessIncomingTransition,
  ProcessNodeDescriptionsDoc,
  ProcessNodeDetails,
  ProcessOutgoingTransition,
  ProcessRefResolve,
  ServiceNameResolve,
} from '../types'

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

import type { ProcessPathSnapshotStep as ProcessPathStep } from '../snapshot/processPathSnapshot'
import { transitionCaption } from './processUserRoute'

export type { ProcessPathStep }

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
  routeScoped = false,
  path = [],
  onSnapshot,
  snapshotBusy = false,
  onClose,
  onOpenService,
  onOpenSubProcess,
  processNo,
  nodeDescriptions,
  canEditCatalog = false,
  onNodeDescriptionsChange,
}: Props) {
  const hasPath = path.length > 1
  const rules = decisionInfo?.rules ?? []
  const hasDetails = (details?.groups.length ?? 0) > 0
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
  const transitionServiceCodes = useMemo(() => {
    const set = new Set<string>()
    for (const group of details?.groups ?? []) {
      if (!group.title.toLowerCase().startsWith('geçiş')) continue
      for (const row of group.rows) {
        if (row.label !== 'Servis') continue
        const code = row.value.split('·')[0]?.trim()
        if (code) set.add(code)
      }
    }
    return set
  }, [details])
  const otherServices = useMemo(
    () => services.filter((s) => !transitionServiceCodes.has(s)),
    [services, transitionServiceCodes],
  )
  const hasServices = otherServices.length > 0
  const transitionServiceCount = transitionServiceCodes.size
  const serviceSummary =
    services.length > 0
      ? transitionServiceCount > 0
        ? `${services.length} servis (${transitionServiceCount} geçişe bağlı, ${otherServices.length} adım düzeyinde)`
        : `${services.length} servis`
      : null
  const [resolved, setResolved] = useState<ServiceNameResolve[]>([])
  const [subProcessMeta, setSubProcessMeta] = useState<ProcessRefResolve | null>(null)

  const savedNote = nodeDescriptions?.nodes?.[nodeId]
  const hasSavedNote = Boolean(savedNote?.title?.trim() || savedNote?.text?.trim())
  const showNoteSection = canEditCatalog || hasSavedNote
  const [draftTitle, setDraftTitle] = useState('')
  const [draftText, setDraftText] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteError, setNoteError] = useState<string>()

  useEffect(() => {
    if (!open) return
    setDraftTitle(savedNote?.title ?? '')
    setDraftText(savedNote?.text ?? '')
    setNoteError(undefined)
  }, [open, nodeId, savedNote?.title, savedNote?.text])

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
      } catch (e) {
        setNoteError(e instanceof Error ? e.message : 'Kaydedilemedi')
      } finally {
        setNoteBusy(false)
      }
    },
    [nodeId, onNodeDescriptionsChange, processNo],
  )

  const serviceKey = useMemo(() => services.join('\0'), [services])

  useEffect(() => {
    if (!open || !hasServices) {
      setResolved([])
      return
    }
    let cancelled = false
    void resolveServiceNames(services)
      .then((rows) => {
        if (!cancelled) setResolved(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(services.map((serviceName) => ({ serviceName, id: null, descriptionTr: null })))
        }
      })
    return () => {
      cancelled = true
    }
  }, [hasServices, open, serviceKey, services])

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

  return (
    <aside
      className={`pf-detail-drawer${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="pf-detail-drawer-title"
      aria-hidden={!open}
    >
      <header className="pf-detail-drawer-head">
        <div className="pf-detail-drawer-head-copy">
          <span className="pf-detail-drawer-kind">{KIND_LABEL[kind]}</span>
          <h2 id="pf-detail-drawer-title" className="pf-detail-drawer-title">
            {nodeName}
          </h2>
          <p className="pf-detail-drawer-id">{nodeId}</p>
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
        {hasIncoming ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">Bu adıma geliş</h3>
            <p className="pf-detail-lead">
              {routeScoped
                ? 'Bu rotada bu adıma hangi geçişle gelindi?'
                : 'Hangi adımdan, hangi geçişle bu noktaya ulaşılıyor?'}
            </p>
            <ul className="pf-detail-incoming-list">
              {incoming.map((row, i) => (
                <li
                  key={`${row.fromId}:${row.label ?? ''}:${i}`}
                  className="pf-detail-incoming"
                >
                  <span className="pf-detail-incoming-from">
                    <span className="pf-detail-incoming-kind">{KIND_LABEL[row.fromKind]}</span>
                    {row.fromName}
                  </span>
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
              {routeScoped
                ? 'Bu rotada bu adımdan hangi geçişle devam edildi?'
                : 'Bu noktadan hangi geçişle nereye gidiliyor? (Servisi olmayan geçişler de dahil.)'}
            </p>
            <ul className="pf-detail-incoming-list">
              {outgoing.map((row, i) => (
                <li key={`${row.toId}:${row.label ?? ''}:${i}`} className="pf-detail-incoming">
                  {transitionCaption(row.label) ? (
                    <>
                      <span className="pf-detail-incoming-label">{transitionCaption(row.label)}</span>
                      <span className="pf-detail-incoming-arrow" aria-hidden>
                        →
                      </span>
                    </>
                  ) : null}
                  <span className="pf-detail-incoming-from">
                    <span className="pf-detail-incoming-kind">{KIND_LABEL[row.toKind]}</span>
                    {row.toName}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showNoteSection ? (
          <section className="pf-detail-section pf-detail-note-section">
            <h3 className="pf-detail-section-title">Adım açıklaması</h3>
            <p className="pf-detail-lead">
              XML dışı katalog notu — ekip geneli görür (sunucu veritabanı).
            </p>
            {canEditCatalog && processNo ? (
              <>
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
            ) : (
              <>
                {savedNote?.title?.trim() ? (
                  <p className="pf-detail-note-title">{savedNote.title.trim()}</p>
                ) : null}
                {savedNote?.text?.trim() ? (
                  <p className="pf-detail-note-body">{savedNote.text.trim()}</p>
                ) : null}
              </>
            )}
          </section>
        ) : null}

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

        {hasDetails
          ? details!.groups.map((group) => (
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
          : null}

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
        !hasDetails &&
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
