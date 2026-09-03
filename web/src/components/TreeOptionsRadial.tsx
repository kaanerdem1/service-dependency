import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  showNonServiceMethods: boolean
  onShowNonServiceMethodsChange: (next: boolean) => void
}

/** Sidebar altı — Seçenekler popover (yukarı açılır) */
export function TreeOptionsRadial({
  showNonServiceMethods,
  onShowNonServiceMethodsChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="tree-options" ref={rootRef}>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="tree-options-panel"
            role="menu"
            aria-label="Ağaç seçenekleri"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 480, damping: 32 }}
          >
            <div className="tree-options-panel-head">
              <span>Seçenekler</span>
              <button
                type="button"
                className="tree-options-close"
                aria-label="Seçenekleri kapat"
                title="Kapat"
                onClick={() => setOpen(false)}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <label className="tree-options-row">
              <span className="tree-options-row-copy">
                <span className="tree-options-row-title">
                  Servis olmayan metodları göster
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showNonServiceMethods}
                className={`tree-options-switch${showNonServiceMethods ? ' is-on' : ''}`}
                onClick={() => onShowNonServiceMethodsChange(!showNonServiceMethods)}
              >
                <span className="tree-options-switch-thumb" />
              </button>
            </label>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        className={`tree-options-trigger${open ? ' is-open' : ''}${showNonServiceMethods ? ' has-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span>Seçenekler</span>
        <svg
          className={`tree-options-chev${open ? ' is-open' : ''}`}
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden
        >
          <path
            d="M4 6.5 8 10.5 12 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {showNonServiceMethods ? <span className="tree-options-dot" aria-hidden /> : null}
      </button>
    </div>
  )
}
