import type { ModuleNode } from './types'

export type TreeDensity = 'comfortable' | 'compact'

export type TreeKindFilter = 'group' | 'package' | 'service' | 'method'

export const ALL_TREE_KINDS: TreeKindFilter[] = ['group', 'package', 'service', 'method']

const DENSITY_KEY = 'serviceDep.treeDensity'
const KINDS_KEY = 'serviceDep.treeKindFilter'

const KIND_LEVEL: Record<TreeKindFilter, number> = {
  group: 0,
  package: 2,
  service: 3,
  method: 4,
}

export function readTreeDensity(): TreeDensity {
  try {
    const v = localStorage.getItem(DENSITY_KEY)
    return v === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function writeTreeDensity(density: TreeDensity) {
  try {
    localStorage.setItem(DENSITY_KEY, density)
  } catch {
    /* private mode */
  }
}

export function readTreeKindFilter(): Set<TreeKindFilter> {
  try {
    const raw = localStorage.getItem(KINDS_KEY)
    if (!raw) return new Set(ALL_TREE_KINDS)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(ALL_TREE_KINDS)
    const next = parsed.filter((k): k is TreeKindFilter =>
      ALL_TREE_KINDS.includes(k as TreeKindFilter),
    )
    return next.length > 0 ? new Set(next) : new Set(ALL_TREE_KINDS)
  } catch {
    return new Set(ALL_TREE_KINDS)
  }
}

export function writeTreeKindFilter(kinds: Set<TreeKindFilter>) {
  try {
    localStorage.setItem(KINDS_KEY, JSON.stringify([...kinds]))
  } catch {
    /* private mode */
  }
}

function normalizeKind(kind: ModuleNode['kind']): TreeKindFilter | null {
  if (kind === 'project') return 'group'
  if (ALL_TREE_KINDS.includes(kind as TreeKindFilter)) return kind as TreeKindFilter
  return null
}

/** At least one ancestor level stays visible when filtering deeper kinds. */
export function isTreeNodeVisible(
  kind: ModuleNode['kind'],
  enabled: Set<TreeKindFilter>,
): boolean {
  if (enabled.size >= ALL_TREE_KINDS.length) return true
  const k = normalizeKind(kind)
  if (!k) return true
  const level = KIND_LEVEL[k]
  const maxLevel = Math.max(...[...enabled].map((x) => KIND_LEVEL[x]))
  if (level > maxLevel) return false
  if (level < maxLevel) return true
  return enabled.has(k)
}
