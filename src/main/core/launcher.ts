import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { CrashInfo, LaunchState, LogLine } from '@shared/types'
import { buildGameArgs, buildJvmArgs, splitCommandLine, substitute } from './args'
import { getLaunchAuth } from './auth/accounts'
import { analyzeCrash, findLatestCrashReport, readTextCapped } from './crash'
import { getVersionStatus } from './installer'
import { getInstance } from './instances'
import { ensureJava } from './java'
import { getVersionJson } from './mojang'
import { verifyModsBeforeLaunch } from './mods'
import {
  assetsDir,
  ensureDir,
  librariesDir,
  logsDir,
  nativesDir,
  versionDir
} from './paths'
import { createRuleContext } from './rules'
import { getSettings } from './store'
import { buildClientClasspath, selectLibraries, type VersionJson } from './version'
import { randomClientId } from './uuid'

export interface LauncherCallbacks {
  onLog: (line: LogLine) => void
  onState: (state: LaunchState) => void
  onCrash?: (crash: CrashInfo) => void
}

const MAX_LOG_LINES = 2000

export class GameLauncher {
  private process: ChildProcessWithoutNullStreams | null = null
  private versionId = ''
  private logs: LogLine[] = []
  private stopping = false
  private crashes = new Map<string, { info: CrashInfo; text: string }>()
  private currentWorkDir = ''
  private currentLogFile = ''
  private currentInstanceId?: string
  private safeMods: { original: string; disabled: string } | null = null

  constructor(private callbacks: LauncherCallbacks) {}

  isRunning(): boolean {
    return Boolean(this.process)
  }

  getLogs(): LogLine[] {
    return [...this.logs]
  }

  private emitLog(stream: LogLine['stream'], text: string): void {
    const line: LogLine = { time: Date.now(), stream, text, versionId: this.versionId }
    this.logs.push(line)
    if (this.logs.length > MAX_LOG_LINES) this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
    this.callbacks.onLog(line)
  }

  private emitState(phase: LaunchState['phase'], message?: string, code?: number | null): void {
    this.callbacks.onState({
      phase,
      versionId: this.versionId,
      instanceId: this.currentInstanceId,
      message,
      pid: this.process?.pid,
      code: code ?? undefined
    })
  }

  private verifyInstall(
    version: VersionJson,
    gameDir: string,
    workDir: string,
    safeMode?: boolean,
    instanceId?: string
  ): void {
    const clientVersionId = version.clientVersionId ?? version.id
    const dir = versionDir(gameDir, clientVersionId)
    const clientJar = path.join(dir, `${clientVersionId}.jar`)
    if (!fs.existsSync(clientJar)) {
      throw new Error(
        `Клиент версии ${clientVersionId} не найден. Сначала скачайте базовую версию во вкладке «Версии».`
      )
    }
    const indexFile = path.join(assetsDir(gameDir), 'indexes', `${version.assetIndex.id}.json`)
    if (!fs.existsSync(indexFile)) {
      throw new Error('Файлы ассетов не найдены. Переустановите версию во вкладке «Версии».')
    }
    const selected = selectLibraries(version.libraries, createRuleContext({ features: {} }))
    const libRoot = librariesDir(gameDir)
    for (const library of selected) {
      const artifact = library.downloads?.artifact
      if (!artifact?.path) continue
      const file = path.join(libRoot, ...artifact.path.split('/'))
      if (!fs.existsSync(file)) {
        throw new Error('Библиотеки версии повреждены. Переустановите версию.')
      }
    }
    if (workDir !== gameDir) {
      if (!safeMode) {
        ensureDir(path.join(workDir, 'mods'))
        verifyModsBeforeLaunch(version, {
          modsDir: path.join(workDir, 'mods'),
          indexKey: instanceId ? `instance:${instanceId}` : undefined
        })
      }
    }
  }

