import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlaytime } from '@shared/utils'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

test('formatPlaytime: ноль — пока ни минуты', () => {
  assert.equal(formatPlaytime(0), 'пока ни минуты')
})

test('formatPlaytime: меньше минуты — пока ни минуты', () => {
  assert.equal(formatPlaytime(1), 'пока ни минуты')
  assert.equal(formatPlaytime(30_000), 'пока ни минуты')
})

test('formatPlaytime: 59 минут', () => {
  assert.equal(formatPlaytime(59 * MINUTE), '59 минут')
})

test('formatPlaytime: 60 минут — это уже час', () => {
  assert.equal(formatPlaytime(60 * MINUTE), '1 час')
})

test('formatPlaytime: 23 часа 59 минут', () => {
  assert.equal(formatPlaytime(23 * HOUR + 59 * MINUTE), '23 часа 59 минут')
})

test('formatPlaytime: 47 часов 12 минут', () => {
  assert.equal(formatPlaytime(47 * HOUR + 12 * MINUTE), '47 часов 12 минут')
})

test('formatPlaytime: 1000 часов', () => {
  assert.equal(formatPlaytime(1000 * HOUR), '1000 часов')
})

test('formatPlaytime: плюрализация минут', () => {
  assert.equal(formatPlaytime(MINUTE), '1 минута')
  assert.equal(formatPlaytime(2 * MINUTE), '2 минуты')
  assert.equal(formatPlaytime(5 * MINUTE), '5 минут')
  assert.equal(formatPlaytime(11 * MINUTE), '11 минут')
  assert.equal(formatPlaytime(21 * MINUTE), '21 минута')
  assert.equal(formatPlaytime(22 * MINUTE), '22 минуты')
})

test('formatPlaytime: плюрализация часов', () => {
  assert.equal(formatPlaytime(HOUR), '1 час')
  assert.equal(formatPlaytime(2 * HOUR), '2 часа')
  assert.equal(formatPlaytime(5 * HOUR), '5 часов')
  assert.equal(formatPlaytime(11 * HOUR), '11 часов')
  assert.equal(formatPlaytime(21 * HOUR), '21 час')
  assert.equal(formatPlaytime(22 * HOUR), '22 часа')
})

test('formatPlaytime: секунды отбрасываются, минуты не округляются вверх', () => {
  assert.equal(formatPlaytime(47 * HOUR + 12 * MINUTE + 59_000), '47 часов 12 минут')
})
