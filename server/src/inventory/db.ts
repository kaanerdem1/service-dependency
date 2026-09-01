import 'dotenv/config'
import pg, { type QueryResultRow } from 'pg'

const ALLOWED_SCHEMAS = new Set(['env'])

function resolveSchema() {
  const schema = (process.env.INVENTORY_PGSCHEMA ?? 'env').trim()
  if (!ALLOWED_SCHEMAS.has(schema)) {
    throw new Error(`Invalid inventory schema: ${schema}`)
  }
  return schema
}

export const INVENTORY_SCHEMA = resolveSchema()

export const pool = new pg.Pool({
  host: process.env.INVENTORY_PGHOST ?? process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.INVENTORY_PGPORT ?? process.env.PGPORT ?? 5432),
  database: process.env.INVENTORY_PGDATABASE ?? 'inventory_db',
  user: process.env.INVENTORY_PGUSER ?? process.env.PGUSER ?? 'postgres',
  password: process.env.INVENTORY_PGPASSWORD ?? process.env.PGPASSWORD,
})

export function tableName(name: string) {
  return `${INVENTORY_SCHEMA}.${name}`
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return pool.query<T>(text, params)
}

export async function pingInventory(): Promise<void> {
  await query('SELECT 1 FROM ' + tableName('service_definition') + ' LIMIT 1')
}
