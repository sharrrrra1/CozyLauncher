import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldWriteCheckMarker } from '../src/shared/update-check'

test('marker written only after a definitive check result', () => {
  assert.equal(shouldWriteCheckMarker({ available: true, ok: true }), true)
  assert.equal(shouldWriteCheckMarker({ available: false, ok: true }), true)
})

test('failed check does not burn the 24h throttle', () => {
  assert.equal(shouldWriteCheckMarker({ available: false, ok: false }), false)
  assert.equal(shouldWriteCheckMarker(null), false)
  assert.equal(shouldWriteCheckMarker(undefined), false)
})