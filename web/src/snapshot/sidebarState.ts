/** Snapshot anında: sabitlenmemiş panel hover ile açık sayılmaz (modal/focus değişince kapanır). */
export function sidebarOpenAtSnapshot(
  navPinned: boolean,
  allowNavCollapse: boolean,
): boolean {
  if (!allowNavCollapse) return true
  return navPinned
}

export function sidebarOpenLabel(open: boolean): string {
  return open ? 'modül paneli açık' : 'modül paneli kapalı'
}
