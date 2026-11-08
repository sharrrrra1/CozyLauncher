export type VersionKind = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

export interface VersionSummary {
  id: string
  type: VersionKind | string
  releaseTime: string
  url: string
  sha1?: string
  complianceLevel?: number
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: VersionSummary[]
}

export interface FeaturedVersion {
  id: string
  tagline: string
  badge: string
}

export interface VersionStatus {
  id: string
  installed: boolean
  installedAt?: number
  versionType?: string
  releaseTime?: string
  sizeBytes?: number
}

export type AccentName = 'emerald' | 'amber' | 'frost' | 'rose'

export interface Settings {
  ramMb: number
  javaMode: 'auto' | 'custom'
  javaPath: string
  gameDir: string
  width: number
  height: number
  fullscreen: boolean
  customResolution: boolean
  jvmArgs: string
  accent: AccentName
  animations: boolean
  closeOnLaunch: boolean
  msClientId: string
  lastVersion: string
  lastAccountId: string
  updateServerUrl?: string
  downloadMirror: 'official' | 'bmclapi'
  proxyUrl: string
}

export interface Account {
  id: string
  type: 'offline' | 'microsoft'
  name: string
  uuid: string
  skinUrl?: string
  xuid?: string
  createdAt: number
  needsReauth?: boolean
  mcTokenExpiresAt?: number
}

export interface SystemInfo {
  totalMemMb: number
  freeMemMb: number
  cpuModel: string
  cores: number
  platform: string
  arch: string
  appVersion: string
  electron: string
}

export interface JavaInfo {
  path: string
  major: number
  version: string
  source: 'mojang' | 'system' | 'custom'
}

export interface VersionMeta {
  id: string
  javaMajor: number
  javaComponent: string
  clientSize: number
  assetSize: number
  totalSize: number
}

export type InstallPhase =
  | 'preparing'
  | 'client'
  | 'libraries'
  | 'assets'
  | 'natives'
  | 'java'
  | 'done'
  | 'error'
  | 'cancelled'

export interface InstallProgress {
  versionId: string
  phase: InstallPhase
  label: string
  done: number
  total: number
  bytes: number
  totalBytes: number
  speed: number
  file?: string
  message?: string
}

export type LaunchPhase =
  | 'preparing'
  | 'java'
  | 'starting'
  | 'running'
  | 'exited'
  | 'error'
  | 'stopped'

export interface LaunchState {
  phase: LaunchPhase
  versionId: string
  instanceId?: string
  message?: string
  pid?: number
  code?: number | null
}

export interface LogLine {
  time: number
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  versionId?: string
}

export type AuthStep =
  | 'opening'
  | 'waiting'
  | 'xbox'
  | 'minecraft'
  | 'profile'
  | 'done'
  | 'error'

export interface AuthProgress {
  step: AuthStep
  message: string
  account?: Account
}

