#!/usr/bin/env node
// Извлекает оригинальные текстуры Minecraft из client.jar проекта в raw_art/mc.
// Использование: node scripts/extract-mc-textures.mjs [path/to/<version>.jar]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import unzipper from 'unzipper'

const WANTED = [
  'assets/minecraft/textures/entity/creeper/creeper.png',
  'assets/minecraft/textures/item/diamond.png',
  'assets/minecraft/textures/item/potion.png',
  'assets/minecraft/textures/item/potion_overlay.png',
  'assets/minecraft/textures/item/experience_bottle.png',
  'assets/minecraft/textures/gui/sprites/hud/heart/full.png',
  'assets/minecraft/textures/block/grass_block_top.png',
  'assets/minecraft/textures/block/grass_block_side.png',
  'assets/minecraft/textures/block/grass_block_side_overlay.png'
]

function defaultJar() {
  const root = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.minecraft', 'versions')
  for (const id of ['1.21.11', '26.3', '26.2']) {
    const candidate = path.join(root, id, `${id}.jar`)
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('client.jar не найден — передайте путь первым аргументом')
}

const jar = process.argv[2] || defaultJar()
const outDir = path.join(process.cwd(), 'raw_art', 'mc')
fs.mkdirSync(outDir, { recursive: true })

const archive = await unzipper.Open.file(jar)
console.log(`jar: ${jar}`)
for (const entryPath of WANTED) {
  const entry = archive.files.find((f) => f.path === entryPath)
  if (!entry) {
    console.log(`MISSING  ${entryPath}`)
    continue
  }
  const buffer = await entry.buffer()
  const dest = path.join(outDir, path.basename(entryPath))
  fs.writeFileSync(dest, buffer)
  console.log(`ok       ${path.basename(entryPath)}  ${entryPath.replace('assets/minecraft/textures/', '')}`)
}
