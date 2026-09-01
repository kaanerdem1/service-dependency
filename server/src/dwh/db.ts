import 'dotenv/config'
import pg, { type QueryResultRow } from 'pg'

const ALLOWED_SCHEMAS = new Set(['stage'])

function resolveSchema() {
  const schema = (process.env.PGSCHEMA ?? process.env.DWH_PG_SCHEMA ?? 'stage').trim()
  if (!ALLOWED_SCHEMAS.has(schema)) {
    throw new Error(`Invalid DWH schema: ${schema}`)
  }
  return schema
}

export const DWH_SCHEMA = resolveSchema()

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'postgres',
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD,
})

export function tableName(name: string) {
  return `${DWH_SCHEMA}.${name}`
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params)
}
