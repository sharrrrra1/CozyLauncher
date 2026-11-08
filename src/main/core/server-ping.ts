import net from 'node:net'

export interface ServerStatus {
  host: string
  port: number
  online: boolean
  latencyMs?: number
  version?: string
  protocol?: number
  players?: { online: number; max: number }
  motd?: string
  favicon?: string
  error?: string
}

function varInt(value: number): Buffer {
  const bytes: number[] = []
  let current = value >>> 0
  do {
    let byte = current & 0x7f
    current >>>= 7
    if (current !== 0) byte |= 0x80
    bytes.push(byte)
  } while (current !== 0)
  return Buffer.from(bytes)
}

function packet(payload: Buffer): Buffer {
  return Buffer.concat([varInt(payload.length), payload])
}

function mcString(value: string): Buffer {
  const data = Buffer.from(value, 'utf8')
  return Buffer.concat([varInt(data.length), data])
}

function readVarInt(buffer: Buffer, offset: number): { value: number; size: number } | null {
  let value = 0
  let size = 0
  for (;;) {
    if (offset + size >= buffer.length) return null
    const byte = buffer[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size += 1
    if ((byte & 0x80) === 0) return { value, size }
    if (size > 5) throw new Error('Некорректный VarInt')
  }
}

function flattenMotd(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattenMotd).join('')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text : ''
    const translate = typeof record.translate === 'string' ? record.translate : ''
    const extra = Array.isArray(record.extra) ? record.extra.map(flattenMotd).join('') : ''
    return `${text}${translate}${extra}`
  }
  return ''
}

export function stripFormatting(input: string): string {
  return input
    .replace(/§[0-9a-fk-or]/gi, '')
    .replace(/\r/g, '')
    .trim()
}

export function parseStatusJson(
  raw: string,
  host: string,
  port: number,
  latencyMs?: number
): ServerStatus {
  try {
    const data = JSON.parse(raw) as {
      version?: { name?: string; protocol?: number }
      players?: { online?: number; max?: number }
      description?: unknown
      favicon?: string
    }
    const favicon =
      typeof data.favicon === 'string' && data.favicon.startsWith('data:image/png;base64,')
        ? data.favicon
        : undefined
    return {
      host,
      port,
      online: true,
      latencyMs,
      version: data.version?.name,
      protocol: data.version?.protocol,
      players: {
        online: Number(data.players?.online ?? 0),
        max: Number(data.players?.max ?? 0)
      },
      motd: stripFormatting(flattenMotd(data.description)),
      favicon
    }
  } catch {
    return { host, port, online: false, error: 'Сервер вернул некорректный ответ' }
  }
}

/** Minecraft Server List Ping (1.7+). Uses protocol 769 (1.21.4); status ignores it. */
export function pingServer(host: string, port = 25565, timeoutMs = 5000): Promise<ServerStatus> {
  return new Promise((resolve) => {
    let settled = false
    let received = Buffer.alloc(0)
    const startedAt = Date.now()

    const socket = net.createConnection({ host, port })
    const finish = (status: ServerStatus): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(status)
    }

    const timer = setTimeout(() => {
      finish({ host, port, online: false, error: 'Превышено время ожидания' })
    }, timeoutMs)

    socket.on('connect', () => {
      const handshake = Buffer.concat([
        Buffer.from([0x00]),
        varInt(769),
        mcString(host),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        varInt(1)
      ])
      socket.write(packet(handshake))
      socket.write(packet(Buffer.from([0x00])))
    })

    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk])
      try {
        const length = readVarInt(received, 0)
        if (!length) return
        if (received.length < length.size + length.value) return
        if (length.value > 4 * 1024 * 1024) {
          finish({ host, port, online: false, error: 'Слишком большой ответ сервера' })
          return
        }
        const body = received.subarray(length.size, length.size + length.value)
        const packetId = readVarInt(body, 0)
        if (!packetId || packetId.value !== 0x00) {
          finish({ host, port, online: false, error: 'Неожиданный пакет статуса' })
          return
        }
        const strLength = readVarInt(body, packetId.size)
        if (!strLength) return
        const start = packetId.size + strLength.size
        const json = body.subarray(start, start + strLength.value).toString('utf8')
        finish(parseStatusJson(json, host, port, Date.now() - startedAt))
      } catch (error) {
        finish({
          host,
          port,
          online: false,
          error: error instanceof Error ? error.message : 'Ошибка чтения ответа'
        })
      }
    })

    socket.on('error', (error) => {
      finish({ host, port, online: false, error: error.message })
    })

    socket.on('close', () => {
      if (!settled) finish({ host, port, online: false, error: 'Соединение закрыто' })
    })
  })
}
