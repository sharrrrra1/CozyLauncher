import { BrowserWindow, session, shell } from 'electron'
import type { AuthProgress } from '@shared/types'
import { normalizeUuid } from '../uuid'

export interface MicrosoftTokens {
  msAccessToken: string
  msRefreshToken: string
  mcAccessToken: string
  mcExpiresAt: number
  name: string
  uuid: string
  xuid: string
  skinUrl?: string
  capes: string[]
}

const DEFAULT_CLIENT_ID = '00000000402b5328'
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf'
const AUTH_URL = 'https://login.live.com/oauth20_authorize.srf'
const TOKEN_URL = 'https://login.live.com/oauth20_token.srf'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

type Progress = (progress: AuthProgress) => void

interface ExchangeResult {
  access_token: string
  refresh_token: string
  expires_in: number
}

function buildAuthUrl(clientId: string): string {
  const url = new URL(AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

function extractCode(rawUrl: string): { code?: string; error?: string } {
  try {
    const url = new URL(rawUrl)
    if (!url.pathname.toLowerCase().includes('oauth20_desktop.srf')) return {}
    return {
      code: url.searchParams.get('code') ?? undefined,
      error: url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? undefined
    }
  } catch {
    return {}
  }
}

async function postForm(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(30000)
  })
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-xbl-contract-version': '1',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Xbox API ${response.status}: ${text.slice(0, 300)}`)
  }
  return (await response.json()) as T
}

async function exchangeCode(code: string, clientId: string): Promise<ExchangeResult> {
  const response = await postForm(TOKEN_URL, {
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Microsoft вернул ошибку ${response.status}: ${text.slice(0, 300)}`)
  }
  return (await response.json()) as ExchangeResult
}

async function refreshMsToken(
  refreshToken: string,
  clientId: string
): Promise<ExchangeResult> {
  const response = await postForm(TOKEN_URL, {
    client_id: clientId,
    grant_type: 'refresh_token',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    refresh_token: refreshToken
  })
  if (!response.ok) {
    throw new Error(
      'Не удалось обновить сессию Microsoft. Войдите в аккаунт заново.'
    )
  }
  return (await response.json()) as ExchangeResult
}

interface XboxAuthResponse {
  Token: string
  DisplayClaims: {
    xui: Array<{ uhs: string; xid?: string }>
  }
}

async function xboxUserAuth(accessToken: string): Promise<XboxAuthResponse> {
  return postJson<XboxAuthResponse>('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${accessToken}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })
}

async function xboxXsts(token: string): Promise<XboxAuthResponse> {
  const response = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-xbl-contract-version': '1',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [token]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    let payload: { XErr?: number } = {}
    try {
      payload = (await response.json()) as { XErr?: number }
    } catch {
      // ignore
    }
    const messages: Record<number, string> = {
      2148916233: 'У аккаунта Microsoft нет профиля Xbox. Создайте его на xbox.com.',
      2148916235: 'Xbox Live недоступен в регионе этого аккаунта.',
      2148916236: 'Аккаунту требуется подтверждение возраста.',
      2148916237: 'Аккаунт Xbox ограничен.',
      2148916238: 'Это детский аккаунт. Нужен взрослый аккаунт Microsoft.'
    }
    throw new Error(
      messages[payload.XErr ?? 0] ?? `Xbox Live отклонил вход (код ${payload.XErr ?? response.status}).`
    )
  }
  return (await response.json()) as XboxAuthResponse
}

async function minecraftLogin(
  xstsToken: string,
  uhs: string
): Promise<{ access_token: string; expires_in: number }> {
  const response = await postJson<{ access_token: string; expires_in: number }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${uhs};${xstsToken}` }
  )
  return response
}

async function hasMinecraftLicense(token: string): Promise<boolean> {
  const response = await fetch(
    'https://api.minecraftservices.com/entitlements/mcstore',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      },
      signal: AbortSignal.timeout(30000)
    }
  )
  if (!response.ok) {
    throw new Error(`Не удалось проверить лицензию Minecraft (${response.status})`)
  }
  const data = (await response.json()) as { items?: unknown[] }
  return Boolean(data.items && data.items.length > 0)
}

interface MinecraftProfile {
  id: string
  name: string
  skins?: Array<{ id: string; state: string; url: string }>
  capes?: Array<{ id: string; state: string; url: string }>
}

async function getProfile(token: string): Promise<MinecraftProfile> {
  const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    },
    signal: AbortSignal.timeout(30000)
  })
  if (response.status === 404) {
    throw new Error('На аккаунте нет профиля Minecraft Java Edition.')
  }
  if (!response.ok) {
    throw new Error(`Не удалось получить профиль Minecraft (${response.status})`)
  }
  return (await response.json()) as MinecraftProfile
}

