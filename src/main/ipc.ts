import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type {
  AuthProgress,
  CrashInfo,
  CreateInstanceInput,
  ImportCandidate,
  InstallProgress,
  Settings
} from '@shared/types'
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
import { configureNetwork } from './core/downloader'
import { FEATURED_VERSIONS } from './core/featured'
import { scanImports, importOfflineAccounts } from './core/import'
import {
  cloneInstance,
  createInstance,
  getInstance,
  listInstances,
  markInstancePlayed,
  removeInstance,
  updateInstance
} from './core/instances'
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
  disableLastMod,
  ensureModdedVersion,
  setModLog
} from './core/mods'
import { installMrpack } from './core/pack'
import { defaultGameDir } from './core/paths'
import { getServerConfig } from './core/promo'
import {
  addServer,
  importServersDat,
  listServers,
  pingAll,
  pingOne,
  removeServer,
  updateServer
} from './core/servers'
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
    },
    onCrash: (crash) => getWindow()?.webContents.send('launch:crash', crash)
  })

  configureNetwork(getSettings().proxyUrl)

  /** Resolves the real version id (Fabric profile for instances) and starts the game. */
  const launchResolved = async (
    versionId: string,
    instanceId?: string,
    safeMode?: boolean,
    server?: { host: string; port: number }
  ): Promise<void> => {
    let actualId = versionId
    if (instanceId) {
      const instance = getInstance(instanceId)
      if (!instance) throw new Error('Сборка не найдена')
      actualId =
        instance.loader === 'fabric'
          ? await ensureModdedVersion(instance.versionId)
          : instance.versionId
    }
    await launcher.launch(actualId, { instanceId, safeMode, server })
    if (instanceId) markInstancePlayed(instanceId)
  }

  const relaunchFromCrash = async (
    crashId: string,
    mutate?: () => void
  ): Promise<void> => {
    const stored = launcher.getCrash(crashId)
    if (!stored) throw new Error('Информация о падении устарела, запустите игру заново')
    mutate?.()
    await launchResolved(stored.info.versionId, stored.info.instanceId)
  }

  const crashText = (crashId: string): string => {
    const stored = launcher.getCrash(crashId)
    if (!stored) throw new Error('Информация о падении не найдена')
    if (stored.text) return stored.text
    if (stored.info.reportPath && fs.existsSync(stored.info.reportPath)) {
      return fs.readFileSync(stored.info.reportPath, 'utf8')
    }
    if (stored.info.logPath && fs.existsSync(stored.info.logPath)) {
      return fs.readFileSync(stored.info.logPath, 'utf8')
    }
    return `${stored.info.title}\n${stored.info.summary}`
  }

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
  safeHandle('settings:update', (_event, patch: Partial<Settings>) => {
    const updated = updateSettings(patch)
    if (patch.proxyUrl !== undefined) configureNetwork(updated.proxyUrl)
    return updated
  })
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

  safeHandle(
    'launch:start',
    async (_event, versionId: string, instanceId?: string, safeMode?: boolean) => {
      await launchResolved(versionId, instanceId, safeMode)
    }
  )
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
      optionalProjectIds?: string[],
      instanceId?: string
    ) => {
      await installMod(
        projectId,
        versionId,
        gameVersion,
        optionalProjectIds ?? [],
        sendModProgress,
        instanceId
      )
    }
  )
  safeHandle('mods:list-installed', async (_event, gameVersion: string, instanceId?: string) => {
    return listInstalledMods(gameVersion, instanceId)
  })
  safeHandle(
    'mods:remove',
    async (_event, gameVersion: string, filename: string, instanceId?: string) => {
      removeMod(gameVersion, filename, instanceId)
    }
  )
  safeHandle(
    'mods:toggle',
    async (_event, gameVersion: string, filename: string, enabled: boolean, instanceId?: string) => {
      toggleMod(gameVersion, filename, enabled, instanceId)
    }
  )
  safeHandle(
    'mods:check-updates',
    async (_event, gameVersion: string, instanceId?: string) => {
      return checkModUpdates(gameVersion, instanceId)
    }
  )
  safeHandle('mods:update-all', async (_event, gameVersion: string, instanceId?: string) => {
    return updateAllMods(gameVersion, instanceId)
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
    async (_event, versionId: string, host: string, port: number, instanceId?: string) => {
      await launchResolved(versionId, instanceId, false, { host, port })
    }
  )

  /* ---------- INSTANCES ---------- */
  safeHandle('instances:list', () => listInstances())
  safeHandle('instances:create', (_event, input: CreateInstanceInput) => createInstance(input))
  safeHandle(
    'instances:update',
    (
      _event,
      id: string,
      patch: Partial<Pick<import('@shared/types').Instance, 'name' | 'versionId' | 'loader' | 'ramMb' | 'javaPath'>>
    ) => updateInstance(id, patch)
  )
  safeHandle('instances:remove', (_event, id: string) => removeInstance(id))
  safeHandle('instances:clone', (_event, id: string, name?: string) => cloneInstance(id, name))
  safeHandle('instances:open-folder', async (_event, id: string) => {
    const instance = getInstance(id)
    if (!instance) throw new Error('Сборка не найдена')
    const error = await shell.openPath(instance.dir)
    if (error) throw new Error(error)
  })
  safeHandle('instances:launch', async (_event, id: string, safeMode?: boolean) => {
    const instance = getInstance(id)
    if (!instance) throw new Error('Сборка не найдена')
    await launchResolved(instance.versionId, id, safeMode)
  })

  /* ---------- CRASHES ---------- */
  safeHandle('crash:safe-mode', async (_event, crashId: string) => {
    const stored = launcher.getCrash(crashId)
    if (!stored) throw new Error('Информация о падении устарела')
    await launchResolved(stored.info.versionId, stored.info.instanceId, true)
  })
  safeHandle('crash:add-memory', async (_event, crashId: string) => {
    const stored = launcher.getCrash(crashId)
    if (!stored) throw new Error('Информация о падении устарела')
    const totalMb = Math.floor(os.totalmem() / 1024 / 1024)
    const next = Math.min(Math.max(2048, totalMb - 2048), stored.info.memoryMb + 2048)
    await relaunchFromCrash(crashId, () => {
      updateSettings({ ramMb: next })
      if (stored.info.instanceId) updateInstance(stored.info.instanceId, { ramMb: next })
    })
  })
  safeHandle('crash:disable-last-mod', async (_event, crashId: string) => {
    const stored = launcher.getCrash(crashId)
    if (!stored) throw new Error('Информация о падении устарела')
    let baseVersion = stored.info.versionId
    try {
      const version = await getVersionJson(stored.info.versionId)
      baseVersion = version.cozyMcVersion ?? baseVersion
    } catch {
      // keep the id as-is
    }
    const disabled = disableLastMod(baseVersion, stored.info.instanceId)
    if (!disabled) throw new Error('Не удалось найти мод для отключения')
    await launchResolved(stored.info.versionId, stored.info.instanceId)
  })
  safeHandle('crash:open-report', async (_event, crashId: string) => {
    const stored = launcher.getCrash(crashId)
    if (!stored) throw new Error('Информация о падении устарела')
    const target = stored.info.reportPath ?? stored.info.logPath
    if (!target || !fs.existsSync(target)) throw new Error('Файл отчёта не найден')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })
  safeHandle('crash:copy-report', (_event, crashId: string) => {
    const text = crashText(crashId)
    clipboard.writeText(text)
    return text
  })
  safeHandle('crash:upload-report', async (_event, crashId: string) => {
    const text = crashText(crashId)
    const response = await fetch('https://api.mclo.gs/1/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CozyLauncher/1.2.0'
      },
      body: new URLSearchParams({ content: text }).toString(),
      signal: AbortSignal.timeout(25000)
    })
    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; url?: string; error?: string }
      | null
    if (!response.ok || !data?.success || !data.url) {
      throw new Error(data?.error ?? `mclo.gs ответил кодом ${response.status}`)
    }
    return data.url
  })

  /* ---------- SERVERS ---------- */
  safeHandle('servers:list', () => listServers())
  safeHandle('servers:add', (_event, input: { name?: string; address: string; port?: number }) =>
    addServer(input)
  )
  safeHandle(
    'servers:update',
    (_event, id: string, patch: Partial<Pick<import('@shared/types').ServerEntry, 'name' | 'favorite'>>) =>
      updateServer(id, patch)
  )
  safeHandle('servers:remove', (_event, id: string) => removeServer(id))
  safeHandle('servers:ping', (_event, host: string, port: number) => pingOne(host, port))
  safeHandle('servers:ping-all', () => pingAll())
  safeHandle('servers:import', () => importServersDat())
  safeHandle(
    'servers:join',
    async (_event, host: string, port: number, versionId: string, instanceId?: string) => {
      await launchResolved(versionId, instanceId, false, { host, port })
    }
  )

  /* ---------- IMPORTS ---------- */
  safeHandle('imports:scan', () => scanImports())
  safeHandle(
    'imports:connect',
    (
      _event,
      candidateId: string,
      name: string,
      versionId: string,
      loader?: 'vanilla' | 'fabric'
    ) => {
      const scan = scanImports()
      const candidate: ImportCandidate | undefined = scan.candidates.find(
        (entry) => entry.id === candidateId
      )
      if (!candidate) throw new Error('Сборка другого лаунчера не найдена')
      return createInstance({
        name,
        versionId,
        loader: loader ?? (candidate.modsCount > 0 ? 'fabric' : 'vanilla'),
        externalDir: candidate.gameDir
      })
    }
  )
  safeHandle('imports:use-vanilla', () => {
    const dir = defaultGameDir()
    updateSettings({ gameDir: dir })
    return dir
  })
  safeHandle('imports:accounts', () => importOfflineAccounts())
}
