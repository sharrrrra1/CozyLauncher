import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ServerConfig, UpdateProgress, UpdateStatus, VersionMeta } from '@shared/types'
import { useApp } from '../state/AppContext'
import { api, formatBytes, formatDate, formatSpeed, versionTypeLabel } from '../lib/api'
import { Button, ProgressBar, Spinner } from '../components/ui'
import { VersionCard } from '../components/VersionCard'
import { VersionArt } from '../components/VersionArt'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { McSprite } from '../components/McSprite'
import { CommunityLinks } from '../components/CommunityLinks'
import { ScreenshotsModal } from '../components/ScreenshotsModal'
import type { PageId } from '../components/Sidebar'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

export function HomePage({ onNavigate }: { onNavigate: (page: PageId) => void }): ReactNode {
  const {
    settings,
    current,
    featured,
    manifest,
    statuses,
    installs,
    selectedVersion,
    selectVersion,
    install,
    cancelInstall,
    launch,
    launchState,
    toast
  } = useApp()

  const [meta, setMeta] = useState<VersionMeta | null>(null)
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('none')
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)
  const [serverBusy, setServerBusy] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

  useEffect(() => {
    let alive = true
    api.server
      .config()
      .then((config) => {
        if (alive) setServerConfig(config)
      })
      .catch(() => undefined)
    const offStatus = api.updates.onStatus((status) => setUpdateStatus(status))
    const offProgress = api.updates.onProgress((progress) => setUpdateProgress(progress))
    return () => {
      alive = false
      offStatus()
      offProgress()
    }
  }, [])

  useEffect(() => {
    if (!selectedVersion) return
    let alive = true
    setMeta(null)
    api.versions
      .meta(selectedVersion)
      .then((value) => {
        if (alive) setMeta(value)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [selectedVersion])

  const activeFeature = featured.find((item) => item.id === selectedVersion)
  const status = statuses[selectedVersion]
  const installProgress = installs[selectedVersion]
  const installing = Boolean(
    installProgress && !['done', 'error', 'cancelled'].includes(installProgress.phase)
  )
  const installed = status?.installed ?? false
  const running = launchState?.phase === 'running' || launchState?.phase === 'starting'
  const percent =
    installProgress && installProgress.total > 0
      ? Math.round((installProgress.done / installProgress.total) * 100)
      : 0

  const versionInfo = useMemo(() => {
    const summary = manifest?.versions.find((entry) => entry.id === selectedVersion)
    return {
      type: status?.versionType ?? summary?.type ?? 'release',
      date: status?.releaseTime ?? summary?.releaseTime
    }
  }, [status, manifest, selectedVersion])

  const playOnServer = async (): Promise<void> => {
    if (!serverConfig || serverConfig.status !== 'online') return
    const versionId = serverConfig.mcVersion
    if (!statuses[versionId]?.installed) {
      toast('info', `Скачиваем Minecraft ${versionId}`, 'Он нужен для входа на CozyPOLIT')
      await install(versionId)
    }
    setServerBusy(true)
    try {
      await api.server.play(versionId, serverConfig.ip, serverConfig.port)
    } catch (error) {
      toast('error', 'Не удалось подключиться', error instanceof Error ? error.message : String(error))
    } finally {
      setServerBusy(false)
    }
  }

  return (
    <div className="page home-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">
            {greeting()}
            {current ? `, ${current.name}` : ''}
          </span>
          <h1>JorneyMC</h1>
        </div>
        <button className="heading-chip" onClick={() => onNavigate('versions')}>
          <Icon name="sparkles" size={15} />
          Выбрать версию
          <Icon name="arrowRight" size={14} />
        </button>
      </div>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-pill">
            <span className="hero-pill-dot" />
            {activeFeature?.badge === 'LATEST'
              ? 'Свежий релиз'
              : installed
                ? 'Готова к запуску'
                : 'Подготовлена к установке'}
          </div>

          <h2 className="hero-title">
            <span className="hero-title-small">Minecraft</span>
            <span className="hero-title-version">{selectedVersion || '—'}</span>
          </h2>
          <p className="hero-subtitle">
            {activeFeature?.tagline ?? 'Выберите версию и играйте'}.
            {' '}
            Аккаунт, Java и файлы — в одном месте.
          </p>

          <div className="hero-chips">
            <span className="chip">
              <Icon name="java" size={14} /> Java {meta?.javaMajor ?? '…'}
            </span>
            <span className="chip">
              <Icon name="memory" size={14} /> {formatBytes(meta?.totalSize)}
            </span>
            <span className="chip">
              <Icon name="clock" size={14} /> {formatDate(versionInfo.date)}
            </span>
            <span className="chip">
              <Icon name="gamepad" size={14} /> {versionTypeLabel(versionInfo.type)}
            </span>
          </div>

          <div className="hero-actions">
            {!current ? (
              <Button
                variant="primary"
                className="btn-hero"
                icon="userPlus"
                onClick={() => onNavigate('accounts')}
              >
                Добавить аккаунт
              </Button>
            ) : installing ? (
              <Button variant="outline" className="btn-hero" icon="x" onClick={() => cancelInstall(selectedVersion)}>
                Отменить установку
              </Button>
            ) : installed ? (
              <Button
                variant="primary"
                className="btn-hero btn-play"
                icon={running ? 'check' : 'play'}
                disabled={running}
                onClick={() => void launch(selectedVersion)}
              >
                {running ? 'Игра запущена' : 'Играть'}
              </Button>
            ) : (
              <Button
                variant="primary"
                className="btn-hero"
                icon="download"
                onClick={() => void install(selectedVersion)}
              >
                Скачать версию
              </Button>
            )}

            <Button variant="ghost" icon="settings" onClick={() => onNavigate('settings')}>
              Настройки
            </Button>
            <Button variant="ghost" icon="monitor" onClick={() => setGalleryOpen(true)}>
              Скриншоты
            </Button>
          </div>

          {installing && installProgress ? (
            <div className="hero-progress">
              <div className="hero-progress-head">
                <span className="hero-progress-label">
                  <Spinner size={13} /> {installProgress.label}
                </span>
                <span className="hero-progress-meta">
                  {percent}%{installProgress.speed ? ` · ${formatSpeed(installProgress.speed)}` : ''}
                </span>
              </div>
              <ProgressBar value={percent} height={6} animated />
              {installProgress.file ? <span className="hero-progress-file">{installProgress.file}</span> : null}
            </div>
          ) : (
            <span className="hero-hint">
              {installed
                ? `Файлы на месте · ${formatBytes(status?.sizeBytes)}`
                : current
                  ? 'Скачаем клиент, библиотеки и ассеты автоматически'
                  : 'Сначала создайте офлайн-аккаунт или войдите через Microsoft'}
            </span>
          )}
        </div>

        <div className="hero-stage">
          <VersionArt
            versionId={selectedVersion || '1.21.11'}
            caption={activeFeature?.tagline}
            large
            className="hero-cover"
          />
          <McSprite kind="creeper" size={56} className="float-sticker sticker-creeper" />
        </div>
      </section>

      <section className="quick-stats">
        <div className="stat-card stat-account">
          <span className="stat-icon">
            <Avatar account={current} size={40} />
          </span>
          <div className="stat-text">
            <span className="stat-label">Аккаунт</span>
            <strong>{current?.name ?? 'Не выбран'}</strong>
            <span className="stat-sub">
              {current ? (current.type === 'microsoft' ? 'Microsoft' : 'Офлайн-профиль') : 'Требуется вход'}
            </span>
          </div>
          <button className="stat-link" onClick={() => onNavigate('accounts')}>
            {current ? 'Сменить' : 'Добавить'}
            <Icon name="chevronRight" size={13} />
          </button>
        </div>

        <div className="stat-card">
          <span className="stat-icon stat-icon-warm">
            <Icon name="memory" size={20} />
          </span>
          <div className="stat-text">
            <span className="stat-label">Выделено памяти</span>
            <strong>{settings?.ramMb ?? '—'} МБ</strong>
            <span className="stat-sub">
              {settings?.fullscreen ? 'Полный экран' : `${settings?.width ?? 0}×${settings?.height ?? 0}`}
            </span>
          </div>
          <button className="stat-link" onClick={() => onNavigate('settings')}>
            Настроить
            <Icon name="chevronRight" size={13} />
          </button>
        </div>

        <div className="stat-card">
          <span className="stat-icon stat-icon-frost">
            <Icon name="java" size={20} />
          </span>
          <div className="stat-text">
            <span className="stat-label">Java для версии</span>
            <strong>Java {meta?.javaMajor ?? '…'}</strong>
            <span className="stat-sub">
              {settings?.javaMode === 'custom' ? 'Выбрана вручную' : 'Авто-подбор'}
            </span>
          </div>
          <button className="stat-link" onClick={() => onNavigate('settings')}>
            Подробнее
            <Icon name="chevronRight" size={13} />
          </button>
        </div>
      </section>

      <section className="featured">
        <div className="section-head">
          <div>
            <h3>Избранные версии</h3>
            <p>Отобранные версии — ставь и играй</p>
          </div>
          <button className="link-action" onClick={() => onNavigate('versions')}>
            Все версии <Icon name="arrowRight" size={14} />
          </button>
        </div>
        <div className="featured-grid">
          {featured.map((item) => (
            <VersionCard
              key={item.id}
              item={item}
              status={statuses[item.id]}
              install={installs[item.id]}
              active={selectedVersion === item.id}
              onSelect={() => selectVersion(item.id)}
              onInstall={() => void install(item.id)}
              onCancel={() => void cancelInstall(item.id)}
              onPlay={() => void launch(item.id)}
            />
          ))}
          {!featured.length ? (
            <div className="featured-skeleton">
              <Spinner size={18} />
              <span>Загружаем рекомендации…</span>
            </div>
          ) : null}
        </div>
      </section>

      <CommunityLinks />

      {serverConfig ? (
        <section className={`server-promo status-${serverConfig.status}`}>
          <div className="server-promo-copy">
            <span className="page-eyebrow">
              {serverConfig.status === 'online'
                ? `Сервер открыт · ${serverConfig.mcVersion}`
                : `Открытие скоро · ${serverConfig.mcVersion}`}
            </span>
            <h3>{serverConfig.title}</h3>
            <p>{serverConfig.bannerText}</p>
            {serverConfig.features.length > 0 ? (
              <div className="server-promo-features">
                {serverConfig.features.map((feature) => (
                  <span key={feature} className="chip">
                    {feature}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="server-promo-actions">
              {serverConfig.status === 'online' ? (
                <Button
                  variant="primary"
                  icon="play"
                  disabled={serverBusy}
                  onClick={() => void playOnServer()}
                >
                  {serverBusy ? 'Подключаемся…' : serverConfig.buttonText}
                </Button>
              ) : (
                <span className="server-promo-soon">
                  <Icon name="clock" size={14} /> Сервер ещё не открыт
                </span>
              )}
              <Button variant="ghost" icon="sparkles" onClick={() => onNavigate('mods')}>
                Собрать моды
              </Button>
            </div>
          </div>
          <div className="server-promo-art">
            <McSprite kind="heart" size={64} />
            <McSprite kind="diamond" size={40} className="server-promo-diamond" />
          </div>
        </section>
      ) : null}

      {updateStatus === 'available' ||
      updateStatus === 'downloading' ||
      updateStatus === 'downloaded' ? (
        <section className="update-banner">
          <span className="update-banner-icon">
            <Icon name="download" size={20} />
          </span>
          <div>
            <strong>
              {updateStatus === 'downloaded'
                ? 'Обновление готово к установке'
                : updateStatus === 'downloading'
                  ? 'Скачиваем обновление лаунчера'
                  : 'Доступно обновление JorneyMC'}
            </strong>
            <p>
              {updateStatus === 'downloading'
                ? `${updateProgress?.percent ?? 0}%${
                    updateProgress?.bytesPerSecond
                      ? ` · ${formatSpeed(updateProgress.bytesPerSecond)}`
                      : ''
                  }`
                : 'Новая версия скачается только с вашего согласия.'}
            </p>
          </div>
          {updateStatus === 'available' ? (
            <Button
              variant="soft"
              className="btn-small"
              onClick={() => void api.updates.download()}
            >
              Скачать обновление
            </Button>
          ) : null}
          {updateStatus === 'downloaded' ? (
            <Button
              variant="primary"
              className="btn-small"
              onClick={() => api.updates.quitAndInstall()}
            >
              Перезапустить и обновить
            </Button>
          ) : null}
        </section>
      ) : null}

      <section className="cozy-note">
        <span className="cozy-note-icon">
          <McSprite kind="potion" size={32} />
        </span>
        <div>
          <strong>На заметку</strong>
          <p>
            Офлайн-профиль не требует интернета и подходит для модов и игры «для себя».
            Для серверов с проверкой лицензии используйте аккаунт Microsoft.
          </p>
        </div>
        <button className="link-action" onClick={() => onNavigate('accounts')}>
          Аккаунты <Icon name="arrowRight" size={14} />
        </button>
      </section>

      <ScreenshotsModal
        open={galleryOpen}
        scope="vanilla"
        title="Ванильный Minecraft"
        onClose={() => setGalleryOpen(false)}
      />
    </div>
  )
}
