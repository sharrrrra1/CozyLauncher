import fs from 'node:fs'
import path from 'node:path'

export type CrashRecommendation =
  | 'more-memory'
  | 'safe-mode'
  | 'disable-last-mod'
  | 'fix-java'
  | 'update-drivers'
  | 'check-mod-dependency'
  | 'none'

export interface CrashAnalysisInput {
  exitCode: number | null
  reportText?: string
  logText?: string
  memoryMb: number
  modFiles?: string[]
}

export interface CrashAnalysis {
  title: string
  summary: string
  details: string[]
  hints: string[]
  recommendation: CrashRecommendation
  /** Mod names/files mentioned by the report, if any. */
  suspects: string[]
  /** Short technical signature, e.g. OutOfMemoryError. */
  signature?: string
}

const ACCESS_VIOLATION = /EXCEPTION_ACCESS_VIOLATION|EXCEPTION_STACK_OVERFLOW/i
const OUT_OF_MEMORY = /OutOfMemoryError|Java heap space|GC overhead limit exceeded|insufficient memory/i
const MISSING_DEP = /Missing or unsupported mandatory dependencies|mod resolution failed|requires .+ of|Incompatible mods found|which is missing/i
const MIXIN = /Mixin apply failed|MixinTransformerError|InvalidMixinException|mixin application failed/i
const JAVA = /UnsupportedClassVersionError|class file version|requires Java \d+|requires at least Java/i
const GRAPHICS = /OpenGL|GLFW|WGL|Pixel format not accelerated|Failed to create window|GLX/i
const DUPLICATE = /Duplicate mods|duplicate mod|A mod with the id .+ is already|duplicate entry/i
const CONFIG = /Could not parse|JsonParseException|MalformedJsonException|invalid config/i

const NOISE = /^\s*at\s|^\s*\.\.\. \d+ more|^\s*$/

function tailLines(text: string, count: number): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  return lines.slice(Math.max(0, lines.length - count)).join('\n')
}

function meaningfulLine(text: string): string {
  const lines = text.split(/\r?\n/)
  const caused = lines.find((line) => /^\s*Caused by:/i.test(line))
  if (caused) return caused.trim()
  const exception = lines.find(
    (line) => /\b(Exception|Error)\b/.test(line) && !NOISE.test(line) && !line.includes('at ')
  )
  return exception?.trim() ?? ''
}

function extractSuspects(text: string, modFiles: string[]): string[] {
  const found = new Set<string>()
  // Fabric/Forge usually print the offending mod id near "mixin" or dependency errors.
  const patterns = [
    /(?:from mod|modid|mod id|mod)\s+["'`]?([a-z0-9_.-]{3,})["'`]?/gi,
    /mixin[s]?\.[a-z0-9_.-]*\.json/gi
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] ?? match[0]).toLowerCase()
      if (!value || ['mod', 'minecraft', 'fabric', 'loader', 'requires'].includes(value)) continue
      if (value.length > 48) continue
      found.add(value)
    }
  }
  for (const file of modFiles) {
    const base = path.basename(file).toLowerCase()
    const stem = base.replace(/-(fabric|forge|neoforge)?[-+]?.*$/, '')
    if (stem.length >= 3 && text.toLowerCase().includes(stem)) found.add(path.basename(file))
  }
  return [...found].slice(0, 6)
}

/**
 * Pure, testable crash report analysis. Never throws: an unknown crash still
 * gets a readable card instead of a raw stack trace.
 */
