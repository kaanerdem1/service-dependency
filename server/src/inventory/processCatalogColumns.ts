import { INVENTORY_SCHEMA, query } from './db.js'

let cachedDescriptionTr: boolean | null = null

export async function hasDescriptionTrColumn(): Promise<boolean> {
  if (cachedDescriptionTr != null) return cachedDescriptionTr
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'process' AND column_name = 'description_tr'
     ) AS ok`,
    [INVENTORY_SCHEMA],
  )
  cachedDescriptionTr = rows[0]?.ok ?? false
  return cachedDescriptionTr
}

/** SELECT listesinde: description_tr veya NULL (kolon yoksa / RENAME sonrası unutulduysa). */
export async function sqlProcessDescriptionTr(alias?: string): Promise<string> {
  if (!(await hasDescriptionTrColumn())) return `NULL::varchar`
  if (!alias) return `description_tr`
  return `${alias}.description_tr`
}

/** Arama WHERE parçası (process satırı). */
export async function sqlProcessSearchOr(alias?: string, param = '$1'): Promise<string> {
  const p = alias ? `${alias}.` : ''
  const parts = [
    `${p}no ILIKE ${param}`,
    `${p}name ILIKE ${param}`,
    `COALESCE(${p}description_en, '') ILIKE ${param}`,
  ]
  if (await hasDescriptionTrColumn()) {
    parts.push(`COALESCE(${p}description_tr, '') ILIKE ${param}`)
  }
  return parts.map((x) => `(${x})`).join(' OR ')
}
