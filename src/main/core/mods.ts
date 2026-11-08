import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { InstallProgress, InstalledMod, ModInstallPlan, ModUpdate, ModVersion } from '@shared/types'
import { downloadAll } from './downloader'
import { resolveDependencies, type DepProject, type DepVersion } from './deps'
import { ensureFabricVersion, fabricVersionId, fetchFabricMeta } from './fabric'
import { cacheDir, ensureDir, launcherDataDir, versionDir } from './paths'
import { getInstance } from './instances'
import { getSettings } from './store'
import type { VersionJson } from './version'

const MODRINTH_API = 'https://api.modrinth.com/v2'
const MODRINTH_HOST = 'api.modrinth.com'
const CDN_HOST = 'cdn.modrinth.com'
const USER_AGENT = 'CozyLauncher/1.1.0 (+https://github.com/sharrrrra1/CozyLauncher)'
const CACHE_TTL = 10 * 60 * 1000
const FETCH_TIMEOUT = 15000

interface ModrinthFile {
  url: string
  filename: string
  size: number
  hashes: { sha1?: string; sha512?: string }
}

interface ModrinthVersionResponse {
  id: string
  project_id: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: ModrinthFile[]
  dependencies?: Array<{
    project_id: string
    version_id: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }>
}

interface IndexEntry {
  projectId: string
  title: string
  versionId: string
  versionNumber: string
  filename: string
  sha1?: string
  sha512?: string
  size: number
  requiredProjectIds: string[]
}

interface IndexFile {
  versions: Record<string, IndexEntry[]>
}

let modLog: ((msg: string) => void) | null = null

export function setModLog(logger: (msg: string) => void): void {
  modLog = logger
}

function log(message: string): void {
  modLog?.(message)
}

/* ------------------------------------------------------------------ */
/*  HTTP + cache                                                      */
/* ------------------------------------------------------------------ */

const memoryCache = new Map<string, { at: number; data: unknown }>()

function cacheFileFor(url: string): string {
  const safe = Buffer.from(url).toString('base64url').slice(0, 120)
  return path.join(cacheDir(), 'mods', `${safe}.json`)
}

function readDiskCache<T>(url: string): { at: number; data: T } | null {
  try {
    return JSON.parse(fs.readFileSync(cacheFileFor(url), 'utf8')) as { at: number; data: T }
  } catch {
    return null
  }
}

function writeDiskCache(url: string, data: unknown): void {
  try {
    const file = cacheFileFor(url)
    ensureDir(path.dirname(file))
    fs.writeFileSync(file, JSON.stringify({ at: Date.now(), data }), 'utf8')
  } catch {
    // cache is best-effort
  }
}

function assertModrinthUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('Разрешены только https-запросы')
  if (url.hostname !== MODRINTH_HOST) throw new Error('Недопустимый домен Modrinth API')
  return url
}

async function fetchJson<T>(urlString: string, force = false): Promise<T> {
  const url = assertModrinthUrl(urlString)
  const key = url.toString()
  const memory = memoryCache.get(key)
  if (!force && memory && Date.now() - memory.at < CACHE_TTL) return memory.data as T
  const disk = readDiskCache<T>(key)
  if (!force && disk && Date.now() - disk.at < CACHE_TTL) {
    memoryCache.set(key, disk)
    return disk.data
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    try {
      log(`GET ${url.pathname}${url.search}`)
      const response = await fetch(key, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal
      })
      if (!response.ok) throw new Error(`Modrinth API error: HTTP ${response.status}`)
      const data = (await response.json()) as T
      const entry = { at: Date.now(), data }
      memoryCache.set(key, entry)
      writeDiskCache(key, data)
      return data
    } catch (error) {
      lastError = error
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400))
    } finally {
      clearTimeout(timer)
    }
  }

  if (disk) return disk.data
  throw lastError instanceof Error ? lastError : new Error('Modrinth недоступен')
}

