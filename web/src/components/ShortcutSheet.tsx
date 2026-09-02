import { MotionModalBackdrop, MotionModalPanel } from '../motion/MotionModal'

const SHORTCUTS = [
  { keys: '⌘ K', label: 'Komut paleti' },
  { keys: '?', label: 'Bu kısayol listesi' },
  { keys: 'Esc', label: 'Modal / paleti kapat' },
  { keys: '← →', label: 'Gezinme geçmişi (harita)' },
  { keys: 'Tab', label: 'Harita / İlişkiler / Servis İşlevi' },
] as const

type Props = {
  open: boolean
  onClose: () => void
}

export function ShortcutSheet({ open, onClose }: Props) {
  if (!open) return null

  return (
    <MotionModalBackdrop onClose={onClose}>
      <MotionModalPanel className="modal shortcut-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Klavye kısayolları</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </header>
        <ul className="shortcut-sheet-list">
          {SHORTCUTS.map((row) => (
            <li key={row.keys}>
              <kbd>{row.keys}</kbd>
              <span>{row.label}</span>
            </li>
          ))}
        </ul>
      </MotionModalPanel>
    </MotionModalBackdrop>
  )
}
