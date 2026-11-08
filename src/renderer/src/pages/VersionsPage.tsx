import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../state/AppContext'
import { Button, Spinner } from '../components/ui'
import { Icon } from '../components/Icon'
import { VersionRow } from '../components/VersionRow'
import { McSprite } from '../components/McSprite'
import { formatCount, formatDate } from '../lib/api'

type Filter = 'all' | 'release' | 'snapshot' | 'installed'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'release', label: 'Релизы' },
  { id: 'snapshot', label: 'Снапшоты' },
  { id: 'installed', label: 'Установленные' }
]

export function VersionsPage(): ReactNode {
  const {
    manifest,
    manifestError,
    refreshManifest,
    statuses,
    refreshStatuses,
    installs,
    selectedVersion,
    selectVersion,
    install,
    cancelInstall,
    removeVersion,
    launch,
    featured
  } = useApp()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(60)

  useEffect(() => {
    setLimit(60)
  }, [search, filter])

  const filtered = useMemo(() => {
    if (!manifest) return []
    const query = search.trim().toLowerCase()
    const featuredRank = new Map(featured.map((item, index) => [item.id, index]))
    return manifest.versions
      .filter((version) => {
        if (query && !version.id.toLowerCase().includes(query)) return false
        if (filter === 'release' && version.type !== 'release') return false
        if (filter === 'snapshot' && version.type !== 'snapshot') return false
        if (filter === 'installed' && !statuses[version.id]?.installed) return false
        return true
      })
      .sort(
        (a, b) =>
          (featuredRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (featuredRank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      )
  }, [manifest, search, filter, statuses, featured])

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit])
  const visibleKey = visible.map((version) => version.id).join(',')
  const allKey = useMemo(
    () => (filter === 'installed' ? (manifest?.versions.map((v) => v.id).join(',') ?? '') : ''),
    [filter, manifest]
  )

  useEffect(() => {
    if (!manifest) return
    const ids =
      filter === 'installed'
        ? (allKey ? allKey.split(',') : [])
        : visibleKey
          ? visibleKey.split(',')
          : []
    if (ids.length) void refreshStatuses(ids)
  }, [manifest, filter, visibleKey, allKey, refreshStatuses])

  const installedFeatured = featured.filter((item) => statuses[item.id]?.installed).length
  const latest = manifest?.latest.release

  return (
    <div className="page versions-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Каталог Mojang</span>
          <h1>Версии Minecraft</h1>
        </div>
        <div className="heading-actions">
          <div className="heading-stat">
            <span>Последний релиз</span>
            <strong>{latest ?? '…'}</strong>
          </div>
          <div className="heading-stat">
            <span>В каталоге</span>
            <strong>{manifest ? formatCount(manifest.versions.length) : '…'}</strong>
          </div>
          <div className="heading-stat">
            <span>Избранное</span>
            <strong>
              {installedFeatured}/{featured.length}
            </strong>
          </div>
          <Button variant="ghost" icon="refresh" onClick={() => void refreshManifest()}>
            Обновить
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти версию, например 1.21.11"
            spellCheck={false}
            aria-label="Поиск версии"
          />
          {search ? (
            <button className="search-clear" onClick={() => setSearch('')} aria-label="Очистить поиск">
              <Icon name="x" size={13} />
            </button>
          ) : null}
        </div>
        <div className="segmented" role="tablist" aria-label="Фильтр версий">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={filter === item.id}
              className={`segment${filter === item.id ? ' is-active' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="toolbar-count">
          {manifest ? `${formatCount(filtered.length)} версий` : ''}
        </span>
      </div>

      <div className="version-table">
        <div className="table-head">
          <span />
          <span>Версия</span>
          <span>Дата выхода</span>
          <span className="table-head-size">Размер</span>
          <span>Статус</span>
          <span />
        </div>

        {!manifest && !manifestError ? (
          <div className="table-loading">
            <Spinner size={20} />
            <span>Загружаем каталог версий…</span>
          </div>
        ) : null}

        {manifestError ? (
          <div className="table-error">
            <span className="table-error-icon">
              <Icon name="wifi" size={22} />
            </span>
            <div>
              <strong>Не удалось загрузить каталог</strong>
              <p>{manifestError}</p>
            </div>
            <Button variant="soft" icon="refresh" onClick={() => void refreshManifest()}>
              Повторить
            </Button>
          </div>
        ) : null}

        {manifest && !filtered.length ? (
          <div className="table-empty">
            <McSprite kind="creeper" size={56} />
            <strong>Ничего не нашлось</strong>
            <p>
              {filter === 'installed'
                ? 'Пока нет установленных версий — скачайте любую из каталога.'
                : 'Попробуйте изменить запрос или фильтр.'}
            </p>
            <button
              className="link-btn"
              onClick={() => {
                setSearch('')
                setFilter('all')
              }}
            >
              Сбросить фильтры
            </button>
          </div>
        ) : null}

        {visible.map((version) => (
          <VersionRow
            key={version.id}
            version={version}
            status={statuses[version.id]}
            install={installs[version.id]}
            active={selectedVersion === version.id}
            onSelect={() => selectVersion(version.id)}
            onInstall={() => void install(version.id)}
            onCancel={() => void cancelInstall(version.id)}
            onRemove={() => void removeVersion(version.id)}
            onPlay={() => void launch(version.id)}
          />
        ))}

        {filtered.length > visible.length ? (
          <button className="load-more" onClick={() => setLimit((value) => value + 80)}>
            Показать ещё 80
            <span>{formatCount(filtered.length - visible.length)} осталось</span>
          </button>
        ) : null}
      </div>

      <p className="versions-footnote">
        Каталог синхронизируется с piston-meta.mojang.com. Данные обновляются автоматически
        каждый час. Установленные версии хранятся в{' '}
        <code>.minecraft/versions</code> и запускаются без повторной загрузки.
        {manifest?.latest.release ? ` Последний релиз от ${formatDate(
          manifest.versions.find((v) => v.id === manifest.latest.release)?.releaseTime
        )}.` : ''}
      </p>
    </div>
  )
}
