# `processFlowMap/` — ProcessFlowMap parçaları

Ana bileşen hâlâ `../ProcessFlowMap.tsx` (nodes, edges, notlar, `ProcessFlowMapCore` yakında).

| Dosya | Rol |
| --- | --- |
| `constants.ts` | Layout sabitleri, `KIND_LABEL` |
| `types.ts` | Node/edge data tipleri, `PathHighlight` |
| `edgeGeometry.ts` | Ok rayları, `kitEdgePath`, `classifyRoute` |
| `buildGraph.ts` | `buildGraph`, `withEdgeRoutes`, `focusHighlightFor` |

Sonraki dilim: `nodes.tsx`, `edges.tsx`, `ProcessFlowMapCore.tsx`.
