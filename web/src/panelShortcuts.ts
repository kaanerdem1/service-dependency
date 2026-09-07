export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

/** Mac: ⌃F — ⌘F tarayıcıda “bul”. Windows: Ctrl+Alt+F */
export function favoritesPanelShortcutLabel(): string {
  return isApplePlatform() ? '⌃F' : 'Ctrl+Alt+F'
}

/** Mac: ⌃G — ⌘G tarayıcıda “sonrakini bul”. Windows: Ctrl+Alt+G */
export function workflowsPanelShortcutLabel(): string {
  return isApplePlatform() ? '⌃G' : 'Ctrl+Alt+G'
}

export function matchPanelShortcut(
  e: KeyboardEvent,
  panel: 'favorites' | 'workflows',
): boolean {
  if (e.shiftKey) return false
  const key = panel === 'favorites' ? 'f' : 'g'
  if (e.key.toLowerCase() !== key) return false
  if (isApplePlatform()) {
    return e.ctrlKey && !e.metaKey && !e.altKey
  }
  return e.ctrlKey && e.altKey && !e.metaKey
}