export interface CozyApi {
  system: {
    info(): Promise<SystemInfo>
  }
  window: {
    minimize(): void
    maximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(cb: (maximized: boolean) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
    chooseJava(): Promise<string | null>
    chooseGameDir(): Promise<string | null>
  }
  versions: {
    manifest(): Promise<VersionManifest>
    featured(): Promise<FeaturedVersion[]>
    status(id: string): Promise<VersionStatus>
    statuses(ids: string[]): Promise<Record<string, VersionStatus>>
    install(id: string): Promise<VersionStatus>
    cancel(id: string): Promise<void>
    remove(id: string): Promise<void>
    meta(id: string): Promise<VersionMeta>
    onProgress(cb: (progress: InstallProgress) => void): () => void
  }
  java: {
    detect(): Promise<JavaInfo[]>
  }
  accounts: {
    list(): Promise<Account[]>
    current(): Promise<Account | null>
    addOffline(name: string): Promise<Account>
    addMicrosoft(): Promise<Account>
    remove(id: string): Promise<Account[]>
    select(id: string): Promise<Account[]>
    refresh(id: string): Promise<Account>
    head(id: string): Promise<string | null>
    onAuth(cb: (progress: AuthProgress) => void): () => void
  }
  launch: {
    start(versionId: string, instanceId?: string, safeMode?: boolean): Promise<void>
    stop(): Promise<void>
    logs(): Promise<LogLine[]>
    onState(cb: (state: LaunchState) => void): () => void
    onLog(cb: (line: LogLine) => void): () => void
    onCrash(cb: (crash: CrashInfo) => void): () => void
  }
  shell: {
    openExternal(url: string): Promise<void>
    openPath(target: string): Promise<void>
  }
  app: {
    version: string
  }
  updates: {
    check(): Promise<{ available: boolean; version?: string; notes?: string } | null>
    download(): Promise<void>
    quitAndInstall(): void
    onStatus(cb: (status: UpdateStatus) => void): () => void
    onProgress(cb: (progress: UpdateProgress) => void): () => void
  }
  mods: {
    search(query: string, gameVersion?: string): Promise<ModSearchResult[]>
    versions(projectId: string, gameVersion?: string): Promise<ModVersion[]>
    preview(
      projectId: string,
      versionId: string,
      gameVersion: string,
      optionalProjectIds?: string[]
    ): Promise<ModInstallPlan>
    install(
      projectId: string,
      versionId: string,
      gameVersion: string,
      optionalProjectIds?: string[],
      instanceId?: string
    ): Promise<void>
    listInstalled(gameVersionId: string, instanceId?: string): Promise<InstalledMod[]>
    remove(gameVersionId: string, filename: string, instanceId?: string): Promise<void>
    toggle(
      gameVersionId: string,
      filename: string,
      enabled: boolean,
      instanceId?: string
    ): Promise<void>
    checkUpdates(gameVersionId: string, instanceId?: string): Promise<ModUpdate[]>
    updateAll(gameVersionId: string, instanceId?: string): Promise<number>
    installPack(): Promise<{ name: string; files: number } | null>
    onProgress(cb: (progress: InstallProgress) => void): () => void
    onLog(cb: (line: string) => void): () => void
  }
  server: {
    config(): Promise<ServerConfig>
    play(versionId: string, host: string, port: number, instanceId?: string): Promise<void>
  }
  instances: {
    list(): Promise<Instance[]>
    create(input: CreateInstanceInput): Promise<Instance>
    update(
      id: string,
      patch: Partial<Pick<Instance, 'name' | 'versionId' | 'loader' | 'ramMb' | 'javaPath'>>
    ): Promise<Instance>
    remove(id: string): Promise<void>
    clone(id: string, name?: string): Promise<Instance>
    openFolder(id: string): Promise<void>
    launch(id: string, safeMode?: boolean): Promise<void>
  }
  crash: {
    safeMode(crashId: string): Promise<void>
    addMemory(crashId: string): Promise<void>
    disableLastMod(crashId: string): Promise<void>
    openReport(crashId: string): Promise<void>
    copyReport(crashId: string): Promise<string>
    uploadReport(crashId: string): Promise<string>
  }
  servers: {
    list(): Promise<ServerEntry[]>
    add(input: { name?: string; address: string; port?: number }): Promise<ServerEntry>
    update(id: string, patch: Partial<Pick<ServerEntry, 'name' | 'favorite'>>): Promise<ServerEntry>
    remove(id: string): Promise<void>
    ping(host: string, port: number): Promise<ServerStatus>
    pingAll(): Promise<Record<string, ServerStatus>>
    import(): Promise<{ imported: number; skipped: number; files: string[] }>
    join(host: string, port: number, versionId: string, instanceId?: string): Promise<void>
  }
  imports: {
    scan(): Promise<ImportScan>
    connect(candidateId: string, name: string, versionId: string, loader?: 'vanilla' | 'fabric'): Promise<Instance>
    useVanilla(): Promise<string>
    accounts(): Promise<{ imported: string[]; skipped: number }>
  }
}

export type UpdateStatus = 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error'

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

export interface ModSearchResult {
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl?: string
  downloads: number
  source: 'modrinth' | 'curseforge' | 'other'
}

export interface ModVersion {
  versionId: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  filename: string
  url: string
  size: number
  sha1?: string
  source: 'modrinth' | 'curseforge' | 'other'
}

export interface InstalledMod {
  filename: string
  projectId?: string
  versionNumber?: string
  size: number
  enabled: boolean
  title?: string
  sha1?: string
}

export interface ModDependency {
  projectId: string
  versionId: string | null
  type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

export interface ModInstallFile {
  projectId: string
  title: string
  versionNumber: string
  versionId: string
  filename: string
  url: string
  size: number
  sha1?: string
  sha512?: string
  reason: string
}

export interface ModInstallPlan {
  files: ModInstallFile[]
  totalSize: number
  optional: Array<{
    projectId: string
    title: string
    versionNumber: string
    size: number
  }>
  blocked: string[]
}

export interface ModUpdate {
  projectId: string
  title: string
  currentVersion: string
  latestVersion: string
  versionId: string
  filename: string
}

export interface ServerConfig {
  title: string
  subtitle: string
  ip: string
  port: number
  status: 'online' | 'offline' | 'soon'
  bannerText: string
  bannerUrl?: string
  buttonText: string
  updatedAt: number
  features: string[]
  mcVersion: string
}

export interface Instance {
  id: string
  name: string
  versionId: string
  loader: 'vanilla' | 'fabric'
  dir: string
  external: boolean
  ramMb?: number
  javaPath?: string
  createdAt: number
  lastPlayedAt?: number
  modsCount?: number
}

export interface CreateInstanceInput {
  name: string
  versionId: string
  loader?: 'vanilla' | 'fabric'
  ramMb?: number
  javaPath?: string
  externalDir?: string
}

export interface ServerEntry {
  id: string
  name: string
  host: string
  port: number
  favorite: boolean
  createdAt: number
  lastPlayedAt?: number
  icon?: string
}

export interface ServerStatus {
  host: string
  port: number
  online: boolean
  latencyMs?: number
  version?: string
  protocol?: number
  players?: { online: number; max: number }
  motd?: string
  favicon?: string
  error?: string
}

export interface ImportCandidate {
  id: string
  launcher: string
  name: string
  gameDir: string
  mcVersion?: string
  modsCount: number
  hasSaves: boolean
  hasServers: boolean
}

export interface ImportScan {
  vanilla: {
    gameDir: string
    versions: number
    exists: boolean
    isCurrent: boolean
  }
  candidates: ImportCandidate[]
  accountNames: string[]
}

export type CrashRecommendation =
  | 'more-memory'
  | 'safe-mode'
  | 'disable-last-mod'
  | 'fix-java'
  | 'update-drivers'
  | 'check-mod-dependency'
  | 'none'

export interface CrashInfo {
  id: string
  versionId: string
  instanceId?: string
  createdAt: number
  exitCode: number | null
  title: string
  summary: string
  details: string[]
  hints: string[]
  recommendation: CrashRecommendation
  suspects: string[]
  signature?: string
  reportPath?: string
  logPath?: string
  memoryMb: number
  modsCount: number
}

