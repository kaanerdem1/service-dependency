# `impactMap/` — ImpactMap parçaları

Ana export: `../ImpactMap.tsx` → `ImpactMapCore.tsx`.

| Dosya | Rol |
| --- | --- |
| `ImpactMapCore.tsx` | State, React Flow, snapshot, filtre |
| `buildGraph.ts` | `ImpactGraph` → nodes/edges |
| `nodes.tsx` | `impactMapNodeTypes` (sabit referans) |
| `edges.tsx` | `impactMapEdgeTypes`, `FocusEdgeHopChip` |
| `popovers.tsx` | Metod / not popup |
| `types.ts`, `constants.ts` | Props ve sabitler |

API: graf `useServiceStageData` → prop; lazy not/metod `api/client.ts`.
