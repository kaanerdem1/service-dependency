import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { springSoft } from '../motion/config'

export type WelcomeStepId =
  | 'search'
  | 'map'
  | 'table'
  | 'overview'
  | 'screens'
  | 'star'

const sceneTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
}

function PreviewShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="welcome-preview-scene">
      <span className="welcome-preview-label">{label}</span>
      <div className="welcome-preview-canvas">{children}</div>
    </div>
  )
}

function SearchScene() {
  const reduced = useReducedMotion()
  return (
    <PreviewShell label="Komut paleti">
      <div className="wp-cmdk">
        <div className="wp-cmdk-input">
          <span className="wp-cmdk-icon" aria-hidden>
            ⌕
          </span>
          <motion.span
            className="wp-cmdk-typed"
            initial={{ width: 0 }}
            animate={{ width: reduced ? 'auto' : '72%' }}
            transition={{ duration: reduced ? 0 : 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          >
            PROPOSAL
          </motion.span>
          {!reduced ? (
            <motion.span
              className="wp-cmdk-caret"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              aria-hidden
            />
          ) : null}
        </div>
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className={`wp-cmdk-hit${i === 0 ? ' is-focus' : ''}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 + i * 0.12, ...springSoft }}
          >
            <span className="wp-dot" />
            <span className="wp-cmdk-hit-name">
              {i === 0 ? 'PROPOSAL_MAIN_GET' : 'PROPOSAL_DETAIL_GET'}
            </span>
          </motion.div>
        ))}
      </div>
    </PreviewShell>
  )
}

function MapScene() {
  const reduced = useReducedMotion()
  const nodes = [
    { id: 'center', x: 140, y: 78, r: 13, center: true, label: 'PROPOSAL_MAIN_GET', delay: 0.08 },
    { id: 'n1', x: 42, y: 36, r: 9, label: 'CONS_APP_INFO', delay: 0.18 },
    { id: 'n2', x: 48, y: 96, r: 9, label: 'CCS_CRD_RATE', delay: 0.24 },
    { id: 'n3', x: 92, y: 132, r: 8, label: 'PTT_PAYMENT', delay: 0.3 },
    { id: 'n4', x: 198, y: 28, r: 9, label: 'ADK_UPDATE', delay: 0.22 },
    { id: 'n5', x: 236, y: 88, r: 9, label: 'MAIN_INFO', delay: 0.28 },
    { id: 'n6', x: 210, y: 138, r: 8, label: 'USAGE_MIG', delay: 0.34 },
    { id: 'n7', x: 140, y: 28, r: 8, label: 'DETAIL_GET', delay: 0.2 },
  ]
  const edges: [string, string][] = [
    ['n1', 'center'],
    ['n2', 'center'],
    ['n3', 'n2'],
    ['n4', 'center'],
    ['n5', 'center'],
    ['n6', 'n5'],
    ['n7', 'center'],
    ['n1', 'n7'],
  ]
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

  return (
    <PreviewShell label="Etki haritası">
      <svg className="wp-map" viewBox="0 0 280 168" aria-hidden>
        {edges.map(([from, to], i) => {
          const a = byId[from]!
          const b = byId[to]!
          return (
            <motion.line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="wp-map-edge"
              initial={{ pathLength: 0, opacity: 0.25 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.55, delay: 0.12 + i * 0.05 }}
            />
          )
        })}
        {nodes.map((n) => (
          <motion.g
            key={n.id}
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: n.delay, ...springSoft }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              className={n.center ? 'wp-map-node is-center' : 'wp-map-node'}
            />
            {!reduced && n.center ? (
              <motion.circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                className="wp-map-pulse"
                animate={{ r: [n.r, n.r + 10], opacity: [0.35, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
              />
            ) : null}
            <text
              x={n.x}
              y={n.y + n.r + 11}
              textAnchor="middle"
              className={n.center ? 'wp-map-label is-center' : 'wp-map-label'}
            >
              {n.label}
            </text>
          </motion.g>
        ))}
      </svg>
    </PreviewShell>
  )
}

function TableScene() {
  const reduced = useReducedMotion()
  const rows = [
    {
      n: 1,
      l1: 'CONS_APPLICATION_GET_APPLICATION_MAIN_INFO',
      l2: 'CONS_APPLICATION_GET_APPLICATION_INFO',
      l3: 'CONS_APPLICATION_ADK_UPDATE_APPLICATION',
      expand: true,
    },
    {
      n: 2,
      l1: 'CCS_CRD_CREDIT_COST_RATE_GET',
      l2: '—',
      l3: '—',
    },
    {
      n: 3,
      l1: 'CONS_CALCULATE_PAYMENT_DETAIL_FOR_PTT',
      l2: '—',
      l3: '—',
    },
  ]
  return (
    <PreviewShell label="Katman tablosu">
      <div className="wp-table">
        <div className="wp-table-head" role="row">
          <span className="wp-table-num" aria-hidden />
          <span>1. Katman</span>
          <span>2. Katman</span>
          <span>3. Katman</span>
        </div>
        {rows.map((row, i) => (
          <motion.div
            key={row.n}
            className="wp-table-row"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.1, ...springSoft }}
          >
            <span className="wp-table-num">{row.n}</span>
            <span className="wp-table-cell" title={row.l1}>
              {row.l1}
            </span>
            <span className="wp-table-cell" title={row.l2}>
              {row.expand ? (
                <span className="wp-table-expand">
                  <motion.span
                    className="wp-chevron"
                    animate={reduced ? {} : { rotate: [0, 90, 90, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.25, 0.75, 1] }}
                  >
                    ▸
                  </motion.span>
                  <span>{row.l2}</span>
                </span>
              ) : (
                row.l2
              )}
            </span>
            <span className="wp-table-cell" title={row.l3}>
              {row.l3}
            </span>
          </motion.div>
        ))}
      </div>
    </PreviewShell>
  )
}

function OverviewScene() {
  const tiles = [
    { w: 'wide', label: 'Sahiplik' },
    { w: 'narrow', label: 'Ekip' },
    { w: 'narrow', label: 'Proje' },
    { w: 'wide', label: 'İşlev özeti' },
  ]
  return (
    <PreviewShell label="Servis İşlevi">
      <div className="wp-bento">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            className={`wp-bento-tile is-${tile.w}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.08, ...springSoft }}
          >
            <span className="wp-bento-label">{tile.label}</span>
            <span className="wp-bento-bar" />
            <span className="wp-bento-bar is-short" />
          </motion.div>
        ))}
      </div>
    </PreviewShell>
  )
}

