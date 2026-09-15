import assert from 'node:assert/strict'
import test from 'node:test'
import {
  servicesForOutgoingLabel,
  detailGroupsWithoutTransitionServices,
} from '../../../web/src/components/processFlowTransitionServices.ts'

test('geçiş adına göre servis eşlemesi', () => {
  const details = {
    groups: [
      {
        title: 'Geçiş: Onayla',
        rows: [{ label: 'Servis', value: 'SVC_A · call-type: sync' }],
      },
      {
        title: 'Geçiş: Reddet',
        rows: [{ label: 'Servis', value: 'SVC_B' }],
      },
      { title: 'Giriş', rows: [{ label: 'Servis', value: 'SVC_ENTER' }] },
    ],
  }
  assert.deepEqual(servicesForOutgoingLabel(details, 'Onayla'), ['SVC_A'])
  assert.deepEqual(servicesForOutgoingLabel(details, 'Reddet'), ['SVC_B'])
  const without = detailGroupsWithoutTransitionServices(details.groups)
  assert.equal(without.length, 1)
  assert.equal(without[0]?.title, 'Giriş')
})
