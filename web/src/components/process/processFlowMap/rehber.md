# `processFlowMap/` — ProcessFlowMap parçaları

Ana export: `../ProcessFlowMap.tsx` → `ProcessFlowMapCore.tsx`.

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
