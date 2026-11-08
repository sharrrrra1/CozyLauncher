import fs from 'node:fs'
import path from 'node:path'
import type { ServerConfig } from '@shared/types'
import { ensureDir, launcherDataDir } from './paths'
import {
  BUILTIN_PROMO,
  parsePromo,
  promoToConfig,
  type PromoFile
} from './promo-schema'

const PROMO_URL =
  'https://raw.githubusercontent.com/sharrrrra1/CozyLauncher/main/cozypolit.json'
const CACHE_TTL = 30 * 60 * 1000

export {
  parsePromo,
  promoToConfig,
  isValidServerAddress,
  isValidPort,
  type PromoFile
} from './promo-schema'

function cachePath(): string {
  return path.join(launcherDataDir(), 'news-cache.json')
}

function readCache(): { at: number; promo: PromoFile } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as {
      at: number
      promo: PromoFile
    }
    return parsed?.promo ? parsed : null
  } catch {
    return null
  }
}

function writeCache(promo: PromoFile): void {
  try {
    ensureDir(path.dirname(cachePath()))
    fs.writeFileSync(cachePath(), JSON.stringify({ at: Date.now(), promo }), 'utf8')
  } catch {
    // best-effort cache
  }
}

/** Network failure must never break the launcher: cache first, builtin last. */
export async function getServerConfig(): Promise<ServerConfig> {
  const cached = readCache()
  if (cached && Date.now() - cached.at < CACHE_TTL) return promoToConfig(cached.promo)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(PROMO_URL, {
      headers: {
        'User-Agent': 'CozyLauncher/1.1.0 (+https://github.com/sharrrrra1/CozyLauncher)'
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timer))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const parsed = parsePromo(await response.json())
    if (!parsed) throw new Error('Некорректный cozypolit.json')
    writeCache(parsed)
    return promoToConfig(parsed)
  } catch {
    return promoToConfig(cached?.promo ?? BUILTIN_PROMO)
  }
}

export function builtinServerConfig(): ServerConfig {
  return promoToConfig(BUILTIN_PROMO)
}
