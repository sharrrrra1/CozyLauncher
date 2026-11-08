import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'screenshots')
const pages = process.env.COZY_SCREENSHOT_PAGES ?? 'home,versions,accounts,settings'

if (!fs.existsSync(path.join(root, 'out', 'main', 'index.js'))) {
  console.log('Сборка не найдена — собираем проект…')
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, shell: true, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

fs.mkdirSync(outDir, { recursive: true })

const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronPath)) {
  console.error('Electron не найден:', electronPath)
  process.exit(1)
}

const child = spawn(electronPath, ['.'], {
  cwd: root,
  env: {
    ...process.env,
    COZY_SCREENSHOT: outDir,
    COZY_SCREENSHOT_PAGES: pages
  },
  stdio: 'inherit'
})

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`Скриншоты сохранены: ${outDir}`)
  } else {
    console.error('Снимок экрана завершился с кодом', code)
  }
  process.exit(code ?? 0)
})
