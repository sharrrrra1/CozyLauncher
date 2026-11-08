import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AccentName, ImportCandidate, ImportScan, JavaInfo } from '@shared/types'
import { useApp } from '../state/AppContext'
import { api, formatBytes, formatError } from '../lib/api'
import { Badge, Button, Field, Modal, Spinner, Toggle } from '../components/ui'
import { Icon } from '../components/Icon'
import { Torch } from '../components/Stickers'
import { McSprite } from '../components/McSprite'

const ACCENTS: { id: AccentName; label: string }[] = [
  { id: 'emerald', label: 'Изумруд' },
  { id: 'amber', label: 'Янтарь' },
  { id: 'frost', label: 'Иней' },
  { id: 'rose', label: 'Роза' }
]

const RESOLUTIONS = [
  { width: 1280, height: 720, label: '1280 × 720' },
  { width: 1600, height: 900, label: '1600 × 900' },
  { width: 1920, height: 1080, label: '1920 × 1080' },
  { width: 2560, height: 1440, label: '2560 × 1440' }
]

function Section({
  title,
  subtitle,
  icon,
  children,
  className = ''
}: {
  title: string
  subtitle?: string
  icon: ReactNode
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <section className={`settings-card ${className}`.trim()}>
      <div className="settings-card-head">
        <span className="settings-card-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="settings-card-body">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children,
  stacked = false
}: {
  label: string
  hint?: string
  children: ReactNode
  stacked?: boolean
}): ReactNode {
  return (
    <div className={`setting-row${stacked ? ' is-stacked' : ''}`}>
      <div className="setting-row-text">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  )
}

