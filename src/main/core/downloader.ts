import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici'
import { ensureDir } from './paths'
import { mirrorCandidates, type DownloadMirror } from './mirror'
import { getSettings } from './store'

export interface DownloadTask {
  url: string
  dest: string
  sha1?: string
  sha512?: string
  size?: number
  label?: string
}

export interface DownloadProgress {
  done: number
  total: number
  bytes: number
  totalBytes: number
  speed: number
  current?: string
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
  concurrency?: number
  mirror?: DownloadMirror
}

const USER_AGENT = 'CozyLauncher/1.2.0 (Minecraft launcher)'
const PROGRESS_INTERVAL = 120

let configuredProxy = ''

/** Applies the proxy from settings to every Node fetch in the main process. */
export function configureNetwork(proxyUrl?: string): void {
  const normalized = (proxyUrl ?? '').trim()
  if (normalized === configuredProxy) return
  configuredProxy = normalized
  try {
    if (normalized) {
      setGlobalDispatcher(new ProxyAgent(normalized))
    } else {
      setGlobalDispatcher(new Agent())
    }
  } catch {
    // Invalid proxy URL: keep the default dispatcher rather than breaking networking.
  }
}

/** Reads mirror/proxy settings before a download batch. */
export function networkFromSettings(): { mirror: DownloadMirror } {
  const settings = getSettings()
  configureNetwork(settings.proxyUrl)
  return { mirror: settings.downloadMirror === 'bmclapi' ? 'bmclapi' : 'official' }
}

function abortError(): Error {
  const error = new Error('Загрузка отменена')
  error.name = 'AbortError'
  return error
}

async function sha1File(file: string): Promise<string> {
  const hash = createHash('sha1')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

async function sha512File(file: string): Promise<string> {
  const hash = createHash('sha512')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

async function fileSize(file: string): Promise<number> {
  try {
    const stat = await fsp.stat(file)
    return stat.isFile() ? stat.size : -1
  } catch {
    return -1
  }
}

async function verifyHash(file: string, task: DownloadTask): Promise<boolean> {
  if (task.sha1) {
    const actual = await sha1File(file)
    if (actual.toLowerCase() !== task.sha1.toLowerCase()) return false
  }
  if (task.sha512) {
    const actual = await sha512File(file)
    if (actual.toLowerCase() !== task.sha512.toLowerCase()) return false
  }
  return true
}

async function fetchWithResume(
  url: string,
  temp: string,
  expectSize: number | undefined,
  signal: AbortSignal | undefined,
  allowResume: boolean
): Promise<void> {
  const existing = allowResume ? await fileSize(temp) : -1
  const resumeAt = existing > 0 && (!expectSize || existing < expectSize) ? existing : 0
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
  if (resumeAt > 0) headers.Range = `bytes=${resumeAt}-`

  const response = await fetch(url, { headers, signal })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} для ${url}`)
  }

  // A server may ignore Range and answer with 200; then the file must restart.
  const append = resumeAt > 0 && response.status === 206
  await fsp.mkdir(path.dirname(temp), { recursive: true })
  await pipeline(
    Readable.fromWeb(response.body as never),
    fs.createWriteStream(temp, { flags: append ? 'a' : 'w' })
  )
}

async function downloadOne(
  task: DownloadTask,
  signal?: AbortSignal,
  mirror: DownloadMirror = 'official'
): Promise<void> {
  const temp = `${task.dest}.cozy-part`
  await fsp.mkdir(path.dirname(task.dest), { recursive: true })
  const candidates = mirrorCandidates(task.url, mirror)
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (signal?.aborted) throw abortError()
    const url = candidates[Math.min(candidates.length - 1, Math.floor((attempt - 1) / 2))]
    try {
      // First attempt may resume a partial file left by a previous run.
      await fetchWithResume(url, temp, task.size, signal, attempt === 1)
      if (!(await verifyHash(temp, task))) {
        await fsp.rm(temp, { force: true }).catch(() => undefined)
        throw new Error(`Хеш не совпал для ${task.dest}`)
      }
      await fsp.rename(temp, task.dest).catch(async () => {
        await fsp.rm(task.dest, { force: true })
        await fsp.rename(temp, task.dest)
      })
      return
    } catch (error) {
      lastError = error
      // A corrupted partial file must never be resumed again.
      await fsp.rm(temp, { force: true }).catch(() => undefined)
      if (signal?.aborted) throw abortError()
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось скачать файл')
}

export async function downloadAll(
  tasks: DownloadTask[],
  options: DownloadOptions = {}
): Promise<void> {
  const unique = new Map<string, DownloadTask>()
  for (const task of tasks) {
    if (task.url && task.dest) unique.set(task.dest, task)
  }
  const list = [...unique.values()]
  const total = list.length
  const totalBytes = list.reduce((sum, task) => sum + (task.size ?? 0), 0)
  const mirror = options.mirror ?? networkFromSettings().mirror
  let done = 0
  let bytes = 0
  let speed = 0
  let lastBytes = 0
  let lastTime = Date.now()
  let lastEmit = 0
  let current: string | undefined

  const emit = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmit < PROGRESS_INTERVAL) return
    lastEmit = now
    const elapsed = (now - lastTime) / 1000
    if (elapsed >= 0.4) {
      speed = Math.max(0, (bytes - lastBytes) / elapsed)
      lastBytes = bytes
      lastTime = now
    }
    options.onProgress?.({ done, total, bytes, totalBytes, speed, current })
  }

  const pending: DownloadTask[] = []
  for (const task of list) {
    const size = await fileSize(task.dest)
    const matches = size >= 0 && (task.size ? size === task.size : true)
    if (matches) {
      done += 1
      bytes += task.size ?? Math.max(0, size)
    } else {
      pending.push(task)
    }
  }
  emit(true)

  const concurrency = Math.max(1, Math.min(32, options.concurrency ?? 8))
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      if (options.signal?.aborted) throw abortError()
      const task = pending[cursor]
      cursor += 1
      current = task.label ?? path.basename(task.dest)
      await downloadOne(task, options.signal, mirror)
      done += 1
      bytes += task.size ?? (await fileSize(task.dest))
      emit()
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, () => worker())
  )
  emit(true)
}
