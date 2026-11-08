import path from 'node:path'
import { rulesAllow, type Rule, type RuleContext } from './rules'

export interface DownloadInfo {
  path?: string
  sha1?: string
  size?: number
  url: string
}

export interface Library {
  name: string
  downloads?: {
    artifact?: DownloadInfo
    classifiers?: Record<string, DownloadInfo>
  }
  rules?: Rule[]
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
}

export interface VersionJson {
  id: string
  type: string
  mainClass: string
  releaseTime?: string
  assets: string
  assetIndex: {
    id: string
    sha1?: string
    size?: number
    totalSize?: number
    url: string
  }
  downloads: {
    client: DownloadInfo
    server?: DownloadInfo
  }
  javaVersion?: {
    component: string
    majorVersion: number
  }
  libraries: Library[]
  logging?: {
    client?: {
      argument: string
      file: { id: string; url: string; sha1?: string; size?: number }
      type: string
    }
  }
  arguments?: {
    game?: LaunchArgument[]
    jvm?: LaunchArgument[]
  }
  minecraftArguments?: string
  /** Local Fabric-style profiles inherit everything from a parent version. */
  inheritsFrom?: string
  /** Set by the launcher when the profile inherits its client jar from a parent. */
  clientVersionId?: string
  /** Marks versions created by the mod catalog (run folder isolation). */
  cozyModded?: boolean
  cozyMcVersion?: string
  cozyFabricLoader?: string
}

export type LaunchArgument =
  | string
  | {
      rules?: Rule[]
      value: string | string[]
    }

export interface MavenName {
  group: string
  artifact: string
  version: string
  classifier?: string
  extension: string
}

export function parseMavenName(name: string): MavenName {
  const [coords, ext] = name.split('@')
  const parts = coords.split(':')
  return {
    group: parts[0] ?? '',
    artifact: parts[1] ?? '',
    version: parts[2] ?? '',
    classifier: parts[3],
    extension: ext ?? 'jar'
  }
}

export function isNativeClassifier(classifier: string | undefined): boolean {
  return Boolean(classifier && classifier.startsWith('natives-'))
}

function nativeMatchesArch(classifier: string, ctx: RuleContext): boolean {
  const isArm = classifier.endsWith('-arm64')
  if (ctx.osArch === 'arm64') return isArm
  return !isArm
}

export function selectLibraries(libraries: Library[], ctx: RuleContext): Library[] {
  return libraries.filter((library) => {
    if (!rulesAllow(library.rules, ctx)) return false
    const { classifier } = parseMavenName(library.name)
    if (isNativeClassifier(classifier) && !nativeMatchesArch(classifier as string, ctx)) {
      return false
    }
    return true
  })
}

export function libraryArtifact(library: Library): DownloadInfo | undefined {
  return library.downloads?.artifact
}

export function classpathLibraries(libraries: Library[]): Library[] {
  return libraries.filter((library) => Boolean(library.downloads?.artifact))
}

export function dedupeClasspath(libraries: Library[]): Library[] {
  const byKey = new Map<string, Library>()
  for (const library of libraries) {
    const maven = parseMavenName(library.name)
    const key = `${maven.group}:${maven.artifact}:${maven.classifier ?? ''}`
    byKey.set(key, library)
  }
  return [...byKey.values()]
}

export function buildClasspath(libraries: Library[], librariesDir: string): string {
  return dedupeClasspath(classpathLibraries(libraries))
    .map((library) => {
      const artifact = libraryArtifact(library)
      const relative = artifact?.path ?? mavenPath(library.name)
      return path.join(librariesDir, ...relative.split('/'))
    })
    .join(path.delimiter)
}

export function buildClientClasspath(
  clientJar: string,
  libraries: Library[],
  librariesDir: string
): string {
  return [clientJar, buildClasspath(libraries, librariesDir)].filter(Boolean).join(path.delimiter)
}

export function mavenPath(name: string): string {
  const maven = parseMavenName(name)
  const file = `${maven.artifact}-${maven.version}${maven.classifier ? `-${maven.classifier}` : ''}.${maven.extension}`
  return `${maven.group.replace(/\./g, '/')}/${maven.artifact}/${maven.version}/${file}`
}

export interface LegacyNative {
  library: Library
  jarPath: string
  download: DownloadInfo
  exclude: string[]
}

export function legacyNatives(
  libraries: Library[],
  ctx: RuleContext,
  librariesDir: string
): LegacyNative[] {
  const natives: LegacyNative[] = []
  for (const library of libraries) {
    if (!library.natives) continue
    const rawClassifier = library.natives[ctx.osName]
    if (!rawClassifier) continue
    const classifier = rawClassifier.replace(
      '${arch}',
      ctx.osArch === 'x64' ? '64' : ctx.osArch === 'x86' ? '32' : ctx.osArch
    )
    const download = library.downloads?.classifiers?.[classifier]
    if (!download) continue
    const maven = parseMavenName(library.name)
    const relative =
      download.path ??
      `${maven.group.replace(/\./g, '/')}/${maven.artifact}/${maven.version}/${maven.artifact}-${maven.version}-${classifier}.jar`
    natives.push({
      library,
      jarPath: path.join(librariesDir, ...relative.split('/')),
      download,
      exclude: library.extract?.exclude ?? ['META-INF/']
    })
  }
  return natives
}
