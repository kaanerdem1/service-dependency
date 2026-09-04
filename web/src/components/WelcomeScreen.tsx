import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { springSoft } from '../motion/config'
import { MotionSpotlight } from '../motion/MotionSpotlight'
import { WelcomePreview, type WelcomeStepId } from './WelcomePreview'

type Step = {
  id: WelcomeStepId
  title: string
  sub: string
  hint?: string
}

const STEPS: Step[] = [
  {
    id: 'search',
    title: 'Servis seç',
    sub: 'Modül ağacı veya ⌘K',
    hint: 'Arama sonuçlarında Enter ile pivot değişir',
  },
  {
    id: 'map',
    title: 'Harita',
    sub: 'Etki zinciri ve komşular',
    hint: 'Grup balonuna tıklayarak servisleri açın',
  },
  {
    id: 'table',
    title: 'Tablo',
    sub: 'Katmanlı çağıran listesi',
    hint: '2./3. satırdaki ▶ ile alt katmanları genişletin',
  },
  {
    id: 'overview',
    title: 'Servis İşlevi',
    sub: 'Sahiplik ve işlev özeti',
  },
  {
    id: 'screens',
    title: 'Ekranlar',
    sub: 'Region ve page bağlantıları',
  },
  {
    id: 'star',
    title: 'Favoriler',
    sub: 'Başlıktaki ★ ile sabitle',
  },
]

const STEP_MS = 4800

export function WelcomeScreen() {
  const reduced = useReducedMotion()
  const [active, setActive] = useState(0)
  const [autoPlay, setAutoPlay] = useState(true)

  const goTo = useCallback((index: number, manual = false) => {
    setActive((index + STEPS.length) % STEPS.length)
    if (manual) setAutoPlay(false)
  }, [])

  useEffect(() => {
    if (!autoPlay || reduced) return
    const timer = window.setInterval(() => {
      setActive((i) => (i + 1) % STEPS.length)
    }, STEP_MS)
    return () => window.clearInterval(timer)
  }, [autoPlay, reduced])

  const step = STEPS[active]!

  return (
    <MotionSpotlight className="welcome-shell">
      <motion.div
        className="welcome-head"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSoft}
      >
        <h1 className="welcome-title">Servis Kataloğunu İnceleyin</h1>
        <p className="welcome-lede">
          Ağaçta dolaşarak veya arayarak bir servis seçin; harita, tablo bağlantılarını ve
          bilgilerini inceleyin. Hızlı arama için <kbd className="welcome-kbd">⌘K</kbd> kullanın.
        </p>
      </motion.div>

      <div
        className="welcome-layout"
        onMouseEnter={() => setAutoPlay(false)}
        onFocusCapture={() => setAutoPlay(false)}
      >
        <nav className="welcome-rail" aria-label="Özellik turu">
          {STEPS.map((item, i) => {
            const on = i === active
            return (
              <button
                key={item.id}
                type="button"
                className={`welcome-rail-item${on ? ' is-active' : ''}`}
                onClick={() => goTo(i, true)}
                aria-current={on ? 'step' : undefined}
              >
                {on ? (
                  <motion.span
                    className="welcome-rail-indicator"
                    layoutId="welcome-rail-indicator"
                    transition={{ type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    aria-hidden
                  />
                ) : null}
                <span className="welcome-rail-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="welcome-rail-copy">
                  <strong>{item.title}</strong>
                  <span>{item.sub}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="welcome-preview-wrap">
          <div className="welcome-preview-stage-host">
            <AnimatePresence mode="wait" initial={false}>
              <WelcomePreview key={step.id} step={step.id} />
            </AnimatePresence>
          </div>
        </div>

        <div className="welcome-progress" aria-hidden>
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`welcome-progress-dot${i === active ? ' is-active' : ''}${i < active ? ' is-done' : ''}`}
              onClick={() => goTo(i, true)}
              aria-label={`${s.title} önizlemesi`}
            />
          ))}
        </div>
      </div>

      <div className="welcome-footnote-slot" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {step.hint ? (
            <motion.p
              key={step.id}
              className="welcome-footnote"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {step.hint}
            </motion.p>
          ) : (
            <p key="empty-hint" className="welcome-footnote is-empty" aria-hidden>
              &nbsp;
            </p>
          )}
        </AnimatePresence>
      </div>
    </MotionSpotlight>
  )
}
