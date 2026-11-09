import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { BLOCK_MARK_SVG } from '../src/shared/block-mark.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
fs.mkdirSync(buildDir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#17332c"/>
      <stop offset="0.55" stop-color="#0c1d18"/>
      <stop offset="1" stop-color="#06110d"/>
    </linearGradient>
  </defs>

  <rect x="28" y="28" width="968" height="968" rx="228" fill="url(#bg)"/>

  <g fill="#f6e7c1">
    <rect x="170" y="182" width="18" height="18" opacity="0.75"/>
    <rect x="836" y="150" width="12" height="12" opacity="0.55"/>
    <rect x="748" y="298" width="10" height="10" opacity="0.4"/>
    <rect x="232" y="310" width="10" height="10" opacity="0.4"/>
    <rect x="872" y="420" width="8" height="8" opacity="0.3"/>
  </g>

  <ellipse cx="512" cy="874" rx="268" ry="38" fill="#000000" opacity="0.3"/>

  <g transform="translate(512 520) scale(13.2) translate(-32 -32)">
    ${BLOCK_MARK_SVG}
  </g>
</svg>`

const png = await sharp(Buffer.from(svg)).png().toBuffer()
fs.writeFileSync(path.join(buildDir, 'icon.png'), png)
fs.writeFileSync(path.join(buildDir, 'icon-256.png'), await sharp(png).resize(256, 256).png().toBuffer())
fs.writeFileSync(path.join(root, 'screenshots', 'icon.png'), await sharp(png).resize(512, 512).png().toBuffer())
console.log('Иконки сохранены в build/icon.png')