import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildActivity } from '../src/main/core/presence'

test('presence: сборка попадает в state', () => {
  const payload = buildActivity({
    instanceName: 'Уютная сборка',
    versionId: '1.21.4',
    startedAt: 1_700_000_123_456
  })
  assert.equal(payload.details, 'Играет в Minecraft')
  assert.equal(payload.state, 'Сборка «Уютная сборка»')
  assert.equal(payload.timestamps.start, 1_700_000_123)
  assert.deepEqual(payload.assets, { large_image: 'jorneymc', large_text: 'JorneyMC' })
})

test('presence: ваниль показывает версию', () => {
  const payload = buildActivity({ versionId: '1.21.4', startedAt: 0 })
  assert.equal(payload.state, 'Версия 1.21.4')
  assert.equal(payload.timestamps.start, 0)
})

test('presence: пустые опциональные поля не ломают payload', () => {
  const payload = buildActivity({})
  assert.equal(payload.state, 'Minecraft')
  assert.equal(payload.details, 'Играет в Minecraft')
  assert.ok(Number.isInteger(payload.timestamps.start))
})

test('presence: время всегда целые unix-секунды', () => {
  const payload = buildActivity({ versionId: '1.21.4', startedAt: 1_700_000_123_999 })
  assert.equal(payload.timestamps.start, 1_700_000_123)
  assert.ok(!String(payload.timestamps.start).includes('.'))
})

test('presence: некорректное время заменяется текущим', () => {
  const payload = buildActivity({ versionId: '1.21.4', startedAt: Number.NaN }, 1_600_000_000_000)
  assert.equal(payload.timestamps.start, 1_600_000_000)
})
