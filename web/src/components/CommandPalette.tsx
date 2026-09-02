import { Command } from 'cmdk'
import { useEffect, useMemo, useState } from 'react'
import { searchServices } from '../api/client'
import type { Service } from '../types'

type RecentItem = { id: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** localStorage MRU — oturumlar arası */
  frequent: RecentItem[]
  /** Oturum içi gezinme yolu */
  visitTrail: RecentItem[]
  onSelectService: (serviceId: string) => void
  onOpenInbox?: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  frequent,
  visitTrail,
  onSelectService,
  onOpenInbox,
}: Props) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
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
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(() => {
      void searchServices(q)
        .then((rows) => {
          if (!cancelled) setHits(rows.slice(0, 12))
        })
        .catch(() => {
          if (!cancelled) setHits([])
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

  const frequentFiltered = useMemo(() => filterItems(frequent).slice(0, 10), [frequent, query])

  const visitFiltered = useMemo(() => {
    const frequentIds = new Set(frequentFiltered.map((r) => r.id))
    return filterItems(visitTrail)
      .filter((r) => !frequentIds.has(r.id))
      .slice(0, 6)
  }, [visitTrail, frequentFiltered, query])

  const pick = (id: string) => {
    onSelectService(id)
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="cmdk-backdrop" onClick={() => onOpenChange(false)}>
      <Command
        className="cmdk-root"
        label="Komut paleti"
        onClick={(e) => e.stopPropagation()}
        shouldFilter={false}
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Servis ara veya komut yaz…"
          autoFocus
        />
        <Command.List>
          <Command.Empty>
            {loading ? 'Aranıyor…' : query.trim().length < 2 ? 'Servis adı yazın veya listeden seçin' : 'Sonuç yok'}
          </Command.Empty>

          {frequentFiltered.length > 0 ? (
            <Command.Group heading="Son kullanılanlar">
              {frequentFiltered.map((r) => (
                <Command.Item key={r.id} value={`freq-${r.id}`} onSelect={() => pick(r.id)}>
                  <span className="cmdk-item-name">{r.name}</span>
                  <span className="cmdk-item-meta">{r.id}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {visitFiltered.length > 0 ? (
            <Command.Group heading="Bu oturumda">
              {visitFiltered.map((r) => (
                <Command.Item key={r.id} value={`visit-${r.id}`} onSelect={() => pick(r.id)}>
                  <span className="cmdk-item-name">{r.name}</span>
                  <span className="cmdk-item-meta">{r.id}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {hits.length > 0 ? (
            <Command.Group heading="Arama">
              {hits.map((s) => (
                <Command.Item key={s.id} value={`hit-${s.id}`} onSelect={() => pick(s.id)}>
                  <span className="cmdk-item-name">{s.name}</span>
                  <span className="cmdk-item-meta">{s.id}</span>
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
                Gelen kutusunu aç
              </Command.Item>
            ) : null}
          </Command.Group>
        </Command.List>
        <footer className="cmdk-foot">
          <span>↑↓ gezin</span>
          <span>↵ seç</span>
          <span>Esc kapat</span>
        </footer>
      </Command>
    </div>
  )
}
