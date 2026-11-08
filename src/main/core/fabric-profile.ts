import type { Library, VersionJson } from './version'
import { mavenPath } from './version'

export const FABRIC_MAVEN = 'https://maven.fabricmc.net/'

export interface FabricLibraryEntry {
  name: string
  url?: string
  sha1?: string
  size?: number
}

export interface FabricMetaEntry {
  loader: { version: string; maven: string; stable?: boolean }
  intermediary: { version: string; maven: string }
  launcherMeta: {
    mainClass: { client: string }
    libraries: {
      client?: FabricLibraryEntry[]
      common?: FabricLibraryEntry[]
      server?: FabricLibraryEntry[]
    }
  }
}

export function fabricVersionId(mcVersion: string, loaderVersion: string): string {
  const id = `${mcVersion}-fabric-loader-${loaderVersion}`
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Некорректный идентификатор Fabric-версии')
  return id
}

function fabricLibrary(entry: FabricLibraryEntry): Library {
  const relative = mavenPath(entry.name)
  const base = entry.url ?? FABRIC_MAVEN
  return {
    name: entry.name,
    downloads: {
      artifact: {
        path: relative,
        url: `${base.replace(/\/$/, '')}/${relative}`,
        sha1: entry.sha1,
        size: entry.size
      }
    }
  }
}

export function mavenLibrary(maven: string): Library {
  const relative = mavenPath(maven)
  return {
    name: maven,
    downloads: {
      artifact: {
        path: relative,
        url: `${FABRIC_MAVEN}${relative}`
      }
    }
  }
}

/**
 * Builds a Fabric version JSON that inherits from vanilla. `launcherMeta` does
 * not contain fabric-loader or intermediary, so they are added explicitly.
 */
export function synthesizeFabricProfile(mcVersion: string, meta: FabricMetaEntry): VersionJson {
  const id = fabricVersionId(mcVersion, meta.loader.version)
  const libraries = [
    ...(meta.launcherMeta.libraries.common ?? []).map(fabricLibrary),
    mavenLibrary(meta.loader.maven),
    mavenLibrary(meta.intermediary.maven)
  ]

  return {
    id,
    type: 'release',
    mainClass: meta.launcherMeta.mainClass.client,
    assets: '',
    assetIndex: { id: '', url: '' },
    downloads: { client: { url: '' } },
    libraries,
    inheritsFrom: mcVersion,
    cozyModded: true,
    cozyMcVersion: mcVersion,
    cozyFabricLoader: meta.loader.version
  }
}