export function analyzeCrash(input: CrashAnalysisInput): CrashAnalysis {
  const report = input.reportText ?? ''
  const log = tailLines(input.logText ?? '', 450)
  const text = `${report}\n${log}`
  const mods = (input.modFiles ?? []).map((file) => path.basename(file))
  const suspects = extractSuspects(text, mods)
  const description = report.match(/Description:\s*(.+)/i)?.[1]?.trim()
  const baseDetails = [description, meaningfulLine(report || log)].filter(Boolean) as string[]

  if (OUT_OF_MEMORY.test(text)) {
    return {
      title: 'Игре не хватило памяти',
      summary: `Minecraft закрылся, потому что Java исчерпала выделенные ${input.memoryMb} МБ.`,
      details: baseDetails.length ? baseDetails : ['java.lang.OutOfMemoryError: Java heap space'],
      hints: [
        'Увеличьте память на 2 ГБ и попробуйте снова.',
        'Закройте браузер и другие тяжёлые программы перед запуском.',
        'Тяжёлые модпаки требуют 6–8 ГБ, но не больше половины ОЗУ компьютера.'
      ],
      recommendation: 'more-memory',
      suspects,
      signature: 'OutOfMemoryError'
    }
  }

  if (MISSING_DEP.test(text)) {
    const requirement = text.match(/requires (.+?) of (.+?)(?:\n|$)/i)
    return {
      title: 'Не хватает зависимости мода',
      summary: requirement
        ? `Мод ${requirement[2]} требует ${requirement[1]}.`
        : 'Fabric нашёл мод без обязательной библиотеки или несовместимую пару модов.',
      details: baseDetails.length ? baseDetails : ['Fabric Loader: mod resolution failed'],
      hints: [
        'Откройте «Моды» и установите недостающую зависимость.',
        'Можно запустить игру без модов и проверить, что дело именно в них.',
        'Проверьте, что все моды собраны под одну версию Minecraft и Fabric.'
      ],
      recommendation: 'check-mod-dependency',
      suspects,
      signature: 'MissingDependency'
    }
  }

  if (MIXIN.test(text)) {
    return {
      title: 'Конфликт модов (Mixin)',
      summary:
        suspects.length > 0
          ? `Похоже, конфликтуют моды: ${suspects.join(', ')}.`
          : 'Два или несколько модов попытались изменить один и тот же класс игры.',
      details: baseDetails.length ? baseDetails : ['Mixin apply failed'],
      hints: [
        'Отключите последний установленный мод и запустите снова.',
        'Проверьте, что моды совместимы с вашей версией Minecraft и Fabric.',
        'Безопасный режим поможет подтвердить, что проблема в модах.'
      ],
      recommendation: 'disable-last-mod',
      suspects,
      signature: 'MixinConflict'
    }
  }

  if (JAVA.test(text)) {
    const version = text.match(/requires (?:at least )?Java (\d+)/i)?.[1]
    return {
      title: 'Неподходящая версия Java',
      summary: version
        ? `Этой версии Minecraft нужна Java ${version} или новее.`
        : 'Игра запустилась на несовместимой версии Java.',
      details: baseDetails.length ? baseDetails : ['UnsupportedClassVersionError'],
      hints: [
        'Верните выбор Java в режим «Авто» в настройках.',
        'Если выбрана своя Java, укажите Java 17/21/25 в зависимости от версии игры.'
      ],
      recommendation: 'fix-java',
      suspects,
      signature: 'WrongJava'
    }
  }

  if (DUPLICATE.test(text)) {
    return {
      title: 'Дубликаты модов',
      summary: 'В папке mods лежат два файла одного и того же мода.',
      details: baseDetails.length ? baseDetails : ['Duplicate mods detected'],
      hints: [
        'Откройте папку модов и удалите старую версию дубликата.',
        'Проверка перед запуском в лаунчере покажет нехватку зависимостей, но не дубликаты.'
      ],
      recommendation: 'disable-last-mod',
      suspects,
      signature: 'DuplicateMods'
    }
  }

  if (GRAPHICS.test(text) && (ACCESS_VIOLATION.test(text) || /Failed to create window|Pixel format not accelerated/i.test(text))) {
    return {
      title: 'Проблема с графикой',
      summary: 'Игра не смогла создать окно или инициализировать OpenGL.',
      details: baseDetails.length ? baseDetails : ['OpenGL/GLFW initialization failed'],
      hints: [
        'Обновите драйверы видеокарты.',
        'Уберите шейдеры и моды на графику, затем попробуйте снова.',
        'На ноутбуках запускайте игру на дискретной видеокарте.'
      ],
      recommendation: 'update-drivers',
      suspects,
      signature: 'Graphics'
    }
  }

  if (CONFIG.test(text) && suspects.length > 0) {
    return {
      title: 'Повреждён конфиг мода',
      summary: `Не удалось прочитать настройки: ${suspects.join(', ')}.`,
      details: baseDetails.length ? baseDetails : ['Malformed JSON in mod config'],
      hints: ['Удалите папку config проблемного мода — она создастся заново.'],
      recommendation: 'disable-last-mod',
      suspects,
      signature: 'Config'
    }
  }

  const code = input.exitCode === null ? 'неизвестен' : String(input.exitCode)
  return {
    title: 'Minecraft завершился с ошибкой',
    summary: description ?? `Игра закрылась с кодом ${code}.`,
    details: baseDetails.length ? baseDetails : [`Код выхода: ${code}`],
    hints: [
      'Откройте отчёт или консоль и найдите строку Caused by.',
      'Попробуйте безопасный режим без модов.',
      'Если краш повторяется, загрузите отчёт на mclo.gs и покажите разработчику.'
    ],
    recommendation: 'safe-mode',
    suspects,
    signature: ACCESS_VIOLATION.test(text) ? 'NativeCrash' : undefined
  }
}

export function findLatestCrashReport(workDir: string): string | null {
  const dir = path.join(workDir, 'crash-reports')
  try {
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.txt'))
      .map((file) => path.join(dir, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    return files[0] ?? null
  } catch {
    return null
  }
}

export function readTextCapped(file: string | null, maxBytes = 512 * 1024): string {
  if (!file) return ''
  try {
    const stat = fs.statSync(file)
    if (stat.size <= maxBytes) return fs.readFileSync(file, 'utf8')
    const fd = fs.openSync(file, 'r')
    try {
      const buffer = Buffer.alloc(maxBytes)
      fs.readSync(fd, buffer, 0, maxBytes, Math.max(0, stat.size - maxBytes))
      return buffer.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}
