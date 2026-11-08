import { createHash } from 'node:crypto'

/** Constant-shape comparison that is safe for optional expected hashes. */
export function hashMatches(expected: string | undefined, actual: string): boolean {
  if (!expected) return true
  return expected.trim().toLowerCase() === actual.trim().toLowerCase()
}

export function hashBuffer(algorithm: 'sha1' | 'sha512', data: Buffer | string): string {
  return createHash(algorithm).update(data).digest('hex')
}
