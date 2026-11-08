import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ImportCandidate, ImportScan } from '@shared/types'
import { defaultGameDir } from './paths'
import { addOfflineAccount, listAccounts } from './auth/accounts'
import { getSettings } from './store'

interface LauncherSpec {
  id: string
  name: string
  roots: string[]
  gameSub: string
}

function appDataDir(): string {
  return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
}

function launcherSpecs(): LauncherSpec[] {
  const appdata = appDataDir()
  const home = os.homedir()
  return [
    {
      id: 'prism',
      name: 'Prism Launcher',
      roots: [
        path.join(appdata, 'PrismLauncher', 'instances'),
        path.join(appdata, 'PolyMC', 'instances'),
        path.join(appdata, 'MultiMC', 'instances')
      ],
      gameSub: '.minecraft'
    },
    {
      id: 'curseforge',
      name: 'CurseForge',
      roots: [
        path.join(home, 'curseforge', 'minecraft', 'Instances'),
        path.join(home, 'Documents', 'curseforge', 'minecraft', 'Instances'),
        path.join(appdata, 'CurseForge', 'minecraft', 'Instances')
      ],
      gameSub: 'minecraft'
    },
    {
      id: 'atlauncher',
      name: 'ATLauncher',
      roots: [path.join(appdata, 'ATLauncher', 'Instances')],
      gameSub: ''
    },
    {
      id: 'gdlauncher',
      name: 'GDLauncher',
      roots: [
        path.join(appdata, 'gdlauncher_next', 'instances'),
        path.join(appdata, 'gdlauncher', 'instances')
      ],
      gameSub: ''
    }
  ]
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function countJars(dir: string): number {
  try {
    return fs.readdirSync(path.join(dir, 'mods')).filter((file) => file.endsWith('.jar')).length
  } catch {
    return 0
  }
}

function hasEntries(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0
  } catch {
    return false
  }
}

const VERSION_PATTERN = /(\d+\.\d+(?:\.\d+)?(?:[-_][A-Za-z0-9.]+)?)/

function detectVersion(gameDir: string, instanceDir: string): string | undefined {
  // Prism / MultiMC
  const pack = readJson(path.join(instanceDir, 'mmc-pack.json'))
  if (pack && Array.isArray(pack.components)) {
    for (const component of pack.components as Array<Record<string, unknown>>) {
      if (component.uid === 'net.minecraft' && typeof component.version === 'string') {
        return component.version
      }
    }
  }

  // CurseForge
  const curse = readJson(path.join(instanceDir, 'minecraftinstance.json'))
  if (curse) {
    for (const key of ['gameVersion', 'minecraftVersion', 'mcVersion']) {
      if (typeof curse[key] === 'string') return curse[key] as string
    }
    const loader = curse.baseModLoader as Record<string, unknown> | undefined
    if (loader && typeof loader.minecraftVersion === 'string') return loader.minecraftVersion
    const raw = JSON.stringify(curse)
    const match = raw.match(/"gameVersion"\s*:\s*"([^"]+)"/)
    if (match) return match[1]
  }

  // ATLauncher / GDLauncher
  for (const name of ['instance.json', 'instance.cfg', 'mmc-pack.json']) {
    const file = path.join(instanceDir, name)
    if (!fs.existsSync(file)) continue
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const match = raw.match(/"(?:mcVersion|minecraftVersion|version|id)"\s*:\s*"([^"]+)"/)
      if (match && /^\d+\.\d+/.test(match[1])) return match[1]
    } catch {
      // ignore
    }
  }

  const folder = path.basename(instanceDir)
  const match = folder.match(VERSION_PATTERN)
  if (match && /^\d+\.\d+/.test(match[1])) return match[1]
  try {
    const versions = fs.readdirSync(path.join(gameDir, 'versions'))
    const release = versions.find((entry) => /^\d+\.\d+(\.\d+)?$/.test(entry))
    return release
  } catch {
    return undefined
  }
}

export function scanImports(): ImportScan {
  const vanilla = defaultGameDir()
  const candidates: ImportCandidate[] = []
  const seen = new Set<string>()

  for (const spec of launcherSpecs()) {
    for (const root of spec.roots) {
      if (!fs.existsSync(root)) continue
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(root, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const instanceDir = path.join(root, entry.name)
        const gameDir = spec.gameSub ? path.join(instanceDir, spec.gameSub) : instanceDir
        if (!fs.existsSync(gameDir) || !fs.statSync(gameDir).isDirectory()) continue
        if (seen.has(gameDir)) continue
        seen.add(gameDir)
        candidates.push({
          id: `${spec.id}|${gameDir}`,
          launcher: spec.name,
          name: entry.name,
          gameDir,
          mcVersion: detectVersion(gameDir, instanceDir),
          modsCount: countJars(gameDir),
          hasSaves: hasEntries(path.join(gameDir, 'saves')),
          hasServers: fs.existsSync(path.join(gameDir, 'servers.dat'))
        })
      }
    }
  }

  let vanillaVersions = 0
  try {
    vanillaVersions = fs
      .readdirSync(path.join(vanilla, 'versions'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).length
  } catch {
    // no vanilla installation
  }

  const accountNames = scanOfflineAccountNames()

  return {
    vanilla: {
      gameDir: vanilla,
      versions: vanillaVersions,
      exists: fs.existsSync(vanilla),
      isCurrent: path.resolve(vanilla) === path.resolve(getSettings().gameDir)
    },
    candidates: candidates.sort((a, b) => a.launcher.localeCompare(b.launcher) || a.name.localeCompare(b.name)),
    accountNames
  }
}

/** Reads only names; tokens from other launchers cannot be transferred. */
export function scanOfflineAccountNames(): string[] {
  const names = new Set<string>()
  const vanilla = defaultGameDir()

  const profiles = readJson(path.join(vanilla, 'launcher_profiles.json'))
  if (profiles && profiles.profiles && typeof profiles.profiles === 'object') {
    for (const value of Object.values(profiles.profiles as Record<string, unknown>)) {
      const profile = value as Record<string, unknown>
      if (typeof profile.name === 'string' && profile.name.trim()) names.add(profile.name.trim())
    }
  }

  const accounts = readJson(path.join(vanilla, 'launcher_accounts.json'))
  if (accounts && accounts.accounts && typeof accounts.accounts === 'object') {
    for (const value of Object.values(accounts.accounts as Record<string, unknown>)) {
      const account = value as Record<string, unknown>
      const profile = account.minecraftProfile as Record<string, unknown> | undefined
      if (profile && typeof profile.name === 'string' && profile.name.trim()) {
        names.add(profile.name.trim())
      }
    }
  }

  return [...names].filter((name) => /^[A-Za-z0-9_]{3,16}$/.test(name)).slice(0, 20)
}

export function importOfflineAccounts(): { imported: string[]; skipped: number } {
  const existing = new Set(listAccounts().map((account) => account.name.toLowerCase()))
  const imported: string[] = []
  let skipped = 0
  for (const name of scanOfflineAccountNames()) {
    if (existing.has(name.toLowerCase())) {
      skipped += 1
      continue
    }
    try {
      addOfflineAccount(name)
      existing.add(name.toLowerCase())
      imported.push(name)
    } catch {
      skipped += 1
    }
  }
  return { imported, skipped }
}
