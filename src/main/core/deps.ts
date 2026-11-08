import type { ModDependency } from '@shared/types'

export interface DepVersion {
  id: string
  projectId: string
  versionNumber: string
  filename: string
  url: string
  size: number
  sha1?: string
  sha512?: string
  dependencies: ModDependency[]
}

export interface DepProject {
  title: string
  versions: DepVersion[]
}

export interface ResolvedFile extends DepVersion {
  title: string
  reason: string
  dependencyType: ModDependency['type'] | 'root'
}

export interface OptionalCandidate {
  projectId: string
  title: string
  versionNumber: string
  size: number
}

export interface ResolveResult {
  files: ResolvedFile[]
  optional: OptionalCandidate[]
  blocked: string[]
}

export interface ResolveOptions {
  root: DepVersion
  rootTitle: string
  /** Must return versions already filtered by game version + Fabric loader, newest first. */
  loadProject(projectId: string): Promise<DepProject | null>
  includeOptional?: string[]
  maxFiles?: number
  maxBytes?: number
}

export const MAX_MOD_FILES = 60
export const MAX_MOD_BYTES = 400 * 1024 * 1024

interface QueueItem {
  version: DepVersion
  title: string
  reason: string
  dependencyType: ResolvedFile['dependencyType']
}

/**
 * Breadth-first closure over required dependencies.
 * `incompatible` blocks the whole install, `embedded` is skipped,
 * `optional` is only followed when the project id is explicitly included.
 */
export async function resolveDependencies(options: ResolveOptions): Promise<ResolveResult> {
  const maxFiles = options.maxFiles ?? MAX_MOD_FILES
  const maxBytes = options.maxBytes ?? MAX_MOD_BYTES
  const includeOptional = new Set(options.includeOptional ?? [])

  const files: ResolvedFile[] = []
  const optionalMap = new Map<string, OptionalCandidate>()
  const blocked: string[] = []
  const seenProjects = new Set<string>()
  const seenVersions = new Set<string>()
  const queue: QueueItem[] = [
    {
      version: options.root,
      title: options.rootTitle,
      reason: 'Выбранный мод',
      dependencyType: 'root'
    }
  ]

  const checkLimits = (): void => {
    if (files.length > maxFiles) {
      throw new Error(`Слишком много файлов: ${files.length} (лимит ${maxFiles})`)
    }
    const total = files.reduce((sum, file) => sum + file.size, 0)
    if (total > maxBytes) {
      throw new Error(
        `Слишком большой объём: ${Math.round(total / 1024 / 1024)} МБ (лимит ${Math.round(maxBytes / 1024 / 1024)} МБ)`
      )
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()!
    if (seenVersions.has(item.version.id)) continue
    seenVersions.add(item.version.id)
    seenProjects.add(item.version.projectId)

    files.push({
      ...item.version,
      title: item.title,
      reason: item.reason,
      dependencyType: item.dependencyType
    })
    checkLimits()

    for (const dependency of item.version.dependencies ?? []) {
      if (!dependency.projectId) continue
      if (dependency.type === 'embedded') continue

      if (dependency.type === 'incompatible') {
        blocked.push(
          `${item.title} несовместим с проектом ${dependency.projectId}. Установка отменена.`
        )
        continue
      }

      if (dependency.type === 'optional') {
        if (seenProjects.has(dependency.projectId)) continue
        if (!includeOptional.has(dependency.projectId)) {
          if (!optionalMap.has(dependency.projectId)) {
            const project = await options.loadProject(dependency.projectId).catch(() => null)
            const version = project?.versions[0]
            if (project && version) {
              optionalMap.set(dependency.projectId, {
                projectId: dependency.projectId,
                title: project.title,
                versionNumber: version.versionNumber,
                size: version.size
              })
            }
          }
          continue
        }
      }

      if (seenProjects.has(dependency.projectId)) continue

      const project = await options.loadProject(dependency.projectId)
      const version = project?.versions[0]
      if (!project || !version) {
        throw new Error(
          `Не найдена совместимая версия зависимости ${dependency.projectId} для ${item.title}`
        )
      }
      seenProjects.add(dependency.projectId)
      queue.push({
        version,
        title: project.title,
        reason: `Требуется для ${item.title}`,
        dependencyType: dependency.type === 'optional' ? 'optional' : 'required'
      })
    }
  }

  return { files, optional: [...optionalMap.values()], blocked }
}
