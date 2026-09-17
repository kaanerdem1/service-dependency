/**
 * Süreç yüksek seviye UI (gruplu kartlar). API grafından türetir; tam harita değil.
 * İlgili: `processHighLevel.ts`, [rehber.md](./rehber.md)
 */
import { useMemo, useState } from 'react'
import type { ProcessFlowGraph, ProcessFlowNodeKind } from '../../types'
import {
  highLevelFor,
  lookupNodes,
  type HlBlock,
  type HlFork,
  type HlGroup,
  type HlPiece,
} from './processHighLevel'

const KIND_LABEL: Record<ProcessFlowNodeKind, string> = {
  start: 'Başlangıç',
  end: 'Bitiş',
  task: 'Görev',
  decision: 'Karar',
  service: 'Servis',
  subprocess: 'Alt süreç',
  dummy: 'Adım',
  other: 'Adım',
}

type Props = { graph: ProcessFlowGraph }

function isBlock(p: HlPiece): p is HlBlock {
  return !('type' in p)
}

function BlockCard({
  block,
  graph,
  selected,
  onSelect,
}: {
  block: HlBlock
  graph: ProcessFlowGraph
  selected: boolean
  onSelect: (block: HlBlock) => void
}) {
  const xml = lookupNodes(graph, block.xmlIds)[0]
  const svc = xml?.services[0]
  const kind = block.kind === 'group' ? 'other' : block.kind
  return (
    <button
      type="button"
      className={`hl-node is-${kind}${selected ? ' is-on' : ''}`}
      onClick={() => onSelect(block)}
      title={block.hint}
    >
      {kind === 'start' || kind === 'end' ? (
        <>
          <span className={`hl-event${kind === 'end' && /reddet|iptal/i.test(block.title) ? ' is-stop' : ''}`} />
          <strong>{block.title}</strong>
        </>
      ) : kind === 'decision' ? (
        <>
          <span className="hl-diamond" aria-hidden>
            <span className="hl-diamond-mark">✕</span>
          </span>
          <strong>{block.title}</strong>
        </>
      ) : (
        <>
          <span className="hl-kicker">{KIND_LABEL[kind] ?? 'Adım'}</span>
          <strong>{block.title}</strong>
          {svc ? <span className="hl-svc">{svc}</span> : null}
        </>
      )}
    </button>
  )
}

function Pieces({
  pieces,
  graph,
  selectedId,
  onSelect,
}: {
  pieces: HlPiece[]
  graph: ProcessFlowGraph
  selectedId?: string
  onSelect: (block: HlBlock) => void
}) {
  return (
    <div className="hl-seq">
      {pieces.map((p, i) => (
        <FragmentPiece
          key={'id' in p && !('type' in p) ? p.id : `${i}`}
          piece={p}
          graph={graph}
          selectedId={selectedId}
          onSelect={onSelect}
          showArrow={i < pieces.length - 1}
        />
      ))}
    </div>
  )
}

function FragmentPiece({
  piece,
  graph,
  selectedId,
  onSelect,
  showArrow,
}: {
  piece: HlPiece
  graph: ProcessFlowGraph
  selectedId?: string
  onSelect: (block: HlBlock) => void
  showArrow: boolean
}) {
  if (isBlock(piece)) {
    return (
      <>
        <BlockCard block={piece} graph={graph} selected={selectedId === piece.id} onSelect={onSelect} />
        {showArrow ? <span className="hl-arrow" aria-hidden /> : null}
      </>
    )
  }
  if (piece.type === 'group') {
    return (
      <>
        <GroupBox group={piece} graph={graph} selectedId={selectedId} onSelect={onSelect} />
        {showArrow ? <span className="hl-arrow" aria-hidden /> : null}
      </>
    )
  }
  return (
    <>
      <ForkBox fork={piece} graph={graph} selectedId={selectedId} onSelect={onSelect} />
      {showArrow ? <span className="hl-arrow" aria-hidden /> : null}
    </>
  )
}

function GroupBox({
  group,
  graph,
  selectedId,
  onSelect,
}: {
  group: HlGroup
  graph: ProcessFlowGraph
  selectedId?: string
  onSelect: (block: HlBlock) => void
}) {
  return (
    <div className="hl-group">
      <p className="hl-group-title">{group.title}</p>
      {group.hint ? <p className="hl-group-hint">{group.hint}</p> : null}
      <Pieces pieces={group.blocks} graph={graph} selectedId={selectedId} onSelect={onSelect} />
    </div>
  )
}

function ForkBox({
  fork,
  graph,
  selectedId,
  onSelect,
}: {
  fork: HlFork
  graph: ProcessFlowGraph
  selectedId?: string
  onSelect: (block: HlBlock) => void
}) {
  return (
    <div className="hl-fork">
      <BlockCard block={fork.gate} graph={graph} selected={selectedId === fork.gate.id} onSelect={onSelect} />
      <div className="hl-fork-arms">
        {fork.arms.map((arm) => (
          <div className="hl-arm" key={arm.label}>
            <span className="hl-elbl">{arm.label}</span>
            <Pieces pieces={arm.blocks} graph={graph} selectedId={selectedId} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProcessHighLevelView({ graph }: Props) {
  const overview = useMemo(() => highLevelFor(graph), [graph])
  const [selected, setSelected] = useState<HlBlock>()
  const xmlNodes = selected ? lookupNodes(graph, selected.xmlIds) : []

  return (
    <div className="hl-shell">
      <div className="hl-poster">
        <header className="hl-head">
          <h2>{overview.title}</h2>
          <ul className="hl-legend">
            <li>
              <span className="hl-event" /> Başlangıç
            </li>
            <li>
              <span className="hl-event is-stop" /> Bitiş / red
            </li>
            <li>
              <span className="hl-leg-task" /> Görev
            </li>
            <li>
              <span className="hl-diamond" /> Karar
            </li>
            <li>
              <span className="hl-leg-svc" /> Servis
            </li>
          </ul>
        </header>
        <p className="hl-note">{overview.note}</p>
        {overview.lanes.map((lane) => (
          <section className={`hl-lane is-${lane.tone}`} key={lane.id}>
            <h3>{lane.title}</h3>
            <div className="hl-lane-body">
              <Pieces
                pieces={lane.pieces}
                graph={graph}
                selectedId={selected?.id}
                onSelect={setSelected}
              />
            </div>
          </section>
        ))}
      </div>
      {selected ? (
        <aside className="pf-detail">
          <p className="pf-detail-kicker">
            {selected.kind === 'group' ? 'Grup' : KIND_LABEL[selected.kind] ?? 'Adım'}
          </p>
          <h3 className="pf-detail-title">{selected.title}</h3>
          {selected.hint ? <p className="pf-detail-hint">{selected.hint}</p> : null}
          {xmlNodes.map((n) => (
            <div key={n.id} className="hl-xml-block">
              <p className="hl-xml-name">{n.name}</p>
              {n.services.length ? (
                <ul className="pf-detail-svcs">
                  {n.services.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="pf-detail-empty">Bu adımda servis çağrısı yok.</p>
              )}
            </div>
          ))}
          {!xmlNodes.length ? (
            <p className="pf-detail-empty">Bu blok özet; XML’de eşleşen adım yok.</p>
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}
