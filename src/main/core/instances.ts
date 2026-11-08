import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Instance } from '@shared/types'
import { ensureDir, launcherDataDir } from './paths'
import { writeJsonAtomic } from './store'

const ID_PATTERN = /^[a-z0-9-]{6,48}$/

interface InstancesFile {
  instances: Instance[]
}

function registryPath(): string {
  return path.join(launcherDataDir(), 'instances.json')
}

function instancesRoot(): string {
  return ensureDir(path.join(launcherDataDir(), 'instances'))
}

export function instanceOwnDir(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error('Некорректный идентификатор сборки')
  return path.join(instancesRoot(), id)
}

export function instanceGameDir(id: string): string {
  const dir = path.join(instanceOwnDir(id), 'game')
  return ensureDir(dir)
}

function readRegistry(): InstancesFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(), 'utf8')) as InstancesFile
    if (Array.isArray(parsed?.instances)) return parsed
  } catch {
    // first run or broken file
  }
  return { instances: [] }
}

function writeRegistry(file: InstancesFile): void {
  writeJsonAtomic(registryPath(), file)
}

export function sanitizeInstanceName(raw: string): string {
  const name = raw.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '').trim()
  if (!name) throw new Error('Название сборки не может быть пустым')
  if (name.length > 48) throw new Error('Название сборки слишком длинное')
  return name
}

function ensureGameLayout(dir: string): void {
  for (const sub of ['mods', 'saves', 'screenshots', 'resourcepacks', 'shaderpacks', 'config', 'logs']) {
    ensureDir(path.join(dir, sub))
  }
}

export function listInstances(): Instance[] {
  return readRegistry().instances.map((instance) => {
    let modsCount = 0
    try {
      modsCount = fs
        .readdirSync(path.join(instance.dir, 'mods'))
        .filter((file) => file.endsWith('.jar') || file.endsWith('.jar.disabled')).length
    } catch {
      // instance folder may be offline
    }
    return { ...instance, modsCount }
  })
}

export function getInstance(id: string): Instance | null {
  return listInstances().find((instance) => instance.id === id) ?? null
}

export interface CreateInstanceInput {
  name: string
  versionId: string
  loader?: 'vanilla' | 'fabric'
  ramMb?: number
  javaPath?: string
  /** Link an existing external game folder instead of creating a new one. */
  externalDir?: string
}

export function createInstance(input: CreateInstanceInput): Instance {
  if (!/^[A-Za-z0-9._-]+$/.test(input.versionId)) {
    throw new Error('Некорректная версия Minecraft')
  }
  const name = sanitizeInstanceName(input.name)
  const id = randomUUID()
  let dir: string
  let external = false

  if (input.externalDir) {
    dir = path.resolve(input.externalDir)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error('Папка сборки не найдена')
    }
    external = true
  } else {
    dir = instanceGameDir(id)
    ensureGameLayout(dir)
  }

  const instance: Instance = {
    id,
    name,
    versionId: input.versionId,
    loader: input.loader === 'vanilla' ? 'vanilla' : 'fabric',
    dir,
    external,
    ramMb: input.ramMb,
    javaPath: input.javaPath,
    createdAt: Date.now()
  }
  const registry = readRegistry()
  registry.instances.push(instance)
  writeRegistry(registry)
  return instance
}

export function updateInstance(
  id: string,
  patch: Partial<Pick<Instance, 'name' | 'versionId' | 'loader' | 'ramMb' | 'javaPath'>>
): Instance {
  const registry = readRegistry()
  const instance = registry.instances.find((entry) => entry.id === id)
  if (!instance) throw new Error('Сборка не найдена')
  if (patch.name !== undefined) instance.name = sanitizeInstanceName(patch.name)
  if (patch.versionId !== undefined) {
    if (!/^[A-Za-z0-9._-]+$/.test(patch.versionId)) throw new Error('Некорректная версия Minecraft')
    instance.versionId = patch.versionId
  }
  if (patch.loader !== undefined) instance.loader = patch.loader === 'vanilla' ? 'vanilla' : 'fabric'
  if (patch.ramMb !== undefined) instance.ramMb = Math.max(512, Math.round(patch.ramMb))
  if (patch.javaPath !== undefined) instance.javaPath = patch.javaPath.trim()
  writeRegistry(registry)
  return { ...instance }
}

export function markInstancePlayed(id: string): void {
  const registry = readRegistry()
  const instance = registry.instances.find((entry) => entry.id === id)
  if (!instance) return
  instance.lastPlayedAt = Date.now()
  writeRegistry(registry)
}

export function removeInstance(id: string): void {
  const registry = readRegistry()
  const instance = registry.instances.find((entry) => entry.id === id)
  if (!instance) throw new Error('Сборка не найдена')
  registry.instances = registry.instances.filter((entry) => entry.id !== id)
  writeRegistry(registry)
  if (!instance.external) {
    fs.rmSync(instanceOwnDir(id), { recursive: true, force: true })
  }
}

export function cloneInstance(id: string, name?: string): Instance {
  const source = getInstance(id)
  if (!source) throw new Error('Сборка не найдена')
  const targetId = randomUUID()
  const targetDir = instanceGameDir(targetId)
  ensureGameLayout(targetDir)
  fs.cpSync(source.dir, targetDir, {
    recursive: true,
    force: true,
    filter: (file) => {
      const relative = path.relative(source.dir, file)
      if (!relative) return true
      return !relative.startsWith('logs') && !relative.startsWith('crash-reports')
    }
  })

  const instance: Instance = {
    id: targetId,
    name: sanitizeInstanceName(name ?? `${source.name} — копия`),
    versionId: source.versionId,
    loader: source.loader,
    dir: targetDir,
    external: false,
    ramMb: source.ramMb,
    javaPath: source.javaPath,
    createdAt: Date.now()
  }
  const registry = readRegistry()
  registry.instances.push(instance)
  writeRegistry(registry)
  return { ...instance }
}

export function suggestedInstancesRoot(): string {
  return instancesRoot()
}

export function homeDir(): string {
  return os.homedir()
}
