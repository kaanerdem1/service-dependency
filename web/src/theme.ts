export type AppTheme = 'mixed' | 'white'

export const APP_THEME_KEY = 'sd-app-theme'

export function readAppTheme(): AppTheme {
  if (typeof window === 'undefined') return 'mixed'
  return window.localStorage.getItem(APP_THEME_KEY) === 'white'
    ? 'white'
    : 'mixed'
}

export function themeLabel(theme: AppTheme): string {
  return theme === 'mixed' ? 'Kapalı Tema' : 'Açık Tema'
}
