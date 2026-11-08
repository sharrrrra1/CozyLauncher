import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { rulesAllow, type RuleContext } from '../src/main/core/rules'
import {
  buildClasspath,
  buildClientClasspath,
  dedupeClasspath,
  legacyNatives,
  parseMavenName,
  selectLibraries,
  type Library,
  type VersionJson
} from '../src/main/core/version'
import { buildGameArgs, buildJvmArgs, splitCommandLine } from '../src/main/core/args'
import { isValidNickname, normalizeUuid, offlineUuid } from '../src/main/core/uuid'

const windowsContext: RuleContext = {
  osName: 'windows',
  osArch: 'x64',
  osVersion: '10.0.19045',
  features: {}
}

test('rules: no rules means allowed', () => {
  assert.equal(rulesAllow(undefined, windowsContext), true)
  assert.equal(rulesAllow([], windowsContext), true)
})

test('rules: platform restrictions', () => {
  assert.equal(
    rulesAllow([{ action: 'allow', os: { name: 'windows' } }], windowsContext),
    true
  )
  assert.equal(
    rulesAllow([{ action: 'allow', os: { name: 'linux' } }], windowsContext),
    false
  )
  assert.equal(
    rulesAllow(
      [
        { action: 'allow', os: { name: 'linux' } },
        { action: 'disallow', os: { name: 'windows' } }
      ],
      windowsContext
    ),
    false
  )
})

test('rules: feature gating', () => {
  assert.equal(
    rulesAllow(
      [{ action: 'allow', features: { has_custom_resolution: true } }],
      { ...windowsContext, features: { has_custom_resolution: true } }
    ),
    true
  )
  assert.equal(
    rulesAllow(
      [{ action: 'allow', features: { has_custom_resolution: true } }],
      windowsContext
    ),
    false
  )
})

test('libraries: arm64 natives are filtered out on x64', () => {
  const libraries: Library[] = [
    { name: 'org.lwjgl:lwjgl:3.4.3', downloads: { artifact: { url: '', path: 'main.jar' } } },
    {
      name: 'org.lwjgl:lwjgl:3.4.3:natives-windows',
      downloads: { artifact: { url: '', path: 'win.jar' } }
    },
    {
      name: 'org.lwjgl:lwjgl:3.4.3:natives-windows-arm64',
      downloads: { artifact: { url: '', path: 'win-arm.jar' } }
    },
    {
      name: 'org.lwjgl:lwjgl-freetype:3.4.3:natives-macos',
      downloads: { artifact: { url: '', path: 'mac.jar' } },
      rules: [{ action: 'allow', os: { name: 'osx' } }]
    }
  ]
  const selected = selectLibraries(libraries, windowsContext).map((library) => library.name)
  assert.deepEqual(selected, [
    'org.lwjgl:lwjgl:3.4.3',
    'org.lwjgl:lwjgl:3.4.3:natives-windows'
  ])
})

test('libraries: classpath dedupe keeps main and native classifiers apart', () => {
  const libraries: Library[] = [
    { name: 'org.lwjgl:lwjgl:3.4.3', downloads: { artifact: { url: '', path: 'a/main.jar' } } },
    {
      name: 'org.lwjgl:lwjgl:3.4.3:natives-windows',
      downloads: { artifact: { url: '', path: 'a/native.jar' } }
    },
    { name: 'org.lwjgl:lwjgl:3.3.0', downloads: { artifact: { url: '', path: 'b/main.jar' } } }
  ]
  const deduped = dedupeClasspath(libraries)
  assert.equal(deduped.length, 2)
  const cp = buildClasspath(deduped, 'C:\\\\libs')
  assert.match(cp, /a\\native\.jar/)
  assert.match(cp, /b\\main\.jar/)
})

