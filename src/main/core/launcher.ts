import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { app } from 'electron'
import type { LaunchState, LogLine } from '@shared/types'
import { buildGameArgs, buildJvmArgs, splitCommandLine, substitute } from './args'
import { getLaunchAuth } from './auth/accounts'
import { getVersionStatus } from './installer'
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
}

const MAX_LOG_LINES = 2000

export class GameLauncher {
  private process: ChildProcessWithoutNullStreams | null = null
  private versionId = ''
  private logs: LogLine[] = []
  private stopping = false

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
      message,
      pid: this.process?.pid,
      code: code ?? undefined
    })
  }

  private verifyInstall(version: VersionJson, gameDir: string, workDir: string): void {
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
      ensureDir(path.join(workDir, 'mods'))
      verifyModsBeforeLaunch(version)
    }
  }

  async launch(versionId: string, options: { server?: { host: string; port: number } } = {}): Promise<void> {
    if (this.process) throw new Error('Minecraft уже запущен')
    this.versionId = versionId
    this.logs = []
    this.stopping = false
    let logStream: fs.WriteStream | null = null

    try {
      this.emitState('preparing', 'Проверяем аккаунт и файлы версии')
      const settings = getSettings()
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
      const workDir =
        version.cozyModded
          ? ensureDir(path.join(versionDir(gameDir, version.id), 'run'))
          : gameDir
      this.verifyInstall(version, gameDir, workDir)

      this.emitState('java', 'Подбираем Java для версии')
      const java = await ensureJava(version, (progress) => {
        const percent =
          progress.totalBytes > 0
            ? Math.min(100, Math.round((progress.bytes / progress.totalBytes) * 100))
            : Math.round((progress.done / Math.max(1, progress.total)) * 100)
        this.emitState(
          'java',
          `${progress.label}${progress.total > 0 ? ` · ${percent}%` : ''}`
        )
      })
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

      const jvmArgs = buildJvmArgs(version, context, {
        minRamMb: settings.ramMb,
        maxRamMb: settings.ramMb,
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
      this.emitLog('system', `Память: ${settings.ramMb} МБ · Каталог: ${workDir}`)
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
        if (wasStopping) {
          this.emitState('stopped', 'Minecraft остановлен')
        } else if (code === 0) {
          this.emitState('exited', 'Minecraft закрыт')
        } else {
          this.emitState(
            'error',
            `Minecraft завершился с кодом ${code}. Подробности в консоли.`,
            code
          )
        }
      })
    } catch (error) {
      logStream?.end()
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
