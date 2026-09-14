#!/usr/bin/env node
/** Tüm süreç XML'lerinin parser ile birebir uyumunu kontrol eder. */
import 'dotenv/config'

const base = process.env.API_BASE?.replace(/\/$/, '') ?? 'http://127.0.0.1:4000'
const no = process.env.PROCESS_NO?.trim()
const url = no
  ? `${base}/api/meta/process-parse-audit?no=${encodeURIComponent(no)}`
  : `${base}/api/meta/process-parse-audit?limit=500`

const res = await fetch(url)
if (!res.ok) {
  console.error(`HTTP ${res.status}`, await res.text())
  process.exit(1)
}
const body = await res.json()
console.log(JSON.stringify(body, null, 2))
if (no ? !body.ok : !body.ok) {
  process.exit(1)
}