test('libraries: client jar is first on the classpath', () => {
  const libraries: Library[] = [
    { name: 'org.lwjgl:lwjgl:3.4.3', downloads: { artifact: { url: '', path: 'a/main.jar' } } }
  ]
  const cp = buildClientClasspath('C:\\\\game\\\\versions\\\\26.3\\\\26.3.jar', libraries, 'C:\\\\libs')
  assert.equal(cp.split(path.delimiter)[0], 'C:\\\\game\\\\versions\\\\26.3\\\\26.3.jar')
  assert.match(cp, /a\\main\.jar/)
})

test('libraries: legacy natives substitution', () => {
  const libraries: Library[] = [
    {
      name: 'org.lwjgl.lwjgl:lwjgl-platform:2.9.4',
      downloads: {
        artifact: { url: '', path: 'main.jar' },
        classifiers: {
          'natives-windows-64': { url: '', path: 'natives/lwjgl-64.jar' }
        }
      },
      natives: { windows: 'natives-windows-${arch}' },
      extract: { exclude: ['META-INF/'] }
    }
  ]
  const natives = legacyNatives(libraries, windowsContext, 'C:\\\\libs')
  assert.equal(natives.length, 1)
  assert.match(natives[0].jarPath, /lwjgl-64\.jar$/)
})

test('maven names are parsed', () => {
  assert.deepEqual(parseMavenName('org.lwjgl:lwjgl:3.4.3:natives-windows'), {
    group: 'org.lwjgl',
    artifact: 'lwjgl',
    version: '3.4.3',
    classifier: 'natives-windows',
    extension: 'jar'
  })
})

test('game args substitute variables and gate features', () => {
  const version = {
    id: '26.3',
    type: 'release',
    mainClass: 'net.minecraft.client.main.Main',
    assets: '34',
    assetIndex: { id: '34', url: '' },
    downloads: { client: { url: '' } },
    libraries: [],
    arguments: {
      game: [
        '--username',
        '${auth_player_name}',
        {
          rules: [{ action: 'allow', features: { has_custom_resolution: true } }],
          value: ['--width', '${resolution_width}', '--height', '${resolution_height}']
        }
      ],
      jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
    }
  } satisfies VersionJson

  const ctx = { ...windowsContext, features: { has_custom_resolution: true } }
  const args = buildGameArgs(version, ctx, {
    auth_player_name: 'Cozy',
    resolution_width: '1920',
    resolution_height: '1080'
  })
  assert.deepEqual(args, [
    '--username',
    'Cozy',
    '--width',
    '1920',
    '--height',
    '1080'
  ])

  const jvm = buildJvmArgs(version, ctx, {
    minRamMb: 512,
    maxRamMb: 4096,
    classpath: 'cp.jar',
    nativesDir: 'natives',
    launcherName: 'cozy',
    launcherVersion: '1.0.0',
    vars: {},
    extraJvmArgs: ['-XX:+UseG1GC']
  })
  assert.deepEqual(jvm, [
    '-Xms512M',
    '-Xmx4096M',
    '-Djava.library.path=natives',
    '-cp',
    'cp.jar',
    '-XX:+UseG1GC'
  ])
})

test('legacy argument splitting respects quotes', () => {
  assert.deepEqual(splitCommandLine('--username "Cozy Player" --x 1'), [
    '--username',
    'Cozy Player',
    '--x',
    '1'
  ])
})

test('offline uuid matches the canonical algorithm', () => {
  assert.equal(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f')
  assert.equal(offlineUuid('Notch'), offlineUuid('Notch'))
  assert.notEqual(offlineUuid('Notch'), offlineUuid('notch'))
})

test('nicknames and uuid normalization', () => {
  assert.equal(isValidNickname('Cozy_Player'), true)
  assert.equal(isValidNickname('ab'), false)
  assert.equal(isValidNickname('вредный'), false)
  assert.equal(
    normalizeUuid('B50AD385829D3141A2167E7D7539BA7F'),
    'b50ad385-829d-3141-a216-7e7d7539ba7f'
  )
})
