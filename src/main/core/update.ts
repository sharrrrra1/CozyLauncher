import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { getSettings } from './store'

export type UpdateStatus =
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

const UPDATE_CHANNEL = 'stable'
const CHECK_INTERVAL = 24 * 60 * 60 * 1000

const statusListeners = new Set<(status: UpdateStatus) => void>()
const progressListeners = new Set<(progress: UpdateProgress) => void>()

let currentStatus: UpdateStatus = 'none'
let currentProgress: UpdateProgress = { percent: 0, bytesPerSecond: 0, total: 0, transferred: 0 }
let downloadedPath: string | null = null
let updaterWired = false

function emitStatus(status: UpdateStatus): void {
  currentStatus = status
  for (const cb of statusListeners) cb(status)
}

function emitProgress(progress: UpdateProgress): void {
  currentProgress = progress
  for (const cb of progressListeners) cb(progress)
}

export function onStatus(cb: (status: UpdateStatus) => void): () => void {
  statusListeners.add(cb)
  cb(currentStatus)
  return () => statusListeners.delete(cb)
}

export function onProgress(cb: (progress: UpdateProgress) => void): () => void {
  progressListeners.add(cb)
  cb(currentProgress)
  return () => progressListeners.delete(cb)
}

/* ------------------------------------------------------------------ */
/*  electron-updater (primary channel)                                */
/* ------------------------------------------------------------------ */

let cachedUpdater: any = null

function getUpdater(): any | null {
  if (cachedUpdater) return cachedUpdater === true ? null : cachedUpdater
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    // electron-builder публикует latest.yml; канал stable искал бы stable.yml
    autoUpdater.channel = 'latest'
    autoUpdater.allowPrerelease = false
    if (!updaterWired) {
      updaterWired = true
      autoUpdater.on('checking-for-update', () => emitStatus('checking'))
      autoUpdater.on('update-available', () => emitStatus('available'))
      autoUpdater.on('update-not-available', () => emitStatus('none'))
      autoUpdater.on('download-progress', (progress: any) => {
        emitProgress({
          percent: Math.round(progress.percent ?? 0),
          bytesPerSecond: Math.round(progress.bytesPerSecond ?? 0),
          total: progress.total ?? 0,
          transferred: progress.transferred ?? 0
        })
      })
      autoUpdater.on('update-downloaded', () => emitStatus('downloaded'))
      autoUpdater.on('error', () => emitStatus('error'))
    }
    cachedUpdater = autoUpdater
    return autoUpdater
  } catch {
    cachedUpdater = true
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Custom HTTP fallback (VDS endpoint, optional)                     */
/* ------------------------------------------------------------------ */

function updateServerUrl(): string {
  return (getSettings().updateServerUrl ?? '').trim().replace(/\/$/, '')
}

function jsonGet(url: string, query?: Record<string, string | number>): Promise<any> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        target.searchParams.set(key, String(value))
      }
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      reject(new Error('Недопустимый протокол сервера обновлений'))
      return
    }
    const mod = target.protocol === 'https:' ? https : http
    const req = mod.get(target, { timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error('Invalid JSON from update server'))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
  })
}

async function checkViaHttp(): Promise<{ available: boolean; version?: string; notes?: string }> {
  const serverUrl = updateServerUrl()
  if (!serverUrl) return { available: false }
  try {
    const body = await jsonGet(`${serverUrl}/api/update/check`, {
      app: 'cozylauncher',
      version: app.getVersion(),
      channel: UPDATE_CHANNEL
    })
    if (body?.available && body?.version && body.version !== app.getVersion()) {
      emitStatus('available')
      return { available: true, version: body.version, notes: body.notes }
    }
    emitStatus('none')
    return { available: false }
  } catch {
    emitStatus('none')
    return { available: false }
  }
}

/* ------------------------------------------------------------------ */
/*  Check                                                             */
/* ------------------------------------------------------------------ */

export async function checkForUpdates(): Promise<{
  available: boolean
  version?: string
  notes?: string
}> {
  emitStatus('checking')
  const updater = getUpdater()
  if (updater) {
    try {
      const result = await updater.checkForUpdates()
      const version = result?.updateInfo?.version
      if (version && version !== app.getVersion()) {
        emitStatus('available')
        return {
          available: true,
          version,
          notes: typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined
        }
      }
      emitStatus('none')
      return { available: false }
    } catch {
      emitStatus('error')
    }
  }
  return checkViaHttp()
}

