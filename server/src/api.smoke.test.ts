import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from './createApp.js'

test('GET /api/health → 200', async () => {
  const app = createApp()
  const res = await request(app).get('/api/health')
  assert.equal(res.status, 200)
  assert.ok(res.body)
})

test('GET /api/processes inventory kapalıyken not_available', async () => {
  const prev = process.env.CATALOG_SOURCE
  process.env.CATALOG_SOURCE = 'mock'
  try {
    const app = createApp()
    const res = await request(app).get('/api/processes')
    assert.equal(res.status, 404)
    assert.equal(res.body?.error, 'not_available')
  } finally {
    if (prev === undefined) delete process.env.CATALOG_SOURCE
    else process.env.CATALOG_SOURCE = prev
  }
})
