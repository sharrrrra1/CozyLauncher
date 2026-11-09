import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOT_STEPS, bootView } from '../src/renderer/src/lib/boot'

test('boot: старт — первый шаг активен, прогресс нулевой', () => {
  const view = bootView(0, false)
  assert.equal(view.percent, 0)
  assert.deepEqual(
    view.steps.map((step) => step.state),
    ['active', 'pending', 'pending', 'pending']
  )
  assert.equal(view.steps.length, BOOT_STEPS.length)
  assert.equal(view.done, false)
})

test('boot: пройденные шаги отмечены, текущий активен', () => {
  const view = bootView(2, false)
  assert.equal(view.percent, 50)
  assert.deepEqual(
    view.steps.map((step) => step.state),
    ['done', 'done', 'active', 'pending']
  )
})

test('boot: ready завершает все шаги и даёт 100%', () => {
  const view = bootView(3, true)
  assert.equal(view.percent, 100)
  assert.equal(view.done, true)
  assert.deepEqual(
    view.steps.map((step) => step.state),
    ['done', 'done', 'done', 'done']
  )
})

test('boot: stage за пределами диапазона не ломает прогресс', () => {
  assert.equal(bootView(-2, false).percent, 0)
  const capped = bootView(99, false)
  assert.equal(capped.percent, 75)
  assert.deepEqual(
    capped.steps.map((step) => step.state),
    ['done', 'done', 'done', 'active']
  )
})