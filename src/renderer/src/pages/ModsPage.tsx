import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../state/AppContext'
import { api, formatBytes, formatCount, formatError, formatSpeed } from '../lib/api'
import { Button, Spinner, Badge, ProgressBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { McSprite } from '../components/McSprite'
import type {
  InstallProgress,
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
  const { selectedVersion, statuses, toast, install, cancelInstall } = useApp()
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

  const installed = statuses[selectedVersion]?.installed ?? false

  const loadInstalled = async (): Promise<void> => {
    try {
      setInstalledMods(await api.mods.listInstalled(selectedVersion))
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
  }, [selectedVersion])

  const handleSearch = async (event?: React.FormEvent): Promise<void> => {
    if (event) event.preventDefault()
    setLoading(true)
    try {
      setMods(await api.mods.search(searchQuery, selectedVersion))
    } catch (error) {
      toast('error', 'Ошибка поиска модов', formatError(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void handleSearch()
  }, [selectedVersion])

  const openVersions = async (mod: ModSearchResult): Promise<void> => {
    setSelectedMod(mod)
    setModVersionsList([])
    setVersionsLoading(true)
    try {
      setModVersionsList(await api.mods.versions(mod.projectId, selectedVersion))
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
        selectedVersion
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
        selectedVersion,
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
        selectedVersion,
        pending.optional
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
      await api.mods.remove(selectedVersion, mod.filename)
      toast('info', 'Мод удалён', mod.filename)
      await loadInstalled()
    } catch (error) {
      toast('error', 'Не удалось удалить мод', formatError(error))
    }
  }

  const toggleMod = async (mod: InstalledMod): Promise<void> => {
    try {
      await api.mods.toggle(selectedVersion, mod.filename, !mod.enabled)
      await loadInstalled()
    } catch (error) {
      toast('error', 'Не удалось переключить мод', formatError(error))
    }
  }

  const checkUpdates = async (): Promise<void> => {
    setCheckingUpdates(true)
    try {
      const list = await api.mods.checkUpdates(selectedVersion)
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
      const count = await api.mods.updateAll(selectedVersion)
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
          <span className="page-eyebrow">Каталог Modrinth · только Fabric</span>
          <h1>Моды для Minecraft {selectedVersion}</h1>
        </div>
        <div className="heading-actions">
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

      {!installed ? (
        <section className="cozy-note" style={{ marginBottom: 18 }}>
          <span className="cozy-note-icon">
            <McSprite kind="grass" size={32} />
          </span>
          <div>
            <strong>Сначала скачайте Minecraft {selectedVersion}</strong>
            <p>
              Моды устанавливаются в отдельный Fabric-профиль этой версии. Ванильная
              версия и её миры останутся нетронутыми.
            </p>
          </div>
          <Button variant="soft" className="btn-small" onClick={() => void install(selectedVersion)}>
            Скачать версию
          </Button>
        </section>
      ) : null}

      {tab === 'catalog' ? (
        <>
          <form onSubmit={handleSearch} className="toolbar">
            <div className="search" style={{ flex: 1 }}>
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

          <div className="version-table">
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
                      style={{ width: 32, height: 32, borderRadius: 6 }}
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
                  className="row-date"
                  style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
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

          <div className="version-table">
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
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{mod.filename}</span>
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
            <div
              style={{
                marginTop: 16,
                background: '#000',
                color: '#7ee787',
                padding: 10,
                borderRadius: 8,
                fontSize: 11,
                fontFamily: 'monospace',
                maxHeight: 140,
                overflowY: 'auto'
              }}
            >
              {logs.slice(-40).map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {selectedMod ? (
        <div className="modal-backdrop" onClick={() => setSelectedMod(null)}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: 640, width: '100%', background: 'var(--panel)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>Версии мода: {selectedMod.title}</h3>
              <button className="icon-btn" onClick={() => setSelectedMod(null)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            {versionsLoading ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <Spinner size={24} />
                <p style={{ marginTop: 8 }}>Загружаем доступные версии…</p>
              </div>
            ) : modVersionsList.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 24 }}>
                Для версии {selectedVersion} подходящих Fabric-версий мода не найдено.
              </p>
            ) : (
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {modVersionsList.map((version) => (
                  <div
                    key={version.versionId}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}
                  >
                    <div>
                      <strong>{version.versionNumber}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {version.loaders.join(', ')} · {formatBytes(version.size)}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      className="btn-small"
                      disabled={previewingVersionId === version.versionId}
                      onClick={() => void openPreview(version)}
                    >
                      {previewingVersionId === version.versionId ? (
                        <Spinner size={12} />
                      ) : (
                        'Установить с зависимостями'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {pending ? (
        <div className="modal-backdrop" onClick={() => !installing && setPending(null)}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: 720, width: '100%', background: 'var(--panel)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3>Установка: {pending.mod.title}</h3>
              <button className="icon-btn" disabled={installing} onClick={() => setPending(null)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <p style={{ marginTop: 0, color: 'var(--text-dim)' }}>
              Будет скачано {pending.plan.files.length}{' '}
              {pending.plan.files.length === 1 ? 'файл' : 'файлов'}, всего{' '}
              {formatBytes(pending.plan.totalSize)}. Файлы сверяются по SHA-1 и SHA-512.
            </p>

            {pending.plan.blocked.length > 0 ? (
              <div style={{ background: 'rgba(255,90,90,0.12)', border: '1px solid rgba(255,90,90,0.4)', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                {pending.plan.blocked.map((reason, index) => (
                  <div key={index} style={{ color: '#ff8b8b', fontSize: 13 }}>{reason}</div>
                ))}
              </div>
            ) : null}

            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pending.plan.files.map((file) => (
                <div key={`${file.projectId}-${file.versionId}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6 }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{file.title}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {file.versionNumber} · {file.reason}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatBytes(file.size)}</span>
                </div>
              ))}
            </div>

            {pending.plan.optional.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 13 }}>Необязательные зависимости</strong>
                {pending.plan.optional.map((option) => (
                  <label key={option.projectId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={pending.optional.includes(option.projectId)}
                      disabled={installing}
                      onChange={() => void toggleOptional(option.projectId)}
                    />
                    {option.title} {option.versionNumber} · {formatBytes(option.size)}
                  </label>
                ))}
              </div>
            ) : null}

            {installing ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>{progress?.label ?? 'Готовим установку…'}</span>
                  <span>
                    {percent}%
                    {progress?.speed ? ` · ${formatSpeed(progress.speed)}` : ''}
                  </span>
                </div>
                <ProgressBar value={percent} height={6} animated />
                {progress?.file ? (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{progress.file}</div>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <Button variant="ghost" disabled={installing} onClick={() => setPending(null)}>
                Отмена
              </Button>
              <Button
                variant="primary"
                icon="download"
                disabled={installing || pending.plan.blocked.length > 0}
                onClick={() => void confirmInstall()}
              >
                {installing ? <Spinner size={13} /> : 'Скачать и установить'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {installing && !pending ? (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ background: 'var(--panel)', padding: 24, borderRadius: 12 }}>
            <Spinner size={20} /> Устанавливаем моды…
          </div>
        </div>
      ) : null}
    </div>
  )
}
