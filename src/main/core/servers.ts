import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ServerEntry, ServerStatus } from '@shared/types'
import { launcherDataDir } from './paths'
import { writeJsonAtomic } from './store'
import { pingServer } from './server-ping'
import { parseServersDat } from './nbt'
import { getSettings } from './store'

interface ServersFile {
  servers: ServerEntry[]
}

function serversPath(): string {
  return path.join(launcherDataDir(), 'servers.json')
}

function readFile(): ServersFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(serversPath(), 'utf8')) as ServersFile
    if (Array.isArray(parsed?.servers)) return parsed
  } catch {
    // first run
  }
  return { servers: [] }
}

function writeFile(file: ServersFile): void {
  writeJsonAtomic(serversPath(), file)
}

export function splitAddress(raw: string): { host: string; port: number } {
  const value = raw.trim()
  if (!value) throw new Error('Адрес сервера не может быть пустым')
  let host = value
  let port = 25565
  if (value.startsWith('[')) {
    const match = value.match(/^\[([^\]]+)\](?::(\d+))?$/)
    if (!match) throw new Error('Некорректный IPv6-адрес')
    host = match[1]
    port = match[2] ? Number(match[2]) : 25565
  } else if ((value.match(/:/g) ?? []).length === 1) {
    const [name, rawPort] = value.split(':')
    host = name
    port = Number(rawPort)
  }
  if (!host || host.length > 253 || !/^[A-Za-z0-9._:[\]-]+$/.test(host)) {
    throw new Error('Некорректный адрес сервера')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Некорректный порт сервера')
  }
  return { host, port }
}

export function listServers(): ServerEntry[] {
  return readFile().servers
}

export function addServer(input: { name?: string; address: string; port?: number }): ServerEntry {
  let host: string
  let port: number
  if (input.port !== undefined) {
    host = input.address.trim()
    port = input.port
    if (!/^[A-Za-z0-9._:[\]-]+$/.test(host) || host.length > 253) {
      throw new Error('Некорректный адрес сервера')
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Некорректный порт сервера')
    }
  } else {
    const parsed = splitAddress(input.address)
    host = parsed.host
    port = parsed.port
  }

  const file = readFile()
  if (file.servers.some((server) => server.host.toLowerCase() === host.toLowerCase() && server.port === port)) {
    throw new Error('Этот сервер уже добавлен')
  }
  const entry: ServerEntry = {
    id: randomUUID(),
    name: (input.name ?? '').trim() || host,
    host,
    port,
    favorite: false,
    createdAt: Date.now()
  }
  file.servers.push(entry)
  writeFile(file)
  return entry
}

export function updateServer(
  id: string,
  patch: Partial<Pick<ServerEntry, 'name' | 'favorite'>>
): ServerEntry {
  const file = readFile()
  const server = file.servers.find((entry) => entry.id === id)
  if (!server) throw new Error('Сервер не найден')
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('Название сервера не может быть пустым')
    server.name = name.slice(0, 64)
  }
  if (patch.favorite !== undefined) server.favorite = Boolean(patch.favorite)
  writeFile(file)
  return server
}

export function removeServer(id: string): void {
  const file = readFile()
  const next = file.servers.filter((entry) => entry.id !== id)
  if (next.length === file.servers.length) throw new Error('Сервер не найден')
  file.servers = next
  writeFile(file)
}

export async function pingOne(host: string, port: number): Promise<ServerStatus> {
  return pingServer(host, port)
}

export async function pingAll(): Promise<Record<string, ServerStatus>> {
  const servers = listServers()
  const result: Record<string, ServerStatus> = {}
  await Promise.all(
    servers.map(async (server) => {
      result[server.id] = await pingServer(server.host, server.port)
    })
  )
  return result
}

export interface ServerImportResult {
  imported: number
  skipped: number
  files: string[]
}

/** Imports servers.dat from the shared game folder and from isolated instances. */
export function importServersDat(extraFiles: string[] = []): ServerImportResult {
  const settings = getSettings()
  const candidates = [
    path.join(settings.gameDir, 'servers.dat'),
    ...extraFiles
  ]
  const file = readFile()
  const existing = new Set(
    file.servers.map((server) => `${server.host.toLowerCase()}:${server.port}`)
  )
  let imported = 0
  let skipped = 0
  const usedFiles: string[] = []

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue
    try {
      const entries = parseServersDat(fs.readFileSync(candidate))
      usedFiles.push(candidate)
      for (const entry of entries) {
        let parsed: { host: string; port: number }
        try {
          parsed = splitAddress(entry.ip)
        } catch {
          skipped += 1
          continue
        }
        const key = `${parsed.host.toLowerCase()}:${parsed.port}`
        if (existing.has(key)) {
          skipped += 1
          continue
        }
        existing.add(key)
        file.servers.push({
          id: randomUUID(),
          name: entry.name.slice(0, 64) || parsed.host,
          host: parsed.host,
          port: parsed.port,
          favorite: false,
          createdAt: Date.now(),
          icon: entry.icon
        })
        imported += 1
      }
    } catch {
      skipped += 1
    }
  }

  if (imported > 0) writeFile(file)
  return { imported, skipped, files: usedFiles }
}
