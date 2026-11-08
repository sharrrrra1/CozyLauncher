import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AuthProgress,
  CozyApi,
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
    start: (versionId) => ipcRenderer.invoke('launch:start', versionId),
    stop: () => ipcRenderer.invoke('launch:stop'),
    logs: () => ipcRenderer.invoke('launch:logs'),
    onState: (cb) => subscribe<LaunchState>('launch:state', cb),
    onLog: (cb) => subscribe<LogLine>('launch:log', cb)
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
    install: (projectId, versionId, gameVersion, optionalProjectIds) =>
      ipcRenderer.invoke('mods:install', projectId, versionId, gameVersion, optionalProjectIds),
    listInstalled: (gameVersionId) => ipcRenderer.invoke('mods:list-installed', gameVersionId),
    remove: (gameVersionId, filename) => ipcRenderer.invoke('mods:remove', gameVersionId, filename),
    toggle: (gameVersionId, filename, enabled) =>
      ipcRenderer.invoke('mods:toggle', gameVersionId, filename, enabled),
    checkUpdates: (gameVersionId) => ipcRenderer.invoke('mods:check-updates', gameVersionId),
    updateAll: (gameVersionId) => ipcRenderer.invoke('mods:update-all', gameVersionId),
    installPack: () => ipcRenderer.invoke('mods:install-pack'),
    onProgress: (cb) => subscribe<InstallProgress>('mods:progress', cb),
    onLog: (cb) => subscribe<string>('mods:log', cb)
  },
  server: {
    config: () => ipcRenderer.invoke('server:config'),
    play: (versionId, host, port) => ipcRenderer.invoke('server:play', versionId, host, port)
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
