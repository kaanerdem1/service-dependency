# `processFlowMap/` — ProcessFlowMap parçaları

Ana export: `../ProcessFlowMap.tsx` — yalnızca `ReactFlowProvider` sarmalayıcı; gövde **`ProcessFlowMapCore.tsx`**. Tipler paylaşılan `web/src/types.ts` + yerel `types.ts`.

CSS: `styles/process-flow.css` (hub) → `process-flow-chrome.css`, `process-flow-canvas.css` — [styles/rehber.md](../../../styles/rehber.md).

| Dosya | Rol |
| --- | --- |
| `constants.ts` | Layout sabitleri, `KIND_LABEL` |
| `types.ts` | Node/edge data tipleri, `PathHighlight` |
| `edgeGeometry.ts` | Ok rayları, `kitEdgePath`, `classifyRoute` |
| `buildGraph.ts` | `buildGraph`, `withEdgeRoutes`, `focusHighlightFor`, `buildDag` |
| `nodes.tsx` | `processFlowNodeTypes`, `NoteNodeData` |
| `edges.tsx` | `processFlowEdgeTypes`, `EdgeMarkers`, `FullscreenGlyph` |
| `noteNodes.ts` | Not storage / `noteActions` |
| `ProcessFlowMapCore.tsx` | State, React Flow, drawer, snapshot |
