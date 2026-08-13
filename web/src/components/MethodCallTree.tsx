import { useEffect, useState } from 'react'
import {
  getMethodCallees,
  getMethodCallers,
  getMethodImpact,
  listMethodsForService,
} from '../api/client'
import type { MethodImpact, MethodRef } from '../types'

type Props = {
  serviceId: string
  /** Ağaç / haritadan gelen odak */
  focusMethodId?: string
  onPivotService?: (serviceId: string) => void
}

type Mode = 'callers' | 'callees'

type NodeState = {
  loading?: boolean
  children?: MethodRef[]
  error?: string
}

/** Servis metod listesi + lazy çağıran/çağırılan ağacı (#6 / #7) */
export function MethodCallTree({
  serviceId,
  focusMethodId,
  onPivotService,
}: Props) {
  const [methods, setMethods] = useState<MethodRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>()
  const [mode, setMode] = useState<Mode>('callers')
  const [expanded, setExpanded] = useState<Record<string, NodeState>>({})
  const [impact, setImpact] = useState<MethodImpact>()
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(undefined)
    setSelectedId(undefined)
    setExpanded({})
    setImpact(undefined)
    void listMethodsForService(serviceId)
      .then((list) => {
        if (!cancelled) setMethods(list)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Metodlar yüklenemedi')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [serviceId])

  useEffect(() => {
    if (!focusMethodId || loading) return
    setSelectedId(focusMethodId)
    const el = document.getElementById(`method-row-${focusMethodId}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusMethodId, loading, methods])

  useEffect(() => {
    if (!selectedId) {
      setImpact(undefined)
      return
    }
    let cancelled = false
    void getMethodImpact(selectedId).then((imp) => {
      if (!cancelled) setImpact(imp)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const selected = methods.find((m) => m.id === selectedId)

  const visible = methods.filter((m) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return (
      m.name.toLowerCase().includes(q) ||
      m.className.toLowerCase().includes(q) ||
      m.signature.toLowerCase().includes(q)
    )
  })

  const toggleExpand = async (methodId: string) => {
    const cur = expanded[methodId]
    if (cur?.children) {
      setExpanded((e) => {
        const next = { ...e }
        delete next[methodId]
        return next
      })
      return
    }
    setExpanded((e) => ({ ...e, [methodId]: { loading: true } }))
    try {
      const children =
        mode === 'callers'
          ? await getMethodCallers(methodId)
          : await getMethodCallees(methodId)
      setExpanded((e) => ({ ...e, [methodId]: { children } }))
    } catch (err) {
      setExpanded((e) => ({
        ...e,
        [methodId]: {
          error: err instanceof Error ? err.message : 'Yüklenemedi',
        },
      }))
    }
  }

  if (loading) {
    return <p className="empty-hint">Metodlar yükleniyor…</p>
  }
  if (error) {
    return <p className="empty-hint">{error}</p>
  }

  return (
    <div className="method-panel">
      <p className="hint-sm entity-tab-hint">
        Metod → {mode === 'callers' ? 'çağıranlar' : 'çağırılanlar'} (lazy).
        Çapraz servis satırına tıklayınca pivot.
      </p>

      <div className="method-toolbar">
        <input
          type="search"
          className="method-filter"
          placeholder="Filtre: sınıf / metod…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="method-mode" role="group" aria-label="Ağaç yönü">
          <button
            type="button"
            className={mode === 'callers' ? 'on' : ''}
            onClick={() => {
              setMode('callers')
              setExpanded({})
            }}
          >
            Çağıranlar
          </button>
          <button
            type="button"
            className={mode === 'callees' ? 'on' : ''}
            onClick={() => {
              setMode('callees')
              setExpanded({})
            }}
          >
            Çağırılanlar
          </button>
        </div>
      </div>

      <p className="method-count">
        {visible.length}/{methods.length} metod
      </p>

      <ul className="method-list">
        {visible.map((m) => {
          const open = Boolean(expanded[m.id])
          const st = expanded[m.id]
          const isSel = selectedId === m.id
          return (
            <li
              key={m.id}
              id={`method-row-${m.id}`}
              className={isSel ? 'selected' : ''}
            >
              <div className="method-row">
                <button
                  type="button"
                  className="method-expand"
                  aria-expanded={open}
                  title={mode === 'callers' ? 'Çağıranları aç' : 'Çağırılanları aç'}
                  onClick={() => void toggleExpand(m.id)}
                >
                  {st?.loading ? '…' : open ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  className="method-main"
                  onClick={() => setSelectedId(m.id)}
                >
                  <span className="method-class">{m.className}</span>
                  <span className="method-name">{m.name}</span>
                  <span className="method-sig mono">{m.signature}</span>
                  <span
                    className="method-meta"
                    title={`Çağıran ${m.callerCount} · Çağırılan ${m.calleeCount}`}
                  >
                    çağıran {m.callerCount} · çağırılan {m.calleeCount}
                  </span>
                </button>
              </div>
              {st?.error && <p className="hint-sm">{st.error}</p>}
              {st?.children && (
                <ul className="method-children">
                  {st.children.length === 0 ? (
                    <li className="method-empty">
                      {mode === 'callers' ? 'Çağıran yok' : 'Çağrı yok'}
                    </li>
                  ) : (
                    st.children.map((c) => (
                      <li key={`${m.id}-${c.id}`}>
                        <button
                          type="button"
                          className="method-child"
                          onClick={() => {
                            if (c.serviceId !== serviceId) {
                              onPivotService?.(c.serviceId)
                              return
                            }
                            setSelectedId(c.id)
                          }}
                        >
                          <span className="method-svc">{c.serviceName}</span>
                          <span className="method-class">{c.className}</span>
                          <span className="method-name">{c.name}</span>
                          <span
                            className="method-meta"
                            title={`Çağıran ${c.callerCount} · Çağırılan ${c.calleeCount}`}
                          >
                            çağıran {c.callerCount} · çağırılan {c.calleeCount}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {selected && impact && (
        <div className="method-impact">
          <h3 className="section-title">Seçili metod etkisi</h3>
          <p className="mono">
            {selected.className}.{selected.name}
          </p>
          <p>
            Blast (çağıran BFS): <strong>{impact.methodCount}</strong> metod ·{' '}
            <strong>{impact.serviceCount}</strong> servis
          </p>
          {impact.serviceIds.length > 0 && (
            <p className="hint-sm method-impact-svcs">
              Servisler:{' '}
              {impact.serviceIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="linkish"
                  onClick={() => onPivotService?.(id)}
                >
                  {id.replace(/^svc-/, '')}
                </button>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
