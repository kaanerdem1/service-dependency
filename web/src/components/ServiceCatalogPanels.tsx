import { useEffect, useMemo, useState } from 'react'
import { getServiceProcesses, getServiceScreens } from '../api/client'
import { EmptyState } from './EmptyState'
import type { ServiceProcessLink, ServiceScreenLink } from '../types'

type ScreenFilter = 'all' | 'region' | 'page'

const SCREEN_FILTERS: { id: ScreenFilter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'region', label: 'Region' },
  { id: 'page', label: 'Page' },
]

function pageTypeLabel(pageType: string): string {
  if (pageType === 'region') return 'Region'
  if (pageType === 'page') return 'Page'
  return pageType
}

export function useServiceCatalogLinks(serviceId: string | undefined) {
  const isInventory = Boolean(serviceId?.startsWith('sd-'))
  const [screens, setScreens] = useState<ServiceScreenLink[]>([])
  const [processes, setProcesses] = useState<ServiceProcessLink[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!serviceId || !isInventory) {
      setScreens([])
      setProcesses([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void Promise.all([getServiceScreens(serviceId), getServiceProcesses(serviceId)])
      .then(([screenRows, processRows]) => {
        if (cancelled) return
        setScreens(screenRows)
        setProcesses(processRows)
      })
      .catch(() => {
        if (cancelled) return
        setScreens([])
        setProcesses([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [serviceId, isInventory])

  return { screens, processes, loading, isInventory }
}

function ScreenListPanel({
  screens,
  filter,
  onFilterChange,
  loading,
}: {
  screens: ServiceScreenLink[]
  filter: ScreenFilter
  onFilterChange: (filter: ScreenFilter) => void
  loading: boolean
}) {
  const filtered = useMemo(() => {
    if (filter === 'all') return screens
    return screens.filter((row) => row.pageType === filter)
  }, [screens, filter])

  const counts = useMemo(
    () => ({
      all: screens.length,
      region: screens.filter((row) => row.pageType === 'region').length,
      page: screens.filter((row) => row.pageType === 'page').length,
    }),
    [screens],
  )

  if (loading) {
    return (
      <EmptyState
        variant="catalog"
        what="Ekran bağlantıları yükleniyor."
        action="Birkaç saniye bekleyin."
      />
    )
  }

  return (
    <div className="service-link-panel">
      <div className="service-link-filter" role="tablist" aria-label="Ekran türü">
        {SCREEN_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={`service-link-filter-btn${filter === item.id ? ' on' : ''}`}
            data-filter={item.id}
            onClick={() => onFilterChange(item.id)}
          >
            <span className="service-link-filter-label">{item.label}</span>
            <span className="service-link-filter-count">{counts[item.id]}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          variant="catalog"
          what={
            filter === 'all'
              ? 'Bu servise bağlı ekran kaydı yok.'
              : `${pageTypeLabel(filter)} türünde ekran bağlantısı yok.`
          }
          action="Envanterde screen_service ilişkisi seyrek; çoğu serviste liste boş kalır."
        />
      ) : (
        <ul className="service-link-list">
          {filtered.map((row) => (
            <li key={row.oid} className="service-link-row">
              <div className="service-link-row-head">
                <span className={`service-link-type is-${row.pageType}`}>
                  {pageTypeLabel(row.pageType)}
                </span>
                <span className="service-link-name">{row.name}</span>
              </div>
              <span className="service-link-oid" title="Screen OID">
                {row.oid}
              </span>
              {row.descriptionTr ? (
                <p className="service-link-desc">{row.descriptionTr}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProcessListPanel({
  processes,
  loading,
}: {
  processes: ServiceProcessLink[]
  loading: boolean
}) {
  if (loading) {
    return (
      <EmptyState
        variant="catalog"
        what="Process bağlantıları yükleniyor."
        action="Birkaç saniye bekleyin."
      />
    )
  }

  if (processes.length === 0) {
    return (
      <EmptyState
        variant="catalog"
        what="Bu servise bağlı process kaydı yok."
        action="Envanterde process_service ilişkisi seyrek; çoğu serviste liste boş kalır."
      />
    )
  }

  return (
    <ul className="service-link-list">
      {processes.map((row) => (
        <li key={row.oid} className="service-link-row">
          <div className="service-link-row-head">
            <span className="service-link-type is-process">Process</span>
            <span className="service-link-name">{row.name}</span>
          </div>
          <span className="service-link-oid" title="Process OID">
            {row.oid}
          </span>
          {row.descriptionTr ? (
            <p className="service-link-desc">{row.descriptionTr}</p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function ServiceScreensStage({
  screens,
  loading,
}: {
  screens: ServiceScreenLink[]
  loading: boolean
}) {
  const [filter, setFilter] = useState<ScreenFilter>('all')

  return (
    <div className="stage-catalog-panel">
      <header className="stage-catalog-head">
        <h2 className="stage-catalog-title">Ekranlar</h2>
        <p className="stage-catalog-lead">
          Bu servise bağlı ekran ve region kayıtları (envanter `screen_service`).
        </p>
      </header>
      <ScreenListPanel
        screens={screens}
        filter={filter}
        onFilterChange={setFilter}
        loading={loading}
      />
    </div>
  )
}

export function ServiceProcessesStage({
  processes,
  loading,
}: {
  processes: ServiceProcessLink[]
  loading: boolean
}) {
  return (
    <div className="stage-catalog-panel">
      <header className="stage-catalog-head">
        <h2 className="stage-catalog-title">Process</h2>
        <p className="stage-catalog-lead">
          Bu servise bağlı iş süreci kayıtları (envanter `process_service`).
        </p>
      </header>
      <ProcessListPanel processes={processes} loading={loading} />
    </div>
  )
}
