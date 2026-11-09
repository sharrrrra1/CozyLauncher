import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../state/AppContext'
import { api, formatBytes, formatCount, formatError, formatSpeed } from '../lib/api'
import { Button, Spinner, Badge, ProgressBar, Modal } from '../components/ui'
import { Icon } from '../components/Icon'
import { McSprite } from '../components/McSprite'
import type {
  InstallProgress,
  Instance,
  InstalledMod,
  ModInstallPlan,
  ModSearchResult,
  ModUpdate,
  ModVersion
} from '@shared/types'

interface PendingInstall {
  mod: ModSearchResult
  version: ModVersion
  plan: ModInstallPlan
  optional: string[]
}

export function ModsPage(): ReactNode {
  const { selectedVersion, statuses, toast, install, cancelInstall, refreshStatuses } = useApp()
  const [instances, setInstances] = useState<Instance[]>([])
  const [targetId, setTargetId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [mods, setMods] = useState<ModSearchResult[]>([])
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'catalog' | 'installed'>('catalog')

  const [selectedMod, setSelectedMod] = useState<ModSearchResult | null>(null)
  const [modVersionsList, setModVersionsList] = useState<ModVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingInstall | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const [updates, setUpdates] = useState<ModUpdate[]>([])
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  const targetInstance = instances.find((item) => item.id === targetId)
  const gameVersion = targetInstance?.versionId ?? selectedVersion
  const versionStatus = statuses[gameVersion]
  const installed = versionStatus?.installed ?? false
  const statusKnown = Boolean(versionStatus)

  useEffect(() => {
    void api.instances.list().then(setInstances).catch(() => undefined)
  }, [])

  // An instance may target a game version other than the selected one; make
  // sure its install status is known before claiming the client is missing.
  useEffect(() => {
    if (!versionStatus) void refreshStatuses([gameVersion])
  }, [gameVersion, versionStatus, refreshStatuses])

  const loadInstalled = async (): Promise<void> => {
    try {
      setInstalledMods(await api.mods.listInstalled(gameVersion, targetId || undefined))
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    void loadInstalled()
    setUpdates([])
    const unsubscribeLog = api.mods.onLog((message) => {
      setLogs((prev) => [...prev.slice(-120), message])
    })
    const unsubscribeProgress = api.mods.onProgress((value) => setProgress(value))
    return () => {
      unsubscribeLog()
      unsubscribeProgress()
    }
  }, [gameVersion, targetId])

  const handleSearch = async (event?: React.FormEvent): Promise<void> => {
    if (event) event.preventDefault()
    setLoading(true)
    try {
      setMods(await api.mods.search(searchQuery, gameVersion))
    } catch (error) {
      toast('error', 'Ошибка поиска модов', formatError(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void handleSearch()
  }, [gameVersion])

  const openVersions = async (mod: ModSearchResult): Promise<void> => {
    setSelectedMod(mod)
    setModVersionsList([])
    setVersionsLoading(true)
    try {
      setModVersionsList(await api.mods.versions(mod.projectId, gameVersion))
    } catch (error) {
      toast('error', 'Не удалось загрузить версии мода', formatError(error))
    } finally {
      setVersionsLoading(false)
    }
  }

  const openPreview = async (version: ModVersion): Promise<void> => {
    if (!selectedMod) return
    setPreviewingVersionId(version.versionId)
    try {
      const plan = await api.mods.preview(
        selectedMod.projectId,
        version.versionId,
        gameVersion
      )
      setPending({ mod: selectedMod, version, plan, optional: [] })
      setSelectedMod(null)
    } catch (error) {
      toast('error', 'Не удалось собрать зависимости', formatError(error))
    } finally {
      setPreviewingVersionId(null)
    }
  }

  const refreshPreview = async (optional: string[]): Promise<void> => {
    if (!pending) return
    try {
      const plan = await api.mods.preview(
        pending.mod.projectId,
        pending.version.versionId,
        gameVersion,
        optional
      )
      setPending({ ...pending, plan, optional })
    } catch (error) {
      toast('error', 'Не удалось обновить список', formatError(error))
    }
  }

  const toggleOptional = async (projectId: string): Promise<void> => {
    if (!pending) return
    const next = pending.optional.includes(projectId)
      ? pending.optional.filter((id) => id !== projectId)
      : [...pending.optional, projectId]
    await refreshPreview(next)
  }

  const confirmInstall = async (): Promise<void> => {
    if (!pending) return
    setInstalling(true)
    setProgress(null)
    try {
      await api.mods.install(
        pending.mod.projectId,
        pending.version.versionId,
        gameVersion,
        pending.optional,
        targetId || undefined
      )
      toast('success', 'Мод установлен', `${pending.mod.title} · ${pending.version.versionNumber}`)
      setPending(null)
      await loadInstalled()
    } catch (error) {
      toast('error', 'Ошибка установки мода', formatError(error))
    } finally {
      setInstalling(false)
      setProgress(null)
    }
  }

  const removeMod = async (mod: InstalledMod): Promise<void> => {
    try {
      await api.mods.remove(gameVersion, mod.filename, targetId || undefined)
      toast('info', 'Мод удалён', mod.filename)
      await loadInstalled()
    } catch (error) {
      toast('error', 'Не удалось удалить мод', formatError(error))
    }
  }

  const toggleMod = async (mod: InstalledMod): Promise<void> => {
    try {
      await api.mods.toggle(gameVersion, mod.filename, !mod.enabled, targetId || undefined)
      await loadInstalled()
    } catch (error) {
      toast('error', 'Не удалось переключить мод', formatError(error))
    }
  }

  const checkUpdates = async (): Promise<void> => {
    setCheckingUpdates(true)
    try {
      const list = await api.mods.checkUpdates(gameVersion, targetId || undefined)
      setUpdates(list)
      toast(
        list.length ? 'info' : 'success',
        list.length ? `Доступно обновлений: ${list.length}` : 'Все моды обновлены',
        list.map((item) => `${item.title}: ${item.currentVersion} → ${item.latestVersion}`).join('\n')
      )
    } catch (error) {
      toast('error', 'Не удалось проверить обновления', formatError(error))
    } finally {
      setCheckingUpdates(false)
    }
  }

  const updateAll = async (): Promise<void> => {
    setCheckingUpdates(true)
    try {
      const count = await api.mods.updateAll(gameVersion, targetId || undefined)
      toast('success', 'Обновление завершено', `Обновлено модов: ${count}`)
      setUpdates([])
      await loadInstalled()
    } catch (error) {
      toast('error', 'Ошибка обновления', formatError(error))
    } finally {
      setCheckingUpdates(false)
    }
  }

  const installPack = async (): Promise<void> => {
    try {
      const result = await api.mods.installPack()
      if (!result) return
      toast('success', 'Модпак установлен', `${result.name} · файлов: ${result.files}`)
      await loadInstalled()
    } catch (error) {
      toast('error', 'Не удалось установить модпак', formatError(error))
    }
  }

  const percent = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  return (
    <div className="page versions-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">
            Каталог Modrinth · только Fabric
            {targetInstance ? ` · сборка «${targetInstance.name}»` : ''}
          </span>
          <h1>Моды для Minecraft {gameVersion}</h1>
        </div>
        <div className="heading-actions">
          <select
            className="select-inline"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            aria-label="Куда устанавливать моды"
          >
            <option value="">Общий Fabric-профиль {selectedVersion}</option>
            {instances.map((instance) => (
              <option key={instance.id} value={instance.id}>
                Сборка: {instance.name} ({instance.versionId})
              </option>
            ))}
          </select>
          <div className="heading-stat">
            <span>Установлено</span>
            <strong>{installedMods.filter((mod) => mod.enabled).length} модов</strong>
          </div>
          <div className="segmented" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'catalog'}
              className={`segment${tab === 'catalog' ? ' is-active' : ''}`}
              onClick={() => setTab('catalog')}
            >
              Каталог
            </button>
            <button
              role="tab"
              aria-selected={tab === 'installed'}
              className={`segment${tab === 'installed' ? ' is-active' : ''}`}
              onClick={() => setTab('installed')}
            >
              Установленные
            </button>
          </div>
        </div>
      </div>

      {statusKnown && !installed ? (
        <section className="cozy-note">
          <span className="cozy-note-icon">
            <McSprite kind="grass" size={32} />
          </span>
          <div>
            <strong>Сначала скачайте Minecraft {gameVersion}</strong>
            <p>
              {targetInstance
                ? `Моды установятся в папку сборки «${targetInstance.name}» и не затронут другие сборки.`
                : 'Моды устанавливаются в отдельный Fabric-профиль этой версии. Ванильная версия и её миры останутся нетронутыми.'}
            </p>
          </div>
          <Button variant="soft" className="btn-small" onClick={() => void install(gameVersion)}>
            Скачать версию
          </Button>
        </section>
      ) : null}

      {tab === 'catalog' ? (
        <>
          <form onSubmit={handleSearch} className="toolbar">
            <div className="search flex-1">
              <Icon name="search" size={16} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск модов (например, Sodium, JEI)..."
                spellCheck={false}
              />
              {searchQuery ? (
                <button type="button" className="search-clear" onClick={() => setSearchQuery('')}>
                  <Icon name="x" size={13} />
                </button>
              ) : null}
            </div>
            <Button variant="soft" icon="download" type="button" onClick={() => void installPack()}>
              Модпак .mrpack
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? <Spinner size={14} /> : 'Найти'}
            </Button>
          </form>

          <div className="version-table mods-table">
            <div className="table-head">
              <span />
              <span>Название мода</span>
              <span>Описание</span>
              <span>Загрузки</span>
              <span />
            </div>

            {loading ? (
              <div className="table-loading">
                <Spinner size={20} />
                <span>Ищем моды в Modrinth…</span>
              </div>
            ) : null}

            {!loading && mods.length === 0 ? (
              <div className="table-empty">
                <McSprite kind="creeper" size={56} />
                <strong>Ничего не найдено</strong>
                <p>Попробуйте другой запрос или проверьте подключение к интернету.</p>
              </div>
            ) : null}

            {mods.map((mod) => (
              <div key={mod.projectId} className="version-row">
                <span className="row-thumb">
                  {mod.iconUrl ? (
                    <img
                      src={mod.iconUrl}
                      alt=""
                      className="row-thumb-img"
                    />
                  ) : (
                    <Icon name="sparkles" size={18} />
                  )}
                </span>
                <span className="row-name">
                  <strong>{mod.title}</strong>
                  <span>{mod.slug}</span>
                </span>
                <span
                  className="row-date flex-2 overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {mod.description}
                </span>
                <span className="row-size">{formatCount(mod.downloads)}</span>
                <div className="row-actions">
                  <Button
                    variant="soft"
                    icon="download"
                    className="btn-small"
                    disabled={!installed}
                    onClick={() => void openVersions(mod)}
                  >
                    Выбрать
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="toolbar justify-end">
            <Button
              variant="ghost"
              icon="download"
              className="btn-small"
              onClick={() => void installPack()}
            >
              Установить .mrpack
            </Button>
            <Button
              variant="soft"
              icon="refresh"
              className="btn-small"
              disabled={checkingUpdates}
              onClick={() => void checkUpdates()}
            >
              {checkingUpdates ? <Spinner size={13} /> : 'Проверить обновления'}
            </Button>
            {updates.length > 0 ? (
              <Button
                variant="primary"
                className="btn-small"
                disabled={checkingUpdates}
                onClick={() => void updateAll()}
              >
                Обновить все ({updates.length})
              </Button>
            ) : null}
          </div>

          <div className="version-table mods-table">
            <div className="table-head">
              <span />
              <span>Имя файла</span>
              <span>Версия</span>
              <span>Размер</span>
              <span />
            </div>

            {installedMods.length === 0 ? (
              <div className="table-empty">
                <McSprite kind="grass" size={56} />
                <strong>Нет установленных модов</strong>
                <p>Перейдите в каталог и установите нужные модификации.</p>
              </div>
            ) : null}

            {installedMods.map((mod) => {
              const update = updates.find((item) => item.projectId === mod.projectId)
              return (
                <div key={mod.filename} className="version-row">
                  <span className="row-thumb">
                    <Icon name={mod.enabled ? 'check' : 'x'} size={18} />
                  </span>
                  <span className="row-name">
                    <strong>{mod.title ?? mod.filename}</strong>
                    <span className="row-sub">{mod.filename}</span>
                  </span>
                  <span className="row-date">
                    {update ? (
                      <Badge tone="warm">
                        {mod.versionNumber} → {update.latestVersion}
                      </Badge>
                    ) : (
                      (mod.versionNumber ?? '—')
                    )}
                  </span>
                  <span className="row-size">{formatBytes(mod.size)}</span>
                  <div className="row-actions">
                    <button
                      className="icon-btn"
                      onClick={() => void toggleMod(mod)}
                      title={mod.enabled ? 'Выключить мод' : 'Включить мод'}
                    >
                      <Icon name={mod.enabled ? 'check' : 'play'} size={15} />
                    </button>
                    <button
                      className="icon-btn icon-danger"
                      onClick={() => void removeMod(mod)}
                      title="Удалить мод"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {logs.length > 0 ? (
            <div className="mods-log">
              {logs.slice(-40).map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={selectedMod !== null}
        icon="sparkles"
        width={640}
        title={selectedMod ? `Версии мода: ${selectedMod.title}` : 'Версии мода'}
        subtitle={`Только сборки Fabric для Minecraft ${gameVersion}`}
        onClose={() => setSelectedMod(null)}
      >
        {versionsLoading ? (
          <div className="modal-empty">
            <Spinner size={24} />
            <p>Загружаем доступные версии…</p>
          </div>
        ) : modVersionsList.length === 0 ? (
          <div className="modal-empty">
            <p>Для версии {gameVersion} подходящих Fabric-версий мода не найдено.</p>
          </div>
        ) : (
          <div className="modal-list">
            {modVersionsList.map((version) => (
              <div key={version.versionId} className="modal-list-row">
                <div className="modal-list-text">
                  <strong>{version.versionNumber}</strong>
                  <span>
                    {version.loaders.join(', ')} · {formatBytes(version.size)}
                  </span>
                </div>
                <Button
                  variant="primary"
                  className="btn-small"
                  loading={previewingVersionId === version.versionId}
                  disabled={previewingVersionId === version.versionId}
                  onClick={() => void openPreview(version)}
                >
                  Установить с зависимостями
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={pending !== null}
        icon="download"
        width={720}
        title={pending ? `Установка: ${pending.mod.title}` : 'Установка'}
        subtitle={
          pending
            ? `Будет скачано ${pending.plan.files.length} ${
                pending.plan.files.length === 1 ? 'файл' : 'файлов'
              }, всего ${formatBytes(pending.plan.totalSize)}. Файлы сверяются по SHA-1 и SHA-512.`
            : undefined
        }
        dismissable={!installing}
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="ghost" disabled={installing} onClick={() => setPending(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              icon="download"
              loading={installing}
              disabled={installing || (pending?.plan.blocked.length ?? 0) > 0}
              onClick={() => void confirmInstall()}
            >
              Скачать и установить
            </Button>
          </>
        }
      >
        {pending ? (
          <>
            {pending.plan.blocked.length > 0 ? (
              <div className="modal-alert">
                {pending.plan.blocked.map((reason, index) => (
                  <div key={index}>{reason}</div>
                ))}
              </div>
            ) : null}

            <div className="modal-list">
              {pending.plan.files.map((file) => (
                <div key={`${file.projectId}-${file.versionId}`} className="modal-list-row is-plain">
                  <div className="modal-list-text">
                    <strong>{file.title}</strong>
                    <span>
                      {file.versionNumber} · {file.reason}
                    </span>
                  </div>
                  <span className="modal-list-meta">{formatBytes(file.size)}</span>
                </div>
              ))}
            </div>

            {pending.plan.optional.length > 0 ? (
              <div className="modal-section">
                <strong className="modal-section-title">Необязательные зависимости</strong>
                {pending.plan.optional.map((option) => (
                  <label key={option.projectId} className="modal-check">
                    <input
                      type="checkbox"
                      checked={pending.optional.includes(option.projectId)}
                      disabled={installing}
                      onChange={() => void toggleOptional(option.projectId)}
                    />
                    <span>
                      {option.title} {option.versionNumber} · {formatBytes(option.size)}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {installing ? (
              <div className="modal-progress">
                <div className="modal-progress-head">
                  <span>{progress?.label ?? 'Готовим установку…'}</span>
                  <span>
                    {percent}%{progress?.speed ? ` · ${formatSpeed(progress.speed)}` : ''}
                  </span>
                </div>
                <ProgressBar value={percent} height={6} animated />
                {progress?.file ? <div className="modal-progress-file">{progress.file}</div> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>

      <Modal
        open={installing && !pending}
        title="Установка модов"
        dismissable={false}
        onClose={() => undefined}
        width={420}
      >
        <div className="modal-empty">
          <Spinner size={22} />
          <p>Устанавливаем моды…</p>
        </div>
      </Modal>
    </div>
  )
}
