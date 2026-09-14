import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyNodeDescriptionPatch,
  normalizeNodeDescriptionsDoc,
} from './processNodeDescriptions.js'

test('normalize: boş ve geçersiz', () => {
  assert.deepEqual(normalizeNodeDescriptionsDoc(null), {})
  assert.deepEqual(normalizeNodeDescriptionsDoc({ nodes: { A: { text: '  x  ' } } }), {
    nodes: { A: { text: 'x' } },
  })
})

test('patch: metin ekle ve sil', () => {
  let doc = applyNodeDescriptionPatch({}, { nodeKey: 'Karar', text: 'Açıklama' })
  assert.equal(doc.nodes?.Karar?.text, 'Açıklama')
  doc = applyNodeDescriptionPatch(doc, { nodeKey: 'Karar', delete: true })
  assert.deepEqual(doc, {})
})

test('patch: title ve text temizleme', () => {
  const doc = applyNodeDescriptionPatch(
    { nodes: { X: { title: 'T', text: 'B' } } },
    { nodeKey: 'X', text: '' },
  )
  assert.equal(doc.nodes?.X?.title, 'T')
  assert.equal(doc.nodes?.X?.text, undefined)
})
