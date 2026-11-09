import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  Account,
  AccentName,
  AuthProgress,
  CrashInfo,
  FeaturedVersion,
  InstallPhase,
  InstallProgress,
  LaunchState,
  LogLine,
  Settings,
  SystemInfo,
  VersionManifest,
  VersionStatus
} from '@shared/types'
import { api, formatError } from '../lib/api'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  message?: string
}

interface AppContextValue {
  ready: boolean
  bootStage: number
  settings: Settings | null
  system: SystemInfo | null
  accounts: Account[]
  current: Account | null
  featured: FeaturedVersion[]
  manifest: VersionManifest | null
  manifestError: string | null
  statuses: Record<string, VersionStatus>
  installs: Record<string, InstallProgress>
  launchState: LaunchState | null
  logs: LogLine[]
  consoleOpen: boolean
  toasts: ToastItem[]
  authProgress: AuthProgress | null
  authBusy: boolean
  crash: CrashInfo | null
  selectedVersion: string
  accent: AccentName
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  refreshManifest: () => Promise<void>
  refreshStatuses: (ids: string[]) => Promise<void>
  selectVersion: (id: string) => void
  install: (id: string) => Promise<void>
  cancelInstall: (id: string) => Promise<void>
  removeVersion: (id: string) => Promise<void>
  launch: (versionId?: string) => Promise<void>
  launchInstance: (instanceId: string, safeMode?: boolean) => Promise<void>
  dismissCrash: () => void
  stop: () => Promise<void>
  refreshAccounts: () => Promise<void>
  selectAccount: (id: string) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  addOffline: (name: string) => Promise<Account>
  addMicrosoft: () => Promise<Account>
  refreshAccountAuth: (id: string) => Promise<Account>
  setConsoleOpen: (open: boolean) => void
  clearLogs: () => void
  toast: (kind: ToastKind, title: string, message?: string) => void
  dismissToast: (id: number) => void
}

const AppContext = createContext<AppContextValue | null>(null)

