import type { BrowserWindow } from 'electron'
import type { Account, AuthProgress } from '@shared/types'
import { createOfflineAccount } from './offline'
import { microsoftLogin, refreshMicrosoft, type MicrosoftTokens } from './microsoft'
import {
  currentStoredAccount,
  deleteAccount,
  findAccountByName,
  getAccountSecret,
  getSettings,
  getStoredAccount,
  listAccounts,
  markNeedsReauth,
  setCurrentAccount,
  toPublicAccount,
  updateAccountTokens,
  upsertAccount,
  type StoredAccount
} from '../store'
import { normalizeUuid } from '../uuid'

export interface LaunchAuth {
  accessToken: string
  uuid: string
  name: string
  userType: 'legacy' | 'msa'
  xuid: string
}

type Progress = (progress: AuthProgress) => void

export { listAccounts }

export function addOfflineAccount(name: string): Account {
  const account = createOfflineAccount(name)
  if (findAccountByName(account.name)) {
    throw new Error('Аккаунт с таким ником уже существует')
  }
  upsertAccount(account)
  if (!getSettings().lastAccountId) setCurrentAccount(account.id)
  return account
}

function applyMicrosoftTokens(tokens: MicrosoftTokens): Account {
  const id = `microsoft:${tokens.uuid}`
  const existing = getStoredAccount(id)
  const account: StoredAccount = {
    id,
    type: 'microsoft',
    name: tokens.name,
    uuid: normalizeUuid(tokens.uuid),
    skinUrl: tokens.skinUrl,
    xuid: tokens.xuid,
    createdAt: existing?.createdAt ?? Date.now(),
    needsReauth: false,
    mcTokenExpiresAt: tokens.mcExpiresAt
  }
  upsertAccount(account)
  updateAccountTokens(id, {
    accessToken: tokens.mcAccessToken,
    refreshToken: tokens.msRefreshToken,
    expiresAt: tokens.mcExpiresAt
  })
  return toPublicAccount({ ...account, mcAccessToken: tokens.mcAccessToken })
}

export async function addMicrosoftAccount(
  parent: BrowserWindow | null,
  onProgress: Progress
): Promise<Account> {
  const clientId = getSettings().msClientId
  const tokens = await microsoftLogin(parent, clientId, onProgress)
  const account = applyMicrosoftTokens(tokens)
  setCurrentAccount(account.id)
  onProgress({ step: 'done', message: `Вошли как ${account.name}`, account })
  return account
}

export function removeAccount(id: string): Account[] {
  return deleteAccount(id)
}

export function selectAccount(id: string): Account[] {
  if (!getStoredAccount(id)) throw new Error('Аккаунт не найден')
  setCurrentAccount(id)
  return listAccounts()
}

export function getCurrentAccount(): Account | null {
  const account = currentStoredAccount()
  return account ? toPublicAccount(account) : null
}

export async function refreshAccount(
  id: string,
  onProgress: Progress = () => undefined
): Promise<Account> {
  const stored = getStoredAccount(id)
  if (!stored) throw new Error('Аккаунт не найден')
  if (stored.type !== 'microsoft') return toPublicAccount(stored)
  const refreshToken = getAccountSecret(id, 'msRefreshToken')
  if (!refreshToken) {
    markNeedsReauth(id)
    throw new Error('Сессия Microsoft потеряна — войдите заново')
  }
  const tokens = await refreshMicrosoft(refreshToken, getSettings().msClientId, onProgress)
  return applyMicrosoftTokens(tokens)
}

export async function getLaunchAuth(onProgress: Progress = () => undefined): Promise<LaunchAuth> {
  const account = currentStoredAccount()
  if (!account) throw new Error('Сначала добавьте аккаунт Minecraft')

  if (account.type === 'offline') {
    return {
      accessToken: '0',
      uuid: account.uuid,
      name: account.name,
      userType: 'legacy',
      xuid: '0'
    }
  }

  let token = getAccountSecret(account.id, 'mcAccessToken')
  const expiresAt = account.mcTokenExpiresAt ?? 0
  if (!token || expiresAt < Date.now() + 120_000) {
    onProgress({ step: 'minecraft', message: 'Обновляем сессию Microsoft' })
    const refreshed = await refreshAccount(account.id, onProgress)
    token = getAccountSecret(account.id, 'mcAccessToken')
    if (!token) {
      markNeedsReauth(account.id)
      throw new Error('Не удалось обновить сессию Microsoft — войдите заново')
    }
    return {
      accessToken: token,
      uuid: refreshed.uuid,
      name: refreshed.name,
      userType: 'msa',
      xuid: refreshed.xuid ?? '0'
    }
  }

  return {
    accessToken: token,
    uuid: account.uuid,
    name: account.name,
    userType: 'msa',
    xuid: account.xuid ?? '0'
  }
}

const skinCache = new Map<string, { at: number; data: string | null }>()
const SKIN_TTL = 10 * 60 * 1000

export async function getSkinDataUrl(id: string): Promise<string | null> {
  const account = getStoredAccount(id)
  if (!account?.skinUrl) return null
  const cached = skinCache.get(account.skinUrl)
  if (cached && Date.now() - cached.at < SKIN_TTL) return cached.data

  try {
    const url = new URL(account.skinUrl)
    if (!url.hostname.endsWith('minecraft.net') && !url.hostname.endsWith('mojang.com')) {
      return null
    }
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CozyLauncher/1.0.0' },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > 2_000_000) throw new Error('Слишком большой файл скина')
    const data = `data:image/png;base64,${buffer.toString('base64')}`
    skinCache.set(account.skinUrl, { at: Date.now(), data })
    return data
  } catch {
    skinCache.set(account.skinUrl, { at: Date.now(), data: null })
    return null
  }
}
