import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type { AuthProgress, InstallProgress, Settings } from '@shared/types'
import {
  addMicrosoftAccount,
  addOfflineAccount,
  getCurrentAccount,
  getSkinDataUrl,
  listAccounts,
  refreshAccount,
  removeAccount,
  selectAccount
} from './core/auth/accounts'
import { FEATURED_VERSIONS } from './core/featured'
import {
  cancelInstall,
  getVersionStatus,
  getVersionStatuses,
  installVersion,
  removeVersion
} from './core/installer'
import { detectJava } from './core/java'
import { GameLauncher } from './core/launcher'
import { getVersionJson, getVersionManifest } from './core/mojang'
import { registerUpdateIpc } from './core/update'
import {
  searchMods,
  modVersions,
  previewModInstall,
  installMod,
  listInstalledMods,
  removeMod,
  toggleMod,
  checkModUpdates,
  updateAllMods,
  setModLog
} from './core/mods'
import { installMrpack } from './core/pack'
import { getServerConfig } from './core/promo'
import { getSettings, updateSettings } from './core/store'

function sendProgress(window: BrowserWindow | null, progress: InstallProgress): void {
  window?.webContents.send('versions:progress', progress)
}

function sanitizeExternal(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Разрешены только http и https ссылки')
  }
  return parsed.toString()
}

// safeHandle / safeOn declared above during refactor


const registered = new Set<string>()

function safeHandle(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any) {
  if (registered.has(channel)) {
    ipcMain.removeHandler(channel)
  }
  registered.add(channel)
  ipcMain.handle(channel, handler)
}

