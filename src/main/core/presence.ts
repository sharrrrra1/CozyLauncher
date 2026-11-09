import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DiscordPresenceConfig } from '@shared/types'

/**
 * Discord Rich Presence для JorneyMC.
 *
 * Работаем напрямую с локальным Discord RPC через named pipe — без сторонних
 * библиотек. Протокол простой: 8-байтный заголовок (opcode + длина, оба
 * little-endian) и JSON-полезная нагрузка.
 *
 * ВАЖНО ДЛЯ ВЛАДЕЛЬЦА РЕПОЗИТОРИЯ:
 * создайте приложение на https://discord.com/developers/applications,
 * возьмите его Application ID и вставьте ниже вместо 'SET_ME'.
 * Пока стоит 'SET_ME', модуль полностью выключен и не делает ни одной
 * попытки подключения.
 */
const DISCORD_CLIENT_ID = 'SET_ME'

const LARGE_IMAGE = 'jorneymc'
const LARGE_TEXT = 'JorneyMC'

export interface ActivityInput {
  instanceName?: string
  versionId?: string
  startedAt?: number
}

export interface DiscordActivityPayload {
  details: string
  state: string
  timestamps: { start: number }
  assets: { large_image: string; large_text: string }
}

/**
 * Чистая сборка payload — её же проверяем в тестах.
 * Время Discord считает сам, поэтому отправляем unix-секунды начала игры.
 */
export function buildActivity(input: ActivityInput, now = Date.now()): DiscordActivityPayload {
  const startedAt =
    typeof input.startedAt === 'number' && Number.isFinite(input.startedAt) ? input.startedAt : now
  const instanceName = (input.instanceName ?? '').trim()
  const versionId = (input.versionId ?? '').trim()

  return {
    details: 'Играет в Minecraft',
    state: instanceName
      ? `Сборка «${instanceName}»`
      : versionId
        ? `Версия ${versionId}`
        : 'Minecraft',
    timestamps: { start: Math.floor(startedAt / 1000) },
    assets: { large_image: LARGE_IMAGE, large_text: LARGE_TEXT }
  }
}

function hasClientId(): boolean {
  return Boolean(DISCORD_CLIENT_ID) && DISCORD_CLIENT_ID !== 'SET_ME'
}

