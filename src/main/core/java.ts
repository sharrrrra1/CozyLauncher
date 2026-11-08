import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { InstallProgress, JavaInfo } from '@shared/types'
import { downloadAll, type DownloadTask } from './downloader'
import { readJavaCache, writeJavaCache, type JavaCacheFile } from './javaCache'
import { getRuntimeManifest, runtimePlatformKey } from './mojang'
import { cacheDir, ensureDir, runtimesDir } from './paths'
import { getSettings } from './store'
import type { VersionJson } from './version'

const IS_WINDOWS = process.platform === 'win32'
const JAVA_BIN = IS_WINDOWS ? 'java.exe' : 'java'
const JAVA_CACHE_TTL = 24 * 60 * 60 * 1000

export interface JavaProgress {
  label: string
  done: number
  total: number
  bytes: number
  totalBytes: number
  speed: number
}

function javaPathIn(home: string): string {
  return path.join(home, 'bin', JAVA_BIN)
}

function probeJava(file: string): JavaInfo | null {
  try {
    if (!fs.existsSync(file)) return null
    const result = spawnSync(file, ['-version'], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    })
    const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
    const versionMatch = output.match(/version "([^"]+)"/)
    if (!versionMatch) return null
    const version = versionMatch[1]
    const rawMajor = version.split('.')[0]
    const major = rawMajor === '1' ? Number(version.split('.')[1]) : Number(rawMajor)
    if (!Number.isFinite(major) || major <= 0) return null
    return { path: file, major, version, source: 'system' }
  } catch {
    return null
  }
}

function directoryEntries(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name))
  } catch {
    return []
  }
}

function runtimeCandidates(root: string, platform: string): string[] {
  const found: string[] = []
  for (const componentDir of directoryEntries(root)) {
    const component = path.basename(componentDir)
    found.push(javaPathIn(path.join(componentDir, platform, component)))
    found.push(javaPathIn(path.join(componentDir, platform)))
  }
  return found
}

function systemCandidates(): string[] {
  const candidates: string[] = []
  if (process.env.JAVA_HOME) candidates.push(javaPathIn(process.env.JAVA_HOME))
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    if (entry) candidates.push(path.join(entry, JAVA_BIN))
  }
  if (IS_WINDOWS) {
    const programFiles = [
      process.env.ProgramFiles ?? 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      process.env.ProgramW6432 ?? 'C:\\Program Files'
    ]
    const vendors = [
      'Eclipse Adoptium',
      'Java',
      'Microsoft',
      'Amazon Corretto',
      'BellSoft',
      'Zulu',
      'Semeru',
      'JetBrains'
    ]
    for (const base of programFiles) {
      for (const vendor of vendors) {
        for (const versionDir of directoryEntries(path.join(base, vendor))) {
          candidates.push(javaPathIn(versionDir))
        }
      }
    }
    candidates.push(path.join('C:\\Program Files\\Common Files\\Oracle\\Java\\javapath', JAVA_BIN))
  }
  return candidates
}

function uniqueCandidates(paths: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const candidate of paths) {
    if (!candidate) continue
    const key = path.resolve(candidate).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result
}

export function detectJava(): JavaInfo[] {
  const platform = runtimePlatformKey()
  const roots = [runtimesDir(), path.join(app.getPath('appData'), '.minecraft', 'runtime')]
  const candidates = uniqueCandidates([
    ...systemCandidates(),
    ...roots.flatMap((root) => runtimeCandidates(root, platform))
  ])

  const cacheFile = path.join(cacheDir(), 'java-probe.json')
  const cache = readJavaCache(cacheFile, JAVA_CACHE_TTL)
  const updated: JavaCacheFile = {}
  const result: JavaInfo[] = []
  for (const candidate of candidates) {
    const key = path.resolve(candidate).toLowerCase()
    const hit = cache[key]
    if (hit && fs.existsSync(hit.path)) {
      updated[key] = hit
      result.push({ path: hit.path, major: hit.major, version: hit.version, source: 'system' })
      continue
    }
    const parsed = probeJava(candidate)
    if (parsed) {
      updated[key] = { path: parsed.path, major: parsed.major, version: parsed.version, at: Date.now() }
      result.push(parsed)
    }
  }
  try {
    writeJavaCache(cacheFile, updated)
  } catch {
    // cache write is best-effort
  }
  return result.sort((a, b) => b.major - a.major)
}

