import os from 'node:os'

export interface Rule {
  action: 'allow' | 'disallow'
  os?: {
    name?: string
    arch?: string
    version?: string
  }
  features?: Record<string, boolean>
}

export interface RuleContext {
  osName: string
  osArch: string
  osVersion: string
  features: Record<string, boolean>
}

export function osNameFromPlatform(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'osx'
  return 'linux'
}

export function osArchFromNode(arch: string = process.arch): string {
  if (arch === 'x64') return 'x64'
  if (arch === 'ia32') return 'x86'
  if (arch === 'arm64') return 'arm64'
  return arch
}

export function createRuleContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    osName: osNameFromPlatform(),
    osArch: osArchFromNode(),
    osVersion: os.release(),
    features: {},
    ...overrides
  }
}

export function ruleMatches(rule: Rule, ctx: RuleContext): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== ctx.osName) return false
    if (rule.os.arch && rule.os.arch !== ctx.osArch) return false
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(ctx.osVersion)) return false
      } catch {
        return false
      }
    }
  }
  if (rule.features) {
    for (const [key, expected] of Object.entries(rule.features)) {
      if (Boolean(ctx.features[key]) !== expected) return false
    }
  }
  return true
}

export function rulesAllow(
  rules: Rule[] | undefined,
  ctx: RuleContext
): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (ruleMatches(rule, ctx)) allowed = rule.action === 'allow'
  }
  return allowed
}
