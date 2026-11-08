import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCrash } from '../src/main/core/crash'
import { applyMirror, mirrorCandidates } from '../src/main/core/mirror'
import { parseServersDat, writeServersDat } from '../src/main/core/nbt'
import { parseStatusJson, stripFormatting } from '../src/main/core/server-ping'

test('crash: out of memory recommendation', () => {
  const analysis = analyzeCrash({
    exitCode: 1,
    reportText: [
      '---- Minecraft Crash Report ----',
      'Description: Rendering screen',
      'java.lang.OutOfMemoryError: Java heap space',
      'Caused by: java.lang.OutOfMemoryError: Java heap space'
    ].join('\n'),
    memoryMb: 2048,
    modFiles: ['sodium-fabric-0.6.13.jar']
  })
  assert.equal(analysis.recommendation, 'more-memory')
  assert.equal(analysis.signature, 'OutOfMemoryError')
  assert.match(analysis.title, /памят/i)
})

test('crash: missing dependency points at mclo.gs-less hints', () => {
  const analysis = analyzeCrash({
    exitCode: 1,
    reportText:
      'Incompatible mods found!\nMod betterend requires version 1.7.0 of cloth-config, which is missing!',
    memoryMb: 4096
  })
  assert.equal(analysis.recommendation, 'check-mod-dependency')
  assert.equal(analysis.signature, 'MissingDependency')
})

test('crash: mixin conflict lists suspects', () => {
  const analysis = analyzeCrash({
    exitCode: 1,
    reportText: 'Mixin apply failed: mixin.sodium.json from mod sodium',
    memoryMb: 4096,
    modFiles: ['sodium-fabric-0.6.13.jar']
  })
  assert.equal(analysis.recommendation, 'disable-last-mod')
  assert.equal(analysis.signature, 'MixinConflict')
  assert.ok(analysis.suspects.length > 0)
})

test('crash: wrong java is detected', () => {
  const analysis = analyzeCrash({
    exitCode: 1,
    reportText: 'UnsupportedClassVersionError: requires Java 21',
    memoryMb: 4096
  })
  assert.equal(analysis.recommendation, 'fix-java')
  assert.match(analysis.summary, /Java 21/)
})

test('crash: unknown crash still yields a readable card', () => {
  const analysis = analyzeCrash({ exitCode: 255, memoryMb: 2048 })
  assert.equal(analysis.recommendation, 'safe-mode')
  assert.ok(analysis.hints.length >= 3)
  assert.ok(analysis.details.length >= 1)
})

test('servers.dat round trip', () => {
  const buffer = writeServersDat([
    { name: 'Cozy', ip: 'play.cozy.example:25565', icon: 'data:image/png;base64,AAA' },
    { name: 'Vanilla', ip: 'mc.example.com' }
  ])
  const parsed = parseServersDat(buffer)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].name, 'Cozy')
  assert.equal(parsed[0].ip, 'play.cozy.example:25565')
  assert.equal(parsed[0].icon, 'data:image/png;base64,AAA')
  assert.equal(parsed[1].name, 'Vanilla')
})

test('server list ping json flattens motd and favicon', () => {
  const status = parseStatusJson(
    JSON.stringify({
      version: { name: '1.21.4', protocol: 769 },
      players: { online: 12, max: 100 },
      description: {
        text: 'Добро пожаловать в ',
        extra: [{ text: 'Cozy' }, { text: 'POLIT', color: 'gold' }]
      },
      favicon: 'data:image/png;base64,AAAA'
    }),
    'mc.example.com',
    25565,
    42
  )
  assert.equal(status.online, true)
  assert.equal(status.players?.online, 12)
  assert.equal(status.version, '1.21.4')
  assert.equal(status.motd, 'Добро пожаловать в CozyPOLIT')
  assert.equal(status.latencyMs, 42)
  assert.ok(status.favicon?.startsWith('data:image/png'))
})

test('server list ping rejects broken json', () => {
  const status = parseStatusJson('not json', 'host', 25565)
  assert.equal(status.online, false)
  assert.ok(status.error)
})

test('formatting codes are stripped', () => {
  assert.equal(stripFormatting('§aHello §lworld'), 'Hello world')
})

test('mojang urls are rewritten to BMCLAPI', () => {
  assert.equal(
    applyMirror('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', 'bmclapi'),
    'https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json'
  )
  assert.equal(
    applyMirror('https://piston-meta.mojang.com/v1/packages/abc/1.21.4.json', 'bmclapi'),
    'https://bmclapi2.bangbang93.com/version/1.21.4/json'
  )
  assert.equal(
    applyMirror('https://resources.download.minecraft.net/ab/abcdef', 'bmclapi'),
    'https://bmclapi2.bangbang93.com/assets/ab/abcdef'
  )
})

test('non-mojang urls and official mode stay untouched', () => {
  const modrinth = 'https://cdn.modrinth.com/data/a/versions/b/file.jar'
  assert.equal(applyMirror(modrinth, 'bmclapi'), modrinth)
  assert.deepEqual(mirrorCandidates(modrinth, 'bmclapi'), [modrinth])
  const official = 'https://launchermeta.mojang.com/x.json'
  assert.deepEqual(mirrorCandidates(official, 'official'), [official])
  assert.deepEqual(mirrorCandidates(official, 'bmclapi'), [
    'https://bmclapi2.bangbang93.com/x.json',
    official
  ])
})
