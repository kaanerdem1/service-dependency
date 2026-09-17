import assert from 'node:assert/strict'
import test from 'node:test'
import { sinkCopyRealId } from '../src/components/processFlowIds.ts'
import { isDummyId, isHappyLabel, isRejectLabel } from '../src/components/processFlowCanvasLayout.ts'

test('sinkCopyRealId gerçek BPM id’sini ::near kopyasından ayırır', () => {
  assert.equal(sinkCopyRealId('n1'), 'n1')
  assert.equal(sinkCopyRealId('n1::near:2'), 'n1')
})

test('keşif canvas: dummy id ve geçiş etiketleri', () => {
  assert.equal(isDummyId('d:x'), true)
  assert.equal(isDummyId('task-1'), false)
  assert.equal(isHappyLabel('Onayla'), true)
  assert.equal(isRejectLabel('Reddet'), true)
  assert.equal(isHappyLabel('Diğer'), false)
})
