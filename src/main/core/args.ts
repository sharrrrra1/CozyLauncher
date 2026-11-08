import type { LaunchArgument, VersionJson } from './version'
import { rulesAllow, type RuleContext } from './rules'

export function splitCommandLine(input: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (/\s/.test(char)) {
      if (current) {
        out.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }
  if (current) out.push(current)
  return out
}

export function substitute(value: string, vars: Record<string, string>): string {
  return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const replacement = vars[key]
    return replacement === undefined ? match : replacement
  })
}

export function collectArgs(
  args: LaunchArgument[] | undefined,
  ctx: RuleContext
): string[] {
  const result: string[] = []
  for (const arg of args ?? []) {
    if (typeof arg === 'string') {
      result.push(arg)
      continue
    }
    if (!rulesAllow(arg.rules, ctx)) continue
    if (Array.isArray(arg.value)) result.push(...arg.value)
    else result.push(arg.value)
  }
  return result
}

export interface BuildJvmOptions {
  minRamMb: number
  maxRamMb: number
  extraJvmArgs?: string[]
  classpath: string
  nativesDir: string
  launcherName: string
  launcherVersion: string
  vars: Record<string, string>
}

export function buildJvmArgs(
  version: VersionJson,
  ctx: RuleContext,
  options: BuildJvmOptions
): string[] {
  const raw = collectArgs(version.arguments?.jvm, ctx)
  const vars: Record<string, string> = {
    ...options.vars,
    natives_directory: options.nativesDir,
    classpath: options.classpath,
    launcher_name: options.launcherName,
    launcher_version: options.launcherVersion
  }
  const expanded = raw.map((arg) => substitute(arg, vars))
  const extras = (options.extraJvmArgs ?? []).filter(Boolean)
  return [
    `-Xms${options.minRamMb}M`,
    `-Xmx${options.maxRamMb}M`,
    ...expanded,
    ...extras
  ]
}

export interface BuildGameOptions {
  fullscreen?: boolean
  extraGameArgs?: string[]
  server?: { host: string; port: number }
}

export function isValidServerHost(host: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/.test(host)
}

export function isValidServerPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/** Builds `--server`/`--port` only for a strictly validated target. */
export function buildServerArgs(host: string, port: number): string[] {
  if (!isValidServerHost(host)) throw new Error('Некорректный адрес сервера')
  if (!isValidServerPort(port)) throw new Error('Некорректный порт сервера')
  return ['--server', host, '--port', String(port)]
}

function withoutServerArgs(args: string[]): string[] {
  const result: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--server' || arg === '--port') {
      index += 1
      continue
    }
    result.push(arg)
  }
  return result
}

export function buildGameArgs(
  version: VersionJson,
  ctx: RuleContext,
  vars: Record<string, string>,
  options: BuildGameOptions = {}
): string[] {
  const raw = version.arguments?.game
    ? collectArgs(version.arguments.game, ctx)
    : splitCommandLine(version.minecraftArguments ?? '')
  let args = raw.map((arg) => substitute(arg, vars))
  if (options.server) args = withoutServerArgs(args)
  if (options.fullscreen && !args.includes('--fullscreen')) args.push('--fullscreen')
  if (options.server) {
    args.push(...buildServerArgs(options.server.host, options.server.port))
  }
  args.push(...(options.extraGameArgs ?? []).filter(Boolean))
  return args
}
