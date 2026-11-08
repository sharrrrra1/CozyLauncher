export interface PromoFile {
  schema: number
  status: 'open' | 'closed'
  title: string
  text: string
  features: string[]
  server: { mcVersion: string; address: string; port: number }
  updatedAt: string
}

export interface PromoConfig {
  status: 'online' | 'soon'
  ip: string
  port: number
  features: string[]
  mcVersion: string
  title: string
  subtitle: string
  bannerText: string
  buttonText: string
  updatedAt: number
}

export const BUILTIN_PROMO: PromoFile = {
  schema: 1,
  status: 'closed',
  title: 'CozyPOLIT',
  text: 'Политический сервер: города, экономика, парламент, осады',
  features: ['Города и нации (Towny)', '11 профессий', 'Осады городов'],
  server: { mcVersion: '1.21.4', address: '', port: 25565 },
  updatedAt: '2026-11-08'
}

export function isValidServerAddress(address: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/.test(address)
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

/** Strict parser: unknown status, bad address/port, or wrong schema are rejected. */
export function parsePromo(raw: unknown): PromoFile | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.schema !== 1) return null
  if (value.status !== 'open' && value.status !== 'closed') return null

  const title = cleanString(value.title, 80)
  const text = cleanString(value.text, 500)
  if (!title || !text) return null

  const features = Array.isArray(value.features)
    ? value.features
        .map((feature) => cleanString(feature, 120))
        .filter((feature): feature is string => Boolean(feature))
        .slice(0, 10)
    : []

  const server = (value.server ?? {}) as Record<string, unknown>
  const mcVersion = cleanString(server.mcVersion, 32)
  if (!mcVersion || !/^[A-Za-z0-9._-]+$/.test(mcVersion)) return null

  const address = typeof server.address === 'string' ? server.address.trim() : ''
  if (address && !isValidServerAddress(address)) return null
  if (value.status === 'open' && !address) return null

  const port = typeof server.port === 'number' ? server.port : Number(server.port)
  if (!isValidPort(port)) return null

  const updatedAt = cleanString(value.updatedAt, 40) ?? ''

  return {
    schema: 1,
    status: value.status,
    title,
    text,
    features,
    server: { mcVersion, address, port },
    updatedAt
  }
}

export function promoToConfig(promo: PromoFile): PromoConfig {
  const open = promo.status === 'open'
  return {
    title: promo.title,
    subtitle: open ? 'Сервер уже открыт!' : 'Открытие скоро',
    ip: promo.server.address,
    port: promo.server.port,
    status: open ? 'online' : 'soon',
    bannerText: promo.text,
    buttonText: 'Играть на CozyPOLIT',
    features: promo.features,
    mcVersion: promo.server.mcVersion,
    updatedAt: Date.parse(promo.updatedAt) || Date.now()
  }
}
