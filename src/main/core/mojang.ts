import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { VersionManifest, VersionSummary } from '@shared/types'
import type { DownloadInfo, VersionJson } from './version'
import { cacheDir, ensureDir, versionDir } from './paths'
import { getSettings } from './store'
import { mergeVersions, MAX_INHERIT_DEPTH } from './version-resolve'

const USER_AGENT = 'CozyLauncher/1.0.0'
const MANIFEST_URLS = [
  'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
  'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
]
const RUNTIME_INDEX_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
const MANIFEST_TTL = 10 * 60 * 1000
const RUNTIME_TTL = 24 * 60 * 60 * 1000

interface RuntimeIndexEntry {
  manifest: { url: string; sha1?: string; size?: number }
  version?: { name?: string; released?: string }
}

export interface RuntimeFile {
  type: 'file' | 'directory' | 'link'
  executable?: boolean
  target?: string
  downloads?: {
    raw?: DownloadInfo
    lzma?: DownloadInfo
  }
}

export interface RuntimeManifest {
  files: Record<string, RuntimeFile>
}

let manifestMemory: { at: number; data: VersionManifest } | null = null

async function fetchJson<T>(url: string, timeoutMs = 45000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`)
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function readCached<T>(file: string): { at: number; data: T } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { at: number; data: T }
    if (parsed && parsed.data) return parsed
  } catch {
    // ignore broken cache
  }
  return null
}

function writeCached(file: string, data: unknown): void {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), data }), 'utf8')
}

export async function getVersionManifest(force = false): Promise<VersionManifest> {
  const file = path.join(cacheDir(), 'version_manifest_v2.json')
  const cached = readCached<VersionManifest>(file)
  if (!force && manifestMemory && Date.now() - manifestMemory.at < MANIFEST_TTL) {
    return manifestMemory.data
  }
  if (!force && cached && Date.now() - cached.at < MANIFEST_TTL) {
    manifestMemory = cached
    return cached.data
  }
  for (const url of MANIFEST_URLS) {
    try {
      const data = await fetchJson<VersionManifest>(url)
      if (!data?.versions?.length) continue
      writeCached(file, data)
      manifestMemory = { at: Date.now(), data }
      return data
    } catch {
      // try next mirror
    }
  }
  if (cached) {
    manifestMemory = cached
    return cached.data
  }
  throw new Error('Не удалось получить список версий Minecraft. Проверьте интернет.')
}

export async function getVersionSummary(id: string): Promise<VersionSummary> {
  const manifest = await getVersionManifest()
  const summary = manifest.versions.find((version) => version.id === id)
  if (!summary) throw new Error(`Версия ${id} не найдена в манифесте Mojang`)
  return summary
}

export async function getVersionJson(id: string): Promise<VersionJson> {
  return resolveVersion(id, new Set(), 0)
}

function readLocalVersion(id: string): VersionJson | null {
  try {
    const file = path.join(versionDir(getSettings().gameDir, id), `${id}.json`)
    if (!fs.existsSync(file)) return null
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as VersionJson
    return parsed?.libraries ? parsed : null
  } catch {
    return null
  }
}

async function resolveVersion(
  id: string,
  seen: Set<string>,
  depth: number
): Promise<VersionJson> {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Некорректный идентификатор версии')
  if (seen.has(id) || depth > MAX_INHERIT_DEPTH) {
    throw new Error(`Цикл или слишком глубокая цепочка inheritsFrom у версии ${id}`)
  }
  seen.add(id)

  const local = readLocalVersion(id)
  if (local) {
    if (local.inheritsFrom) {
      const parent = await resolveVersion(local.inheritsFrom, seen, depth + 1)
      return mergeVersions(parent, local)
    }
    return local
  }

  return fetchRemoteVersion(id)
}

async function fetchRemoteVersion(id: string): Promise<VersionJson> {
  const file = path.join(cacheDir(), 'versions', `${id}.json`)
  const cached = readCached<VersionJson>(file)
  if (cached?.data?.libraries) return cached.data
  const summary = await getVersionSummary(id)
  try {
    const data = await fetchJson<VersionJson>(summary.url)
    writeCached(file, data)
    return data
  } catch (error) {
    if (cached?.data?.libraries) return cached.data
    throw error
  }
}

export function runtimePlatformKey(): string {
  if (process.platform === 'win32') {
    return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64'
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  }
  return 'linux'
}

async function getRuntimeIndex(): Promise<Record<string, Record<string, RuntimeIndexEntry[]>>> {
  const file = path.join(cacheDir(), 'java', 'all.json')
  const cached = readCached<Record<string, Record<string, RuntimeIndexEntry[]>>>(file)
  if (cached && Date.now() - cached.at < RUNTIME_TTL) return cached.data
  try {
    const data = await fetchJson<Record<string, Record<string, RuntimeIndexEntry[]>>>(
      RUNTIME_INDEX_URL
    )
    writeCached(file, data)
    return data
  } catch (error) {
    if (cached) return cached.data
    throw error
  }
}

export async function getRuntimeManifest(component: string): Promise<RuntimeManifest> {
  const platform = runtimePlatformKey()
  const file = path.join(cacheDir(), 'java', `${component}-${platform}.json`)
  const cached = readCached<RuntimeManifest>(file)
  if (cached?.data?.files) return cached.data
  const index = await getRuntimeIndex()
  const entry = index[platform]?.[component]?.[0]
  if (!entry) throw new Error(`Рантайм ${component} недоступен для ${platform}`)
  const data = await fetchJson<RuntimeManifest>(entry.manifest.url)
  writeCached(file, data)
  return data
}

export async function runtimeDownloadFile(component: string): Promise<string> {
  if (!/^[A-Za-z0-9._-]+$/.test(component)) throw new Error('Некорректный рантайм Java')
  return path.join(cacheDir(), 'java', `${component}.manifest.json`)
}

export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}