export function SettingsPage(): ReactNode {
  const { settings, system, updateSettings, refreshAccounts, toast } = useApp()
  const [javaList, setJavaList] = useState<JavaInfo[] | null>(null)
  const [javaLoading, setJavaLoading] = useState(false)
  const [ramDraft, setRamDraft] = useState(settings?.ramMb ?? 2048)
  const [widthDraft, setWidthDraft] = useState(String(settings?.width ?? 1280))
  const [heightDraft, setHeightDraft] = useState(String(settings?.height ?? 720))
  const [jvmDraft, setJvmDraft] = useState(settings?.jvmArgs ?? '')
  const [clientDraft, setClientDraft] = useState(settings?.msClientId ?? '')
  const [proxyDraft, setProxyDraft] = useState(settings?.proxyUrl ?? '')
  const [scan, setScan] = useState<ImportScan | null>(null)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [connectTarget, setConnectTarget] = useState<ImportCandidate | null>(null)
  const [connectName, setConnectName] = useState('')
  const [connectVersion, setConnectVersion] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setRamDraft(settings?.ramMb ?? 2048)
    setWidthDraft(String(settings?.width ?? 1280))
    setHeightDraft(String(settings?.height ?? 720))
    setJvmDraft(settings?.jvmArgs ?? '')
    setClientDraft(settings?.msClientId ?? '')
    setProxyDraft(settings?.proxyUrl ?? '')
  }, [
    settings?.ramMb,
    settings?.width,
    settings?.height,
    settings?.jvmArgs,
    settings?.msClientId,
    settings?.proxyUrl
  ])

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  const detectJava = async (): Promise<void> => {
    setJavaLoading(true)
    try {
      const list = await api.java.detect()
      setJavaList(list)
    } catch (error) {
      toast('error', 'Не удалось найти Java', formatError(error))
    } finally {
      setJavaLoading(false)
    }
  }

  useEffect(() => {
    void detectJava()
  }, [])

  useEffect(() => {
    let alive = true
    api.imports
      .scan()
      .then((result) => {
        if (alive) setScan(result)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (!settings) {
    return (
      <div className="page settings-page">
        <div className="page-loading">
          <Spinner size={22} /> Загружаем настройки…
        </div>
      </div>
    )
  }

  const totalMb = system?.totalMemMb ?? 8192
  const maxRam = Math.max(2048, Math.floor((totalMb - 1024) / 512) * 512)
  const recommended = Math.min(6144, Math.max(2048, Math.floor(totalMb / 4 / 512) * 512))
  const commitRam = (value: number): void => {
    const clamped = Math.max(512, Math.min(maxRam, Math.round(value / 512) * 512 || 512))
    setRamDraft(clamped)
    void updateSettings({ ramMb: clamped })
  }

  const commitResolution = (): void => {
    const width = Math.max(640, Math.min(7680, Number.parseInt(widthDraft, 10) || settings.width))
    const height = Math.max(480, Math.min(4320, Number.parseInt(heightDraft, 10) || settings.height))
    setWidthDraft(String(width))
    setHeightDraft(String(height))
    void updateSettings({ width, height })
  }

  const commitJvm = (): void => {
    if (jvmDraft === settings.jvmArgs) return
    void updateSettings({ jvmArgs: jvmDraft })
    toast('info', 'Аргументы JVM сохранены')
  }

  const commitClientId = (): void => {
    const value = clientDraft.trim() || '00000000402b5328'
    setClientDraft(value)
    if (value === settings.msClientId) return
    void updateSettings({ msClientId: value })
    toast('info', 'Client ID Microsoft обновлён')
  }

  const pickJava = async (): Promise<void> => {
    const chosen = await api.settings.chooseJava()
    if (!chosen) return
    await updateSettings({ javaMode: 'custom', javaPath: chosen })
    toast('success', 'Java выбрана вручную', chosen)
    void detectJava()
  }

  const pickGameDir = async (): Promise<void> => {
    const chosen = await api.settings.chooseGameDir()
    if (!chosen) return
    await updateSettings({ gameDir: chosen })
    toast('success', 'Папка игры изменена', chosen)
  }

  const commitProxy = (): void => {
    const value = proxyDraft.trim()
    if (value === settings.proxyUrl) return
    setProxyDraft(value)
    void updateSettings({ proxyUrl: value })
    toast(
      value ? 'success' : 'info',
      value ? 'Прокси сохранён' : 'Прокси отключён',
      value || 'Загрузки пойдут напрямую'
    )
  }

  const runScan = async (): Promise<void> => {
    setScanning(true)
    try {
      setScan(await api.imports.scan())
    } catch (error) {
      toast('error', 'Не удалось просканировать лаунчеры', formatError(error))
    } finally {
      setScanning(false)
    }
  }

  const openConnect = (candidate: ImportCandidate): void => {
    setConnectTarget(candidate)
    setConnectName(candidate.name)
    setConnectVersion(candidate.mcVersion ?? settings.lastVersion)
  }

  const connectImport = async (): Promise<void> => {
    if (!connectTarget) return
    if (!connectName.trim() || !/^[A-Za-z0-9._-]+$/.test(connectVersion.trim())) {
      toast('error', 'Проверьте название и версию Minecraft')
      return
    }
    setImporting(connectTarget.id)
    try {
      await api.imports.connect(
        connectTarget.id,
        connectName.trim(),
        connectVersion.trim(),
        connectTarget.modsCount > 0 ? 'fabric' : 'vanilla'
      )
      toast('success', 'Сборка подключена', `${connectName.trim()} → вкладка «Сборки»`)
      setConnectTarget(null)
      await runScan()
    } catch (error) {
      toast('error', 'Не удалось подключить сборку', formatError(error))
    } finally {
      setImporting(null)
    }
  }

  const useVanilla = async (): Promise<void> => {
    try {
      const dir = await api.imports.useVanilla()
      await updateSettings({})
      toast('success', 'Папка .minecraft подключена', dir)
      await runScan()
    } catch (error) {
      toast('error', 'Не удалось подключить .minecraft', formatError(error))
    }
  }

  const importAccounts = async (): Promise<void> => {
    try {
      const result = await api.imports.accounts()
      toast(
        result.imported.length ? 'success' : 'info',
        result.imported.length
          ? `Импортировано аккаунтов: ${result.imported.length}`
          : 'Новых офлайн-аккаунтов не найдено',
        result.imported.join(', ') || 'Офлайн-аккаунты ищутся в launcher_profiles.json'
      )
      await api.accounts.list().catch(() => undefined)
      await refreshAccounts()
    } catch (error) {
      toast('error', 'Не удалось импортировать аккаунты', formatError(error))
    }
  }

  const matchingJava = javaList?.filter((item) => item.major >= 21) ?? []
  const ramPercent = Math.round(
    ((Math.min(ramDraft, maxRam) - 512) / Math.max(1, maxRam - 512)) * 100
  )

  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Конфигурация</span>
          <h1>Настройки лаунчера</h1>
        </div>
        <span className="heading-note">
          <Icon name="check" size={14} /> Изменения сохраняются автоматически
        </span>
      </div>

      <div className="settings-grid">
        <Section
          title="Игра и память"
          subtitle="Производительность и окно Minecraft"
          icon={<Icon name="memory" size={19} />}
          className="settings-wide"
        >
          <Row
            label="Оперативная память"
            hint={`Рекомендуем ${recommended} МБ · всего ${formatBytes(totalMb * 1024 * 1024)}`}
          >
            <div className="ram-control">
              <div className="ram-value">
                <strong>{ramDraft}</strong>
                <span>МБ</span>
              </div>
              <input
                className="range"
                type="range"
                min={512}
                max={maxRam}
                step={512}
                value={Math.min(ramDraft, maxRam)}
                style={{
                  background: `linear-gradient(90deg, var(--accent) 0%, var(--accent-2) ${ramPercent}%, rgba(158, 219, 184, 0.1) ${ramPercent}%)`
                }}
                onChange={(event) => setRamDraft(Number(event.target.value))}
                onPointerUp={(event) => commitRam(Number((event.target as HTMLInputElement).value))}
                onKeyUp={(event) => commitRam(Number((event.target as HTMLInputElement).value))}
                aria-label="Оперативная память в мегабайтах"
              />
              <div className="ram-scale">
                <span>512 МБ</span>
                <span>{recommended} МБ</span>
                <span>{maxRam} МБ</span>
              </div>
            </div>
          </Row>

          <Row label="Разрешение окна" hint="Применяется при следующем запуске">
            <div className="resolution-control">
              <div className="resolution-inputs">
                <input
                  value={widthDraft}
                  onChange={(event) => setWidthDraft(event.target.value.replace(/\D/g, ''))}
                  onBlur={commitResolution}
                  inputMode="numeric"
                  aria-label="Ширина окна"
                  disabled={settings.fullscreen}
                />
                <span>×</span>
                <input
                  value={heightDraft}
                  onChange={(event) => setHeightDraft(event.target.value.replace(/\D/g, ''))}
                  onBlur={commitResolution}
                  inputMode="numeric"
                  aria-label="Высота окна"
                  disabled={settings.fullscreen}
                />
              </div>
              <div className="resolution-presets">
                {RESOLUTIONS.map((preset) => (
                  <button
                    key={preset.label}
                    className={`preset${settings.width === preset.width && settings.height === preset.height ? ' is-active' : ''}`}
                    onClick={() => {
                      setWidthDraft(String(preset.width))
                      setHeightDraft(String(preset.height))
                      void updateSettings({ width: preset.width, height: preset.height })
                    }}
                    disabled={settings.fullscreen}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </Row>

          <Row label="Полноэкранный режим" hint="Игра откроется на весь экран">
            <Toggle
              checked={settings.fullscreen}
              onChange={(checked) => void updateSettings({ fullscreen: checked })}
              label="Полноэкранный режим"
            />
          </Row>

          <Row label="Папка игры" hint={settings.gameDir}>
            <div className="path-control">
              <button className="btn btn-ghost btn-small" onClick={() => void pickGameDir()}>
                <Icon name="folder" size={15} /> Выбрать
              </button>
              <button
                className="btn btn-ghost btn-small"
                onClick={() => void api.shell.openPath(settings.gameDir)}
              >
                <Icon name="external" size={15} /> Открыть
              </button>
            </div>
          </Row>
        </Section>

        <Section
          title="Java"
          subtitle="Среда выполнения Minecraft"
          icon={<Icon name="java" size={19} />}
        >
          <div className="java-mode">
            <button
              className={`radio-card${settings.javaMode === 'auto' ? ' is-active' : ''}`}
              onClick={() => void updateSettings({ javaMode: 'auto', javaPath: '' })}
            >
              <span className="radio-dot" />
              <span>
                <strong>Автоматически</strong>
                <em>Подберём подходящую версию Java для выбранного релиза</em>
              </span>
            </button>
            <button
              className={`radio-card${settings.javaMode === 'custom' ? ' is-active' : ''}`}
              onClick={() => void updateSettings({ javaMode: 'custom' })}
            >
              <span className="radio-dot" />
              <span>
                <strong>Своя Java</strong>
                <em>{settings.javaPath || 'Путь не выбран'}</em>
              </span>
            </button>
          </div>

          <div className="java-actions">
            <Button variant="soft" icon="folder" className="btn-small" onClick={() => void pickJava()}>
              Выбрать java.exe
            </Button>
            <Button
              variant="ghost"
              icon="refresh"
              className="btn-small"
              loading={javaLoading}
              onClick={() => void detectJava()}
            >
              Найти Java
            </Button>
          </div>

          <div className="java-list">
            {javaLoading && !javaList ? (
              <div className="java-empty">
                <Spinner size={16} /> Сканируем систему…
              </div>
            ) : null}
            {javaList?.length === 0 ? (
              <div className="java-empty">
                Java не найдена. Лаунчер скачает нужную среду с серверов Mojang при запуске.
              </div>
            ) : null}
            {javaList?.map((item) => (
              <div key={item.path} className="java-item">
                <span className={`java-major${item.major >= 21 ? ' is-good' : ''}`}>
                  {item.major}
                </span>
                <div className="java-item-text">
                  <strong>{item.version}</strong>
                  <span className="mono">{item.path}</span>
                </div>
                <Badge tone={item.source === 'mojang' ? 'info' : 'neutral'}>
                  {item.source === 'mojang' ? 'Mojang' : item.source === 'custom' ? 'Выбрана' : 'Система'}
                </Badge>
              </div>
            ))}
            {javaList && javaList.length > 0 && matchingJava.length === 0 ? (
              <div className="java-warn">
                <Icon name="alert" size={14} />
                Для 26.x нужна Java 25, для 1.21.11 — Java 21. Подходящая среда будет скачана
                автоматически.
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          title="Внешний вид"
          subtitle="Атмосфера лаунчера"
          icon={<Torch size={19} />}
        >
          <Row label="Акцентный цвет" hint="Подсветка кнопок и активных элементов">
            <div className="accent-control">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  className={`accent-swatch accent-${accent.id}${settings.accent === accent.id ? ' is-active' : ''}`}
                  onClick={() => void updateSettings({ accent: accent.id })}
                  title={accent.label}
                  aria-label={accent.label}
                >
                  <span />
                </button>
              ))}
            </div>
          </Row>
          <Row label="Анимации" hint="Плавающие стикеры, свечение и переходы">
            <Toggle
              checked={settings.animations}
              onChange={(checked) => void updateSettings({ animations: checked })}
              label="Анимации интерфейса"
            />
          </Row>
          <div className="appearance-preview">
            <McSprite kind="xp" size={32} />
            <div>
              <strong>{ACCENTS.find((item) => item.id === settings.accent)?.label}</strong>
              <span>Тёмная уютная тема · Manrope</span>
            </div>
          </div>
        </Section>

        <Section
          title="Дополнительно"
          subtitle="Для опытных игроков"
          icon={<Icon name="settings" size={19} />}
        >
          <Row
            label="Аргументы JVM"
            hint="Добавляются к стандартным параметрам, например: -XX:+UseG1GC"
            stacked
          >
            <textarea
              className="text-input mono"
              rows={2}
              value={jvmDraft}
              onChange={(event) => setJvmDraft(event.target.value)}
              onBlur={commitJvm}
              placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
              spellCheck={false}
            />
          </Row>
          <Row label="Скрывать лаунчер при запуске" hint="Окно свернётся, когда игра начнёт загрузку">
            <Toggle
              checked={settings.closeOnLaunch}
              onChange={(checked) => void updateSettings({ closeOnLaunch: checked })}
              label="Скрывать лаунчер при запуске"
            />
          </Row>
          <Row
            label="Client ID Microsoft"
            hint="Публичный идентификатор Xbox Live. Меняйте только для своего приложения Azure."
            stacked
          >
            <div className="inline-input">
              <input
                className="text-input mono"
                value={clientDraft}
                onChange={(event) => setClientDraft(event.target.value)}
                onBlur={commitClientId}
                spellCheck={false}
              />
              <Button variant="ghost" className="btn-small" onClick={commitClientId}>
                Сохранить
              </Button>
            </div>
          </Row>
        </Section>

        <Section
          title="Загрузки и сеть"
          subtitle="Зеркала, прокси и докачка файлов"
          icon={<Icon name="download" size={19} />}
        >
          <Row
            label="Зеркало Mojang"
            hint="BMCLAPI ускоряет загрузку версий, библиотек и ассетов в России"
          >
            <select
              value={settings.downloadMirror}
              onChange={(event) =>
                void updateSettings({
                  downloadMirror: event.target.value === 'bmclapi' ? 'bmclapi' : 'official'
                })
              }
            >
              <option value="official">Официальные серверы Mojang</option>
              <option value="bmclapi">BMCLAPI (зеркало)</option>
            </select>
          </Row>
          <Row
            label="Прокси"
            hint="HTTP-прокси для всех загрузок. Пусто — подключаться напрямую"
            stacked
          >
            <div className="inline-input">
              <input
                className="text-input mono"
                value={proxyDraft}
                onChange={(event) => setProxyDraft(event.target.value)}
                onBlur={commitProxy}
                placeholder="http://127.0.0.1:1080"
                spellCheck={false}
              />
              <Button variant="ghost" className="btn-small" onClick={commitProxy}>
                Сохранить
              </Button>
            </div>
          </Row>
          <div className="about-note">
            <Icon name="download" size={15} />
            Загрузки идут параллельно, недокачиваются после обрыва и проверяются по SHA-1. Если
            зеркало недоступно, лаунчер автоматически вернётся к официальному серверу.
          </div>
        </Section>

        <Section
          title="Импорт из других лаунчеров"
          subtitle="Перенос сборок, миров и аккаунтов"
          icon={<Icon name="download" size={19} />}
          className="settings-wide"
        >
          <Row
            label="Ванильный .minecraft"
            hint={scan?.vanilla.gameDir ?? 'Стандартная папка Minecraft'}
          >
            {scan?.vanilla.isCurrent ? (
              <Badge tone="accent">уже используется</Badge>
            ) : (
              <Button
                variant="soft"
                className="btn-small"
                disabled={!scan?.vanilla.exists}
                onClick={() => void useVanilla()}
              >
                Использовать эту папку
              </Button>
            )}
          </Row>

          <div className="import-head">
            <div>
              <strong>Сборки других лаунчеров</strong>
              <span>Prism, CurseForge, ATLauncher, GDLauncher — подключаются на месте, без копирования</span>
            </div>
            <Button
              variant="ghost"
              className="btn-small"
              icon="refresh"
              loading={scanning}
              onClick={() => void runScan()}
            >
              Обновить
            </Button>
          </div>

          {scanning && !scan ? (
            <div className="java-empty">
              <Spinner size={16} /> Ищем установленные лаунчеры…
            </div>
          ) : null}

          {scan && scan.candidates.length === 0 ? (
            <div className="java-empty">Других сборок не найдено</div>
          ) : null}

          <div className="import-list">
            {scan?.candidates.map((candidate) => (
              <div className="import-item" key={candidate.id}>
                <span className="import-icon">
                  <Icon name="gamepad" size={18} />
                </span>
                <div className="import-text">
                  <strong>{candidate.name}</strong>
                  <span>
                    {candidate.launcher}
                    {candidate.mcVersion ? ` · Minecraft ${candidate.mcVersion}` : ''} ·{' '}
                    {candidate.modsCount} модов
                    {candidate.hasSaves ? ' · есть миры' : ''}
                  </span>
                </div>
                <Button
                  variant="soft"
                  className="btn-small"
                  loading={importing === candidate.id}
                  onClick={() => openConnect(candidate)}
                >
                  Подключить
                </Button>
              </div>
            ))}
          </div>

          <Row
            label="Аккаунты"
            hint="Имена из launcher_profiles.json. Токены других лаунчеров перенести нельзя"
          >
            <Button variant="soft" className="btn-small" onClick={() => void importAccounts()}>
              Импортировать офлайн-аккаунты
            </Button>
          </Row>
        </Section>

        <Section
          title="О системе"
          subtitle="Диагностика и версии"
          icon={<Icon name="info" size={19} />}
          className="settings-wide"
        >
          <div className="about-grid">
            <div className="about-item">
              <span>Cozy Launcher</span>
              <strong>{api.app.version}</strong>
            </div>
            <div className="about-item">
              <span>Electron</span>
              <strong>{system?.electron ?? '—'}</strong>
            </div>
            <div className="about-item">
              <span>Платформа</span>
              <strong>
                {system ? `${system.platform} · ${system.arch}` : '—'}
              </strong>
            </div>
            <div className="about-item">
              <span>Процессор</span>
              <strong title={system?.cpuModel}>{system ? `${system.cores} ядер` : '—'}</strong>
            </div>
            <div className="about-item is-wide">
              <span>Папка лаунчера</span>
              <strong className="mono">{settings.gameDir}</strong>
            </div>
          </div>
          <div className="about-note">
            <Icon name="shield" size={15} />
            Токены Microsoft шифруются через safeStorage Windows. Пароль не сохраняется.
            Лаунчер скачивает только официальные файлы Mojang и проверяет SHA-1.
          </div>
        </Section>
      </div>

      <Modal
        open={connectTarget !== null}
        icon="download"
        title="Подключить сборку"
        subtitle={
          connectTarget
            ? `${connectTarget.launcher} · ${connectTarget.modsCount} модов · папка останется на месте`
            : undefined
        }
        dismissable={importing === null}
        onClose={() => setConnectTarget(null)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConnectTarget(null)}
              disabled={importing !== null}
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              loading={importing === connectTarget?.id}
              onClick={() => void connectImport()}
            >
              Подключить
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Название в лаунчере" wide>
            <input
              value={connectName}
              maxLength={48}
              onChange={(event) => setConnectName(event.target.value)}
            />
          </Field>
          <Field
            label="Версия Minecraft"
            wide
            hint="Которая установлена в Cozy. Сборка использует общие файлы версии."
          >
            <input
              value={connectVersion}
              placeholder="1.21.4"
              spellCheck={false}
              onChange={(event) => setConnectVersion(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
