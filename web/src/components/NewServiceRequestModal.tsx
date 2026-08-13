import { useEffect, useMemo, useRef, useState } from 'react'
import type { Service } from '../types'
import type { SessionUser } from '../mock/session'
import { createChangeRequest, searchServices } from '../api/client'

type Props = {
  session: SessionUser
  /** Kullanıcının ekip domain’indeki servisler (paket varsayılanı + öneri) */
  domainServices: Service[]
  onClose: () => void
  onCreated: (requestIds: string[]) => void
}

type TabId =
  | 'identity'
  | 'ownership'
  | 'deps'
  | 'data'
  | 'security'
  | 'ops'
  | 'approval'

const TABS: { id: TabId; label: string; required?: boolean }[] = [
  { id: 'identity', label: 'Kimlik', required: true },
  { id: 'ownership', label: 'Sahiplik', required: true },
  { id: 'deps', label: 'Bağımlılık' },
  { id: 'data', label: 'Veri' },
  { id: 'security', label: 'Güvenlik' },
  { id: 'ops', label: 'Operasyon' },
  { id: 'approval', label: 'Onay' },
]

const SERVICE_TYPES = ['API', 'batch', 'BFF', 'worker', 'library'] as const
const ENV_OPTIONS = ['dev', 'test', 'prod'] as const
const PROTOCOLS = ['HTTP', 'gRPC', 'queue', 'DB'] as const
const CRITICALITY = ['0', '1', '2', '3'] as const

function line(label: string, value: string) {
  const v = value.trim()
  return v ? `${label}: ${v}` : null
}