async function completeChain(
  exchange: ExchangeResult,
  onProgress: Progress
): Promise<MicrosoftTokens> {
  onProgress({ step: 'xbox', message: 'Проверяем профиль Xbox Live' })
  const xbox = await xboxUserAuth(exchange.access_token)
  const uhs = xbox.DisplayClaims.xui[0]?.uhs
  if (!uhs) throw new Error('Xbox Live не вернул идентификатор пользователя')

  onProgress({ step: 'xbox', message: 'Получаем токен XSTS' })
  const xsts = await xboxXsts(xbox.Token)
  const xuid = xsts.DisplayClaims.xui[0]?.xid ?? '0'

  onProgress({ step: 'minecraft', message: 'Входим в Minecraft Services' })
  const minecraft = await minecraftLogin(xsts.Token, uhs)

  onProgress({ step: 'minecraft', message: 'Проверяем лицензию Minecraft' })
  if (!(await hasMinecraftLicense(minecraft.access_token))) {
    throw new Error(
      'На этом аккаунте Microsoft нет лицензии Minecraft Java Edition. Купите игру или используйте офлайн-аккаунт.'
    )
  }

  onProgress({ step: 'profile', message: 'Загружаем профиль игрока' })
  const profile = await getProfile(minecraft.access_token)
  const activeSkin = profile.skins?.find((skin) => skin.state === 'ACTIVE')
  const capes = (profile.capes ?? [])
    .filter((cape) => cape.state === 'ACTIVE')
    .map((cape) => cape.url)

  return {
    msAccessToken: exchange.access_token,
    msRefreshToken: exchange.refresh_token,
    mcAccessToken: minecraft.access_token,
    mcExpiresAt: Date.now() + minecraft.expires_in * 1000,
    name: profile.name,
    uuid: normalizeUuid(profile.id),
    xuid,
    skinUrl: activeSkin?.url,
    capes
  }
}

export async function microsoftLogin(
  parent: BrowserWindow | null,
  clientId: string,
  onProgress: Progress
): Promise<MicrosoftTokens> {
  const effectiveClientId = clientId || DEFAULT_CLIENT_ID
  const partition = 'persist:cozy-microsoft'
  const loginSession = session.fromPartition(partition)
  loginSession.setUserAgent(USER_AGENT)

  onProgress({ step: 'opening', message: 'Открываем окно входа Microsoft' })

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false
    const loginWindow = new BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 420,
      minHeight: 600,
      parent: parent ?? undefined,
      modal: Boolean(parent),
      show: false,
      autoHideMenuBar: true,
      title: 'Вход Microsoft — Cozy Launcher',
      backgroundColor: '#0b1512',
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })

    const timeout = setTimeout(() => {
      finish(new Error('Время ожидания входа Microsoft истекло'))
    }, 5 * 60 * 1000)

    const finish = (error: Error | null, value?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) {
        if (!loginWindow.isDestroyed()) loginWindow.close()
        reject(error)
      } else {
        resolve(value as string)
        setTimeout(() => {
          if (!loginWindow.isDestroyed()) loginWindow.close()
        }, 120)
      }
    }

    const handleUrl = (rawUrl: string, event?: Electron.Event): boolean => {
      const parsed = extractCode(rawUrl)
      if (!parsed.code && !parsed.error) return false
      event?.preventDefault()
      if (parsed.code) {
        onProgress({ step: 'waiting', message: 'Код получен, завершаем вход' })
        finish(null, parsed.code)
      } else {
        finish(new Error(parsed.error || 'Вход Microsoft отменён'))
      }
      return true
    }

    loginWindow.webContents.on('will-redirect', (event, url) => {
      handleUrl(url, event)
    })
    loginWindow.webContents.on('will-navigate', (event, url) => {
      handleUrl(url, event)
    })
    loginWindow.webContents.on('did-navigate', (_event, url) => {
      handleUrl(url)
    })
    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/login\.live\.com|microsoftonline\.com|microsoft\.com/.test(url)) {
        return { action: 'allow' }
      }
      shell.openExternal(url).catch(() => undefined)
      return { action: 'deny' }
    })
    loginWindow.once('ready-to-show', () => loginWindow.show())
    loginWindow.on('closed', () => {
      finish(new Error('Окно входа закрыто'))
    })

    loginWindow.loadURL(buildAuthUrl(effectiveClientId)).catch((error: Error) => {
      finish(new Error(`Не удалось открыть страницу Microsoft: ${error.message}`))
    })
    onProgress({ step: 'waiting', message: 'Войдите в аккаунт Microsoft в открывшемся окне' })
  })

  onProgress({ step: 'waiting', message: 'Обмениваем код на токены' })
  const exchange = await exchangeCode(code, effectiveClientId)
  return completeChain(exchange, onProgress)
}

export async function refreshMicrosoft(
  refreshToken: string,
  clientId: string,
  onProgress: Progress = () => undefined
): Promise<MicrosoftTokens> {
  const effectiveClientId = clientId || DEFAULT_CLIENT_ID
  const exchange = await refreshMsToken(refreshToken, effectiveClientId)
  return completeChain(exchange, onProgress)
}