function pipePath(index: number): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\discord-ipc-${index}`
  }
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || os.tmpdir()
  return path.join(base, `discord-ipc-${index}`)
}

let enabled = false
let socket: net.Socket | null = null
let connecting = false
let ready = false
let buffer = Buffer.alloc(0)
let pendingActivity: DiscordActivityPayload | null = null
let readyTimer: NodeJS.Timeout | null = null

function clearReadyTimer(): void {
  if (readyTimer) {
    clearTimeout(readyTimer)
    readyTimer = null
  }
}

function sendFrame(opcode: number, data: unknown): void {
  if (!socket || socket.destroyed) return
  try {
    const payload = Buffer.from(JSON.stringify(data), 'utf8')
    const header = Buffer.alloc(8)
    header.writeUInt32LE(opcode, 0)
    header.writeUInt32LE(payload.length, 4)
    socket.write(Buffer.concat([header, payload]))
  } catch {
    // Молча: presence не должен ломать запуск игры.
  }
}

function sendActivity(activity: DiscordActivityPayload | null): void {
  sendFrame(2, {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity },
    nonce: randomUUID()
  })
}

function resetConnection(): void {
  clearReadyTimer()
  socket = null
  connecting = false
  ready = false
  buffer = Buffer.alloc(0)
}

function flushPending(): void {
  if (!pendingActivity) return
  sendActivity(pendingActivity)
}

function handleData(chunk: Buffer): void {
  buffer = Buffer.concat([buffer, chunk])
  while (buffer.length >= 8) {
    const opcode = buffer.readUInt32LE(0)
    const length = buffer.readUInt32LE(4)
    if (length > 8 * 1024 * 1024) {
      resetConnection()
      return
    }
    if (buffer.length < 8 + length) return
    const payload = buffer.subarray(8, 8 + length)
    buffer = buffer.subarray(8 + length)

    let data: unknown = null
    try {
      data = JSON.parse(payload.toString('utf8'))
    } catch {
      data = null
    }

    if (opcode === 3) {
      // Discord периодически пингует — обязательно отвечаем, иначе рвёт pipe.
      sendFrame(4, data ?? {})
    } else if (opcode === 1) {
      // READY от Discord: можно выставлять активность.
      ready = true
      clearReadyTimer()
      flushPending()
    }
  }
}

function attachSocket(candidate: net.Socket): void {
  socket = candidate
  connecting = false
  ready = false
  buffer = Buffer.alloc(0)

  candidate.on('data', handleData)
  candidate.on('error', () => {
    if (socket === candidate) resetConnection()
  })
  candidate.on('close', () => {
    if (socket === candidate) resetConnection()
  })

  sendFrame(0, { v: 1, client_id: DISCORD_CLIENT_ID })
  // На случай, если READY задержится: чуть подождём и всё равно попробуем.
  clearReadyTimer()
  readyTimer = setTimeout(() => {
    ready = true
    flushPending()
  }, 900)
  readyTimer.unref?.()
}

function tryPipe(index: number): void {
  if (!enabled) {
    connecting = false
    return
  }
  if (index < 0 || index > 10) {
    connecting = false
    return
  }

  const candidate = net.createConnection(pipePath(index))
  let settled = false
  let timer: NodeJS.Timeout | null = null

  const fail = (): void => {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    candidate.removeAllListeners()
    candidate.destroy()
    // По ТЗ перебираем 1..10, но Discord обычно открывает именно discord-ipc-0,
    // поэтому проверяем его последним — иначе на живом Discord можно не найти pipe.
    const next = index < 10 ? index + 1 : index === 10 ? 0 : -1
    if (next >= 0) {
      tryPipe(next)
    } else {
      connecting = false
    }
  }

  candidate.once('error', fail)
  candidate.once('connect', () => {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    candidate.removeListener('error', fail)
    attachSocket(candidate)
  })

  timer = setTimeout(() => {
    if (!settled) fail()
  }, 500)
  timer.unref?.()
}

function ensureConnection(): void {
  if (!enabled || !hasClientId()) return
  if (socket && !socket.destroyed) {
    if (ready) flushPending()
    return
  }
  if (connecting) return
  connecting = true
  tryPipe(1)
}

/** Включает/выключает presence и мгновенно убирает активность при выключении. */
export function setPresenceEnabled(value: boolean): void {
  enabled = Boolean(value) && hasClientId()

  if (!enabled) {
    pendingActivity = null
    // Сразу просим Discord убрать активность, но соединение не рвём:
    // если игрок включит обратно — переиспользуем его же.
    if (socket && ready) sendActivity(null)
  }
}

export function isPresenceEnabled(): boolean {
  return enabled && hasClientId()
}

/** Тихо: если Discord закрыт или pipe не открылся — просто ничего не делаем. */
export function setPresenceActivity(activity: DiscordActivityPayload): void {
  if (!isPresenceEnabled()) return
  pendingActivity = activity
  try {
    ensureConnection()
  } catch {
    // Никогда не бросаем наверх.
  }
}

export function clearPresenceActivity(): void {
  pendingActivity = null
  try {
    if (socket && ready) sendActivity(null)
  } catch {
    // Молча.
  }
}

/** Корректно закрываем pipe при выходе из лаунчера. */
export function shutdownPresence(): void {
  enabled = false
  pendingActivity = null
  clearReadyTimer()
  const current = socket
  resetConnection()
  if (current && !current.destroyed) {
    try {
      current.destroy()
    } catch {
      // Молча.
    }
  }
}

export function getPresenceConfig(): DiscordPresenceConfig {
  return { enabled: isPresenceEnabled(), clientId: DISCORD_CLIENT_ID }
}

/** Совместимость со старым API: clientId теперь константа в этом модуле. */
export function applyPresenceConfig(config: DiscordPresenceConfig): void {
  setPresenceEnabled(config.enabled)
}
