#!/usr/bin/env node
/** CI / deploy öncesi: süreç XML + Türkçe label var mı? */
import 'dotenv/config'

const base = process.env.API_BASE?.replace(/\/$/, '') ?? 'http://127.0.0.1:4000'
const res = await fetch(`${base}/api/meta/process-catalog-health`)
if (!res.ok) {
  console.error(`HTTP ${res.status}`)
  process.exit(1)
}
const body = await res.json()
console.log(JSON.stringify(body, null, 2))
if (!body.ok) {
  console.error('\nOnarım:', body.repairCommand)
  process.exit(1)
}