export function NewServiceRequestModal({
  session,
  domainServices,
  onClose,
  onCreated,
}: Props) {
  const packages = useMemo(() => {
    const map = new Map<string, { packageId: string; projectId: string; label: string }>()
    for (const s of domainServices) {
      if (!map.has(s.packageId)) {
        map.set(s.packageId, {
          packageId: s.packageId,
          projectId: s.projectId,
          label: s.packageId,
        })
      }
    }
    return [...map.values()]
  }, [domainServices])

  const [tab, setTab] = useState<TabId>('identity')

  const [packageId, setPackageId] = useState(packages[0]?.packageId ?? '')
  const selectedPkg = packages.find((p) => p.packageId === packageId) ?? packages[0]

  const [techName, setTechName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [namespace, setNamespace] = useState('')
  const [envs, setEnvs] = useState<string[]>(['dev', 'test'])
  const [serviceType, setServiceType] = useState<string>('API')
  const [runtime, setRuntime] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [ciPipeline, setCiPipeline] = useState('')
  const [criticality, setCriticality] = useState('2')

  const [summary, setSummary] = useState('')
  const [rationale, setRationale] = useState('')

  const [team, setTeam] = useState(session.team ?? '')
  const [primaryOwner, setPrimaryOwner] = useState(
    session.role === 'lead' ? session.name : '',
  )
  const [backupOwner, setBackupOwner] = useState('')
  const [onCall, setOnCall] = useState('')
  const [department, setDepartment] = useState('')

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedCache, setSelectedCache] = useState<Record<string, Service>>({})
  const [inboundPlan, setInboundPlan] = useState('')
  const [protocol, setProtocol] = useState<string>('HTTP')
  const [contractLink, setContractLink] = useState('')
  const [breakingRisk, setBreakingRisk] = useState('')

  const [tablesRead, setTablesRead] = useState('')
  const [tablesWrite, setTablesWrite] = useState('')
  const [piiClass, setPiiClass] = useState('')
  const [retention, setRetention] = useState('')
  const [etlImpact, setEtlImpact] = useState('')
  const [topics, setTopics] = useState('')

  const [authModel, setAuthModel] = useState('')
  const [vaultNeed, setVaultNeed] = useState('')
  const [networkSeg, setNetworkSeg] = useState('')
  const [auditLog, setAuditLog] = useState('')

  const [slo, setSlo] = useState('')
  const [capacity, setCapacity] = useState('')
  const [deployStrategy, setDeployStrategy] = useState('')
  const [monitoring, setMonitoring] = useState('')
  const [goLive, setGoLive] = useState('')

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const selected = selectedIds
    .map((id) => selectedCache[id])
    .filter((s): s is Service => Boolean(s))

  const leadHint = session.role === 'lead' ? session.name : `ekip lideri (${session.team})`

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggleEnv = (env: string) => {
    setEnvs((prev) =>
      prev.includes(env) ? prev.filter((x) => x !== env) : [...prev, env],
    )
  }

  const addDependency = (s: Service) => {
    setSelectedCache((prev) => ({ ...prev, [s.id]: s }))
    setSelectedIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]))
    setQuery('')
    setHits([])
    setSearchOpen(false)
  }

  const removeDependency = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  const onSearch = async (q: string) => {
    setQuery(q)
    setSearchOpen(true)
    if (!q.trim()) {
      setHits([])
      return
    }
    try {
      const found = await searchServices(q)
      setHits(found.filter((s) => !selectedIds.includes(s.id)))
    } catch {
      setHits([])
    }
  }

  const buildDescription = () => {
    const sections = [
      [
        '## Kimlik / katalog',
        line('Teknik ad', techName),
        line('Görünen ad', displayName),
        line('Paket', selectedPkg?.packageId ?? ''),
        line('Proje', selectedPkg?.projectId ?? ''),
        line('Namespace', namespace),
        line('Ortam planı', envs.join(', ')),
        line('Tip', serviceType),
        line('Runtime', runtime),
        line('Repo', repoUrl),
        line('CI', ciPipeline),
        line('Criticality', `tier ${criticality}`),
        line('Ne ekleniyor', summary),
        line('Neden', rationale),
      ],
      [
        '## Sahiplik',
        line('Sorumlu ekip', team),
        line('Primary owner', primaryOwner),
        line('Yedek', backupOwner),
        line('Talep eden', session.name),
        line('On-call / iletişim', onCall),
        line('Departman', department),
      ],
      [
        '## Bağımlılık',
        line(
          'Çağıracağı servisler (outbound)',
          selected.map((s) => s.name).join(', ') || 'belirtilmedi',
        ),
        line('Onu çağıracaklar (inbound plan)', inboundPlan),
        line('Protokol', protocol),
        line('Sözleşme', contractLink),
        line('Breaking risk', breakingRisk),
      ],
      [
        '## Veri etkisi',
        line('Okuyacağı tablolar', tablesRead),
        line('Yazacağı tablolar', tablesWrite),
        line('PII / KVKK', piiClass),
        line('Retention / encryption', retention),
        line('ETL / rapor', etlImpact),
        line('Topic / queue', topics),
      ],
      [
        '## Güvenlik',
        line('AuthN/AuthZ', authModel),
        line('Secret / vault', vaultNeed),
        line('Ağ segmenti', networkSeg),
        line('Denetim logu', auditLog),
      ],
      [
        '## Operasyon',
        line('SLO / hata bütçesi', slo),
        line('Kapasite', capacity),
        line('Deploy / rollback', deployStrategy),
        line('Monitoring', monitoring),
        line('Go-live', goLive),
      ],
      [
        '## Onay',
        'Domain lideri onayı (zorunlu).',
        'Çağıracağı servis owner’ları onaycı değildir — yalnızca katalog / etki bilgisi.',
      ],
    ]

    return sections
      .map((block) => block.filter(Boolean).join('\n'))
      .filter((s) => s.split('\n').length > 1)
      .join('\n\n')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (!techName.trim()) {
      setError('Teknik servis adı zorunlu.')
      setTab('identity')
      return
    }
    if (!summary.trim() || !rationale.trim()) {
      setError('“Ne ekleniyor?” ve “Neden?” zorunlu (Kimlik sekmesi).')
      setTab('identity')
      return
    }
    if (!selectedPkg) {
      setError('Paket seçin.')
      setTab('identity')
      return
    }
    if (!team.trim()) {
      setError('Sorumlu ekip zorunlu.')
      setTab('ownership')
      return
    }
    setSaving(true)
    try {
      const created = await createChangeRequest({
        kind: 'new_service',
        proposedServiceName: techName.trim(),
        proposedProjectId: selectedPkg.projectId,
        proposedPackageId: selectedPkg.packageId,
        summary,
        rationale,
        description: buildDescription(),
        personId: session.id,
        personName: session.name,
        team,
        department,
        affectedServiceIds: selectedIds,
      })
      onCreated(created.map((c) => c.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal wide ns-modal"
        role="dialog"
        aria-labelledby="ns-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="ns-title">Yeni Servis Talebi</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Kapat
          </button>
        </header>
        <p className="modal-sub">
          Domain: <strong>{session.team ?? '—'}</strong>
          {' · '}
          Onay: <strong>ekip lideri</strong> ({leadHint}). Zorunlu alanlar Kimlik + Sahiplik;
          diğer sekmeler opsiyonel katalog bilgisidir.
        </p>

        <div className="task-tabs ns-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={tab === t.id ? 'on' : ''}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.required ? ' *' : ''}
            </button>
          ))}
        </div>

        <form className="cr-form ns-form" onSubmit={submit}>
          <div className="task-tab-body ns-tab-body">
            {tab === 'identity' && (
              <div className="ns-pane">
                <div className="form-row">
                  <div className="ns-field">
                    <span className="ns-field-label">
                      Teknik servis adı <span className="req">*</span>
                    </span>
                    <p className="field-hint">
                      Kod / repo / katalog kimliği (PascalCase). Örn. WalletLedgerService
                    </p>
                    <input
                      value={techName}
                      onChange={(e) => setTechName(e.target.value)}
                      placeholder="WalletLedgerService"
                      required
                    />
                  </div>
                  <div className="ns-field">
                    <span className="ns-field-label">Görünen ad</span>
                    <p className="field-hint">
                      UI’da görünen insan dili. Örn. Cüzdan Defteri Servisi
                    </p>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Cüzdan Defteri Servisi"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label>
                    Hedef paket <span className="req">*</span>
                    <select
                      value={packageId}
                      onChange={(e) => setPackageId(e.target.value)}
                      required
                    >
                      {packages.map((p) => (
                        <option key={p.packageId} value={p.packageId}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Namespace
                    <input
                      value={namespace}
                      onChange={(e) => setNamespace(e.target.value)}
                      placeholder="ör. payments.wallet"
                    />
                  </label>
                </div>
                <fieldset className="ns-fieldset">
                  <legend>Ortam planı</legend>
                  <div className="ns-check-row">
                    {ENV_OPTIONS.map((env) => (
                      <label key={env} className="ns-check">
                        <input
                          type="checkbox"
                          checked={envs.includes(env)}
                          onChange={() => toggleEnv(env)}
                        />
                        {env}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="form-row">
                  <label>
                    Tip
                    <select
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value)}
                    >
                      {SERVICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Criticality (tier)
                    <select
                      value={criticality}
                      onChange={(e) => setCriticality(e.target.value)}
                    >
                      {CRITICALITY.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Dil / runtime
                    <input
                      value={runtime}
                      onChange={(e) => setRuntime(e.target.value)}
                      placeholder="Java 21, Node 22…"
                    />
                  </label>
                  <label>
                    CI pipeline
                    <input
                      value={ciPipeline}
                      onChange={(e) => setCiPipeline(e.target.value)}
                      placeholder="pipeline adı / URL"
                    />
                  </label>
                </div>
                <label>
                  Repo URL
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Ne ekleniyor? <span className="req">*</span>
                    <textarea
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      rows={2}
                      required
                    />
                  </label>
                  <label>
                    Neden? <span className="req">*</span>
                    <textarea
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      rows={2}
                      required
                    />
                  </label>
                </div>
              </div>
            )}

            {tab === 'ownership' && (
              <div className="ns-pane">
                <div className="form-row">
                  <label>
                    Sorumlu ekip (domain) <span className="req">*</span>
                    <input
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Departman
                    <input
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Primary owner
                    <input
                      value={primaryOwner}
                      onChange={(e) => setPrimaryOwner(e.target.value)}
                      placeholder="Ad Soyad"
                    />
                  </label>
                  <label>
                    Yedek owner
                    <input
                      value={backupOwner}
                      onChange={(e) => setBackupOwner(e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Talep eden
                    <input value={session.name} readOnly />
                  </label>
                  <label>
                    İletişim / on-call grubu
                    <input
                      value={onCall}
                      onChange={(e) => setOnCall(e.target.value)}
                      placeholder="#payments-oncall"
                    />
                  </label>
                </div>
                <p className="hint-sm">
                  Çalışan açtıysa onay yine ekip liderinde kalır; primary owner alanı katalog
                  içindir.
                </p>
              </div>
            )}

            {tab === 'deps' && (
              <div className="ns-pane">
                <h3 className="section-title">Çağıracağı servisler (outbound)</h3>
                <p className="hint-sm">
                  Katalog / etki bilgisi. Seçilen servislerin owner’ı onaycı değildir.
                </p>

                <div className="ns-dep-picker" ref={searchWrapRef}>
                  <input
                    className="ns-search"
                    value={query}
                    onChange={(e) => void onSearch(e.target.value)}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Servis ara ve ekle…"
                    autoComplete="off"
                  />
                  {searchOpen && (query.trim() || hits.length > 0) && (
                    <ul className="ns-search-results" role="listbox">
                      {hits.length === 0 ? (
                        <li className="ns-search-empty">
                          {query.trim() ? 'Sonuç yok' : 'Aramak için yazın'}
                        </li>
                      ) : (
                        hits.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="ns-search-hit"
                              onClick={() => addDependency(s)}
                            >
                              <strong>{s.name}</strong>
                              <span className="svc-meta">
                                {' '}
                                · {s.owner?.name ?? 'Owner yok'}
                                {s.owner?.team ? ` · ${s.owner.team}` : ''}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>

                <div className="ns-chip-box" aria-live="polite">
                  {selected.length === 0 ? (
                    <p className="ns-chip-empty">Henüz bağımlılık seçilmedi.</p>
                  ) : (
                    <ul className="ns-chip-list">
                      {selected.map((s) => (
                        <li key={s.id} className="ns-chip">
                          <span className="ns-chip-text">
                            <strong>{s.name}</strong>
                            <span className="svc-meta">
                              {' '}
                              · {s.owner?.name ?? '—'}
                              {s.owner?.team ? ` · ${s.owner.team}` : ''}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="ns-chip-remove"
                            aria-label={`${s.name} kaldır`}
                            onClick={() => removeDependency(s.id)}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="form-row">
                  <div className="ns-field">
                    <span className="ns-field-label">Onu çağıracaklar (inbound, plan)</span>
                    <p className="field-hint">
                      Bu yeni servisi ileride kimlerin çağıracağı planı (henüz katalogda
                      olmayabilir).
                    </p>
                    <textarea
                      value={inboundPlan}
                      onChange={(e) => setInboundPlan(e.target.value)}
                      rows={2}
                      placeholder="Planlanan tüketiciler…"
                    />
                  </div>
                  <div className="ns-field">
                    <span className="ns-field-label">Breaking change riski</span>
                    <p className="field-hint">
                      Geriye dönük uyumsuz değişiklik riski var mı? (alan kaldırma, sözleşme
                      kırılması). Yoksa “yok / düşük” yazın.
                    </p>
                    <textarea
                      value={breakingRisk}
                      onChange={(e) => setBreakingRisk(e.target.value)}
                      rows={2}
                      placeholder="Örn. Yok — yalnız yeni endpoint"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label>
                    Protokol
                    <select
                      value={protocol}
                      onChange={(e) => setProtocol(e.target.value)}
                    >
                      {PROTOCOLS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sözleşme linki
                    <input
                      value={contractLink}
                      onChange={(e) => setContractLink(e.target.value)}
                      placeholder="OpenAPI / schema URL"
                    />
                  </label>
                </div>
              </div>
            )}

            {tab === 'data' && (
              <div className="ns-pane">
                <div className="form-row">
                  <label>
                    Okuyacağı tablolar / şemalar
                    <textarea
                      value={tablesRead}
                      onChange={(e) => setTablesRead(e.target.value)}
                      rows={2}
                    />
                  </label>
                  <label>
                    Yazacağı tablolar / şemalar
                    <textarea
                      value={tablesWrite}
                      onChange={(e) => setTablesWrite(e.target.value)}
                      rows={2}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <div className="ns-field">
                    <span className="ns-field-label">PII / KVKK sınıflandırması</span>
                    <p className="field-hint">
                      Kişisel veri var mı? Örn. yok · kamu · kısıtlı (TC/iletişim) · özel
                      nitelikli. KVKK kapsamında hangi sınıfa düştüğünü kısaca yazın.
                    </p>
                    <input
                      value={piiClass}
                      onChange={(e) => setPiiClass(e.target.value)}
                      placeholder="Örn. kısıtlı — müşteri e-posta"
                    />
                  </div>
                  <div className="ns-field">
                    <span className="ns-field-label">Retention / encryption</span>
                    <p className="field-hint">
                      Veri ne kadar saklanacak, şifreleme / maskeleme var mı?
                    </p>
                    <input
                      value={retention}
                      onChange={(e) => setRetention(e.target.value)}
                      placeholder="Örn. 2 yıl · at-rest encrypt"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label>
                    ETL / rapor etkisi
                    <textarea
                      value={etlImpact}
                      onChange={(e) => setEtlImpact(e.target.value)}
                      rows={2}
                    />
                  </label>
                  <label>
                    Yeni topic / queue adları
                    <input value={topics} onChange={(e) => setTopics(e.target.value)} />
                  </label>
                </div>
              </div>
            )}

            {tab === 'security' && (
              <div className="ns-pane">
                <div className="form-row">
                  <label>
                    AuthN / AuthZ modeli
                    <textarea
                      value={authModel}
                      onChange={(e) => setAuthModel(e.target.value)}
                      rows={2}
                      placeholder="mTLS, OAuth, service token…"
                    />
                  </label>
                  <label>
                    Secret / vault ihtiyacı
                    <textarea
                      value={vaultNeed}
                      onChange={(e) => setVaultNeed(e.target.value)}
                      rows={2}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Ağ segmenti / firewall
                    <textarea
                      value={networkSeg}
                      onChange={(e) => setNetworkSeg(e.target.value)}
                      rows={2}
                    />
                  </label>
                  <label>
                    Denetim logu zorunluluğu
                    <textarea
                      value={auditLog}
                      onChange={(e) => setAuditLog(e.target.value)}
                      rows={2}
                    />
                  </label>
                </div>
              </div>
            )}

            {tab === 'ops' && (
              <div className="ns-pane">
                <div className="form-row">
                  <label>
                    SLO / hata bütçesi
                    <input
                      value={slo}
                      onChange={(e) => setSlo(e.target.value)}
                      placeholder="Örn. %99.9"
                    />
                  </label>
                  <label>
                    Go-live tarihi
                    <input
                      type="date"
                      value={goLive}
                      onChange={(e) => setGoLive(e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Kapasite tahmini
                    <textarea
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      rows={2}
                    />
                  </label>
                  <label>
                    Deploy stratejisi / rollback
                    <textarea
                      value={deployStrategy}
                      onChange={(e) => setDeployStrategy(e.target.value)}
                      rows={2}
                    />
                  </label>
                </div>
                <label>
                  Monitoring / alert sahipleri
                  <input
                    value={monitoring}
                    onChange={(e) => setMonitoring(e.target.value)}
                  />
                </label>
              </div>
            )}

            {tab === 'approval' && (
              <div className="ns-pane">
                <ul className="task-preview-list">
                  <li>
                    <strong>
                      T-… — {(team || session.team || 'Ekip').toLocaleUpperCase('tr-TR')} — Yeni:{' '}
                      {techName.trim() || '…'}
                    </strong>
                    <span className="approver-line">
                      Onayı verecek: <strong>ekip lideri</strong>
                      {session.role === 'lead' ? ` · ${session.name}` : ` · ${leadHint}`}
                    </span>
                    <span className="svc-meta">
                      Talep eden: {session.name}
                      {session.role === 'member' ? ' (çalışan → lider onayı)' : ''}
                    </span>
                    {selected.length > 0 && (
                      <span className="svc-meta">
                        Çağıracakları (bilgi): {selected.map((s) => s.name).join(', ')}
                      </span>
                    )}
                  </li>
                </ul>
                <p className="hint-sm">
                  Çağıracağı servis owner’larından task açılmaz. Platform / güvenlik / veri
                  steward adımları policy ile sonra eklenebilir.
                </p>
              </div>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          <footer className="modal-foot ns-foot">
            <div className="ns-foot-nav">
              <button
                type="button"
                className="btn ghost"
                disabled={TABS.findIndex((t) => t.id === tab) === 0}
                onClick={() => {
                  const i = TABS.findIndex((t) => t.id === tab)
                  if (i > 0) setTab(TABS[i - 1]!.id)
                }}
              >
                ← Önceki
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={TABS.findIndex((t) => t.id === tab) === TABS.length - 1}
                onClick={() => {
                  const i = TABS.findIndex((t) => t.id === tab)
                  if (i < TABS.length - 1) setTab(TABS[i + 1]!.id)
                }}
              >
                Sonraki →
              </button>
            </div>
            <div className="ns-foot-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Vazgeç
              </button>
              <button type="submit" className="btn primary compact" disabled={saving}>
                {saving ? 'Gönderiliyor…' : 'Task Aç'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
