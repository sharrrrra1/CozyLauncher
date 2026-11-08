import path from 'node:path'

/**
 * Resolves a path from an untrusted archive inside `root`.
 * Absolute paths, drive letters, backslashes and `..` are rejected (zip-slip).
 */
export function resolveInside(root: string, relative: string): string {
  if (!relative || relative.includes('\0')) throw new Error('Пустой путь в модпаке')
  if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative) || relative.startsWith('\\')) {
    throw new Error(`Абсолютный путь в модпаке запрещён: ${relative}`)
  }
  const normalized = relative.replace(/\\/g, '/')
  if (normalized.split('/').includes('..')) {
    throw new Error(`Выход за пределы папки запрещён: ${relative}`)
  }
  const target = path.resolve(root, normalized)
  const prefix = `${path.resolve(root)}${path.sep}`
  if (target !== path.resolve(root) && !target.startsWith(prefix)) {
    throw new Error(`Выход за пределы папки запрещён: ${relative}`)
  }
  return target
}
