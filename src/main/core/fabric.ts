import fs from 'node:fs'
import path from 'node:path'
import { downloadAll } from './downloader'
import {
  fabricVersionId,
  synthesizeFabricProfile,
  type FabricMetaEntry
} from './fabric-profile'
import { getVersionJson } from './mojang'
import { ensureDir, librariesDir, versionDir } from './paths'
import { getSettings } from './store'
import type { VersionJson } from './version'
import { getVersionStatus } from './installer'

const FABRIC_META = 'https://meta.fabricmc.net/v2/versions/loader'
const USER_AGENT = 'CozyLauncher/1.1.0 (+https://github.com/sharrrrra1/CozyLauncher)'

export {
  fabricVersionId,
  synthesizeFabricProfile,
  type FabricMetaEntry
} from './fabric-profile'

export async function fetchFabricMeta(
  mcVersion: string,
  loaderVersion?: string
): Promise<FabricMetaEntry> {
  if (!/^[A-Za-z0-9._-]+$/.test(mcVersion)) throw new Error('Некорректная версия Minecraft')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let response: Response
  try {
    response = await fetch(`${FABRIC_META}/${encodeURIComponent(mcVersion)}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new Error(`Fabric Meta недоступен (HTTP ${response.status})`)
  const entries = (await response.json()) as FabricMetaEntry[]
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Fabric не поддерживает Minecraft ${mcVersion}`)
  }
  if (loaderVersion) {
    const exact = entries.find((entry) => entry.loader.version === loaderVersion)
    if (!exact) throw new Error(`Fabric Loader ${loaderVersion} не найден для ${mcVersion}`)
    return exact
  }
  const stable = entries.find((entry) => entry.loader.stable === true)
  return stable ?? entries[0]
}

export interface EnsureFabricResult {
  id: string
  version: VersionJson
  installed: boolean
}

/**
 * Makes sure the vanilla parent is installed, synthesizes the Fabric profile,
 * writes it to `versions/<id>/<id>.json`, and downloads loader libraries.
 */
export async function ensureFabricVersion(
  mcVersion: string,
  loaderVersion?: string,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<EnsureFabricResult> {
  const parent = await getVersionStatus(mcVersion)
  if (!parent.installed) {
    throw new Error(`Сначала установите ванильную версию ${mcVersion}`)
  }

  const meta = await fetchFabricMeta(mcVersion, loaderVersion)
  const profile = synthesizeFabricProfile(mcVersion, meta)
  const settings = getSettings()
  const gameDir = settings.gameDir
  const dir = ensureDir(versionDir(gameDir, profile.id))
  const file = path.join(dir, `${profile.id}.json`)

  let installed = true
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(profile, null, 2), 'utf8')
    installed = false
  }

  const libsRoot = ensureDir(librariesDir(gameDir))
  const tasks = profile.libraries
    .map((library) => library.downloads?.artifact)
    .filter((artifact): artifact is NonNullable<typeof artifact> =>
      Boolean(artifact?.url && artifact.path)
    )
    .map((artifact) => ({
      url: artifact.url,
      dest: path.join(libsRoot, ...artifact.path!.split('/')),
      sha1: artifact.sha1,
      size: artifact.size,
      label: path.basename(artifact.path!)
    }))

  onProgress?.(0, tasks.length, 'Библиотеки Fabric')
  await downloadAll(tasks, {
    concurrency: 4,
    onProgress: (progress) =>
      onProgress?.(progress.done, progress.total, progress.current ?? 'Библиотеки Fabric')
  })
  onProgress?.(tasks.length, tasks.length, 'Fabric готов')

  return { id: profile.id, version: await getVersionJson(profile.id), installed }
}
