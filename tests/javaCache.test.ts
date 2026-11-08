import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJavaCache, writeJavaCache, type CachedJava } from '../src/main/core/javaCache'

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-java-cache-')), 'java-probe.json')
}

function entry(overrides: Partial<CachedJava> = {}): CachedJava {
  return { path: 'C:/java/bin/java.exe', major: 21, version: '21.0.2', at: Date.now(), ...overrides }
}

test('java cache: write then read roundtrip', () => {
  const file = tmpFile()
  writeJavaCache(file, { 'c:/java/bin/java.exe': entry() })
  const cache = readJavaCache(file, 24 * 60 * 60 * 1000)
  assert.equal(cache['c:/java/bin/java.exe']?.major, 21)
})

test('java cache: expired entries are dropped', () => {
  const file = tmpFile()
  writeJavaCache(file, {
    fresh: entry({ at: Date.now() }),
    stale: entry({ at: Date.now() - 25 * 60 * 60 * 1000 })
  })
  const cache = readJavaCache(file, 24 * 60 * 60 * 1000)
  assert.ok(cache.fresh)
  assert.equal(cache.stale, undefined)
})

test('java cache: broken file and invalid entries are ignored', () => {
  const file = tmpFile()
  fs.writeFileSync(file, '{not json')
  assert.deepEqual(readJavaCache(file, 1000), {})
  writeJavaCache(file, {
    bad: { path: 5, major: 'x', version: null, at: 'y' } as unknown as CachedJava
  })
  assert.deepEqual(readJavaCache(file, 1000), {})
})
