import assert from 'node:assert/strict'
import test from 'node:test'
import { initialSidebarDrawer, isTextEditingTarget } from '../src/navigation/appShellHelpers.ts'

test('isTextEditingTarget input/textarea/select ve contentEditable', () => {
  const input = { tagName: 'INPUT', isContentEditable: false }
  const div = { tagName: 'DIV', isContentEditable: false }
  const edit = { tagName: 'DIV', isContentEditable: true }
  assert.equal(isTextEditingTarget(input as unknown as EventTarget), true)
  assert.equal(isTextEditingTarget(div as unknown as EventTarget), false)
  assert.equal(isTextEditingTarget(edit as unknown as EventTarget), true)
  assert.equal(isTextEditingTarget(null), false)
})

test('süreç/rota restore drawer’ı iş akışlarını açar', () => {
  const d = initialSidebarDrawer({
    v: 1,
    surface: 'services',
    processFlowNo: 'P1',
  })
  assert.deepEqual(d, { shortcutsOpen: false, workflowsOpen: true })
})

test('persist shortcuts drawer', () => {
  const d = initialSidebarDrawer({
    v: 1,
    surface: 'services',
    sidebarDrawer: 'shortcuts',
  })
  assert.deepEqual(d, { shortcutsOpen: true, workflowsOpen: false })
})
