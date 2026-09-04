import { Command } from 'cmdk'
import { useEffect, useMemo, useState } from 'react'
import { searchMethods, searchServices } from '../api/client'
import type { AppTheme } from '../theme'
import type { MethodRef, Service } from '../types'
import { SearchHitContent } from './SearchHitContent'

type RecentItem = { id: string; name: string }

type Props = {
  open: boolean
  theme?: AppTheme
  onOpenChange: (open: boolean) => void
  /** localStorage MRU — oturumlar arası */
  frequent: RecentItem[]
  /** Oturum içi gezinme yolu */
  visitTrail: RecentItem[]
  onSelectService: (serviceId: string) => void
  onSelectMethod?: (serviceId: string, methodId: string) => void
  onOpenInbox?: () => void
}

function SearchGlyph() {
  return (
    <svg className="cmdk-input-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.35" />
      <path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

export function CommandPalette({
  open,
  theme = 'white',
  onOpenChange,
  frequent,
  visitTrail,
  onSelectService,
  onSelectMethod,
  onOpenInbox,
}: Props) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [methodHits, setMethodHits] = useState<MethodRef[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setMethodHits([])
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setMethodHits([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(() => {
      void Promise.all([searchServices(q), searchMethods(q)])
        .then(([services, methods]) => {
          if (cancelled) return
          setHits(services.slice(0, 10))
          setMethodHits(methods.slice(0, 8))
        })
        .catch(() => {
          if (!cancelled) {
            setHits([])
            setMethodHits([])
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, query])

  const filterItems = (items: RecentItem[]) => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
    )
  }

  const frequentFiltered = useMemo(() => filterItems(frequent).slice(0, 6), [frequent, query])

  const visitFiltered = useMemo(() => {
    const frequentIds = new Set(frequentFiltered.map((r) => r.id))
    return filterItems(visitTrail)
      .filter((r) => !frequentIds.has(r.id))
      .slice(0, 6)
  }, [visitTrail, frequentFiltered, query])

  const pickService = (id: string) => {
    onSelectService(id)
    onOpenChange(false)
  }

  const pickMethod = (serviceId: string, methodId: string) => {
    onSelectMethod?.(serviceId, methodId)
    onOpenChange(false)
  }

  const showIdleHints = query.trim().length < 2

  if (!open) return null

  return (
    <div
      className="cmdk-backdrop"
      data-theme={theme}
      onClick={() => onOpenChange(false)}
    >
      <Command
        className="cmdk-root search-hits-shell"
        label="Komut paleti"
        onClick={(e) => e.stopPropagation()}
        shouldFilter={false}
      >
        <div className="cmdk-input-wrap">
          <SearchGlyph />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Servis, metod veya sd-1020…"
            autoFocus
          />
          <kbd className="cmdk-input-hint" aria-hidden>
            ⌘K
          </kbd>
        </div>

        <Command.List className="search-hits cmdk-list">
          <Command.Empty className="cmdk-empty">
            {loading
              ? 'Aranıyor…'
              : query.trim().length < 2
                ? 'En az 2 karakter yazın veya listeden seçin'
                : 'Sonuç yok'}
          </Command.Empty>

          {frequentFiltered.length > 0 ? (
            <Command.Group heading="Son kullanılanlar">
              {frequentFiltered.map((r) => (
                <Command.Item key={r.id} value={`freq-${r.id}`} onSelect={() => pickService(r.id)}>
                  <SearchHitContent title={r.name} kind="service" metaId={r.id} tip={r.name} />
                </Command.Item>
              ))}
            </Command.Group>
          ) : showIdleHints ? (
            <Command.Group heading="Son kullanılanlar">
              <Command.Item value="freq-empty" disabled className="is-muted">
                <SearchHitContent
                  title="Henüz kayıt yok — servis açınca burada listelenir"
                  kind="service"
                />
              </Command.Item>
            </Command.Group>
          ) : null}

          {visitFiltered.length > 0 ? (
            <Command.Group heading="Bu oturumda">
              {visitFiltered.map((r) => (
                <Command.Item key={r.id} value={`visit-${r.id}`} onSelect={() => pickService(r.id)}>
                  <SearchHitContent title={r.name} kind="service" metaId={r.id} tip={r.name} />
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {hits.length > 0 ? (
            <Command.Group heading="Servisler">
              {hits.map((s) => (
                <Command.Item key={s.id} value={`hit-${s.id}`} onSelect={() => pickService(s.id)}>
                  <SearchHitContent title={s.name} kind="service" metaId={s.id} tip={s.name} />
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {methodHits.length > 0 ? (
            <Command.Group heading="Metodlar">
              {methodHits.map((m) => (
                <Command.Item
                  key={m.id}
                  value={`meth-${m.id}`}
                  onSelect={() => pickMethod(m.serviceId, m.id)}
                >
                  <SearchHitContent
                    title={`${m.className}.${m.name}`}
                    kind="method"
                    metaId={m.id}
                    subtitle={m.serviceName}
                    tip={`${m.className}.${m.name}`}
                  />
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Eylemler">
            {onOpenInbox ? (
              <Command.Item
                value="action-inbox"
                onSelect={() => {
                  onOpenInbox()
                  onOpenChange(false)
                }}
              >
                <SearchHitContent
                  title="Gelen kutusu"
                  kind="action"
                  subtitle="Talepler ve güncellemeler"
                />
              </Command.Item>
            ) : (
              <Command.Item value="action-inbox-soon" disabled className="is-muted">
                <SearchHitContent
                  title="Gelen kutusu"
                  kind="action"
                  subtitle="Oturum gerekli"
                />
              </Command.Item>
            )}
          </Command.Group>
        </Command.List>

        <footer className="cmdk-foot">
          <span>
            <kbd className="cmdk-kbd">↑↓</kbd> gezin
          </span>
          <span>
            <kbd className="cmdk-kbd">↵</kbd> seç
          </span>
          <span>
            <kbd className="cmdk-kbd">Esc</kbd> kapat
          </span>
        </footer>
      </Command>
    </div>
  )
}
