import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
fs.mkdirSync(buildDir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#122a20"/>
      <stop offset="0.55" stop-color="#0a1712"/>
      <stop offset="1" stop-color="#060f0b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="#57d98a" stop-opacity="0.34"/>
      <stop offset="0.65" stop-color="#57d98a" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#57d98a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="top" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a7e97a"/>
      <stop offset="0.5" stop-color="#6ecb43"/>
      <stop offset="1" stop-color="#4aa62c"/>
    </linearGradient>
    <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a86f3e"/>
      <stop offset="1" stop-color="#6d4423"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8ef0b4" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#57d98a" stop-opacity="0.15"/>
    </linearGradient>
  </defs>

  <rect x="28" y="28" width="968" height="968" rx="228" fill="url(#bg)"/>
  <rect x="28" y="28" width="968" height="968" rx="228" fill="url(#glow)"/>
  <rect x="46" y="46" width="932" height="932" rx="212" fill="none" stroke="url(#rim)" stroke-width="3"/>

  <g opacity="0.5" fill="#9fe0bb">
    <rect x="190" y="210" width="10" height="10" rx="2"/>
    <rect x="236" y="168" width="6" height="6" rx="1.5" opacity="0.6"/>
    <rect x="812" y="252" width="9" height="9" rx="2" opacity="0.7"/>
    <rect x="770" y="204" width="5" height="5" rx="1.2" opacity="0.45"/>
    <rect x="228" y="742" width="7" height="7" rx="2" opacity="0.5"/>
    <rect x="806" y="700" width="10" height="10" rx="2" opacity="0.4"/>
  </g>

  <ellipse cx="512" cy="760" rx="238" ry="46" fill="#000000" opacity="0.35"/>

  <g transform="translate(512 520) scale(11.6) translate(-32 -34)">
    <polygon points="32,4 60,18 32,32 4,18" fill="url(#top)"/>
    <polygon points="4,18 32,32 32,60 4,46" fill="url(#dirt)"/>
    <polygon points="60,18 32,32 32,60 60,46" fill="#5a3a1e"/>
    <polygon points="4,18 32,32 32,39 4,25" fill="#63bf3a" opacity="0.95"/>
    <polygon points="60,18 32,32 32,39 60,25" fill="#4c9c2c"/>
    <g fill="#8f5f36" opacity="0.5">
      <rect x="12" y="27" width="5" height="5"/>
      <rect x="24" y="38" width="4" height="4"/>
      <rect x="8" y="38" width="4" height="4"/>
      <rect x="41" y="34" width="5" height="5"/>
      <rect x="48" y="43" width="4" height="4"/>
    </g>
    <g fill="#a7e97a" opacity="0.8">
      <rect x="12" y="16" width="6" height="6"/>
      <rect x="27" y="10" width="5" height="5"/>
      <rect x="41" y="16" width="6" height="6"/>
      <rect x="22" y="22" width="4" height="4"/>
    </g>
    <polygon points="32,4 60,18 32,32 4,18" fill="none" stroke="#173a27" stroke-width="1.4" stroke-opacity="0.5"/>
  </g>

  <g transform="translate(716 330) rotate(12)">
    <polygon points="0,-26 18,0 0,26 -18,0" fill="#7be3ff" opacity="0.95"/>
    <polygon points="0,-26 18,0 0,0 -18,0" fill="#c9f4ff" opacity="0.75"/>
  </g>

  <g fill="#57d98a">
    <circle cx="760" cy="368" r="5" opacity="0.5"/>
    <circle cx="780" cy="352" r="3" opacity="0.35"/>
  </g>
</svg>`

const png = await sharp(Buffer.from(svg)).png().toBuffer()
fs.writeFileSync(path.join(buildDir, 'icon.png'), png)
fs.writeFileSync(path.join(buildDir, 'icon-256.png'), await sharp(png).resize(256, 256).png().toBuffer())
fs.writeFileSync(path.join(root, 'screenshots', 'icon.png'), await sharp(png).resize(512, 512).png().toBuffer())
console.log('Иконки сохранены в build/icon.png')
