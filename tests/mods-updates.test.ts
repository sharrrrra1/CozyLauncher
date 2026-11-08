import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mergeVersions, resolveInheritance } from '../src/main/core/version-resolve'
import { synthesizeFabricProfile, fabricVersionId, type FabricMetaEntry } from '../src/main/core/fabric-profile'
import { resolveDependencies, type DepProject, type DepVersion } from '../src/main/core/deps'
import { buildGameArgs, buildServerArgs, isValidServerHost } from '../src/main/core/args'
import { parsePromo } from '../src/main/core/promo-schema'
import { resolveInside } from '../src/main/core/pack-paths'
import { hashBuffer, hashMatches } from '../src/main/core/hash-util'
import type { Library, VersionJson } from '../src/main/core/version'
import type { RuleContext } from '../src/main/core/rules'

const ctx: RuleContext = { osName: 'windows', osArch: 'x64', osVersion: '10.0', features: {} }

const parent = (): VersionJson => ({
  id: '1.21.4',
  type: 'release',
  mainClass: 'net.minecraft.client.main.Main',
  releaseTime: '2024-12-03T10:00:00+00:00',
  assets: '19',
  assetIndex: { id: '19', url: 'https://example/index.json', sha1: 'idx', size: 10 },
  downloads: { client: { url: 'https://example/client.jar', size: 100, sha1: 'c' } },
  javaVersion: { component: 'java-runtime-delta', majorVersion: 21 },
  libraries: [{ name: 'com.example:parent:1.0', downloads: { artifact: { url: 'https://example/a.jar', path: 'com/example/parent/1.0/parent-1.0.jar' } } }],
  arguments: {
    game: ['--username', '${auth_player_name}'],
    jvm: ['-cp', '${classpath}']
  }
})

const child = (): VersionJson => ({
  id: '1.21.4-fabric-loader-0.20.1',
  type: 'release',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  assets: '',
  assetIndex: { id: '', url: '' },
  downloads: { client: { url: '' } },
  libraries: [{ name: 'net.fabricmc:fabric-loader:0.20.1', downloads: { artifact: { url: 'https://maven/x.jar', path: 'net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar' } } }],
  inheritsFrom: '1.21.4'
})

test('inheritsFrom: child wins, libraries and arguments merge', () => {
  const merged = mergeVersions(parent(), child())
  assert.equal(merged.id, '1.21.4-fabric-loader-0.20.1')
  assert.equal(merged.mainClass, 'net.fabricmc.loader.impl.launch.knot.KnotClient')
  assert.equal(merged.downloads.client.url, 'https://example/client.jar')
  assert.equal(merged.assetIndex.id, '19')
  assert.equal(merged.javaVersion?.majorVersion, 21)
  assert.equal(merged.clientVersionId, '1.21.4')
  assert.deepEqual(
    merged.libraries.map((library) => library.name),
    ['com.example:parent:1.0', 'net.fabricmc:fabric-loader:0.20.1']
  )
  assert.deepEqual(merged.arguments?.game, ['--username', '${auth_player_name}'])
  assert.deepEqual(merged.arguments?.jvm, ['-cp', '${classpath}'])
})

test('inheritsFrom: cycles and excessive depth are rejected', () => {
  const loop: Record<string, VersionJson> = {
    a: { ...parent(), id: 'a', inheritsFrom: 'b' },
    b: { ...parent(), id: 'b', inheritsFrom: 'a' }
  }
  assert.throws(() => resolveInheritance('a', (id) => loop[id] ?? null), /Цикл/)

  const deep: Record<string, VersionJson> = {}
  for (let i = 0; i < 7; i += 1) {
    deep[`v${i}`] = { ...parent(), id: `v${i}`, inheritsFrom: `v${i + 1}` }
  }
  deep.v7 = { ...parent(), id: 'v7' }
  assert.throws(() => resolveInheritance('v0', (id) => deep[id] ?? null), /Цикл/)
})

const fabricMeta = (): FabricMetaEntry => ({
  loader: { version: '0.20.1', maven: 'net.fabricmc:fabric-loader:0.20.1', stable: true },
  intermediary: { version: '1.21.4', maven: 'net.fabricmc:intermediary:1.21.4' },
  launcherMeta: {
    mainClass: { client: 'net.fabricmc.loader.impl.launch.knot.KnotClient' },
    libraries: {
      common: [
        { name: 'org.ow2.asm:asm:9.7.1', url: 'https://maven.fabricmc.net/', sha1: 'asm', size: 12 }
      ]
    }
  }
})

test('Fabric profile contains loader + intermediary and inherits vanilla', () => {
  const profile = synthesizeFabricProfile('1.21.4', fabricMeta())
  assert.equal(profile.id, fabricVersionId('1.21.4', '0.20.1'))
  assert.equal(profile.mainClass, 'net.fabricmc.loader.impl.launch.knot.KnotClient')
  assert.equal(profile.inheritsFrom, '1.21.4')
  const names = profile.libraries.map((library) => library.name)
  assert.ok(names.includes('net.fabricmc:fabric-loader:0.20.1'))
  assert.ok(names.includes('net.fabricmc:intermediary:1.21.4'))
  assert.equal(new Set(names).size, names.length)
  for (const library of profile.libraries) {
    assert.ok(library.downloads?.artifact?.url?.startsWith('https://maven.fabricmc.net/'))
    assert.ok(library.downloads?.artifact?.path)
  }
})

function dep(
  projectId: string,
  id: string,
  dependencies: DepVersion['dependencies'] = [],
  size = 10
): DepVersion {
  return {
    id,
    projectId,
    versionNumber: `v-${id}`,
    filename: `${id}.jar`,
    url: `https://cdn.modrinth.com/${id}.jar`,
    size,
    dependencies
  }
}

