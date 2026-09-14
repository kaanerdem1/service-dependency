#!/usr/bin/env node
/**
 * PAR klasörlerinden processdefinition.xml → env.process
 *
 *   PROCESS_PAR_ROOT=/path/to/par node server/scripts/ingest-process-par.mjs
 *
 * Önce (bir kez): psql ... -f server/sql/process_par_migration.sql
 *
 * Eşleme: klasör adındaki leading digits → process.no veya process.name
 * Yazar: description_tr ← XML label, process_definition ← tam XML, name ← .par adı (klasörden)
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import 'dotenv/config'

const PAR_ROOT =
  process.env.PROCESS_PAR_ROOT?.trim() ||
  process.env.PAR_ROOT?.trim() ||
  ''

if (!PAR_ROOT) {
  console.error('PROCESS_PAR_ROOT (veya PAR_ROOT) gerekli.')
  process.exit(1)
}

const client = new pg.Client({
  host: process.env.INVENTORY_PGHOST ?? process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.INVENTORY_PGPORT ?? process.env.PGPORT ?? 5432),
  database: process.env.INVENTORY_PGDATABASE ?? 'inventory_db',
  user: process.env.INVENTORY_PGUSER ?? process.env.PGUSER ?? 'postgres',
  password: process.env.INVENTORY_PGPASSWORD ?? process.env.PGPASSWORD,
})

function extractLabel(xml) {
  const m =
    xml.match(/<process-definition\b[^>]*\blabel="([^"]*)"/i) ||
    xml.match(/<process-definition\b[^>]*\blabel='([^']*)'/i) ||
    xml.match(/\blabel\s*=\s*"([^"]*)"/i) ||
    xml.match(/\blabel\s*=\s*'([^']*)'/i)
  return m ? m[1].trim() : null
}

function processNoFromDir(name) {
  const m = name.match(/^(\d+)/)
  return m ? m[1] : null
}

function parNameFromDir(dirName) {
  const m = dirName.match(/^\d+-(.+)$/)
  return m ? m[1] : null
}

await client.connect()

const dirs = fs.readdirSync(PAR_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())
let updated = 0
const missingXml = []
const unmatched = []
const noLabel = []

for (const d of dirs) {
  const no = processNoFromDir(d.name)
  if (!no) {
    unmatched.push({ dir: d.name, reason: 'no-number' })
    continue
  }
  const xmlPath = path.join(PAR_ROOT, d.name, 'processdefinition.xml')
  if (!fs.existsSync(xmlPath)) {
    missingXml.push(d.name)
    continue
  }
  const text = fs.readFileSync(xmlPath, 'utf8')
  const label = extractLabel(text)
  if (!label) noLabel.push(d.name)
  const parName = parNameFromDir(d.name)
  const desc = label ? label.slice(0, 800) : null

  const res = await client.query(
    `UPDATE env.process
     SET no = COALESCE(no, $4),
         name = COALESCE($5, name),
         description_tr = $1,
         process_definition = $2,
         process_type = COALESCE(process_type, 'BPM'),
         update_date = now(),
         update_user = CURRENT_USER
     WHERE status = 1
       AND (no = $3 OR name = $3 OR no = $6 OR name = $6)
     RETURNING oid`,
    [desc, text, no, no, parName, d.name],
  )
  if (res.rowCount === 0) unmatched.push({ dir: d.name, no, reason: 'no-db-row' })
  else updated += res.rowCount
}

// Klasör adı = no olan satırlar (105337_CRD_...)
const leftover = await client.query(
  `SELECT COALESCE(no, name) AS key FROM env.process WHERE process_definition IS NULL AND status = 1`,
)
const leftoverSet = new Set(leftover.rows.map((r) => r.key))

for (const d of dirs) {
  if (!leftoverSet.has(d.name)) continue
  const xmlPath = path.join(PAR_ROOT, d.name, 'processdefinition.xml')
  if (!fs.existsSync(xmlPath)) continue
  const text = fs.readFileSync(xmlPath, 'utf8')
  const label = extractLabel(text)
  const parName = parNameFromDir(d.name)
  await client.query(
    `UPDATE env.process
     SET description_tr = COALESCE($1, description_tr),
         process_definition = $2,
         name = COALESCE($3, name),
         process_type = COALESCE(process_type, 'BPM'),
         update_date = now(),
         update_user = CURRENT_USER
     WHERE status = 1 AND (no = $4 OR name = $4)`,
    [label ? label.slice(0, 800) : null, text, parName, d.name],
  )
}

const totals = await client.query(`
  SELECT COUNT(*)::int AS n,
         COUNT(process_definition)::int AS has_xml,
         COUNT(description_tr) FILTER (WHERE description_tr NOT LIKE '%.par')::int AS has_label
  FROM env.process
  WHERE status = 1
`)
const sample = await client.query(`
  SELECT no, name, LEFT(description_tr, 60) AS description_tr, LENGTH(process_definition) AS xml_len
  FROM env.process
  WHERE no IN ('105801','105251','105116')
`)

await client.end()
console.log(
  JSON.stringify(
    {
      parRoot: PAR_ROOT,
      dirs: dirs.length,
      updated,
      missingXml: missingXml.length,
      noLabel,
      unmatched: unmatched.slice(0, 15),
      totals: totals.rows[0],
      featured: sample.rows,
    },
    null,
    2,
  ),
)
