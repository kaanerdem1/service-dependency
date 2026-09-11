import type {
  ProcessDecisionInfo,
  ProcessFlowNodeKind,
  ProcessNodeDetails,
} from '../types'

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
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

function serviceNameFromDetailValue(value: string): string {
  return value.split(' · ')[0]?.trim() ?? value.trim()
}

function isServiceDetailRow(label: string): boolean {
  return label === 'Servis' || label.startsWith('Geçiş:')
}

function ServiceNameButton({
  name,
  onOpenService,
}: {
  name: string
  onOpenService?: (serviceName: string) => void
}) {
  if (!onOpenService) {
    return <span>{name}</span>
  }
  return (
    <button type="button" className="pf-detail-service-link" onClick={() => onOpenService(name)}>
      {name}
    </button>
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
  onClose: () => void
  onOpenService?: (serviceName: string) => void
}

export function ProcessFlowDetailDrawer({
  open,
  nodeId,
  nodeName,
  kind,
  details,
  decisionInfo,
  services,
  onClose,
  onOpenService,
}: Props) {
  const rules = decisionInfo?.rules ?? []
  const hasDetails = (details?.groups.length ?? 0) > 0
  const hasRules = rules.length > 0
  const hasServices = services.length > 0

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
        </div>
        <button type="button" className="pf-detail-drawer-close" onClick={onClose} aria-label="Kapat">
          ×
        </button>
      </header>
      <div className="pf-detail-drawer-body">
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
                      <dd>
                        {onOpenService && isServiceDetailRow(row.label) ? (
                          <ServiceNameButton
                            name={serviceNameFromDetailValue(row.value)}
                            onOpenService={onOpenService}
                          />
                        ) : (
                          row.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))
          : null}

        {hasServices ? (
          <section className="pf-detail-section">
            <h3 className="pf-detail-section-title">Servisler</h3>
            <ul className="pf-detail-service-list">
              {services.map((s) => (
                <li key={s}>
                  <ServiceNameButton name={s} onOpenService={onOpenService} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!hasRules && !hasDetails && !hasServices ? (
          <p className="pf-detail-empty">Bu adım için dolu XML alanı yok.</p>
        ) : null}
      </div>
    </aside>
  )
}
