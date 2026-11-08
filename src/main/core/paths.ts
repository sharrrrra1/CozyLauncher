import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function launcherDataDir(): string {
  return app.getPath('userData')
}

export function cacheDir(): string {
  return ensureDir(path.join(launcherDataDir(), 'cache'))
}

export function runtimesDir(): string {
  return ensureDir(path.join(launcherDataDir(), 'runtimes'))
}

export function defaultGameDir(): string {
  return path.join(app.getPath('appData'), '.minecraft')
}

export function versionsDir(gameDir: string): string {
  return path.join(gameDir, 'versions')
}

export function librariesDir(gameDir: string): string {
  return path.join(gameDir, 'libraries')
}

export function assetsDir(gameDir: string): string {
  return path.join(gameDir, 'assets')
}

export function versionDir(gameDir: string, versionId: string): string {
  return path.join(versionsDir(gameDir), versionId)
}

export function nativesDir(gameDir: string, versionId: string): string {
  return path.join(versionDir(gameDir, versionId), 'natives-cozy')
}

export function markerPath(gameDir: string, versionId: string): string {
  return path.join(versionDir(gameDir, versionId), '.cozy-installed.json')
}

export function logsDir(): string {
  return ensureDir(path.join(launcherDataDir(), 'logs'))
}
