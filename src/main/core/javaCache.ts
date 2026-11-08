import fs from 'node:fs'
import path from 'node:path'

export interface CachedJava {
  path: string
  major: number
  version: string
  at: number
}

export type JavaCacheFile = Record<string, CachedJava>

export function readJavaCache(file: string, ttlMs: number, now = Date.now()): JavaCacheFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const result: JavaCacheFile = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const entry = value as Partial<CachedJava>
    if (
      typeof entry.path !== 'string' ||
      !entry.path ||
      typeof entry.major !== 'number' ||
      Number.isFinite(entry.major) === false ||
      typeof entry.version !== 'string' ||
      typeof entry.at !== 'number' ||
      now - entry.at > ttlMs ||
      now - entry.at < 0
    ) {
      continue
    }
    result[key] = { path: entry.path, major: entry.major, version: entry.version, at: entry.at }
  }
  return result
}

export function writeJavaCache(file: string, entries: JavaCacheFile): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf8')
}
