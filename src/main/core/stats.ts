import fs from 'node:fs'
import path from 'node:path'
import type { PlaytimeStats } from '@shared/types'
import { ensureDir, launcherDataDir } from './paths'

/**
 * Учёт времени в игре.
 *
 * Данные лежат отдельно от settings.json — сюда мы пишем каждую минуту,
 * и настройки не должны дёргаться из-за этого. Формат:
 *   { perInstance: { [id сборки | 'vanilla']: msPlayed }, totalMs }
 *
 * Старый формат (массив sessions) читаем и аккуратно переводим в perInstance,
 * чтобы уже намотанные часы не потерялись после обновления.
 */

const VANILLA_KEY = 'vanilla'

interface LegacySession {
  instanceId?: string
  durationMs?: number
}

interface StoredStats extends PlaytimeStats {
  sessions?: LegacySession[]
}

function statsPath(): string {
  return path.join(launcherDataDir(), 'stats.json')
}

function emptyStats(): PlaytimeStats {
  return { totalMs: 0, perInstance: {}, lastUpdated: Date.now() }
}

function normalize(raw: unknown): PlaytimeStats {
  const parsed = (raw ?? null) as Partial<StoredStats> | null
  const perInstance: Record<string, number> = {}

  if (parsed?.perInstance && typeof parsed.perInstance === 'object') {
    for (const [key, value] of Object.entries(parsed.perInstance)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        perInstance[key] = Math.round(value)
      }
    }
  } else if (Array.isArray(parsed?.sessions)) {
    // Миграция со старого формата: sessions -> perInstance.
    for (const session of parsed.sessions) {
      const key = session.instanceId || VANILLA_KEY
      const duration = Number(session.durationMs)
      if (Number.isFinite(duration) && duration > 0) {
        perInstance[key] = (perInstance[key] ?? 0) + Math.round(duration)
      }
    }
  }

  const summed = Object.values(perInstance).reduce((sum, value) => sum + value, 0)
  const storedTotal = typeof parsed?.totalMs === 'number' && parsed.totalMs > 0 ? parsed.totalMs : 0
  return {
    // Если в старом файле totalMs был больше суммы сессий — не занижаем его.
    totalMs: Math.round(Math.max(storedTotal, summed)),
    perInstance,
    lastUpdated: typeof parsed?.lastUpdated === 'number' ? parsed.lastUpdated : Date.now()
  }
}

function readStats(): PlaytimeStats {
  try {
    return normalize(JSON.parse(fs.readFileSync(statsPath(), 'utf8')))
  } catch {
    return emptyStats()
  }
}

function writeStats(stats: PlaytimeStats): void {
  ensureDir(path.dirname(statsPath()))
  const temp = `${statsPath()}.tmp`
  fs.writeFileSync(temp, JSON.stringify(stats, null, 2), 'utf8')
  fs.renameSync(temp, statsPath())
}

export function getPlaytimeStats(): PlaytimeStats {
  return readStats()
}

/**
 * Добавляет наигранное время к сборке (или к 'vanilla').
 * Возвращает обновлённую статистику.
 */
export function addPlaytime(key: string, deltaMs: number): PlaytimeStats {
  const stats = readStats()
  if (!key || !Number.isFinite(deltaMs) || deltaMs <= 0) return stats

  const delta = Math.round(deltaMs)
  stats.perInstance[key] = (stats.perInstance[key] ?? 0) + delta
  stats.totalMs += delta
  stats.lastUpdated = Date.now()
  writeStats(stats)
  return stats
}

/** Сколько намотано в конкретной сборке (0 — если ещё не играли). */
export function getInstancePlaytimeMs(instanceId: string): number {
  return readStats().perInstance[instanceId] ?? 0
}

/** Сбрасывает статистику — на случай, если пользователь захочет начать с чистого листа. */
export function resetPlaytimeStats(): PlaytimeStats {
  const stats = emptyStats()
  writeStats(stats)
  return stats
}