test('dependency closure: required recursively, optional only on demand, incompatible blocks', async () => {
  const root = dep('root', 'root-1', [
    { projectId: 'a', versionId: null, type: 'required' },
    { projectId: 'b', versionId: null, type: 'optional' },
    { projectId: 'c', versionId: null, type: 'incompatible' }
  ])
  const projects: Record<string, DepProject> = {
    a: { title: 'A', versions: [dep('a', 'a-1', [{ projectId: 'd', versionId: null, type: 'required' }])] },
    b: { title: 'B', versions: [dep('b', 'b-1')] },
    d: { title: 'D', versions: [dep('d', 'd-1')] }
  }
  const result = await resolveDependencies({
    root,
    rootTitle: 'Root',
    loadProject: async (id) => projects[id] ?? null
  })
  assert.deepEqual(result.files.map((file) => file.projectId).sort(), ['a', 'd', 'root'])
  assert.equal(result.optional.length, 1)
  assert.equal(result.optional[0].projectId, 'b')
  assert.equal(result.blocked.length, 1)

  const withOptional = await resolveDependencies({
    root,
    rootTitle: 'Root',
    includeOptional: ['b'],
    loadProject: async (id) => projects[id] ?? null
  })
  assert.deepEqual(withOptional.files.map((file) => file.projectId).sort(), ['a', 'b', 'd', 'root'])
})

test('dependency closure handles cycles and enforces file/size caps', async () => {
  const root = dep('root', 'root-1', [{ projectId: 'a', versionId: null, type: 'required' }])
  const projects: Record<string, DepProject> = {
    a: { title: 'A', versions: [dep('a', 'a-1', [{ projectId: 'root', versionId: null, type: 'required' }])] }
  }
  const result = await resolveDependencies({
    root,
    rootTitle: 'Root',
    loadProject: async (id) => projects[id] ?? null
  })
  assert.equal(result.files.length, 2)

  await assert.rejects(
    resolveDependencies({
      root,
      rootTitle: 'Root',
      maxFiles: 1,
      loadProject: async (id) => projects[id] ?? null
    }),
    /Слишком много файлов/
  )

  await assert.rejects(
    resolveDependencies({
      root: dep('root', 'root-1', [], 500),
      rootTitle: 'Root',
      maxBytes: 400,
      loadProject: async () => null
    }),
    /Слишком большой объём/
  )
})

test('--server/--port are validated and appear once', () => {
  const version: VersionJson = {
    ...parent(),
    arguments: { game: ['--username', '${auth_player_name}', '--server', 'old.example', '--port', '1234'] }
  }
  const args = buildGameArgs(version, ctx, { auth_player_name: 'Cozy' }, {
    server: { host: 'play.cozypolit.ru', port: 25565 },
    extraGameArgs: ['--demo']
  })
  assert.equal(args.filter((arg) => arg === '--server').length, 1)
  assert.equal(args.filter((arg) => arg === '--port').length, 1)
  assert.deepEqual(args.slice(-7), [
    '--username',
    'Cozy',
    '--server',
    'play.cozypolit.ru',
    '--port',
    '25565',
    '--demo'
  ])
  assert.throws(() => buildServerArgs('bad host', 25565), /Некорректный адрес/)
  assert.throws(() => buildServerArgs('play.example', 0), /Некорректный порт/)
  assert.equal(isValidServerHost('play.cozypolit.ru'), true)
  assert.equal(isValidServerHost('-bad.example'), false)
})

test('promo JSON is validated strictly', () => {
  const base = {
    schema: 1,
    status: 'closed',
    title: 'CozyPOLIT',
    text: 'Скоро',
    features: ['Города'],
    server: { mcVersion: '1.21.4', address: '', port: 25565 },
    updatedAt: '2026-11-08'
  }
  assert.ok(parsePromo(base))
  assert.equal(parsePromo({ ...base, status: 'unknown' }), null)
  assert.equal(parsePromo({ ...base, status: 'open' }), null)
  assert.ok(parsePromo({ ...base, status: 'open', server: { ...base.server, address: 'play.cozypolit.ru' } }))
  assert.equal(parsePromo({ ...base, server: { ...base.server, address: 'evil host' } }), null)
  assert.equal(parsePromo({ ...base, server: { ...base.server, port: 99999 } }), null)
  assert.equal(parsePromo({ ...base, schema: 2 }), null)
})

test('mrpack paths cannot escape the run folder', () => {
  const root = path.resolve('C:/game/versions/fabric/run')
  assert.ok(resolveInside(root, 'mods/sodium.jar').startsWith(path.resolve(root)))
  assert.throws(() => resolveInside(root, '../evil.jar'), /запрещён/)
  assert.throws(() => resolveInside(root, 'mods/../../evil.jar'), /запрещён/)
  assert.throws(() => resolveInside(root, 'C:/Windows/system32/evil.jar'), /запрещён/)
  assert.throws(() => resolveInside(root, '\\evil.jar'), /запрещён/)
})

test('sha512 verification accepts the real hash and rejects a swapped file', () => {
  const data = Buffer.from('cozy mod bytes')
  const sha512 = hashBuffer('sha512', data)
  assert.equal(sha512.length, 128)
  assert.equal(hashMatches(sha512, hashBuffer('sha512', data)), true)
  assert.equal(hashMatches(sha512, hashBuffer('sha512', Buffer.from('tampered'))), false)
  assert.equal(hashMatches(undefined, 'anything'), true)
})