let toastSeq = 0

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false)
  const [bootStage, setBootStage] = useState(0)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [current, setCurrent] = useState<Account | null>(null)
  const [featured, setFeatured] = useState<FeaturedVersion[]>([])
  const [manifest, setManifest] = useState<VersionManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, VersionStatus>>({})
  const [installs, setInstalls] = useState<Record<string, InstallProgress>>({})
  const [launchState, setLaunchState] = useState<LaunchState | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [authProgress, setAuthProgress] = useState<AuthProgress | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [crash, setCrash] = useState<CrashInfo | null>(null)

  const installPhases = useRef<Record<string, InstallPhase>>({})
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimers.current.delete(id)
    }
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      toastSeq += 1
      const id = toastSeq
      setToasts((prev) => [...prev.slice(-3), { id, kind, title, message }])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id))
        toastTimers.current.delete(id)
      }, kind === 'error' ? 7000 : 4800)
      toastTimers.current.set(id, timer)
    },
    []
  )

  const refreshStatuses = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return
    try {
      const result = await api.versions.statuses(unique)
      setStatuses((prev) => ({ ...prev, ...result }))
    } catch {
      // status refresh is best-effort
    }
  }, [])

  const refreshAccounts = useCallback(async () => {
    const [list, active] = await Promise.all([api.accounts.list(), api.accounts.current()])
    setAccounts(list)
    setCurrent(active)
  }, [])

  const refreshManifest = useCallback(async () => {
    setManifestError(null)
    try {
      const data = await api.versions.manifest()
      setManifest(data)
    } catch (error) {
      setManifestError(formatError(error))
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [loadedSettings, loadedSystem, loadedFeatured] = await Promise.all([
          api.settings.get(),
          api.system.info(),
          api.versions.featured()
        ])
        if (!alive) return
        setSettings(loadedSettings)
        setSystem(loadedSystem)
        setFeatured(loadedFeatured)
        setBootStage(1)
        await Promise.all([refreshAccounts(), refreshManifest()])
        if (!alive) return
        setBootStage(2)
        const ids = [
          ...loadedFeatured.map((item) => item.id),
          loadedSettings.lastVersion
        ].filter(Boolean)
        await refreshStatuses(ids)
        setBootStage(3)
        const initialLogs = await api.launch.logs()
        if (alive) setLogs(initialLogs)
      } catch (error) {
        if (alive) toast('error', 'Не удалось загрузить лаунчер', formatError(error))
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshAccounts, refreshManifest, refreshStatuses, toast])

  useEffect(() => {
    const offProgress = api.versions.onProgress((progress) => {
      const previous = installPhases.current[progress.versionId]
      installPhases.current[progress.versionId] = progress.phase
      setInstalls((prev) => ({ ...prev, [progress.versionId]: progress }))

      if (previous === progress.phase) return
      if (progress.phase === 'done') {
        setInstalls((prev) => {
          const next = { ...prev }
          delete next[progress.versionId]
          return next
        })
        void refreshStatuses([progress.versionId])
        toast('success', `Minecraft ${progress.versionId} установлен`, 'Можно запускать игру')
      } else if (progress.phase === 'error') {
        const message = progress.message ?? 'Неизвестная ошибка'
        toast('error', 'Ошибка установки', message)
      } else if (progress.phase === 'cancelled') {
        setInstalls((prev) => {
          const next = { ...prev }
          delete next[progress.versionId]
          return next
        })
        toast('info', 'Установка отменена', progress.versionId)
      }
    })

    const offState = api.launch.onState((state) => {
      setLaunchState(state)
      if (state.phase === 'running') {
        setConsoleOpen(true)
        toast('success', 'Minecraft запущен', state.versionId)
      } else if (state.phase === 'error') {
        setConsoleOpen(true)
        toast('error', 'Не удалось запустить игру', state.message)
      } else if (state.phase === 'exited') {
        toast('info', 'Игра закрыта', state.versionId)
      }
    })

    const offLog = api.launch.onLog((line) => {
      setLogs((prev) => {
        const next = [...prev, line]
        return next.length > 2000 ? next.slice(next.length - 2000) : next
      })
    })

    const offCrash = api.launch.onCrash((info) => {
      setCrash(info)
      setConsoleOpen(false)
    })

    const offAuth = api.accounts.onAuth((progress) => {
      setAuthProgress(progress)
    })

    return () => {
      offProgress()
      offState()
      offLog()
      offCrash()
      offAuth()
    }
  }, [refreshStatuses, toast])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
      try {
        const next = await api.settings.update(patch)
        setSettings(next)
      } catch (error) {
        toast('error', 'Не удалось сохранить настройки', formatError(error))
      }
    },
    [toast]
  )

  const selectVersion = useCallback(
    (id: string) => {
      if (!settings || settings.lastVersion === id) return
      void updateSettings({ lastVersion: id })
    },
    [settings, updateSettings]
  )

  const install = useCallback(
    async (id: string) => {
      try {
        await api.versions.install(id)
        await refreshStatuses([id])
      } catch (error) {
        toast('error', 'Ошибка установки', formatError(error))
      }
    },
    [refreshStatuses, toast]
  )

  const cancelInstall = useCallback(async (id: string) => {
    await api.versions.cancel(id)
  }, [])

  const removeVersion = useCallback(
    async (id: string) => {
      try {
        await api.versions.remove(id)
        await refreshStatuses([id])
        delete installPhases.current[id]
        toast('info', `Версия ${id} удалена`, 'Файлы игры очищены')
      } catch (error) {
        toast('error', 'Не удалось удалить версию', formatError(error))
      }
    },
    [refreshStatuses, toast]
  )

  const launch = useCallback(
    async (versionId?: string) => {
      const id = versionId ?? settings?.lastVersion ?? featured[0]?.id
      if (!id) return
      if (versionId && settings && versionId !== settings.lastVersion) {
        void updateSettings({ lastVersion: versionId })
      }
      setLogs([])
      setConsoleOpen(true)
      setCrash(null)
      try {
        await api.launch.start(id)
      } catch {
        // launcher reports the failure through onState('error')
      }
    },
    [settings, featured, updateSettings]
  )

  const launchInstance = useCallback(
    async (instanceId: string, safeMode = false) => {
      setLogs([])
      setConsoleOpen(true)
      setCrash(null)
      try {
        await api.instances.launch(instanceId, safeMode)
      } catch (error) {
        toast('error', 'Не удалось запустить сборку', formatError(error))
      }
    },
    [toast]
  )

  const dismissCrash = useCallback(() => setCrash(null), [])

  const stop = useCallback(async () => {
    try {
      await api.launch.stop()
    } catch (error) {
      toast('error', 'Не удалось остановить игру', formatError(error))
    }
  }, [toast])

  const selectAccount = useCallback(
    async (id: string) => {
      try {
        const list = await api.accounts.select(id)
        setAccounts(list)
        const active = await api.accounts.current()
        setCurrent(active)
        const next = await api.settings.get()
        setSettings(next)
        toast('success', 'Аккаунт выбран', active?.name)
      } catch (error) {
        toast('error', 'Не удалось выбрать аккаунт', formatError(error))
      }
    },
    [toast]
  )

  const removeAccount = useCallback(
    async (id: string) => {
      try {
        const list = await api.accounts.remove(id)
        setAccounts(list)
        setCurrent(await api.accounts.current())
        setSettings(await api.settings.get())
        toast('info', 'Аккаунт удалён')
      } catch (error) {
        toast('error', 'Не удалось удалить аккаунт', formatError(error))
      }
    },
    [toast]
  )

  const addOffline = useCallback(
    async (name: string) => {
      const account = await api.accounts.addOffline(name)
      await refreshAccounts()
      setSettings(await api.settings.get())
      toast('success', 'Офлайн-аккаунт создан', account.name)
      return account
    },
    [refreshAccounts, toast]
  )

  const addMicrosoft = useCallback(async () => {
    setAuthBusy(true)
    setAuthProgress({ step: 'opening', message: 'Открываем окно входа Microsoft' })
    try {
      const account = await api.accounts.addMicrosoft()
      await refreshAccounts()
      setSettings(await api.settings.get())
      toast('success', 'Microsoft подключён', account.name)
      return account
    } finally {
      setAuthBusy(false)
      setAuthProgress(null)
    }
  }, [refreshAccounts, toast])

  const refreshAccountAuth = useCallback(
    async (id: string) => {
      setAuthBusy(true)
      try {
        const account = await api.accounts.refresh(id)
        await refreshAccounts()
        toast('success', 'Сессия обновлена', account.name)
        return account
      } finally {
        setAuthBusy(false)
        setAuthProgress(null)
      }
    },
    [refreshAccounts, toast]
  )

  const clearLogs = useCallback(() => setLogs([]), [])

  const selectedVersion = useMemo(() => {
    if (!settings) return ''
    if (settings.lastVersion) return settings.lastVersion
    if (featured.length) return featured[0].id
    return manifest?.latest.release ?? ''
  }, [settings, featured, manifest])

  const accent = settings?.accent ?? 'emerald'

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      bootStage,
      settings,
      system,
      accounts,
      current,
      featured,
      manifest,
      manifestError,
      statuses,
      installs,
      launchState,
      logs,
      consoleOpen,
      toasts,
      authProgress,
      authBusy,
      crash,
      selectedVersion,
      accent,
      updateSettings,
      refreshManifest,
      refreshStatuses,
      selectVersion,
      install,
      cancelInstall,
      removeVersion,
      launch,
      launchInstance,
      dismissCrash,
      stop,
      refreshAccounts,
      selectAccount,
      removeAccount,
      addOffline,
      addMicrosoft,
      refreshAccountAuth,
      setConsoleOpen,
      clearLogs,
      toast,
      dismissToast
    }),
    [
      ready,
      bootStage,
      settings,
      system,
      accounts,
      current,
      featured,
      manifest,
      manifestError,
      statuses,
      installs,
      launchState,
      logs,
      consoleOpen,
      toasts,
      authProgress,
      authBusy,
      crash,
      selectedVersion,
      accent,
      updateSettings,
      refreshManifest,
      refreshStatuses,
      selectVersion,
      install,
      cancelInstall,
      removeVersion,
      launch,
      launchInstance,
      dismissCrash,
      stop,
      refreshAccounts,
      selectAccount,
      removeAccount,
      addOffline,
      addMicrosoft,
      refreshAccountAuth,
      clearLogs,
      toast,
      dismissToast
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
