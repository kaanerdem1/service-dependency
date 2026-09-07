/**
 * Katalog yazma yetkisi (iş akışları, servis değişiklik notları).
 *
 * Gerçek SSO / rol doğrulaması intranet host’unda yapılacak. Bugün mock oturum
 * “direktör” ayırt etmez; host gömünce `window.__SD_CATALOG__.canEdit` verir.
 *
 * Öncelik (ilk tanımlı kazanır):
 * 1. `window.__SD_CATALOG__.canEdit` — embed / intranet
 * 2. `?sdEdit=0|1` — geçici önizleme
 * 3. `VITE_SD_CATALOG_EDIT` — deploy flag
 * 4. Standalone demo: düzenleme açık
 */

export type SdCatalogEmbed = {
  /** false → salt okuma (yetkisiz). true → oluştur / düzenle. */
  canEdit?: boolean
  /** İleride SSO’dan: director, catalog_editor, … */
  roles?: string[]
}

declare global {
  interface Window {
    __SD_CATALOG__?: SdCatalogEmbed
  }
}

function parseFlag(raw: string | null | undefined): boolean | undefined {
  if (raw == null || raw === '') return undefined
  const v = raw.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'view' || v === 'readonly') return false
  if (v === '1' || v === 'true' || v === 'edit') return true
  return undefined
}

export function resolveCatalogCanEdit(): boolean {
  if (typeof window !== 'undefined') {
    const embed = window.__SD_CATALOG__?.canEdit
    if (typeof embed === 'boolean') return embed
    const query = parseFlag(
      new URLSearchParams(window.location.search).get('sdEdit') ??
        new URLSearchParams(window.location.search).get('catalogEdit'),
    )
    if (query !== undefined) return query
  }
  const env = parseFlag(import.meta.env.VITE_SD_CATALOG_EDIT as string | undefined)
  if (env !== undefined) return env
  return true
}
