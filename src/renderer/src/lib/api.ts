import type { CozyApi } from '@shared/types'

export const api: CozyApi = window.cozy

export function formatError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^Invalid package name[^:]*:\s*/i, '')
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exp
  const digits = value >= 100 || exp === 0 ? 0 : value >= 10 ? 1 : 2
  const formatted = value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
  return `${formatted} ${units[exp]}`
}

export function formatSpeed(bytesPerSecond: number | undefined): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return ''
  return `${formatBytes(bytesPerSecond)}/с`
}

export function formatCount(value: number | undefined): string {
  if (value === undefined) return '—'
  return value.toLocaleString('ru-RU')
}

const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

export function formatDate(input: string | number | undefined): string {
  if (!input) return '—'
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return '—'
  return DATE_FORMAT.format(date)
}

export function formatRelative(input: number | undefined): string {
  if (!input) return '—'
  const diff = Date.now() - input
  if (diff < 60_000) return 'только что'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} дн назад`
  return formatDate(input)
}

export const VERSION_TYPE_LABEL: Record<string, string> = {
  release: 'Релиз',
  snapshot: 'Снапшот',
  old_beta: 'Бета',
  old_alpha: 'Альфа'
}

export function versionTypeLabel(type: string | undefined): string {
  if (!type) return 'Версия'
  return VERSION_TYPE_LABEL[type] ?? type
}

export function shortUuid(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 12)
}

export function assetUrl(path: string): string {
  return new URL(path, window.location.href).toString()
}
