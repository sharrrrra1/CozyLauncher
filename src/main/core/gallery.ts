import fs from 'node:fs'
import path from 'node:path'
import { ClipboardItem, clipboard, nativeImage, shell } from 'electron'
import type { GalleryScope, ScreenshotEntry, ScreenshotImage } from '@shared/types'
import { getInstance } from './instances'
import { getSettings } from './store'

/**
 * Скриншоты лежат там, куда их кладёт сама игра:
 *  - у сборки — <instance.dir>/screenshots;
 *  - у ванили — <settings.gameDir>/screenshots.
 * Никаких копий в userData: показываем ровно то, что нафотографировал игрок.
 */

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const THUMB_WIDTH = 320

function safeFilename(raw: string): string {
  const name = String(raw ?? '')
  if (!name || name !== path.basename(name)) {
    throw new Error('Некорректное имя файла')
  }
  if (name === '.' || name === '..' || name.startsWith('.')) {
    throw new Error('Некорректное имя файла')
  }
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) {
    throw new Error('Некорректное имя файла')
  }
  if (!IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    throw new Error('Такой формат скриншотов не поддерживается')
  }
  return name
}

export function screenshotsDirFor(scope: GalleryScope): string {
  if (scope === 'vanilla') {
    return path.join(getSettings().gameDir, 'screenshots')
  }
  const instance = getInstance(scope)
  if (!instance) throw new Error('Сборка не найдена')
  return path.join(instance.dir, 'screenshots')
}

function resolveScreenshot(scope: GalleryScope, file: string): { dir: string; filePath: string } {
  const dir = path.resolve(screenshotsDirFor(scope))
  const name = safeFilename(file)
  const filePath = path.resolve(dir, name)
  if (filePath !== path.join(dir, name) || !filePath.startsWith(dir + path.sep)) {
    throw new Error('Попытка выйти за пределы папки скриншотов')
  }
  return { dir, filePath }
}

/** Список файлов .png/.jpg/.jpeg без рекурсии, новые сверху. */
export function listScreenshots(scope: GalleryScope): ScreenshotEntry[] {
  const dir = screenshotsDirFor(scope)
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    // Папки ещё нет — это пустая галерея, а не ошибка.
    return []
  }

  const items: ScreenshotEntry[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
    try {
      const stat = fs.statSync(path.join(dir, entry.name))
      items.push({ file: entry.name, mtimeMs: stat.mtimeMs, size: stat.size })
    } catch {
      // Файл исчез между readdir и stat — пропускаем.
    }
  }
  return items.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function loadImage(scope: GalleryScope, file: string): Electron.NativeImage | null {
  const { filePath } = resolveScreenshot(scope, file)
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return null
  const image = nativeImage.createFromPath(filePath)
  return image.isEmpty() ? null : image
}

/** Превью 320px — именно его просит сетка, полноразмерки зря не тянем. */
export function screenshotThumb(scope: GalleryScope, file: string): ScreenshotImage {
  // Ошибки имени/scope пусть долетают до UI: это неправильный запрос, а не битый файл.
  resolveScreenshot(scope, file)
  try {
    const image = loadImage(scope, file)
    if (!image) return { dataUrl: null, isBroken: true }
    return { dataUrl: image.resize({ width: THUMB_WIDTH, quality: 'good' }).toDataURL() }
  } catch {
    return { dataUrl: null, isBroken: true }
  }
}

/** Полный кадр для просмотра — тоже с лимитом 25 МБ. */
export function screenshotFull(scope: GalleryScope, file: string): ScreenshotImage {
  resolveScreenshot(scope, file)
  try {
    const image = loadImage(scope, file)
    if (!image) return { dataUrl: null, isBroken: true }
    return { dataUrl: image.toDataURL() }
  } catch {
    return { dataUrl: null, isBroken: true }
  }
}

/** Копирует в буфер обмена именно картинку, а не путь к файлу. */
export async function copyScreenshot(scope: GalleryScope, file: string): Promise<void> {
  const image = loadImage(scope, file)
  if (!image) throw new Error('Не удалось прочитать скриншот')
  // Electron 45 перешёл на W3C-подобный clipboard: пишем PNG как Blob.
  // Uint8Array.from нужен, чтобы тип буфера был ArrayBuffer, а не SharedArrayBuffer.
  const png = Uint8Array.from(image.toPNG())
  const blob = new Blob([png], { type: 'image/png' })
  await clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export async function openScreenshotsFolder(scope: GalleryScope): Promise<void> {
  const dir = screenshotsDirFor(scope)
  fs.mkdirSync(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

export function deleteScreenshot(scope: GalleryScope, file: string): void {
  const { filePath } = resolveScreenshot(scope, file)
  if (!fs.existsSync(filePath)) return
  fs.unlinkSync(filePath)
}
