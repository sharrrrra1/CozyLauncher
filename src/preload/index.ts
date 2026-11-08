import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AuthProgress,
  CozyApi,
  CrashInfo,
  InstallProgress,
  LaunchState,
  LogLine,
  Settings,
  VersionManifest,
  VersionStatus
} from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CozyApi = {
  system: {
    info: () => ipcRenderer.invoke('system:info')
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (cb) => subscribe('window:maximized', cb)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    chooseJava: () => ipcRenderer.invoke('settings:choose-java'),
    chooseGameDir: () => ipcRenderer.invoke('settings:choose-game-dir')
  },
  versions: {
    manifest: () => ipcRenderer.invoke('versions:manifest'),
    featured: () => ipcRenderer.invoke('versions:featured'),
    status: (id) => ipcRenderer.invoke('versions:status', id),
    statuses: (ids) => ipcRenderer.invoke('versions:statuses', ids),
    install: (id) => ipcRenderer.invoke('versions:install', id),
    cancel: (id) => ipcRenderer.invoke('versions:cancel', id),
    remove: (id) => ipcRenderer.invoke('versions:remove', id),
    meta: (id) => ipcRenderer.invoke('versions:meta', id),
    onProgress: (cb) => subscribe<InstallProgress>('versions:progress', cb)
  },
  java: {
    detect: () => ipcRenderer.invoke('java:detect')
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    current: () => ipcRenderer.invoke('accounts:current'),
    addOffline: (name) => ipcRenderer.invoke('accounts:add-offline', name),
    addMicrosoft: () => ipcRenderer.invoke('accounts:add-microsoft'),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
    select: (id) => ipcRenderer.invoke('accounts:select', id),
    refresh: (id) => ipcRenderer.invoke('accounts:refresh', id),
    head: (id) => ipcRenderer.invoke('accounts:head', id),
    onAuth: (cb) => subscribe<AuthProgress>('accounts:auth', cb)
  },
  launch: {
    start: (versionId, instanceId, safeMode) =>
      ipcRenderer.invoke('launch:start', versionId, instanceId, safeMode),
    stop: () => ipcRenderer.invoke('launch:stop'),
    logs: () => ipcRenderer.invoke('launch:logs'),
    onState: (cb) => subscribe<LaunchState>('launch:state', cb),
    onLog: (cb) => subscribe<LogLine>('launch:log', cb),
    onCrash: (cb) => subscribe<CrashInfo>('launch:crash', cb)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (target) => ipcRenderer.invoke('shell:open-path', target)
  },
  mods: {
    search: (query, versionId) => ipcRenderer.invoke('mods:search', query, versionId),
    versions: (projectId, gameVersion) => ipcRenderer.invoke('mods:versions', projectId, gameVersion),
    preview: (projectId, versionId, gameVersion, optionalProjectIds) =>
      ipcRenderer.invoke('mods:preview', projectId, versionId, gameVersion, optionalProjectIds),
    install: (projectId, versionId, gameVersion, optionalProjectIds, instanceId) =>
      ipcRenderer.invoke(
        'mods:install',
        projectId,
        versionId,
        gameVersion,
        optionalProjectIds,
        instanceId
      ),
    listInstalled: (gameVersionId, instanceId) =>
      ipcRenderer.invoke('mods:list-installed', gameVersionId, instanceId),
    remove: (gameVersionId, filename, instanceId) =>
      ipcRenderer.invoke('mods:remove', gameVersionId, filename, instanceId),
    toggle: (gameVersionId, filename, enabled, instanceId) =>
      ipcRenderer.invoke('mods:toggle', gameVersionId, filename, enabled, instanceId),
    checkUpdates: (gameVersionId, instanceId) =>
      ipcRenderer.invoke('mods:check-updates', gameVersionId, instanceId),
    updateAll: (gameVersionId, instanceId) =>
      ipcRenderer.invoke('mods:update-all', gameVersionId, instanceId),
    installPack: () => ipcRenderer.invoke('mods:install-pack'),
    onProgress: (cb) => subscribe<InstallProgress>('mods:progress', cb),
    onLog: (cb) => subscribe<string>('mods:log', cb)
  },
  server: {
    config: () => ipcRenderer.invoke('server:config'),
    play: (versionId, host, port, instanceId) =>
      ipcRenderer.invoke('server:play', versionId, host, port, instanceId)
  },
  instances: {
    list: () => ipcRenderer.invoke('instances:list'),
    create: (input) => ipcRenderer.invoke('instances:create', input),
    update: (id, patch) => ipcRenderer.invoke('instances:update', id, patch),
    remove: (id) => ipcRenderer.invoke('instances:remove', id),
    clone: (id, name) => ipcRenderer.invoke('instances:clone', id, name),
    openFolder: (id) => ipcRenderer.invoke('instances:open-folder', id),
    launch: (id, safeMode) => ipcRenderer.invoke('instances:launch', id, safeMode)
  },
  crash: {
    safeMode: (crashId) => ipcRenderer.invoke('crash:safe-mode', crashId),
    addMemory: (crashId) => ipcRenderer.invoke('crash:add-memory', crashId),
    disableLastMod: (crashId) => ipcRenderer.invoke('crash:disable-last-mod', crashId),
    openReport: (crashId) => ipcRenderer.invoke('crash:open-report', crashId),
    copyReport: (crashId) => ipcRenderer.invoke('crash:copy-report', crashId),
    uploadReport: (crashId) => ipcRenderer.invoke('crash:upload-report', crashId)
  },
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    add: (input) => ipcRenderer.invoke('servers:add', input),
    update: (id, patch) => ipcRenderer.invoke('servers:update', id, patch),
    remove: (id) => ipcRenderer.invoke('servers:remove', id),
    ping: (host, port) => ipcRenderer.invoke('servers:ping', host, port),
    pingAll: () => ipcRenderer.invoke('servers:ping-all'),
    import: () => ipcRenderer.invoke('servers:import'),
    join: (host, port, versionId, instanceId) =>
      ipcRenderer.invoke('servers:join', host, port, versionId, instanceId)
  },
  imports: {
    scan: () => ipcRenderer.invoke('imports:scan'),
    connect: (candidateId, name, versionId, loader) =>
      ipcRenderer.invoke('imports:connect', candidateId, name, versionId, loader),
    useVanilla: () => ipcRenderer.invoke('imports:use-vanilla'),
    accounts: () => ipcRenderer.invoke('imports:accounts')
  },
  app: {
    version: ipcRenderer.sendSync('app:version') as string
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    quitAndInstall: () => ipcRenderer.invoke('updates:quit-and-install'),
    onStatus: (cb) => subscribe('updates:status', cb),
    onProgress: (cb) => subscribe('updates:progress', cb)
  }
}

contextBridge.exposeInMainWorld('cozy', api)

export type { Account, AuthProgress, InstallProgress, LaunchState, LogLine, Settings, VersionManifest, VersionStatus }
