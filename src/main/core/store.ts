import { safeStorage } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Account, AccentName, Settings } from '@shared/types'
import { defaultGameDir, ensureDir, launcherDataDir } from './paths'

export interface StoredAccount extends Account {
  mcAccessToken?: string
  msRefreshToken?: string
}

interface AccountsFile {
  accounts: StoredAccount[]
}

const ACCENTS: AccentName[] = ['emerald', 'amber', 'frost', 'rose']

let settingsCache: Settings | null = null
let accountsCache: StoredAccount[] | null = null

function settingsPath(): string {
  return path.join(launcherDataDir(), 'settings.json')
}

function accountsPath(): string {
  return path.join(launcherDataDir(), 'accounts.json')
}

function defaultRam(): number {
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024)
  return Math.max(2048, Math.min(6144, Math.floor(totalMb / 4 / 512) * 512))
}

export function defaultSettings(): Settings {
  return {
    ramMb: defaultRam(),
    javaMode: 'auto',
    javaPath: '',
    gameDir: defaultGameDir(),
    width: 1280,
    height: 720,
    fullscreen: false,
    customResolution: true,
    jvmArgs: '',
    accent: 'emerald',
    animations: true,
    closeOnLaunch: false,
    msClientId: '00000000402b5328',
    lastVersion: '',
    lastAccountId: ''
  }
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  ensureDir(path.dirname(file))
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(temp, file)
}

function sanitizeSettings(raw: Partial<Settings>): Settings {
  const defaults = defaultSettings()
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024)
  const merged = { ...defaults, ...raw }
  const accent = ACCENTS.includes(merged.accent) ? merged.accent : defaults.accent
  return {
    ...merged,
    ramMb: Math.max(512, Math.min(Math.max(1024, totalMb - 1024), Math.round(merged.ramMb))),
    width: Math.max(640, Math.min(7680, Math.round(merged.width))),
    height: Math.max(480, Math.min(4320, Math.round(merged.height))),
    javaMode: merged.javaMode === 'custom' ? 'custom' : 'auto',
    javaPath: merged.javaMode === 'custom' ? merged.javaPath.trim() : '',
    gameDir: merged.gameDir.trim() || defaults.gameDir,
    accent,
    msClientId: merged.msClientId.trim() || defaults.msClientId,
    jvmArgs: merged.jvmArgs ?? ''
  }
}

export function getSettings(): Settings {
  if (!settingsCache) {
    const stored = readJson<Partial<Settings>>(settingsPath())
    settingsCache = sanitizeSettings(stored ?? {})
    if (!stored) writeJsonAtomic(settingsPath(), settingsCache)
  }
  return settingsCache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = sanitizeSettings({ ...getSettings(), ...patch })
  settingsCache = next
  writeJsonAtomic(settingsPath(), next)
  if (next.gameDir) ensureDir(next.gameDir)
  return next
}

function seal(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(value).toString('base64')}`
    }
  } catch {
    // fall through to base64 storage
  }
  return `raw:${Buffer.from(value, 'utf8').toString('base64')}`
}

function unseal(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    if (value.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    }
    if (value.startsWith('raw:')) {
      return Buffer.from(value.slice(4), 'base64').toString('utf8')
    }
    return value
  } catch {
    return undefined
  }
}

function loadAccounts(): StoredAccount[] {
  if (!accountsCache) {
    const file = readJson<AccountsFile>(accountsPath())
    accountsCache = Array.isArray(file?.accounts) ? file.accounts : []
  }
  return accountsCache
}

function saveAccounts(): void {
  writeJsonAtomic(accountsPath(), { accounts: loadAccounts() })
}

export function toPublicAccount(account: StoredAccount): Account {
  const { mcAccessToken: _token, msRefreshToken: _refresh, ...rest } = account
  return rest
}

export function listAccounts(): Account[] {
  return loadAccounts().map(toPublicAccount)
}

export function getStoredAccount(id: string): StoredAccount | undefined {
  return loadAccounts().find((account) => account.id === id)
}

export function findAccountByName(name: string): StoredAccount | undefined {
  return loadAccounts().find(
    (account) => account.name.toLowerCase() === name.toLowerCase()
  )
}

export function upsertAccount(account: StoredAccount): Account {
  const accounts = loadAccounts()
  const index = accounts.findIndex((entry) => entry.id === account.id)
  if (index >= 0) accounts[index] = account
  else accounts.push(account)
  saveAccounts()
  return toPublicAccount(account)
}

export function updateAccountTokens(
  id: string,
  tokens: { accessToken?: string; refreshToken?: string; expiresAt?: number }
): void {
  const accounts = loadAccounts()
  const account = accounts.find((entry) => entry.id === id)
  if (!account) return
  if (tokens.accessToken !== undefined) account.mcAccessToken = seal(tokens.accessToken)
  if (tokens.refreshToken !== undefined) account.msRefreshToken = seal(tokens.refreshToken)
  if (tokens.expiresAt !== undefined) account.mcTokenExpiresAt = tokens.expiresAt
  account.needsReauth = false
  saveAccounts()
}

export function getAccountSecret(
  id: string,
  key: 'mcAccessToken' | 'msRefreshToken'
): string | undefined {
  const account = getStoredAccount(id)
  if (!account) return undefined
  return unseal(account[key])
}

export function deleteAccount(id: string): Account[] {
  const accounts = loadAccounts()
  accountsCache = accounts.filter((entry) => entry.id !== id)
  saveAccounts()
  if (getSettings().lastAccountId === id) updateSettings({ lastAccountId: '' })
  return listAccounts()
}

export function currentStoredAccount(): StoredAccount | null {
  const settings = getSettings()
  const accounts = loadAccounts()
  if (!accounts.length) return null
  const selected = accounts.find((account) => account.id === settings.lastAccountId)
  if (selected) return selected
  const fallback = accounts[0]
  updateSettings({ lastAccountId: fallback.id })
  return fallback
}

export function setCurrentAccount(id: string): void {
  updateSettings({ lastAccountId: id })
}

export function markNeedsReauth(id: string): void {
  const account = loadAccounts().find((entry) => entry.id === id)
  if (!account) return
  account.needsReauth = true
  account.mcTokenExpiresAt = 0
  saveAccounts()
}
