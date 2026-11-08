import { createHash } from 'node:crypto'

export const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

export function isValidNickname(name: string): boolean {
  return NICKNAME_PATTERN.test(name)
}

export function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function normalizeUuid(uuid: string): string {
  const clean = uuid.replace(/-/g, '').toLowerCase()
  if (clean.length !== 32) return uuid
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

export function randomClientId(): string {
  const hex = createHash('sha1').update(`${Date.now()}:${Math.random()}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
