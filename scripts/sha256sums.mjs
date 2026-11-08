import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const releaseDir = path.resolve('release')
const { version } = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
const pattern = new RegExp(`^CozyLauncher-(Setup|Portable)-${version.replace(/\./g, '\\.')}\\.exe$`)

if (!fs.existsSync(releaseDir)) {
  console.error('Папка release/ не найдена. Сначала выполните npm run dist.')
  process.exit(1)
}

const files = fs
  .readdirSync(releaseDir)
  .filter((name) => pattern.test(name))
  .sort()

if (files.length === 0) {
  console.error('В release/ нет собранных .exe файлов.')
  process.exit(1)
}

const lines = []
for (const name of files) {
  const hash = createHash('sha256')
  const stream = fs.createReadStream(path.join(releaseDir, name))
  await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  const digest = hash.digest('hex')
  lines.push(`${digest}  ${name}`)
  console.log(`${digest}  ${name}`)
}

fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)
console.log(`\nЗаписано: ${path.join(releaseDir, 'SHA256SUMS.txt')}`)
