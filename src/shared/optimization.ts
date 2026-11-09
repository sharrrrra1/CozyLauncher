import type { OptimizationContext, OptimizationResult } from './types'

/**
 * Чистая логика автооптимизации «под этот ПК».
 * Никакого Electron: сюда передаём уже собранные характеристики,
 * поэтому функцию легко покрыть тестами.
 */

/** Клиентский пресет G1GC — тот же, что советуют для Minecraft. */
export const G1GC_ARGS = [
  '-XX:+UseG1GC',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:G1NewSizePercent=20',
  '-XX:G1ReservePercent=20',
  '-XX:MaxGCPauseMillis=50',
  '-XX:G1HeapRegionSize=32M'
]

export const G1GC_PRESET = G1GC_ARGS.join(' ')

export interface OptimizationSpecs {
  totalMemMb: number
  cores: number
  gpuKnown: boolean
  screenW: number
  screenH: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function even(value: number): number {
  return value - (value % 2)
}

function formatMemory(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024
    const pretty = Number.isInteger(gb) ? String(gb) : gb.toFixed(1).replace('.', ',')
    return `${pretty} ГБ`
  }
  return `${Math.round(mb)} МБ`
}

function normalizeArgs(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/**
 * Подбирает память, JVM-аргументы, разрешение и полноэкранный режим.
 *
 * Память:
 *  - ваниль — 25% ОЗУ, но не меньше 2 ГБ и не больше 8 ГБ;
 *  - сборка с 20+ модами — 40% ОЗУ, но не меньше 4 ГБ и не больше 12 ГБ;
 *  - всегда оставляем системе минимум 2 ГБ и округляем до 512 МБ.
 */
export function computeOptimization(
  specs: OptimizationSpecs,
  context: OptimizationContext = {}
): OptimizationResult {
  const totalMemMb = Math.max(0, Math.round(specs.totalMemMb || 0))
  const cores = Math.max(0, Math.round(specs.cores || 0))
  const modsCount = Math.max(0, Math.round(context.modsCount ?? 0))
  const withMods = modsCount >= 20

  const share = withMods ? 0.4 : 0.25
  const minRam = withMods ? 4096 : 2048
  const maxRam = withMods ? 12288 : 8192
  const ceiling = totalMemMb > 0 ? totalMemMb - 2048 : maxRam

  const wanted = Math.floor(totalMemMb * share)
  let ramMb = clamp(wanted, minRam, maxRam)
  // Жёсткий потолок: система должна дышать. Но ниже 2 ГБ игре не даём.
  let cappedBySystem = false
  if (ceiling >= 2048 && ramMb > ceiling) {
    ramMb = ceiling
    cappedBySystem = true
  }
  ramMb = Math.max(2048, Math.floor(ramMb / 512) * 512)

  const notes: string[] = []

  const currentRam =
    typeof context.currentRamMb === 'number' && context.currentRamMb > 0
      ? Math.round(context.currentRamMb)
      : null

  if (currentRam === null) {
    notes.push(`Выделим ${formatMemory(ramMb)} памяти — с запасом для Minecraft`)
  } else if (currentRam === ramMb) {
    notes.push(`Оставим ${formatMemory(ramMb)} памяти — как раз в самый раз`)
  } else if (ramMb > currentRam) {
    notes.push(`Выделим ${formatMemory(ramMb)} памяти — сейчас ${formatMemory(currentRam)}`)
  } else {
    notes.push(`Хватит ${formatMemory(ramMb)} памяти — сейчас ${formatMemory(currentRam)}`)
  }

  if (withMods) {
    notes.push(`В сборке ${modsCount} модов — поэтому памяти нужно больше обычного`)
  }

  if (cappedBySystem) {
    notes.push('Больше не выделяем: системе тоже нужна память, чтобы дышать')
  } else if (wanted > maxRam) {
    notes.push(
      `Больше не выделяем: ${formatMemory(maxRam)} игре хватит, а системе останется запас`
    )
  }

  const currentJvm = normalizeArgs(context.currentJvmArgs ?? '')
  const keepCustomJvm = Boolean(currentJvm) && currentJvm !== normalizeArgs(G1GC_PRESET)
  const jvmArgs = keepCustomJvm ? [] : [...G1GC_ARGS]
  const jvmArgsLine = keepCustomJvm ? (context.currentJvmArgs ?? '').trim() : G1GC_PRESET

  notes.push(
    keepCustomJvm
      ? 'Ваши JVM-аргументы не трогаем — в них уже что-то настроено вручную'
      : 'Включим плавную сборку мусора G1GC — игра будет меньше подтормаживать'
  )

  const screenW = Math.round(specs.screenW || 0)
  const screenH = Math.round(specs.screenH || 0)
  const width = screenW > 0 ? even(clamp(screenW, 640, 7680)) : 1280
  const height = screenH > 0 ? even(clamp(screenH, 480, 4320)) : 720

  notes.push(
    screenW > 0 && screenH > 0
      ? `Поставим ваше родное разрешение ${width}×${height}`
      : 'Поставим уютное разрешение 1280×720 — экран не удалось определить'
  )

  const fullscreen = cores >= 6 && Boolean(specs.gpuKnown)
  notes.push(
    fullscreen
      ? 'Включим полный экран — процессор и видеокарта это потянут'
      : 'Оставим оконный режим — так удобнее переключаться между делами'
  )

  return {
    ramMb,
    jvmArgs,
    jvmArgsLine,
    width,
    height,
    fullscreen,
    notes,
    keepCustomJvm
  }
}