  /** Moves the mods folder aside so the game starts as close to vanilla as possible. */
  private applySafeMode(workDir: string): boolean {
    const original = path.join(workDir, 'mods')
    const disabled = path.join(workDir, 'mods.cozy-safe-disabled')
    try {
      if (!fs.existsSync(original)) return false
      if (fs.existsSync(disabled)) fs.rmSync(disabled, { recursive: true, force: true })
      fs.renameSync(original, disabled)
      this.safeMods = { original, disabled }
      this.emitLog('system', 'Безопасный режим: моды временно отключены')
      return true
    } catch (error) {
      this.safeMods = null
      this.emitLog(
        'system',
        `Не удалось включить безопасный режим: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  /** Puts the mods folder back after a safe-mode launch, even if the game crashed. */
  private restoreSafeMods(): void {
    const state = this.safeMods
    if (!state) return
    this.safeMods = null
    try {
      if (!fs.existsSync(state.disabled)) return
      if (!fs.existsSync(state.original)) {
        fs.renameSync(state.disabled, state.original)
      } else {
        for (const entry of fs.readdirSync(state.disabled)) {
          fs.renameSync(path.join(state.disabled, entry), path.join(state.original, entry))
        }
        fs.rmSync(state.disabled, { recursive: true, force: true })
      }
      this.emitLog('system', 'Моды восстановлены после безопасного запуска')
    } catch (error) {
      this.emitLog(
        'system',
        `Не удалось вернуть моды: ${error instanceof Error ? error.message : String(error)}. Папка: ${state.disabled}`
      )
    }
  }

  private captureCrash(exitCode: number | null): CrashInfo | null {
    const settings = getSettings()
    const workDir = this.currentWorkDir
    const reportPath = findLatestCrashReport(workDir)
    const reportText = readTextCapped(reportPath)
    const logPath = path.join(workDir, 'logs', 'latest.log')
    const logText = readTextCapped(logPath)
    const modsDir = path.join(workDir, 'mods')
    let modFiles: string[] = []
    try {
      modFiles = fs.readdirSync(modsDir).filter((file) => file.endsWith('.jar'))
    } catch {
      // vanilla folder without mods
    }

    const analysis = analyzeCrash({
      exitCode,
      reportText,
      logText: [
        logText,
        this.logs
          .slice(-300)
          .map((line) => line.text)
          .join('\n')
      ].join('\n'),
      memoryMb: settings.ramMb,
      modFiles
    })

    const info: CrashInfo = {
      id: randomUUID(),
      versionId: this.versionId,
      instanceId: this.currentInstanceId,
      createdAt: Date.now(),
      exitCode,
      title: analysis.title,
      summary: analysis.summary,
      details: analysis.details,
      hints: analysis.hints,
      recommendation: analysis.recommendation,
      suspects: analysis.suspects,
      signature: analysis.signature,
      reportPath: reportPath ?? undefined,
      logPath: fs.existsSync(logPath) ? logPath : undefined,
      memoryMb: settings.ramMb,
      modsCount: modFiles.length
    }
    this.crashes.set(info.id, { info, text: reportText || logText })
    return info
  }

  getCrash(id: string): { info: CrashInfo; text: string } | null {
    return this.crashes.get(id) ?? null
  }

  getLatestCrash(): CrashInfo | null {
    let latest: CrashInfo | null = null
    for (const entry of this.crashes.values()) {
      if (!latest || entry.info.createdAt > latest.createdAt) latest = entry.info
    }
    return latest
  }

  async launch(versionId: string, options: { server?: { host: string; port: number }; instanceId?: string; safeMode?: boolean } = {}): Promise<void> {
    if (this.process) throw new Error('Minecraft уже запущен')
    this.versionId = versionId
    this.logs = []
    this.stopping = false
    let logStream: fs.WriteStream | null = null
    this.safeMods = null

    try {
      this.emitState('preparing', 'Проверяем аккаунт и файлы версии')
      const settings = getSettings()
      const instance = options.instanceId ? getInstance(options.instanceId) : null
      if (options.instanceId && !instance) throw new Error('Сборка не найдена')
      const gameDir = ensureDir(settings.gameDir)

      const [auth, version] = await Promise.all([
        getLaunchAuth((progress) => {
          this.emitState('preparing', progress.message)
        }),
        getVersionJson(versionId)
      ])
      const status = await getVersionStatus(versionId)
      if (!status.installed) {
        throw new Error('Версия не установлена. Скачайте её во вкладке «Версии».')
      }
      const workDir = instance
        ? ensureDir(instance.dir)
        : version.cozyModded
          ? ensureDir(path.join(versionDir(gameDir, version.id), 'run'))
          : gameDir
      this.currentWorkDir = workDir
      this.currentInstanceId = instance?.id
      if (options.safeMode) this.applySafeMode(workDir)
      this.verifyInstall(version, gameDir, workDir, options.safeMode, instance?.id)

      this.emitState('java', 'Подбираем Java для версии')
      const java = await ensureJava(
        version,
        (progress) => {
          const percent =
            progress.totalBytes > 0
              ? Math.min(100, Math.round((progress.bytes / progress.totalBytes) * 100))
              : Math.round((progress.done / Math.max(1, progress.total)) * 100)
          this.emitState(
            'java',
            `${progress.label}${progress.total > 0 ? ` · ${percent}%` : ''}`
          )
        },
        instance?.javaPath ? { javaPath: instance.javaPath } : undefined
      )
      this.emitLog('system', `Java ${java.major} (${java.source}): ${java.path}`)

      const natives = nativesDir(gameDir, versionId)
      for (const sub of ['', 'java', 'jna', 'lwjgl', 'netty']) {
        ensureDir(path.join(natives, sub))
      }

      const context = createRuleContext({
        features: {
          has_custom_resolution: settings.customResolution,
          is_demo_user: false,
          has_quick_plays_support: false,
          is_quick_play_singleplayer: false,
          is_quick_play_multiplayer: false,
          is_quick_play_realms: false
        }
      })
      const selected = selectLibraries(version.libraries, context)
      const clientVersionId = version.clientVersionId ?? version.id
      const clientJar = path.join(versionDir(gameDir, clientVersionId), `${clientVersionId}.jar`)
      const classpath = buildClientClasspath(clientJar, selected, librariesDir(gameDir))
      const logConfig = version.logging?.client
        ? path.join(assetsDir(gameDir), 'log_configs', version.logging.client.file.id)
        : undefined
      const extraJvmArgs = [
        '-Dfile.encoding=UTF-8',
        ...(logConfig && version.logging?.client
          ? [substitute(version.logging.client.argument, { path: logConfig })]
          : []),
        ...splitCommandLine(settings.jvmArgs)
      ]

      const vars = {
        auth_player_name: auth.name,
        version_name: version.id,
        game_directory: workDir,
        assets_root: assetsDir(gameDir),
        assets_index_name: version.assetIndex.id,
        auth_uuid: auth.uuid,
        auth_access_token: auth.accessToken,
        auth_session: `token:${auth.accessToken}`,
        auth_xuid: auth.xuid,
        user_type: auth.userType,
        user_properties: '{}',
        version_type: version.type,
        clientid: randomClientId(),
        resolution_width: String(settings.width),
        resolution_height: String(settings.height),
        library_directory: librariesDir(gameDir)
      }

      const ramMb = Math.max(512, instance?.ramMb ?? settings.ramMb)
      const jvmArgs = buildJvmArgs(version, context, {
        minRamMb: ramMb,
        maxRamMb: ramMb,
        extraJvmArgs,
        classpath,
        nativesDir: natives,
        launcherName: 'CozyLauncher',
        launcherVersion: app.getVersion(),
        vars
      })
      const gameArgs = buildGameArgs(version, context, vars, {
        fullscreen: settings.fullscreen,
        server: options.server
      })

      const env = { ...process.env }
      delete env.JAVA_TOOL_OPTIONS
      delete env._JAVA_OPTIONS
      delete env.CLASSPATH

      const logFile = path.join(
        logsDir(),
        `launch-${new Date().toISOString().replace(/[:.]/g, '-')}-${version.id}.log`
      )
      logStream = fs.createWriteStream(logFile, { flags: 'a' })
      this.emitLog('system', `Запуск ${version.id}${settings.customResolution ? ` · ${settings.width}×${settings.height}` : ''}`)
      this.emitLog('system', `Память: ${ramMb} МБ · Каталог: ${workDir}`)
      if (options.safeMode) this.emitLog('system', 'Режим: безопасный (без модов)')
      if (options.server) {
        this.emitLog('system', `Подключение к серверу ${options.server.host}:${options.server.port}`)
      }

      this.emitState('starting', 'Запускаем Minecraft')
      const child = spawn(java.path, [...jvmArgs, version.mainClass, ...gameArgs], {
        cwd: workDir,
        env,
        windowsHide: false
      })
      this.process = child
      this.emitState('running', 'Minecraft запущен')

      const attach = (
        stream: NodeJS.ReadableStream | null,
        kind: 'stdout' | 'stderr'
      ): void => {
        if (!stream) return
        const reader = readline.createInterface({ input: stream, crlfDelay: Infinity })
        reader.on('line', (line) => {
          this.emitLog(kind, line)
          logStream?.write(`${line}\n`)
        })
      }
      attach(child.stdout, 'stdout')
      attach(child.stderr, 'stderr')

      child.on('error', (error) => {
        this.emitLog('system', `Ошибка процесса: ${error.message}`)
        this.emitState('error', `Не удалось запустить Java: ${error.message}`)
      })

      child.on('exit', (code) => {
        const wasStopping = this.stopping
        this.process = null
        this.stopping = false
        logStream?.end()
        this.restoreSafeMods()
        if (wasStopping) {
          this.emitState('stopped', 'Minecraft остановлен')
          return
        }
        if (code === 0) {
          this.emitState('exited', 'Minecraft закрыт')
          return
        }
        const crash = this.captureCrash(code)
        this.emitState(
          'error',
          crash
            ? `${crash.title}. ${crash.summary}`
            : `Minecraft завершился с кодом ${code}. Подробности в консоли.`,
          code
        )
        if (crash) this.callbacks.onCrash?.(crash)
      })
    } catch (error) {
      logStream?.end()
      this.restoreSafeMods()
      this.process = null
      const message = error instanceof Error ? error.message : String(error)
      this.emitLog('system', `Ошибка: ${message}`)
      this.emitState('error', message)
      throw error
    }
  }

  async stop(): Promise<void> {
    const child = this.process
    if (!child?.pid) return
    this.stopping = true
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGTERM')
    }
  }
}
