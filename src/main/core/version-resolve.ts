import type { Library, VersionJson } from './version'

export const MAX_INHERIT_DEPTH = 4

function libraryKey(library: Library): string {
  return library.name
}

function dedupeLibraries(libraries: Library[]): Library[] {
  const byName = new Map<string, Library>()
  for (const library of libraries) byName.set(libraryKey(library), library)
  return [...byName.values()]
}

/**
 * Merges a parent version with a child that declares `inheritsFrom`.
 * The child wins for scalar fields, libraries are concatenated (child last),
 * and launch arguments are appended (child last) so vanilla game args survive.
 */
export function mergeVersions(parent: VersionJson, child: VersionJson): VersionJson {
  const parentArgs = parent.arguments
  const childArgs = child.arguments
  const argumentsMerged =
    parentArgs || childArgs
      ? {
          game: [...(parentArgs?.game ?? []), ...(childArgs?.game ?? [])],
          jvm: [...(parentArgs?.jvm ?? []), ...(childArgs?.jvm ?? [])]
        }
      : undefined

  const childDownloads = child.downloads?.client?.url ? child.downloads : parent.downloads
  const childAssetIndex = child.assetIndex?.url ? child.assetIndex : parent.assetIndex

  return {
    ...parent,
    ...child,
    id: child.id,
    type: child.type || parent.type,
    mainClass: child.mainClass || parent.mainClass,
    assets: child.assets || parent.assets,
    assetIndex: childAssetIndex,
    downloads: childDownloads,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    logging: child.logging ?? parent.logging,
    releaseTime: child.releaseTime ?? parent.releaseTime,
    libraries: dedupeLibraries([...(parent.libraries ?? []), ...(child.libraries ?? [])]),
    arguments: argumentsMerged,
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
    clientVersionId: parent.clientVersionId ?? parent.id
  }
}

export class VersionCycleError extends Error {
  constructor(id: string) {
    super(`Цикл или слишком глубокая цепочка inheritsFrom у версии ${id}`)
    this.name = 'VersionCycleError'
  }
}

/**
 * Resolves a local version chain. `read` returns a raw local JSON or null when
 * the identifier is not present on disk. Depth is limited and repeats are
 * treated as a cycle.
 */
export function resolveInheritance(
  id: string,
  read: (versionId: string) => VersionJson | null,
  maxDepth = MAX_INHERIT_DEPTH
): VersionJson {
  const seen = new Set<string>()
  const chain: VersionJson[] = []

  let currentId: string | null = id
  while (currentId) {
    if (seen.has(currentId)) throw new VersionCycleError(id)
    seen.add(currentId)
    if (seen.size > maxDepth + 1) throw new VersionCycleError(id)

    const json = read(currentId)
    if (!json) {
      if (currentId === id) throw new Error(`Версия ${id} не найдена`)
      throw new Error(`Родительская версия ${currentId} не найдена`)
    }
    chain.push(json)
    currentId = json.inheritsFrom ?? null
  }

  let merged = chain[chain.length - 1]
  for (let index = chain.length - 2; index >= 0; index -= 1) {
    merged = mergeVersions(merged, chain[index])
  }
  return { ...merged, id }
}
