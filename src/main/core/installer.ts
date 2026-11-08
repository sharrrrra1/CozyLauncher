import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import extractZip from 'extract-zip'
import type { InstallProgress, VersionStatus } from '@shared/types'
import { downloadAll, type DownloadProgress, type DownloadTask } from './downloader'
import { getVersionJson } from './mojang'
import { createRuleContext } from './rules'
import { getSettings } from './store'
import {
  assetsDir,
  ensureDir,
  librariesDir,
  markerPath,
  nativesDir,
  versionDir
} from './paths'
import { legacyNatives, selectLibraries, type VersionJson } from './version'

interface InstallMarker {
  installedAt: number
  sizeBytes: number
  versionType: string
  releaseTime: string
}

const controllers = new Map<string, AbortController>()

function safeId(id: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Некорректный идентификатор версии')
  return id
}

function readMarker(file: string): InstallMarker | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as InstallMarker
  } catch {
    return null
  }
}

export function isInstalling(id: string): boolean {
  return controllers.has(id)
}

export function cancelInstall(id: string): void {
  controllers.get(id)?.abort()
}

function mapProgress(
  versionId: string,
  phase: InstallProgress['phase'],
  label: string,
  progress: DownloadProgress
): InstallProgress {
  return {
    versionId,
    phase,
    label,
    done: progress.done,
    total: progress.total,
    bytes: progress.bytes,
    totalBytes: progress.totalBytes,
    speed: progress.speed,
    file: progress.current
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

async function copyDirectory(source: string, target: string, exclude: string[]): Promise<void> {
  const entries = await fsp.readdir(source, { withFileTypes: true })
  await fsp.mkdir(target, { recursive: true })
  for (const entry of entries) {
    const relative = entry.name
    if (exclude.some((ex) => relative === ex.replace(/\/$/, ''))) continue
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) {
      await copyDirectory(from, to, exclude)
    } else if (entry.isFile()) {
      await fsp.copyFile(from, to)
    }
  }
}

async function extractLegacyNatives(
  version: VersionJson,
  gameDir: string,
  versionId: string,
  onProgress: (progress: InstallProgress) => void
): Promise<void> {
  const context = createRuleContext({ features: {} })
  const selected = selectLibraries(version.libraries, context)
  const libsDir = librariesDir(gameDir)
  const natives = legacyNatives(selected, context, libsDir)
  const target = ensureDir(nativesDir(gameDir, versionId))

  ensureDir(path.join(target, 'java'))
  ensureDir(path.join(target, 'jna'))
  ensureDir(path.join(target, 'lwjgl'))
  ensureDir(path.join(target, 'netty'))

  let done = 0
  for (const native of natives) {
    if (!(await pathExists(native.jarPath))) continue
    const tempDir = path.join(versionDir(gameDir, versionId), `.natives-tmp-${Date.now()}`)
    await fsp.mkdir(tempDir, { recursive: true })
    try {
      await extractZip(native.jarPath, { dir: tempDir })
      await copyDirectory(tempDir, target, native.exclude)
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
    done += 1
    onProgress({
      versionId,
      phase: 'natives',
      label: 'Распаковка нативных библиотек',
      done,
      total: natives.length,
      bytes: done,
      totalBytes: natives.length,
      speed: 0
    })
  }

  if (!natives.length) {
    onProgress({
      versionId,
      phase: 'natives',
      label: 'Нативные библиотеки в classpath',
      done: 1,
      total: 1,
      bytes: 1,
      totalBytes: 1,
      speed: 0
    })
  }
}

export async function getVersionStatus(id: string): Promise<VersionStatus> {
  safeId(id)
  const settings = getSettings()
  const dir = versionDir(settings.gameDir, id)
  const marker = readMarker(markerPath(settings.gameDir, id))
  const clientJar = path.join(dir, `${id}.jar`)
  const versionJson = path.join(dir, `${id}.json`)
  let installed = fs.existsSync(clientJar) && (Boolean(marker) || fs.existsSync(versionJson))

  // Fabric profiles inherit the client jar from their parent vanilla version.
  if (!installed && fs.existsSync(versionJson)) {
    try {
      const local = JSON.parse(fs.readFileSync(versionJson, 'utf8')) as {
        inheritsFrom?: string
      }
      if (local.inheritsFrom) {
        const parentJar = path.join(
          versionDir(settings.gameDir, local.inheritsFrom),
          `${local.inheritsFrom}.jar`
        )
        installed = fs.existsSync(parentJar)
      }
    } catch {
      installed = false
    }
  }

  return {
    id,
    installed,
    installedAt: marker?.installedAt,
    sizeBytes: marker?.sizeBytes,
    versionType: marker?.versionType,
    releaseTime: marker?.releaseTime
  }
}

export async function getVersionStatuses(ids: string[]): Promise<Record<string, VersionStatus>> {
  const result: Record<string, VersionStatus> = {}
  for (const id of ids) {
    try {
      result[id] = await getVersionStatus(id)
    } catch {
      result[id] = { id, installed: false }
    }
  }
  return result
}

export async function installVersion(
  id: string,
  onProgress: (progress: InstallProgress) => void
): Promise<VersionStatus> {
  safeId(id)
  if (controllers.has(id)) throw new Error('Эта версия уже устанавливается')

  const controller = new AbortController()
  controllers.set(id, controller)
  const signal = controller.signal
  const settings = getSettings()
  const gameDir = settings.gameDir
  let installedBytes = 0

  try {
    onProgress({
      versionId: id,
      phase: 'preparing',
      label: 'Чтение манифеста версии',
      done: 0,
      total: 1,
      bytes: 0,
      totalBytes: 0,
      speed: 0
    })

    const version = await getVersionJson(id)
    const dir = ensureDir(versionDir(gameDir, id))
    const libsRoot = ensureDir(librariesDir(gameDir))
    const assetsRoot = ensureDir(assetsDir(gameDir))
    ensureDir(path.join(assetsRoot, 'indexes'))
    ensureDir(path.join(assetsRoot, 'objects'))
    ensureDir(path.join(assetsRoot, 'log_configs'))
    ensureDir(nativesDir(gameDir, id))

    const context = createRuleContext({ features: {} })
    const selected = selectLibraries(version.libraries, context)

    const clientJar = path.join(dir, `${id}.jar`)
    const clientTask: DownloadTask = {
      url: version.downloads.client.url,
      dest: clientJar,
      sha1: version.downloads.client.sha1,
      size: version.downloads.client.size,
      label: `${id}.jar`
    }
    onProgress({
      versionId: id,
      phase: 'client',
      label: 'Скачивание клиента Minecraft',
      done: 0,
      total: 1,
      bytes: 0,
      totalBytes: version.downloads.client.size ?? 0,
      speed: 0,
      file: `${id}.jar`
    })
    await downloadAll([clientTask], {
      signal,
      concurrency: 1,
      onProgress: (progress) => onProgress(mapProgress(id, 'client', 'Клиент Minecraft', progress))
    })
    installedBytes += version.downloads.client.size ?? 0

    const libraryTasks: DownloadTask[] = []
    for (const library of selected) {
      const artifact = library.downloads?.artifact
      if (!artifact?.url || !artifact.path) continue
      libraryTasks.push({
        url: artifact.url,
        dest: path.join(libsRoot, ...artifact.path.split('/')),
        sha1: artifact.sha1,
        size: artifact.size,
        label: path.basename(artifact.path)
      })
    }
    const legacy = legacyNatives(selected, context, libsRoot)
    for (const native of legacy) {
      libraryTasks.push({
        url: native.download.url,
        dest: native.jarPath,
        sha1: native.download.sha1,
        size: native.download.size,
        label: path.basename(native.jarPath)
      })
    }
    const logFile = version.logging?.client?.file
    if (logFile) {
      libraryTasks.push({
        url: logFile.url,
        dest: path.join(assetsRoot, 'log_configs', logFile.id),
        sha1: logFile.sha1,
        size: logFile.size,
        label: logFile.id
      })
    }

    await downloadAll(libraryTasks, {
      signal,
      concurrency: 8,
      onProgress: (progress) =>
        onProgress(mapProgress(id, 'libraries', 'Библиотеки', progress))
    })
    installedBytes += libraryTasks.reduce((sum, task) => sum + (task.size ?? 0), 0)

    const indexDest = path.join(assetsRoot, 'indexes', `${version.assetIndex.id}.json`)
    await downloadAll(
      [
        {
          url: version.assetIndex.url,
          dest: indexDest,
          sha1: version.assetIndex.sha1,
          size: version.assetIndex.size,
          label: `assets/${version.assetIndex.id}.json`
        }
      ],
      {
        signal,
        concurrency: 1,
        onProgress: (progress) =>
          onProgress(mapProgress(id, 'assets', 'Индекс ассетов', progress))
      }
    )

    const indexJson = JSON.parse(await fsp.readFile(indexDest, 'utf8')) as {
      objects: Record<string, { hash: string; size: number }>
    }
    const assetTasks: DownloadTask[] = []
    const seen = new Set<string>()
    for (const object of Object.values(indexJson.objects ?? {})) {
      if (!object?.hash || seen.has(object.hash)) continue
      seen.add(object.hash)
      assetTasks.push({
        url: `https://resources.download.minecraft.net/${object.hash.slice(0, 2)}/${object.hash}`,
        dest: path.join(assetsRoot, 'objects', object.hash.slice(0, 2), object.hash),
        sha1: object.hash,
        size: object.size,
        label: object.hash
      })
    }
    await downloadAll(assetTasks, {
      signal,
      concurrency: 24,
      onProgress: (progress) =>
        onProgress(mapProgress(id, 'assets', 'Ассеты игры', progress))
    })
    installedBytes += version.assetIndex.totalSize ?? assetTasks.reduce((s, t) => s + (t.size ?? 0), 0)

    await extractLegacyNatives(version, gameDir, id, onProgress)

    await fsp.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify(version, null, 2),
      'utf8'
    )

    const marker: InstallMarker = {
      installedAt: Date.now(),
      sizeBytes: Math.round(installedBytes),
      versionType: version.type,
      releaseTime: version.releaseTime ?? ''
    }
    await fsp.writeFile(markerPath(gameDir, id), JSON.stringify(marker, null, 2), 'utf8')

    onProgress({
      versionId: id,
      phase: 'done',
      label: 'Готово',
      done: 1,
      total: 1,
      bytes: installedBytes,
      totalBytes: installedBytes,
      speed: 0
    })
    return await getVersionStatus(id)
  } catch (error) {
    const aborted = signal.aborted || (error instanceof Error && error.name === 'AbortError')
    onProgress({
      versionId: id,
      phase: aborted ? 'cancelled' : 'error',
      label: aborted ? 'Установка отменена' : 'Ошибка установки',
      done: 0,
      total: 1,
      bytes: 0,
      totalBytes: 0,
      speed: 0,
      message: error instanceof Error ? error.message : String(error)
    })
    if (aborted) return await getVersionStatus(id)
    throw error
  } finally {
    controllers.delete(id)
  }
}

export async function removeVersion(id: string): Promise<void> {
  safeId(id)
  cancelInstall(id)
  const settings = getSettings()
  await fsp.rm(versionDir(settings.gameDir, id), { recursive: true, force: true })
}