/* ------------------------------------------------------------------ */
/*  Download                                                          */
/* ------------------------------------------------------------------ */

export async function downloadUpdate(): Promise<void> {
  emitStatus('downloading')
  const updater = getUpdater()

  if (updater) {
    try {
      await updater.downloadUpdate()
      emitStatus('downloaded')
      return
    } catch (error) {
      emitStatus('error')
      throw error
    }
  }

  const serverUrl = updateServerUrl()
  if (!serverUrl) throw new Error('Сервер обновлений не настроен')

  try {
    const info = await checkViaHttp()
    if (!info.available || !info.version) throw new Error('Нет доступного обновления')
    const fileName = `cozylauncher-${info.version}-setup.exe`
    const dest = path.join(app.getPath('userData'), 'updates', fileName)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const total = await downloadFile(
      `${serverUrl}/api/update/download/${info.version}`,
      dest,
      (progress) => emitProgress(progress)
    )
    downloadedPath = dest
    emitStatus('downloaded')
    emitProgress({ percent: 100, bytesPerSecond: 0, total, transferred: total })
  } catch (error) {
    emitStatus('error')
    throw error
  }
}

function downloadFile(
  url: string,
  dest: string,
  onProgress: (progress: UpdateProgress) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const file = fs.createWriteStream(dest)
    let total = 0
    let transferred = 0
    let lastTime = Date.now()

    const req = mod.get(url, { timeout: 30000 }, (res) => {
      total = parseInt(res.headers['content-length'] ?? '0', 10) || 0
      res.on('data', (chunk) => {
        transferred += chunk.length
        const now = Date.now()
        const elapsed = Math.max(now - lastTime, 1)
        lastTime = now
        onProgress({
          percent: total ? Math.round((transferred / total) * 100) : 0,
          bytesPerSecond: Math.round((chunk.length / elapsed) * 1000),
          total,
          transferred
        })
      })
      res.pipe(file)
    })

    file.on('finish', () => {
      file.close()
      resolve(total)
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
  })
}

/* ------------------------------------------------------------------ */
/*  Install                                                           */
/* ------------------------------------------------------------------ */

export function quitAndInstall(): void {
  const updater = getUpdater()
  if (updater?.downloadedUpdateHelper) {
    setImmediate(() => updater.quitAndInstall(false, true))
    return
  }
  if (!downloadedPath || !fs.existsSync(downloadedPath)) {
    dialog.showErrorBox('Обновление', 'Файл обновления не найден. Скачайте обновление снова.')
    return
  }
  void shell.openPath(downloadedPath).then(() => app.quit())
}

/* ------------------------------------------------------------------ */
/*  Startup check (at most once per 24h)                              */
/* ------------------------------------------------------------------ */

function checkMarker(): string {
  return path.join(app.getPath('userData'), 'update-check.json')
}

export async function maybeAutoCheck(getWindow: () => BrowserWindow | null): Promise<void> {
  try {
    const raw = JSON.parse(fs.readFileSync(checkMarker(), 'utf8')) as { at?: number }
    if (raw?.at && Date.now() - raw.at < CHECK_INTERVAL) return
  } catch {
    // first run
  }
  fs.mkdirSync(path.dirname(checkMarker()), { recursive: true })
  fs.writeFileSync(checkMarker(), JSON.stringify({ at: Date.now() }), 'utf8')

  const result = await checkForUpdates().catch(() => null)
  if (result?.available) {
    const window = getWindow()
    window?.webContents.send('updates:status', 'available')
    window?.webContents.send('updates:info', result)
  }
}

/* ------------------------------------------------------------------ */
/*  IPC                                                               */
/* ------------------------------------------------------------------ */

export function registerUpdateIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('updates:check', async () => checkForUpdates())
  ipcMain.handle('updates:download', async () => {
    await downloadUpdate()
  })
  ipcMain.handle('updates:quit-and-install', () => {
    quitAndInstall()
  })

  onStatus((status) => {
    getWindow()?.webContents.send('updates:status', status)
  })
  onProgress((progress) => {
    getWindow()?.webContents.send('updates:progress', progress)
  })
}