function safeOn(channel: string, listener: (event: Electron.IpcMainEvent, ...args: any[]) => void) {
  ipcMain.removeAllListeners(channel)
  ipcMain.on(channel, listener)
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const launcher = new GameLauncher({
    onLog: (line) => getWindow()?.webContents.send('launch:log', line),
    onState: (state) => {
      const window = getWindow()
      window?.webContents.send('launch:state', state)
      if (state.phase === 'running' && getSettings().closeOnLaunch) {
        window?.hide()
      }
    }
  })

  safeHandle('system:info', () => {
    const cpus = os.cpus()
    return {
      totalMemMb: Math.floor(os.totalmem() / 1024 / 1024),
      freeMemMb: Math.floor(os.freemem() / 1024 / 1024),
      cpuModel: cpus[0]?.model?.trim() ?? 'Unknown CPU',
      cores: cpus.length,
      platform: process.platform,
      arch: process.arch,
      appVersion: app.getVersion(),
      electron: process.versions.electron
    }
  })

  safeOn('window:minimize', () => getWindow()?.minimize())
  safeOn('window:maximize', () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  safeOn('window:close', () => getWindow()?.close())
  safeHandle('window:is-maximized', () => getWindow()?.isMaximized() ?? false)

  safeHandle('settings:get', () => getSettings())
  safeHandle('settings:update', (_event, patch: Partial<Settings>) =>
    updateSettings(patch)
  )
  safeHandle('settings:choose-java', async () => {
    const window = getWindow()
    const filters =
      process.platform === 'win32'
        ? [{ name: 'Java', extensions: ['exe'] }]
        : [{ name: 'Java', extensions: ['*'] }]
    const options: Electron.OpenDialogOptions = {
      title: 'Выберите java.exe',
      properties: ['openFile'],
      filters
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })
  safeHandle('settings:choose-game-dir', async () => {
    const window = getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Выберите папку игры',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })

  safeHandle('versions:manifest', () => getVersionManifest())
  safeHandle('versions:featured', () => FEATURED_VERSIONS)
  safeHandle('versions:status', (_event, id: string) => getVersionStatus(id))
  safeHandle('versions:statuses', (_event, ids: string[]) => getVersionStatuses(ids))
  safeHandle('versions:meta', async (_event, id: string) => {
    const version = await getVersionJson(id)
    const assetSize = version.assetIndex.totalSize ?? 0
    return {
      id: version.id,
      javaMajor: version.javaVersion?.majorVersion ?? 8,
      javaComponent: version.javaVersion?.component ?? 'jre-legacy',
      clientSize: version.downloads.client.size ?? 0,
      assetSize,
      totalSize: (version.downloads.client.size ?? 0) + assetSize
    }
  })
  safeHandle('java:detect', () => detectJava())
  safeHandle('versions:install', async (_event, id: string) => {
    try {
      return await installVersion(id, (progress) => sendProgress(getWindow(), progress))
    } catch {
      return getVersionStatus(id)
    }
  })
  safeHandle('versions:cancel', (_event, id: string) => cancelInstall(id))
  safeHandle('versions:remove', async (_event, id: string) => {
    await removeVersion(id)
    return getVersionStatus(id)
  })

  safeHandle('accounts:list', () => listAccounts())
  safeHandle('accounts:current', () => getCurrentAccount())
  safeHandle('accounts:add-offline', (_event, name: string) => addOfflineAccount(name))
  safeHandle('accounts:add-microsoft', async () => {
    const progress = (payload: AuthProgress): void => {
      getWindow()?.webContents.send('accounts:auth', payload)
    }
    return addMicrosoftAccount(getWindow(), progress)
  })
  safeHandle('accounts:remove', (_event, id: string) => removeAccount(id))
  safeHandle('accounts:select', (_event, id: string) => selectAccount(id))
  safeHandle('accounts:refresh', async (_event, id: string) => {
    const progress = (payload: AuthProgress): void => {
      getWindow()?.webContents.send('accounts:auth', payload)
    }
    return refreshAccount(id, progress)
  })
  safeHandle('accounts:head', (_event, id: string) => getSkinDataUrl(id))

  safeHandle('launch:start', async (_event, versionId: string) => {
    await launcher.launch(versionId)
  })
  safeHandle('launch:stop', () => launcher.stop())
  safeHandle('launch:logs', () => launcher.getLogs())

  safeHandle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(sanitizeExternal(url))
  })
  safeHandle('shell:open-path', async (_event, target: string) => {
    const settings = getSettings()
    const resolved = path.resolve(target)
    if (!target || !fs.existsSync(resolved)) {
      const fallback = path.resolve(settings.gameDir)
      const error = await shell.openPath(fallback)
      if (error) throw new Error(error)
      return
    }
    const error = await shell.openPath(resolved)
    if (error) throw new Error(error)
  })

  registerUpdateIpc(getWindow)

  safeOn('app:version', (event) => {
    event.returnValue = app.getVersion()
  })

  setModLog((message) => getWindow()?.webContents.send('mods:log', message))

  /* ---------- MODS ---------- */
  const sendModProgress = (progress: InstallProgress): void => {
    getWindow()?.webContents.send('mods:progress', progress)
  }

  safeHandle('mods:search', async (_event, query: string, gameVersion?: string) => {
    return searchMods(query, gameVersion)
  })
  safeHandle('mods:versions', async (_event, projectId: string, gameVersion?: string) => {
    return modVersions(projectId, gameVersion)
  })
  safeHandle(
    'mods:preview',
    async (
      _event,
      projectId: string,
      versionId: string,
      gameVersion: string,
      optionalProjectIds?: string[]
    ) => previewModInstall(projectId, versionId, gameVersion, optionalProjectIds ?? [])
  )
  safeHandle(
    'mods:install',
    async (
      _event,
      projectId: string,
      versionId: string,
      gameVersion: string,
      optionalProjectIds?: string[]
    ) => {
      await installMod(projectId, versionId, gameVersion, optionalProjectIds ?? [], sendModProgress)
    }
  )
  safeHandle('mods:list-installed', async (_event, gameVersion: string) => {
    return listInstalledMods(gameVersion)
  })
  safeHandle('mods:remove', async (_event, gameVersion: string, filename: string) => {
    removeMod(gameVersion, filename)
  })
  safeHandle(
    'mods:toggle',
    async (_event, gameVersion: string, filename: string, enabled: boolean) => {
      toggleMod(gameVersion, filename, enabled)
    }
  )
  safeHandle('mods:check-updates', async (_event, gameVersion: string) => {
    return checkModUpdates(gameVersion)
  })
  safeHandle('mods:update-all', async (_event, gameVersion: string) => {
    return updateAllMods(gameVersion)
  })
  safeHandle('mods:install-pack', async () => {
    const window = getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Выберите модпак .mrpack',
      properties: ['openFile'],
      filters: [{ name: 'Modrinth Pack', extensions: ['mrpack'] }]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return installMrpack(result.filePaths[0], sendModProgress)
  })

  /* ---------- SERVER CONFIG ---------- */
  safeHandle('server:config', async () => getServerConfig())
  safeHandle(
    'server:play',
    async (_event, versionId: string, host: string, port: number) => {
      await launcher.launch(versionId, { server: { host, port } })
    }
  )
}