function scoreJava(java: JavaInfo, required: number): number {
  if (java.major === required) return 0
  if (java.major > required) return 100 + (java.major - required)
  return 10000 + (required - java.major)
}

async function installRuntime(
  component: string,
  onProgress?: (progress: JavaProgress) => void
): Promise<JavaInfo> {
  const platform = runtimePlatformKey()
  const manifest = await getRuntimeManifest(component)
  const root = path.join(runtimesDir(), component, platform, component)
  ensureDir(root)

  const tasks: DownloadTask[] = []
  for (const [relative, file] of Object.entries(manifest.files)) {
    const dest = path.join(root, ...relative.split('/'))
    if (file.type === 'directory') {
      ensureDir(dest)
      continue
    }
    if (file.type === 'link' || !file.downloads?.raw?.url) continue
    tasks.push({
      url: file.downloads.raw.url,
      dest,
      sha1: file.downloads.raw.sha1,
      size: file.downloads.raw.size,
      label: path.basename(relative)
    })
  }

  onProgress?.({
    label: `Загрузка Java ${component}`,
    done: 0,
    total: tasks.length,
    bytes: 0,
    totalBytes: tasks.reduce((sum, task) => sum + (task.size ?? 0), 0),
    speed: 0
  })

  await downloadAll(tasks, {
    concurrency: 16,
    onProgress: (progress) =>
      onProgress?.({
        label: `Загрузка Java ${component}`,
        done: progress.done,
        total: progress.total,
        bytes: progress.bytes,
        totalBytes: progress.totalBytes,
        speed: progress.speed
      })
  })

  const javaFile = javaPathIn(root)
  const parsed = probeJava(javaFile)
  if (!parsed) throw new Error('Не удалось запустить скачанный рантайм Java')
  return { ...parsed, source: 'mojang' }
}

export function mapJavaProgressToInstall(
  versionId: string,
  progress: JavaProgress
): InstallProgress {
  return {
    versionId,
    phase: 'java',
    label: progress.label,
    done: progress.done,
    total: progress.total,
    bytes: progress.bytes,
    totalBytes: progress.totalBytes,
    speed: progress.speed
  }
}

export async function ensureJava(
  version: VersionJson,
  onProgress?: (progress: JavaProgress) => void,
  override?: { javaPath?: string }
): Promise<JavaInfo> {
  const required = version.javaVersion?.majorVersion ?? 8
  const component = version.javaVersion?.component ?? 'jre-legacy'
  const settings = getSettings()
  const customPath = override?.javaPath?.trim() || (settings.javaMode === 'custom' ? settings.javaPath : '')

  if (customPath) {
    const custom = probeJava(customPath)
    if (!custom) throw new Error('Указанная Java не найдена или не запускается')
    if (custom.major < required) {
      throw new Error(
        `Версии ${version.id} нужна Java ${required}+, а выбрана Java ${custom.major}. Исправьте путь в настройках.`
      )
    }
    return { ...custom, source: 'custom' }
  }

  const available = detectJava()
  const suitable = available
    .filter((java) => java.major >= required)
    .sort((a, b) => scoreJava(a, required) - scoreJava(b, required))
  if (suitable.length) return { ...suitable[0], source: 'system' }

  const installed = await installRuntime(component, onProgress)
  if (installed.major < required) {
    throw new Error(`Рантайм ${component} оказался Java ${installed.major}, нужна Java ${required}`)
  }
  return installed
}
