import { app, BrowserWindow, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { registerIpc } from './ipc'
import { detectJava } from './core/java'
import { maybeAutoCheck } from './core/update'
import { runSmoke, runModsSmoke, runInstanceSmoke } from './smoke'

let mainWindow: BrowserWindow | null = null
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  console.log('Another Cozy Launcher instance is already running — exiting')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a1411',
    title: 'Cozy Launcher',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  window.setMenu(null)
  window.once('ready-to-show', () => window.show())
  window.on('maximize', () => window.webContents.send('window:maximized', true))
  window.on('unmaximize', () => window.webContents.send('window:maximized', false))
  window.on('closed', () => {
    mainWindow = null
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    window.loadURL(devUrl)
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return window
}

async function captureScreenshots(window: BrowserWindow): Promise<void> {
  const outDir = process.env.COZY_SCREENSHOT as string
  fs.mkdirSync(outDir, { recursive: true })
  fs.appendFileSync(path.join(outDir, 'debug.log'), `capture start ${new Date().toISOString()}\n`)
  const pages = (process.env.COZY_SCREENSHOT_PAGES ?? 'home,versions,accounts,settings')
    .split(',')
    .map((page) => page.trim())
    .filter(Boolean)
  fs.appendFileSync(path.join(outDir, 'debug.log'), `pages=${pages.join('|')}\n`)

  await new Promise((resolve) => setTimeout(resolve, 2200))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const isReady = (await window.webContents.executeJavaScript(
      "document.documentElement.dataset.ready === '1'"
    )) as boolean
    if (isReady) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fs.appendFileSync(path.join(outDir, 'debug.log'), 'ready\n')
  await window.webContents.executeJavaScript(
    "document.documentElement.dataset.animations = 'off'; true;"
  )
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (process.env.COZY_SCREENSHOT_FULL) {
    const zoom = (await window.webContents.executeJavaScript(
      `(() => {
        const el = document.querySelector('.content-scroll')
        if (!el) return 1
        return Math.min(1, Math.max(0.55, el.clientHeight / el.scrollHeight))
      })()`
    )) as number
    await window.webContents.executeJavaScript(
      `(() => {
        const el = document.querySelector('.content-scroll')
        if (el) el.style.zoom = ${JSON.stringify(zoom)}
        return true
      })()`
    )
    await new Promise((resolve) => setTimeout(resolve, 450))
  }
  for (const page of pages) {
    try {
      fs.appendFileSync(path.join(outDir, 'debug.log'), `page ${page}\n`)
      await window.webContents.executeJavaScript(
        `window.location.hash = ${JSON.stringify(`#/${page}`)}; true;`
      )
      await new Promise((resolve) => setTimeout(resolve, page === 'home' ? 1400 : 900))
      fs.appendFileSync(path.join(outDir, 'debug.log'), `hash ${page}\n`)
      if (page === 'mods') {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const rows = (await window.webContents.executeJavaScript(
            "document.querySelectorAll('.version-row').length"
          )) as number
          if (rows > 0) break
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
        // Pick an instance target so the screenshot shows the isolation selector.
        await window.webContents.executeJavaScript(
          `(() => {
            const select = document.querySelector('select')
            if (!select) return false
            const option = Array.from(select.options).find((item) => item.value)
            if (!option) return false
            select.value = option.value
            select.dispatchEvent(new Event('change', { bubbles: true }))
            return true
          })()`
        )
        await new Promise((resolve) => setTimeout(resolve, 900))
      }
      const image = await window.webContents.capturePage()
      fs.writeFileSync(path.join(outDir, `${page}.png`), image.toPNG())
      try {
        const text = (await window.webContents.executeJavaScript(
          'document.body.innerText'
        )) as string
        fs.writeFileSync(path.join(outDir, `${page}.txt`), text)
        const meta = (await window.webContents.executeJavaScript(
          `(() => ({
            hash: window.location.hash,
            selects: Array.from(document.querySelectorAll('select')).map((el) => ({
              label: el.getAttribute('aria-label'),
              value: el.value,
              options: Array.from(el.options).map((option) => option.textContent)
            })),
            empties: Array.from(document.querySelectorAll('.empty-state, .empty, [class*="empty"]')).map((el) => el.innerText)
          }))()`
        )) as unknown
        fs.writeFileSync(path.join(outDir, `${page}.meta.json`), JSON.stringify(meta, null, 2))
      } catch {
        // text dump is only a debugging aid
      }
      fs.appendFileSync(path.join(outDir, 'debug.log'), `saved ${page}\n`)
    } catch (error) {
      fs.appendFileSync(path.join(outDir, 'debug.log'), `error ${page}: ${String(error)}\n`)
      console.error(`Не удалось снять страницу ${page}:`, error)
    }
  }
  app.exit(0)
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.cozypolit.cozylauncher')

  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
          ]
        }
      })
    })
  }

  registerIpc(() => mainWindow)

  const smokeVersion = process.env.COZY_SMOKE_VERSION
  if (smokeVersion) {
    const outDir =
      process.env.COZY_SMOKE_OUT ??
      path.join(app.getPath('userData'), 'smoke')
    await runSmoke(smokeVersion, outDir)
    return
  }

  const modsSmoke = process.env.COZY_MODS_SMOKE
  if (modsSmoke) {
    // Format: <mcVersion>|projectId:versionId,projectId:versionId
    const [mcVersion, list = ''] = modsSmoke.split('|')
    const specs = list
      .split(',')
      .filter(Boolean)
      .map((entry) => {
        const [projectId, versionId] = entry.split(':')
        return { projectId, versionId }
      })
    const outDir =
      process.env.COZY_SMOKE_OUT ?? path.join(app.getPath('userData'), 'smoke')
    await runModsSmoke(mcVersion, specs, outDir, process.env.COZY_SMOKE_LAUNCH === '1')
    return
  }

  const instanceSmoke = process.env.COZY_INSTANCE_SMOKE
  if (instanceSmoke) {
    const outDir =
      process.env.COZY_SMOKE_OUT ?? path.join(app.getPath('userData'), 'smoke')
    await runInstanceSmoke(instanceSmoke, outDir)
    return
  }

  void detectJava()

  mainWindow = createWindow()

  void maybeAutoCheck(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })

  const screenshotDir = process.env.COZY_SCREENSHOT
  if (screenshotDir) {
    await captureScreenshots(mainWindow)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  quitting = false
})
