#!/usr/bin/env node
// Собирает UI-спрайты из оригинальных текстур Minecraft (raw_art/mc → src/renderer/src/assets/mc).
// Пиксели масштабируются только целыми nearest-коэффициентами, поэтому спрайты остаются резкими.
// Использование: node scripts/make-mc-sprites.mjs
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SRC = path.join(process.cwd(), 'raw_art', 'mc')
const OUT = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'mc')

/** @typedef {{data: Buffer, width: number, height: number}} Pixels */

async function load(file) {
  const img = sharp(path.join(SRC, file)).toColourspace('srgb').ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

function blank(width, height) {
  return { data: Buffer.alloc(width * height * 4), width, height }
}

/** @param {number} v */
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

function crop(src, left, top, width, height) {
  const out = blank(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = ((top + y) * src.width + (left + x)) * 4
      const d = (y * width + x) * 4
      out.data[d] = src.data[s]
      out.data[d + 1] = src.data[s + 1]
      out.data[d + 2] = src.data[s + 2]
      out.data[d + 3] = src.data[s + 3]
    }
  }
  return out
}

function scale(src, factor) {
  const out = blank(src.width * factor, src.height * factor)
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = (Math.floor(y / factor) * src.width + Math.floor(x / factor)) * 4
      const d = (y * out.width + x) * 4
      out.data[d] = src.data[s]
      out.data[d + 1] = src.data[s + 1]
      out.data[d + 2] = src.data[s + 2]
      out.data[d + 3] = src.data[s + 3]
    }
  }
  return out
}

/** Alpha-over: src поверх dst, обе RGBA одинакового размера. */
function over(dst, src) {
  for (let i = 0; i < dst.width * dst.height; i++) {
    const p = i * 4
    const sa = src.data[p + 3] / 255
    if (sa === 0) continue
    const da = dst.data[p + 3] / 255
    const oa = sa + da * (1 - sa)
    for (let c = 0; c < 3; c++) {
      const s = src.data[p + c]
      const d = dst.data[p + c]
      dst.data[p + c] = oa === 0 ? 0 : Math.round((s * sa + d * da * (1 - sa)) / oa)
    }
    dst.data[p + 3] = Math.round(oa * 255)
  }
  return dst
}

/** Красит маску зелья в цвет potion color (как tint в игре). */
function tint(mask, [r, g, b]) {
  const out = { ...mask, data: Buffer.from(mask.data) }
  for (let i = 0; i < out.width * out.height; i++) {
    const p = i * 4
    out.data[p] = clamp255((out.data[p] * r) / 255)
    out.data[p + 1] = clamp255((out.data[p + 1] * g) / 255)
    out.data[p + 2] = clamp255((out.data[p + 2] * b) / 255)
  }
  return out
}

/**
 * Изометрический куб 2:1 из тайловых текстур: top — верхняя грань, side — боковые.
 * Сторона тайла = size, сторона грани = size → канва size*2 x size*2.
 */
function isoCube(top, side, size) {
  const width = size * 2
  const height = size * 2
  const out = blank(width, height)
  /** @param {Pixels} tex @param {number} u @param {number} v */
  const texel = (tex, u, v) => {
    const x = Math.max(0, Math.min(size - 1, Math.floor(u)))
    const y = Math.max(0, Math.min(size - 1, Math.floor(v)))
    const p = (y * tex.width + x) * 4
    return [tex.data[p], tex.data[p + 1], tex.data[p + 2], tex.data[p + 3]]
  }
  const put = (x, y, rgba) => {
    const p = (y * width + x) * 4
    out.data[p] = rgba[0]
    out.data[p + 1] = rgba[1]
    out.data[p + 2] = rgba[2]
    out.data[p + 3] = rgba[3]
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      // правая грань: x = size + u, y = size + v - u/2
      const ru = cx - size
      const rv = cy - size + ru / 2
      if (ru >= 0 && ru < size && rv >= 0 && rv < size) {
        put(x, y, multiplyPixel(texel(side, ru, rv), 0.62))
        continue
      }
      // левая грань: x = u, y = size/2 + u/2 + v
      const lu = cx
      const lv = cy - size / 2 - lu / 2
      if (lu >= 0 && lu < size && lv >= 0 && lv < size) {
        put(x, y, multiplyPixel(texel(side, lu, lv), 0.8))
        continue
      }
      // верхняя грань: x = size + u - v, y = (u + v)/2
      const tu = cy + (cx - size) / 2
      const tv = cy - (cx - size) / 2
      if (tu >= 0 && tu < size && tv >= 0 && tv < size) {
        put(x, y, texel(top, tu, tv))
      }
    }
  }
  return out
}

function multiplyPixel(rgba, k) {
  return [clamp255(rgba[0] * k), clamp255(rgba[1] * k), clamp255(rgba[2] * k), rgba[3]]
}

async function save(pixels, name) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, name)
  await sharp(pixels.data, {
    raw: { width: pixels.width, height: pixels.height, channels: 4 }
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(file)
  const kb = (fs.statSync(file).size / 1024).toFixed(1)
  console.log(`ok  ${name}  ${pixels.width}x${pixels.height}  ${kb} KB`)
}

// --- крипер: лицо из листа скина (8x8 в точке 8,8) ---
const creeperSheet = await load('creeper.png')
await save(scale(crop(creeperSheet, 8, 8, 8, 8), 16), 'mc-creeper.png')

// --- алмаз ---
await save(scale(await load('diamond.png'), 8), 'mc-diamond.png')

// --- сердце из HUD-спрайта ---
await save(scale(await load('full.png'), 12), 'mc-heart.png')

// --- бутылка опыта ---
await save(scale(await load('experience_bottle.png'), 8), 'mc-xp.png')

// --- зелье: bottle + overlay, затонированный как в игре (цвет ягодного зелья) ---
const bottle = await load('potion.png')
const overlay = await load('potion_overlay.png')
const liquid = tint(overlay, [216, 82, 178])
const potion = blank(16, 16)
over(potion, bottle)
over(potion, liquid)
await save(scale(potion, 8), 'mc-potion-berry.png')

// --- куб травы: top + side из блочных текстур, потом nearest x4 ---
// В 1.21 трава лежит обесцвеченной: game применяет биомный tint, здесь — цвет равнин.
const GRASS_COLOR = [121, 192, 90]
const grassTop = tint(await load('grass_block_top.png'), GRASS_COLOR)
const grassSideBase = await load('grass_block_side.png')
const grassSideOverlay = tint(await load('grass_block_side_overlay.png'), GRASS_COLOR)
const grassSide = over({ ...grassSideBase, data: Buffer.from(grassSideBase.data) }, grassSideOverlay)
await save(scale(isoCube(crop(grassTop, 0, 0, 16, 16), crop(grassSide, 0, 0, 16, 16), 16), 4), 'mc-grass.png')
