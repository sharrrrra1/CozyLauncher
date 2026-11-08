export type DownloadMirror = 'official' | 'bmclapi'

const BMCL_HOST = 'bmclapi2.bangbang93.com'

/**
 * Rewrites official Mojang download URLs to the BMCLAPI mirror.
 * Non-Mojang URLs (Modrinth, Fabric maven, ...) are returned unchanged.
 */
export function applyMirror(raw: string, mirror: DownloadMirror): string {
  if (mirror !== 'bmclapi') return raw
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }

  switch (url.hostname) {
    case 'launchermeta.mojang.com':
    case 'piston-data.mojang.com':
    case 'launcher.mojang.com':
      url.hostname = BMCL_HOST
      return url.toString()
    case 'piston-meta.mojang.com': {
      // /v1/packages/<sha>/<version>.json -> /version/<version>/json
      const match = url.pathname.match(/^\/v1\/packages\/[^/]+\/([^/]+)\.json$/)
      url.hostname = BMCL_HOST
      if (match) url.pathname = `/version/${match[1]}/json`
      return url.toString()
    }
    case 'libraries.minecraft.net':
      url.hostname = BMCL_HOST
      return url.toString()
    case 'resources.download.minecraft.net':
      url.hostname = BMCL_HOST
      url.pathname = `/assets${url.pathname}`
      return url.toString()
    default:
      return raw
  }
}

/** All URLs worth trying for a download, most preferred first. */
export function mirrorCandidates(raw: string, mirror: DownloadMirror): string[] {
  const mirrored = applyMirror(raw, mirror)
  if (mirrored === raw) return [raw]
  // Keep the official URL as a fallback if the mirror is down or out of date.
  return [mirrored, raw]
}

export function isMojangUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname
    return host.endsWith('.mojang.com') || host.endsWith('.minecraft.net')
  } catch {
    return false
  }
}
