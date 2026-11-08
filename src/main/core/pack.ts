import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import extractZip from 'extract-zip'
import type { InstallProgress } from '@shared/types'
import { downloadAll } from './downloader'
import { ensureFabricVersion, fabricVersionId, fetchFabricMeta } from './fabric'
import { cacheDir, ensureDir, versionDir } from './paths'
import { resolveInside } from './pack-paths'
import { getSettings } from './store'
import { getVersionStatus } from './installer'

interface PackFile {
  path: string
  hashes?: { sha1?: string; sha512?: string }
  env?: { client?: string; server?: string }
  downloads?: string[]
  fileSize?: number
}

interface PackIndex {
  formatVersion: number
  name?: string
  files?: PackFile[]
  dependencies?: Record<string, string>
}

export interface PackInstallResult {
  name: string
  files: number
}

async function copyOverrides(source: string, target: string): Promise<number> {
  if (!fs.existsSync(source)) return 0
  let copied = 0
  const entries = await fsp.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(source, entry.name)
    const to = resolveInside(target, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      copied += await copyOverrides(from, to)
    } else if (entry.isFile()) {
      await fsp.mkdir(path.dirname(to), { recursive: true })
      await fsp.copyFile(from, to)
      copied += 1
    }
  }
  return copied
}

export async function installMrpack(
  zipPath: string,
  onProgress?: (progress: InstallProgress) => void
): Promise<PackInstallResult> {
  if (!fs.existsSync(zipPath)) throw new Error('Файл модпака не найден')
  const temp = path.join(cacheDir(), `mrpack-${Date.now()}`)
  ensureDir(temp)

  try {
    onProgress?.({
      versionId: '',
      phase: 'preparing',
      label: 'Читаем модпак',
      done: 0,
      total: 1,
      bytes: 0,
      totalBytes: 0,
      speed: 0
    })
    await extractZip(zipPath, { dir: temp })
    const indexPath = path.join(temp, 'modrinth.index.json')
    if (!fs.existsSync(indexPath)) throw new Error('В модпаке нет modrinth.index.json')
    const index = JSON.parse(await fsp.readFile(indexPath, 'utf8')) as PackIndex
    if (!index || typeof index !== 'object' || !index.dependencies) {
      throw new Error('Некорректный modrinth.index.json')
    }

    const mcVersion = index.dependencies.minecraft
    if (!mcVersion || !/^[A-Za-z0-9._-]+$/.test(mcVersion)) {
      throw new Error('В модпаке не указана версия Minecraft')
    }
    const parent = await getVersionStatus(mcVersion)
    if (!parent.installed) {
      throw new Error(`Сначала установите Minecraft ${mcVersion}, затем повторите установку модпака`)
    }

    const loader = index.dependencies['fabric-loader']
    const meta = await fetchFabricMeta(mcVersion, loader)
    const moddedId = fabricVersionId(mcVersion, meta.loader.version)
    await ensureFabricVersion(mcVersion, meta.loader.version)

    const settings = getSettings()
    const run = ensureDir(path.join(versionDir(settings.gameDir, moddedId), 'run'))
    const modsRoot = ensureDir(path.join(run, 'mods'))

    const tasks: Array<{
      url: string
      dest: string
      sha1?: string
      sha512?: string
      size?: number
      label?: string
    }> = []
    const files = index.files ?? []
    for (const file of files) {
      if (file.env?.client === 'unsupported') continue
      const url = file.downloads?.[0]
      if (!url) continue
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.modrinth.com') {
        throw new Error(`Недопустимый источник файла модпака: ${parsed.host}`)
      }
      const relative = resolveInside(run, file.path)
      tasks.push({
        url,
        dest: relative,
        sha1: file.hashes?.sha1,
        sha512: file.hashes?.sha512,
        size: file.fileSize,
        label: path.basename(file.path)
      })
    }

    const modJarCount = tasks.filter((task) => task.dest.startsWith(modsRoot)).length
    onProgress?.({
      versionId: mcVersion,
      phase: 'client',
      label: 'Скачивание файлов модпака',
      done: 0,
      total: tasks.length,
      bytes: 0,
      totalBytes: tasks.reduce((sum, task) => sum + (task.size ?? 0), 0),
      speed: 0
    })
    await downloadAll(tasks, {
      concurrency: 6,
      onProgress: (progress) =>
        onProgress?.({
          versionId: mcVersion,
          phase: 'client',
          label: 'Скачивание файлов модпака',
          done: progress.done,
          total: progress.total,
          bytes: progress.bytes,
          totalBytes: progress.totalBytes,
          speed: progress.speed,
          file: progress.current
        })
    })

    const overrides = path.join(temp, 'overrides')
    if (fs.existsSync(overrides)) {
      onProgress?.({
        versionId: mcVersion,
        phase: 'natives',
        label: 'Распаковка overrides',
        done: 0,
        total: 1,
        bytes: 0,
        totalBytes: 0,
        speed: 0
      })
      await copyOverrides(overrides, run)
    }

    const name = index.name ?? path.basename(zipPath, path.extname(zipPath))
    onProgress?.({
      versionId: mcVersion,
      phase: 'done',
      label: 'Модпак установлен',
      done: 1,
      total: 1,
      bytes: 0,
      totalBytes: 0,
      speed: 0
    })
    return { name, files: tasks.length || modJarCount }
  } finally {
    await fsp.rm(temp, { recursive: true, force: true }).catch(() => undefined)
  }
}
