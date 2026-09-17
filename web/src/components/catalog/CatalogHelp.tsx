import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MotionModalBackdrop, MotionModalPanel } from '../../motion/MotionModal'
import { listItemTransition, springSoft } from '../../motion/config'
import {
  favoritesPanelShortcutLabel,
  isApplePlatform,
  workflowsPanelShortcutLabel,
} from '../../shortcuts/panelShortcuts'

function Kbd({ children }: { children: string }) {
  return <kbd className="catalog-help-kbd">{children}</kbd>
}

function Row({ keys, text }: { keys: string[]; text: string }) {
  return (
    <li className="catalog-help-row">
      <span className="catalog-help-keys">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
      <span>{text}</span>
    </li>
  )
}

export function CatalogHelp() {
  const [open, setOpen] = useState(false)
  const mod = isApplePlatform() ? '⌘' : 'Ctrl'
  const favKeys = favoritesPanelShortcutLabel()
  const flowKeys = workflowsPanelShortcutLabel()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div className="catalog-help">
      <button
        type="button"
        className={`tree-options-trigger${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="none">
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M9.6 9.4a2.4 2.4 0 1 1 3.5 2.15c-.7.4-1.1.9-1.1 1.7V14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.6" r="0.85" fill="currentColor" />
        </svg>
        <span>Yardım</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open ? (
            <MotionModalBackdrop onClose={() => setOpen(false)}>
              <MotionModalPanel
                className="catalog-help-dialog"
                labelledBy="catalog-help-title"
              >
                <header className="catalog-help-head">
                  <div>
                    <p className="catalog-help-kicker">Katalog</p>
                    <h2 id="catalog-help-title">Yardım ve kısayollar</h2>
                  </div>
                  <button
                    type="button"
                    className="catalog-help-close"
                    aria-label="Yardımı kapat"
                    onClick={() => setOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <p className="catalog-help-lede">
                  Ağaçta dolaş, favoriye sabitle, iş akışında sıra kur. Paneller:{' '}
                  <Kbd>{favKeys}</Kbd> favoriler, <Kbd>{flowKeys}</Kbd> iş akışları.
                  {isApplePlatform() ? (
                    <>
                      {' '}
                      <Kbd>⌘F</Kbd> / <Kbd>⌘G</Kbd> tarayıcıda dolu;{' '}
                      <strong>Control</strong> tuşu ile deneyin.
                    </>
                  ) : null}
                </p>

                <div className="catalog-help-grid">
                  <motion.section
                    className="catalog-help-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springSoft, delay: 0.04 }}
                  >
                    <h3>Genel</h3>
                    <ul>
                      <Row keys={[`${mod}K`]} text="Komut paleti — servis, metod, sd-…" />
                      <Row
                        keys={
                          isApplePlatform()
                            ? ['⌃', 'F']
                            : ['Ctrl', 'Alt', 'F']
                        }
                        text="Favoriler paneli — aç / kapat (aynı kısayol)"
                      />
                      <Row
                        keys={
                          isApplePlatform()
                            ? ['⌃', 'G']
                            : ['Ctrl', 'Alt', 'G']
                        }
                        text="İş akışları paneli — aç / kapat (aynı kısayol)"
                      />
                      <Row keys={['Esc']} text="Palet, panel veya tam ekran haritayı kapat" />
                      <Row keys={['↑', '↓']} text="Modül ağacında satır seç" />
                      <Row keys={['Enter']} text="Seçili servisi veya klasörü aç" />
                      <Row keys={['→', '←']} text="Ağaçta genişlet / daralt" />
                    </ul>
                  </motion.section>

                  <motion.section
                    className="catalog-help-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={listItemTransition(1)}
                  >
                    <h3>Favoriler</h3>
                    <p className="catalog-help-note">
                      Üst çubuktaki yıldız veya <Kbd>{favKeys}</Kbd>. Servisi arayıp ★ ile
                      ekleyin; klasöre sürükleyin.
                    </p>
                    <ul>
                      <Row keys={['↑', '↓']} text="Listede gezin" />
                      <Row keys={['Enter']} text="Seçili servisi aç" />
                      <Row keys={['Esc']} text="Paneli kapat" />
                    </ul>
                    <p className="catalog-help-note">
                      Çift tık adı düzenler. Açık servisi “Servisi ekle” ile de
                      kaydedebilirsiniz.
                    </p>
                  </motion.section>

                  <motion.section
                    className="catalog-help-card"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={listItemTransition(2)}
                  >
                    <h3>İş akışları</h3>
                    <p className="catalog-help-note">
                      Dal ikonu veya <Kbd>{flowKeys}</Kbd>. + köke
                      ekler; sonra servisi bir <strong>akışın</strong> üzerine bırakın.
                      Klasöre servis bırakılamaz.
                    </p>
                    <ul>
                      <Row keys={['Esc']} text="Paneli kapat" />
                    </ul>
                    <p className="catalog-help-note">
                      Ada tıklayınca bilgi sayfası açılır; chevron yalnızca açar /
                      kapar. Kartta girdi, çıktı, kenar durum ve senaryo yazılır;
                      okta yalnızca geçiş notu durur.
                    </p>
                  </motion.section>
                </div>
              </MotionModalPanel>
            </MotionModalBackdrop>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
