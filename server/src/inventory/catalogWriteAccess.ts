import type { Request } from 'express'

/** Frontend `resolveCatalogCanEdit` ile uyumlu yazma kapısı (SSO öncesi). */
export function catalogWriteAllowed(req: Request): boolean {
  const header = req.get('x-sd-catalog-edit')?.trim().toLowerCase()
  if (header === '0' || header === 'false') return false
  if (header === '1' || header === 'true') return true
  const env = process.env.SD_CATALOG_EDIT?.trim().toLowerCase()
  if (env === '0' || env === 'false') return false
  if (env === '1' || env === 'true') return true
  return true
}

export function assertCatalogWrite(req: Request): void {
  if (!catalogWriteAllowed(req)) throw new Error('forbidden_catalog_edit')
}
