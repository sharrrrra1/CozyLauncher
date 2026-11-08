import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { addOfflineAccount, listAccounts, selectAccount } from './core/auth/accounts'
import { getVersionStatus, installVersion } from './core/installer'
import { GameLauncher } from './core/launcher'
import {
  ensureModdedVersion,
  findModdedVersion,
  installMod,
  listInstalledMods,
  verifyModsBeforeLaunch
} from './core/mods'
import { getVersionJson } from './core/mojang'
import { createInstance, removeInstance } from './core/instances'

const START_SIGNAL = /Setting user:|Backend library:|Sound engine started|Created: |OpenAL initialized/

/**
 * Creates a throwaway instance, puts a dummy mod into it and verifies that a
 * safe-mode launch hides the mods folder during the run and restores it after.
 */
export async function runInstanceSmoke(versionId: string, outDir: string): Promise<void> {
  const startedAt = Date.now()
  const events: string[] = []
  const record = (message: string): void => {
    events.push(`${new Date().toISOString()} ${message}`)
    try {
      console.log(`[instance-smoke] ${message}`)
    } catch {
      // stdout may be closed when the launcher runs detached
    }
  }
  fs.mkdirSync(outDir, { recursive: true })

  let success = false
  let instanceId: string | null = null

  try {
    const existing = listAccounts().find(
      (account) => account.type === 'offline' && account.name === 'CozyTester'
    )
    const account = existing ?? addOfflineAccount('CozyTester')
    selectAccount(account.id)
    record(`account: ${account.name}`)

    if (!(await getVersionStatus(versionId)).installed) {
      record(`installing vanilla ${versionId}`)
      await installVersion(versionId, () => undefined)
    }
    record('vanilla ready')

    const profileId = await ensureModdedVersion(versionId)
    record(`fabric profile: ${profileId}`)

    const instance = createInstance({
      name: `Smoke ${Date.now()}`,
      versionId,
      loader: 'fabric',
      ramMb: 2048
    })
    instanceId = instance.id
    const modsDir = path.join(instance.dir, 'mods')
    const disabledDir = path.join(instance.dir, 'mods.cozy-safe-disabled')
    const smokeJar = 'cozy-smoke.jar'
    fs.mkdirSync(modsDir, { recursive: true })
    fs.writeFileSync(path.join(modsDir, smokeJar), Buffer.from('smoke'))
    record(`instance ${instance.id} created at ${instance.dir}`)

    // The game may recreate an empty mods folder on startup, so the safe-mode
    // assertion is about the dummy jar moving aside, not the folder disappearing.
    const jarHidden = (): boolean => !fs.existsSync(path.join(modsDir, smokeJar))
    const jarParked = (): boolean => fs.existsSync(path.join(disabledDir, smokeJar))

    const result = await new Promise<{
      started: boolean
      safeApplied: boolean
      reason: string
    }>((resolve) => {
      let startedGame = false
      let safeApplied = false
      let settled = false
      let killTimer: NodeJS.Timeout | null = null
      const finish = (started: boolean, reason: string): void => {
        if (settled) return
        settled = true
        if (killTimer) clearTimeout(killTimer)
        record(`launch result: ${started} (${reason})`)
        void launcher.stop()
        setTimeout(() => resolve({ started, safeApplied, reason }), 2500)
      }
      const launcher = new GameLauncher({
        onLog: (line) => {
          events.push(`${line.stream}: ${line.text}`)
          if (!startedGame && START_SIGNAL.test(line.text)) {
            startedGame = true
            safeApplied = jarHidden() && jarParked()
            record(`safe mode applied during run: ${safeApplied} (hidden=${jarHidden()}, parked=${jarParked()})`)
            record(`game signal: ${line.text.slice(0, 140)}`)
            killTimer = setTimeout(() => finish(true, 'game reached main menu'), 8000)
          }
        },
        onState: (state) => {
          record(`state: ${state.phase}${state.message ? ` — ${state.message}` : ''}`)
          if (state.phase === 'error') finish(false, state.message ?? 'launch error')
        }
      })
      setTimeout(() => {
        if (!startedGame) finish(false, 'timeout waiting for game start')
      }, 240000)
      launcher
        .launch(profileId, { instanceId: instance.id, safeMode: true })
        .catch((error: Error) => finish(false, error.message))
    })

    const restored =
      fs.existsSync(path.join(modsDir, smokeJar)) && !fs.existsSync(disabledDir)
    record(`mods restored after stop: ${restored}`)

    success = result.started && result.safeApplied && restored
    if (!success) {
      record(`failure: started=${result.started} safeApplied=${result.safeApplied} restored=${restored}`)
    }
  } catch (error) {
    record(`exception: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (instanceId) {
      try {
        removeInstance(instanceId)
      } catch {
        // keep the folder for debugging
      }
    }
  }

  fs.writeFileSync(
    path.join(outDir, `instance-smoke-${versionId}.json`),
    JSON.stringify(
      {
        version: versionId,
        success,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        events
      },
      null,
      2
    )
  )
  app.exit(success ? 0 : 1)
}

export async function runModsSmoke(
  versionId: string,
  specs: Array<{ projectId: string; versionId: string }>,
  outDir: string,
  shouldLaunch: boolean
): Promise<void> {
  const startedAt = Date.now()
  const events: string[] = []
  const record = (message: string): void => {
    events.push(`${new Date().toISOString()} ${message}`)
    try {
      console.log(`[mods-smoke] ${message}`)
    } catch {
      // stdout may be closed when the launcher runs detached
    }
  }
  fs.mkdirSync(outDir, { recursive: true })
  let success = false

  try {
    const existing = listAccounts().find(
      (account) => account.type === 'offline' && account.name === 'CozyTester'
    )
    const account = existing ?? addOfflineAccount('CozyTester')
    selectAccount(account.id)
    record(`account: ${account.name}`)

    if (!(await getVersionStatus(versionId)).installed) {
      record(`installing vanilla ${versionId}`)
      await installVersion(versionId, (progress) => {
        if (progress.done % 500 === 0 || progress.phase === 'done') {
          record(`install ${progress.phase} ${progress.done}/${progress.total}`)
        }
      })
    }
    record('vanilla ready')

    for (const spec of specs) {
      record(`installing mod ${spec.projectId}@${spec.versionId}`)
      await installMod(spec.projectId, spec.versionId, versionId, [], (progress) => {
        if (progress.phase === 'done') record(`mod done ${progress.label}`)
        else if (progress.done % 5 === 0) {
          record(`mod ${progress.phase} ${progress.done}/${progress.total} ${progress.file ?? ''}`)
        }
      })
    }

    const mods = listInstalledMods(versionId)
    record(`installed mods: ${mods.map((mod) => `${mod.title ?? mod.filename}=${mod.enabled}`).join(', ')}`)

    const modded = mods.length > 0 ? findModdedVersion(versionId) : null
    if (!modded) throw new Error('Fabric version was not created')
    const profile = await getVersionJson(modded)
    verifyModsBeforeLaunch(profile)
    record(`prelaunch check passed for ${profile.id}`)

    if (shouldLaunch) {
      success = await new Promise<boolean>((resolve) => {
        let startedGame = false
        let settled = false
        let killTimer: NodeJS.Timeout | null = null
        const finish = (value: boolean, reason: string): void => {
          if (settled) return
          settled = true
          record(`launch result: ${value} (${reason})`)
          if (killTimer) clearTimeout(killTimer)
          void launcher.stop()
          setTimeout(() => resolve(value), 4000)
        }
        const launcher = new GameLauncher({
          onLog: (line) => {
            events.push(`${line.stream}: ${line.text}`)
            if (!startedGame && START_SIGNAL.test(line.text)) {
              startedGame = true
              record(`game signal: ${line.text.slice(0, 140)}`)
              killTimer = setTimeout(() => finish(true, 'game reached main menu'), 8000)
            }
          },
          onState: (state) => {
            record(`state: ${state.phase}${state.message ? ` — ${state.message}` : ''}`)
            if (state.phase === 'error') finish(false, state.message ?? 'launch error')
          }
        })
        setTimeout(() => {
          if (!startedGame) finish(false, 'timeout waiting for game start')
        }, 240000)
        launcher.launch(profile.id).catch((error: Error) => finish(false, error.message))
      })
    } else {
      success = true
    }
  } catch (error) {
    record(`exception: ${error instanceof Error ? error.message : String(error)}`)
  }

  fs.writeFileSync(
    path.join(outDir, `mods-smoke-${versionId}.json`),
    JSON.stringify(
      {
        version: versionId,
        specs,
        success,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        events
      },
      null,
      2
    )
  )
  app.exit(success ? 0 : 1)
}


export async function runSmoke(versionId: string, outDir: string): Promise<void> {
  const startedAt = Date.now()
  const events: string[] = []
  let success = false

  const record = (message: string): void => {
    const line = `${new Date().toISOString()} ${message}`
    events.push(line)
    console.log(`[smoke] ${message}`)
  }

  fs.mkdirSync(outDir, { recursive: true })

  try {
    const existing = listAccounts().find(
      (account) => account.type === 'offline' && account.name === 'CozyTester'
    )
    const account = existing ?? addOfflineAccount('CozyTester')
    selectAccount(account.id)
    record(`account: ${account.name} (${account.uuid})`)

    const status = await getVersionStatus(versionId)
    if (!status.installed) {
      record(`installing ${versionId}`)
      let lastPhase = ''
      await installVersion(versionId, (progress) => {
        const marker = `${progress.phase}:${progress.label}`
        if (progress.phase === 'assets') {
          if (progress.done % 250 === 0 || progress.phase !== lastPhase) {
            record(`assets ${progress.done}/${progress.total}`)
          }
        } else if (marker !== lastPhase || progress.phase === 'done') {
          record(`${progress.phase} ${progress.label} ${progress.done}/${progress.total}`)
        }
        lastPhase = marker
      })
      record('install complete')
    } else {
      record('already installed')
    }

    success = await new Promise<boolean>((resolve) => {
      let startedGame = false
      let settled = false
      let killTimer: NodeJS.Timeout | null = null
      const finish = (value: boolean, reason: string): void => {
        if (settled) return
        settled = true
        record(`result: ${value} (${reason})`)
        if (killTimer) clearTimeout(killTimer)
        void launcher.stop()
        setTimeout(() => resolve(value), 4000)
      }

      const launcher = new GameLauncher({
        onLog: (line) => {
          events.push(`${line.stream}: ${line.text}`)
          if (!startedGame && START_SIGNAL.test(line.text)) {
            startedGame = true
            record(`game signal: ${line.text.slice(0, 140)}`)
            killTimer = setTimeout(() => finish(true, 'game reached main menu'), 8000)
          }
        },
        onState: (state) => {
          record(`state: ${state.phase}${state.message ? ` — ${state.message}` : ''}`)
          if (state.phase === 'error') finish(false, state.message ?? 'launch error')
        }
      })

      setTimeout(() => {
        if (!startedGame) finish(false, 'timeout waiting for game start')
      }, 180000)

      record(`launching ${versionId}`)
      launcher.launch(versionId).catch((error: Error) => {
        finish(false, error.message)
      })
    })
  } catch (error) {
    record(`exception: ${error instanceof Error ? error.message : String(error)}`)
  }

  const result = {
    version: versionId,
    success,
    durationMs: Date.now() - startedAt,
    finishedAt: new Date().toISOString(),
    events
  }
  fs.writeFileSync(path.join(outDir, `smoke-${versionId}.json`), JSON.stringify(result, null, 2))
  app.exit(success ? 0 : 1)
}
