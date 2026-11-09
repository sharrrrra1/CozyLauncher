import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeOptimization, G1GC_PRESET, type OptimizationSpecs } from '@shared/optimization'

function specs(totalMemMb: number, overrides: Partial<OptimizationSpecs> = {}): OptimizationSpecs {
  return {
    totalMemMb,
    cores: 8,
    gpuKnown: true,
    screenW: 2560,
    screenH: 1440,
    ...overrides
  }
}

test('оптимизация: 4 ГБ — игре не больше 2 ГБ', () => {
  const plan = computeOptimization(specs(4096))
  assert.equal(plan.ramMb, 2048)
})

test('оптимизация: 8 ГБ — 2 ГБ ванили', () => {
  const plan = computeOptimization(specs(8192))
  assert.equal(plan.ramMb, 2048)
})

test('оптимизация: 16 ГБ — 4 ГБ ванили', () => {
  const plan = computeOptimization(specs(16384))
  assert.equal(plan.ramMb, 4096)
})

test('оптимизация: 64 ГБ — потолок 8 ГБ для ванили', () => {
  const plan = computeOptimization(specs(65536))
  assert.equal(plan.ramMb, 8192)
  assert.ok(plan.notes.some((note) => /Больше не выделяем/.test(note)))
})

test('оптимизация: реальные 15,7 ГБ не дают ложную заметку про нехватку памяти', () => {
  const plan = computeOptimization(specs(16140))
  assert.equal(plan.ramMb, 3584)
  assert.ok(!plan.notes.some((note) => /системе тоже нужна память/.test(note)))
})

test('оптимизация: модпак на 100 модов на 16 ГБ получает больше памяти', () => {
  const plan = computeOptimization(specs(16384), { modsCount: 100 })
  assert.equal(plan.ramMb, 6144)
  assert.ok(plan.notes.some((note) => /100 модов/.test(note)))
})

test('оптимизация: модпак на слабой машине всё равно не съедает систему', () => {
  const plan = computeOptimization(specs(4096), { modsCount: 100 })
  assert.equal(plan.ramMb, 2048)
})

test('оптимизация: память всегда кратна 512 и не меньше 2048', () => {
  for (const total of [4096, 6144, 8192, 12288, 16384, 32768, 65536]) {
    const plan = computeOptimization(specs(total))
    assert.equal(plan.ramMb % 512, 0)
    assert.ok(plan.ramMb >= 2048)
  }
})

test('оптимизация: свои JVM-аргументы не перетираем', () => {
  const plan = computeOptimization(specs(16384), { currentJvmArgs: '-XX:+UseZGC' })
  assert.equal(plan.keepCustomJvm, true)
  assert.deepEqual(plan.jvmArgs, [])
  assert.equal(plan.jvmArgsLine, '-XX:+UseZGC')
  assert.ok(plan.notes.some((note) => /не трогаем/.test(note)))
})

test('оптимизация: наш пресет G1GC применяется, если аргументов нет', () => {
  const empty = computeOptimization(specs(16384))
  assert.equal(empty.keepCustomJvm, false)
  assert.equal(empty.jvmArgs.length, 6)
  assert.equal(empty.jvmArgsLine, G1GC_PRESET)

  const same = computeOptimization(specs(16384), { currentJvmArgs: G1GC_PRESET })
  assert.equal(same.keepCustomJvm, false)
  assert.equal(same.jvmArgsLine, G1GC_PRESET)
})

test('оптимизация: полный экран только на 6+ ядрах и с известной видеокартой', () => {
  assert.equal(computeOptimization(specs(16384, { cores: 4, gpuKnown: true })).fullscreen, false)
  assert.equal(computeOptimization(specs(16384, { cores: 8, gpuKnown: false })).fullscreen, false)
  assert.equal(computeOptimization(specs(16384, { cores: 8, gpuKnown: true })).fullscreen, true)
})

test('оптимизация: разрешение берём из рабочей области экрана', () => {
  const plan = computeOptimization(specs(16384, { screenW: 2561, screenH: 1441 }))
  assert.equal(plan.width, 2560)
  assert.equal(plan.height, 1440)
  assert.ok(plan.notes.some((note) => note.includes('2560×1440')))
})

test('оптимизация: без данных об экране — уютный fallback', () => {
  const plan = computeOptimization(specs(16384, { screenW: 0, screenH: 0 }))
  assert.equal(plan.width, 1280)
  assert.equal(plan.height, 720)
})

test('оптимизация: пояснения описывают каждое решение', () => {
  const plan = computeOptimization(specs(16384), { modsCount: 25, currentRamMb: 4096 })
  assert.ok(plan.notes.length >= 4)
  assert.ok(plan.notes.some((note) => /Память|памят|Выделим|Оставим|Хватит/.test(note)))
  assert.ok(plan.notes.some((note) => /G1GC/.test(note)))
  assert.ok(plan.notes.some((note) => /разрешение/.test(note)))
})