function buildVersionUrl(projectId: string, gameVersion?: string): string {
  const url = new URL(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version`)
  if (gameVersion) {
    url.searchParams.set('game_versions', JSON.stringify([gameVersion]))
    url.searchParams.set('loaders', JSON.stringify(['fabric']))
  }
  return url.toString()
}

/* ------------------------------------------------------------------ */
/*  Icons                                                             */
/* ------------------------------------------------------------------ */

const iconMemory = new Map<string, string>()

async function iconToDataUri(iconUrl: string | undefined): Promise<string | undefined> {
  if (!iconUrl) return undefined
  if (iconMemory.has(iconUrl)) return iconMemory.get(iconUrl)
  try {
    const url = new URL(iconUrl)
    if (url.protocol !== 'https:' || url.hostname !== CDN_HOST) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    }).finally(() => clearTimeout(timer))
    if (!response.ok) return undefined
    const type = response.headers.get('content-type') ?? 'image/png'
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > 512 * 1024) return undefined
    const uri = `data:${type};base64,${buffer.toString('base64')}`
    iconMemory.set(iconUrl, uri)
    return uri
  } catch {
    return undefined
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const result: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      result[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return result
}

/* ------------------------------------------------------------------ */
/*  Catalog                                                           */
/* ------------------------------------------------------------------ */

export async function searchMods(query: string, gameVersion?: string): Promise<any[]> {
  const url = new URL(`${MODRINTH_API}/search`)
  url.searchParams.set('query', query)
  url.searchParams.set('limit', '20')
  const facets: string[] = [JSON.stringify(['project_type:mod']), JSON.stringify(['categories:fabric'])]
  if (gameVersion) facets.push(JSON.stringify([`versions:${gameVersion}`]))
  url.searchParams.set('facets', `[${facets.join(',')}]`)

  const result = await fetchJson<{ hits: any[] }>(url.toString())
  const hits = Array.isArray(result.hits) ? result.hits.slice(0, 20) : []
  const icons = await mapLimit(hits, 6, (hit) => iconToDataUri(hit.icon_url))
  return hits.map((hit, index) => ({
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    iconUrl: icons[index],
    downloads: hit.downloads,
    source: 'modrinth'
  }))
}

function mapModVersion(version: ModrinthVersionResponse): ModVersion {
  const file = version.files?.[0]
  return {
    versionId: version.id,
    versionNumber: version.version_number,
    gameVersions: version.game_versions ?? [],
    loaders: version.loaders ?? [],
    filename: file?.filename ?? '',
    url: file?.url ?? '',
    size: file?.size ?? 0,
    sha1: file?.hashes?.sha1,
    source: 'modrinth'
  }
}

export async function modVersions(projectId: string, gameVersion?: string): Promise<ModVersion[]> {
  const versions = await fetchJson<ModrinthVersionResponse[]>(buildVersionUrl(projectId, gameVersion))
  return (Array.isArray(versions) ? versions : []).map(mapModVersion)
}

async function getProjectTitle(projectId: string): Promise<string> {
  try {
    const project = await fetchJson<{ title?: string }>(
      `${MODRINTH_API}/project/${encodeURIComponent(projectId)}`
    )
    return project.title ?? projectId
  } catch {
    return projectId
  }
}

async function getVersionById(versionId: string): Promise<ModrinthVersionResponse> {
  return fetchJson<ModrinthVersionResponse>(`${MODRINTH_API}/version/${encodeURIComponent(versionId)}`)
}

function toDepVersion(version: ModrinthVersionResponse): DepVersion {
  const file = version.files?.[0]
  if (!file?.url || !file.filename) throw new Error('У версии мода нет файла для скачивания')
  return {
    id: version.id,
    projectId: version.project_id,
    versionNumber: version.version_number,
    filename: file.filename,
    url: file.url,
    size: file.size,
    sha1: file.hashes?.sha1,
    sha512: file.hashes?.sha512,
    dependencies: (version.dependencies ?? []).map((dependency) => ({
      projectId: dependency.project_id,
      versionId: dependency.version_id,
      type: dependency.dependency_type
    }))
  }
}

async function loadDepProject(projectId: string, gameVersion: string): Promise<DepProject | null> {
  const [title, versions] = await Promise.all([
    getProjectTitle(projectId),
    fetchJson<ModrinthVersionResponse[]>(buildVersionUrl(projectId, gameVersion))
  ])
  if (!Array.isArray(versions) || versions.length === 0) return null
  return { title, versions: versions.map(toDepVersion) }
}

export async function previewModInstall(
  projectId: string,
  versionId: string,
  gameVersion: string,
  optionalProjectIds: string[] = []
): Promise<ModInstallPlan> {
  if (!gameVersion) throw new Error('Не выбрана версия Minecraft')
  const [version, title] = await Promise.all([getVersionById(versionId), getProjectTitle(projectId)])
  const root = toDepVersion(version)
  const result = await resolveDependencies({
    root,
    rootTitle: title,
    includeOptional: optionalProjectIds,
    loadProject: (dependencyProjectId) => loadDepProject(dependencyProjectId, gameVersion)
  })

  return {
    files: result.files.map((file) => ({
      projectId: file.projectId,
      title: file.title,
      versionNumber: file.versionNumber,
      versionId: file.id,
      filename: file.filename,
      url: file.url,
      size: file.size,
      sha1: file.sha1,
      sha512: file.sha512,
      reason: file.reason
    })),
    totalSize: result.files.reduce((sum, file) => sum + file.size, 0),
    optional: result.optional,
    blocked: result.blocked
  }
}

/* ------------------------------------------------------------------ */
/*  Local versions and index                                          */
/* ------------------------------------------------------------------ */

function indexFile(): string {
  return path.join(launcherDataDir(), 'mods-index.json')
}

function readIndex(): IndexFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFile(), 'utf8')) as IndexFile
    return parsed?.versions ? parsed : { versions: {} }
  } catch {
    return { versions: {} }
  }
}

function writeIndex(index: IndexFile): void {
  ensureDir(path.dirname(indexFile()))
  const temp = `${indexFile()}.tmp`
  fs.writeFileSync(temp, JSON.stringify(index, null, 2), 'utf8')
  fs.renameSync(temp, indexFile())
}

function runDir(gameDir: string, moddedId: string): string {
  return path.join(versionDir(gameDir, moddedId), 'run')
}

function modsDir(gameDir: string, moddedId: string): string {
  return ensureDir(path.join(runDir(gameDir, moddedId), 'mods'))
}

interface ModTarget {
  dir: string
  indexKey: string
  moddedId: string | null
}

/** Shared Fabric profile (no instance) or an isolated instance mods folder. */
function resolveTarget(gameVersionId: string, instanceId?: string): ModTarget {
  if (instanceId) {
    const instance = getInstance(instanceId)
    if (!instance) throw new Error('Сборка не найдена')
    return {
      dir: ensureDir(path.join(instance.dir, 'mods')),
      indexKey: `instance:${instanceId}`,
      moddedId: null
    }
  }
  const moddedId = findModdedVersion(gameVersionId)
  if (!moddedId) throw new Error('Сначала установите хотя бы один мод — профиль Fabric создастся автоматически')
  return {
    dir: modsDir(getSettings().gameDir, moddedId),
    indexKey: moddedId,
    moddedId
  }
}

export function findModdedVersion(mcVersion: string): string | null {
  const gameDir = getSettings().gameDir
  const root = path.join(gameDir, 'versions')
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const file = path.join(root, entry.name, `${entry.name}.json`)
      if (!fs.existsSync(file)) continue
      try {
        const json = JSON.parse(fs.readFileSync(file, 'utf8')) as VersionJson
        if (json.cozyModded && json.cozyMcVersion === mcVersion) return entry.name
      } catch {
        // ignore broken profile
      }
    }
  } catch {
    // versions folder missing
  }
  return null
}

export async function ensureModdedVersion(mcVersion: string): Promise<string> {
  const existing = findModdedVersion(mcVersion)
  if (existing) return existing
  const meta = await fetchFabricMeta(mcVersion)
  const id = fabricVersionId(mcVersion, meta.loader.version)
  await ensureFabricVersion(mcVersion, meta.loader.version)
  return id
}

/* ------------------------------------------------------------------ */
/*  Install                                                           */
/* ------------------------------------------------------------------ */

export interface ModProgress {
  (progress: InstallProgress): void
}

export async function installMod(
  projectId: string,
  versionId: string,
  gameVersion: string,
  optionalProjectIds: string[] = [],
  onProgress?: ModProgress,
  instanceId?: string
): Promise<void> {
  const plan = await previewModInstall(projectId, versionId, gameVersion, optionalProjectIds)
  if (plan.blocked.length > 0) throw new Error(plan.blocked.join('\n'))

  log(`План установки: ${plan.files.length} файлов, ${formatBytes(plan.totalSize)}`)
  onProgress?.({
    versionId: gameVersion,
    phase: 'preparing',
    label: 'Проверяем Fabric и зависимости',
    done: 0,
    total: plan.files.length,
    bytes: 0,
    totalBytes: plan.totalSize,
    speed: 0
  })

  await ensureModdedVersion(gameVersion)
  const target = resolveTarget(gameVersion, instanceId)
  const destDir = target.dir

  const tasks = plan.files.map((file) => ({
    url: file.url,
    dest: path.join(destDir, safeFilename(file.filename)),
    sha1: file.sha1,
    sha512: file.sha512,
    size: file.size,
    label: file.filename
  }))

  await downloadAll(tasks, {
    concurrency: 4,
    onProgress: (progress) =>
      onProgress?.({
        versionId: gameVersion,
        phase: 'client',
        label: 'Скачивание модов',
        done: progress.done,
        total: progress.total,
        bytes: progress.bytes,
        totalBytes: progress.totalBytes,
        speed: progress.speed,
        file: progress.current
      })
  })

  const index = readIndex()
  let entries = index.versions[target.indexKey] ?? []
  const requiredProjectIds = plan.files.map((file) => file.projectId)
  for (const file of plan.files) {
    entries = entries.filter((entry) => entry.projectId !== file.projectId)
    entries.push({
      projectId: file.projectId,
      title: file.title,
      versionId: file.versionId,
      versionNumber: file.versionNumber,
      filename: safeFilename(file.filename),
      sha1: file.sha1,
      sha512: file.sha512,
      size: file.size,
      requiredProjectIds
    })
    index.versions[target.indexKey] = entries
  }
  writeIndex(index)
  log(`Установлено ${plan.files.length} файлов в ${destDir}`)

  onProgress?.({
    versionId: gameVersion,
    phase: 'done',
    label: 'Моды установлены',
    done: plan.files.length,
    total: plan.files.length,
    bytes: plan.totalSize,
    totalBytes: plan.totalSize,
    speed: 0
  })
}

function safeFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, '/'))
  if (!base || base === '.' || base === '..' || base.includes('\0')) {
    throw new Error('Недопустимое имя файла мода')
  }
  return base
}

export function listInstalledMods(gameVersionId: string, instanceId?: string): InstalledMod[] {
  let dir: string
  let indexKey: string
  if (instanceId) {
    const instance = getInstance(instanceId)
    if (!instance) return []
    dir = path.join(instance.dir, 'mods')
    indexKey = `instance:${instanceId}`
  } else {
    const moddedId = findModdedVersion(gameVersionId)
    if (!moddedId) return []
    dir = path.join(getSettings().gameDir, 'versions', moddedId, 'run', 'mods')
    indexKey = moddedId
  }
  if (!fs.existsSync(dir)) return []
  const index = readIndex()
  const entries = index.versions[indexKey] ?? []

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.jar') || file.endsWith('.jar.disabled'))
    .map((file) => {
      const enabled = file.endsWith('.jar')
      const base = enabled ? file : file.slice(0, -'.disabled'.length)
      const meta = entries.find((entry) => entry.filename === base)
      return {
        filename: file,
        projectId: meta?.projectId,
        versionNumber: meta?.versionNumber,
        size: fs.statSync(path.join(dir, file)).size,
        enabled,
        title: meta?.title,
        sha1: meta?.sha1
      }
    })
}

function resolveModFile(
  gameVersionId: string,
  filename: string,
  instanceId?: string
): { indexKey: string; file: string } {
  let dir: string
  let indexKey: string
  if (instanceId) {
    const instance = getInstance(instanceId)
    if (!instance) throw new Error('Сборка не найдена')
    dir = path.join(instance.dir, 'mods')
    indexKey = `instance:${instanceId}`
  } else {
    const moddedId = findModdedVersion(gameVersionId)
    if (!moddedId) throw new Error('Для этой версии ещё не установлены моды')
    dir = path.join(getSettings().gameDir, 'versions', moddedId, 'run', 'mods')
    indexKey = moddedId
  }
  const safe = safeFilename(filename)
  if (!safe.endsWith('.jar') && !safe.endsWith('.jar.disabled')) {
    throw new Error('Можно управлять только jar-файлами модов')
  }
  const file = path.join(dir, safe)
  if (!fs.existsSync(file)) throw new Error('Файл мода не найден')
  return { indexKey, file }
}

export function removeMod(gameVersionId: string, filename: string, instanceId?: string): void {
  const { indexKey, file } = resolveModFile(gameVersionId, filename, instanceId)
  const base = file.endsWith('.disabled') ? path.basename(file).slice(0, -'.disabled'.length) : path.basename(file)
  fs.rmSync(file, { force: true })
  const index = readIndex()
  if (index.versions[indexKey]) {
    index.versions[indexKey] = index.versions[indexKey].filter((entry) => entry.filename !== base)
    writeIndex(index)
  }
  log(`Удалён мод ${filename}`)
}

export function toggleMod(
  gameVersionId: string,
  filename: string,
  enabled: boolean,
  instanceId?: string
): void {
  const { file } = resolveModFile(gameVersionId, filename, instanceId)
  const disabled = file.endsWith('.disabled')
  if (enabled && disabled) fs.renameSync(file, file.slice(0, -'.disabled'.length))
  if (!enabled && !disabled) fs.renameSync(file, `${file}.disabled`)
}

/** Disables the most recently modified enabled mod. Used by the crash card. */
export function disableLastMod(gameVersionId: string, instanceId?: string): string | null {
  let dir: string
  if (instanceId) {
    const instance = getInstance(instanceId)
    if (!instance) return null
    dir = path.join(instance.dir, 'mods')
  } else {
    const moddedId = findModdedVersion(gameVersionId)
    if (!moddedId) return null
    dir = path.join(getSettings().gameDir, 'versions', moddedId, 'run', 'mods')
  }
  try {
    const jars = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.jar'))
      .map((file) => ({ file, mtime: fs.statSync(path.join(dir, file)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    if (!jars.length) return null
    const target = jars[0].file
    fs.renameSync(path.join(dir, target), path.join(dir, `${target}.disabled`))
    return target
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Updates                                                           */
/* ------------------------------------------------------------------ */

export async function checkModUpdates(
  gameVersionId: string,
  instanceId?: string
): Promise<ModUpdate[]> {
  const indexKey = instanceId
    ? `instance:${instanceId}`
    : findModdedVersion(gameVersionId)
  if (!indexKey) return []
  const entries = readIndex().versions[indexKey] ?? []
  const updates: ModUpdate[] = []

  for (const entry of entries) {
    try {
      const versions = await fetchJson<ModrinthVersionResponse[]>(
        buildVersionUrl(entry.projectId, gameVersionId)
      )
      const latest = versions?.[0]
      const file = latest?.files?.[0]
      if (!latest || !file || latest.id === entry.versionId) continue
      updates.push({
        projectId: entry.projectId,
        title: entry.title,
        currentVersion: entry.versionNumber,
        latestVersion: latest.version_number,
        versionId: latest.id,
        filename: file.filename
      })
    } catch {
      // one broken project must not break the whole check
    }
  }
  return updates
}

export async function updateAllMods(gameVersionId: string, instanceId?: string): Promise<number> {
  const updates = await checkModUpdates(gameVersionId, instanceId)
  let updated = 0
  for (const update of updates) {
    try {
      await installMod(update.projectId, update.versionId, gameVersionId, [], undefined, instanceId)
      updated += 1
    } catch (error) {
      log(`Не удалось обновить ${update.title}: ${error instanceof Error ? error.message : error}`)
    }
  }
  return updated
}

/* ------------------------------------------------------------------ */
/*  Pre-launch verification                                           */
/* ------------------------------------------------------------------ */

export function verifyModsBeforeLaunch(
  version: VersionJson,
  options: { modsDir?: string; indexKey?: string } = {}
): void {
  if (!version.cozyModded && !options.modsDir) return
  const gameDir = getSettings().gameDir
  const indexKey = options.indexKey ?? version.id
  const dir = options.modsDir ?? path.join(runDir(gameDir, version.id), 'mods')
  if (!fs.existsSync(dir)) return

  const entries = readIndex().versions[indexKey] ?? []
  if (entries.length === 0) return

  const enabled = new Set(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.jar'))
      .map((file) => file)
  )
  const enabledProjects = new Set(
    entries.filter((entry) => enabled.has(entry.filename)).map((entry) => entry.projectId)
  )

  const problems: string[] = []
  for (const entry of entries) {
    if (!enabled.has(entry.filename)) continue
    for (const required of entry.requiredProjectIds ?? []) {
      if (!enabledProjects.has(required)) {
        problems.push(`Для ${entry.title} не хватает зависимости ${required}`)
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`Не хватает обязательных модов:\n${[...new Set(problems)].join('\n')}`)
  }
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                         */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exp
  return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`
}

export async function fileHashes(file: string): Promise<{ sha1: string; sha512: string }> {
  const { createHash } = await import('node:crypto')
  const buffer = await fsp.readFile(file)
  return {
    sha1: createHash('sha1').update(buffer).digest('hex'),
    sha512: createHash('sha512').update(buffer).digest('hex')
  }
}