function ScreensScene() {
  return (
    <PreviewShell label="Ekranlar">
      <div className="wp-screens">
        <div className="wp-filter-row">
          {['Tümü', 'Region', 'Page'].map((f, i) => (
            <motion.span
              key={f}
              className={`wp-filter-chip${i === 1 ? ' is-on' : ''}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 + i * 0.07, ...springSoft }}
            >
              {f}
            </motion.span>
          ))}
        </div>
        {[
          { type: 'Region', name: 'CONS_APPLICATION_MAIN_REGION' },
          { type: 'Region', name: 'CCS_CREDIT_CARD_SUMMARY_REGION' },
          { type: 'Page', name: 'PROPOSAL_MAIN_DETAIL_PAGE' },
        ].map((row, i) => (
          <motion.div
            key={row.name}
            className="wp-screen-row"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1, ...springSoft }}
          >
            <span className={`wp-badge is-${row.type.toLowerCase()}`}>{row.type}</span>
            <span className="wp-screen-name" title={row.name}>
              {row.name}
            </span>
          </motion.div>
        ))}
      </div>
    </PreviewShell>
  )
}

function StarScene() {
  const folders = [
    { name: 'Kritik', count: 2 },
    { name: 'Ödeme', count: 1 },
  ]
  return (
    <PreviewShell label="Favoriler">
      <div className="wp-fav">
        <div className="wp-fav-toolbar">
          <span className="wp-fav-toolbar-title">
            <span className="wp-fav-star-inline" aria-hidden>
              ★
            </span>
            Favorilerim
          </span>
          <span className="wp-fav-toolbar-meta">5</span>
        </div>

        <div className="wp-fav-search" aria-hidden>
          <span>Servis ara…</span>
        </div>

        <motion.div
          className="wp-fav-drawer"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, ...springSoft }}
        >
          <span className="wp-fav-section">Favoriler</span>
          {['PROPOSAL_MAIN_GET', 'CONS_APPLICATION_GET_APPLICATION_MAIN_INFO'].map(
            (name, i) => (
              <motion.div
                key={name}
                className="wp-fav-item"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18 + i * 0.08, ...springSoft }}
              >
                <span className="wp-dot" />
                <span className="wp-fav-item-name">{name}</span>
              </motion.div>
            ),
          )}

          <span className="wp-fav-section is-folders">Klasörler</span>
          {folders.map((folder, i) => (
            <motion.div
              key={folder.name}
              className="wp-fav-folder"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + i * 0.1, ...springSoft }}
            >
              <span className="wp-fav-folder-chev" aria-hidden>
                ▸
              </span>
              <span className="wp-fav-folder-name">{folder.name}</span>
              <span className="wp-fav-folder-count">{folder.count}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </PreviewShell>
  )
}

const SCENES: Record<WelcomeStepId, () => ReactNode> = {
  search: SearchScene,
  map: MapScene,
  table: TableScene,
  overview: OverviewScene,
  screens: ScreensScene,
  star: StarScene,
}

export function WelcomePreview({ step }: { step: WelcomeStepId }) {
  const Scene = SCENES[step]
  return (
    <motion.div
      key={step}
      className="welcome-preview-stage"
      {...sceneTransition}
    >
      <Scene />
    </motion.div>
  )
}
