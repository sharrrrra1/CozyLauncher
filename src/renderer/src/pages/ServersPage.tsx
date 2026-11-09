import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Instance, ServerConfig, ServerEntry, ServerStatus } from '@shared/types'
import { useApp } from '../state/AppContext'
import { api, formatCount, formatError } from '../lib/api'
import { Badge, Button, Field, Modal, Spinner } from '../components/ui'
import { Icon } from '../components/Icon'

function pingLabel(status: ServerStatus | undefined): ReactNode {
  if (!status) return <Badge tone="neutral">проверяем…</Badge>
  if (!status.online) return <Badge tone="rose">офлайн</Badge>
  const players = status.players
  return (
    <Badge tone="accent">
      {players ? `${formatCount(players.online)}/${formatCount(players.max)}` : 'онлайн'}
      {status.latencyMs ? ` · ${status.latencyMs} мс` : ''}
    </Badge>
  )
}

function ServerIcon({ status, name }: { status?: ServerStatus; name: string }): ReactNode {
  if (status?.favicon) {
    return <img className="server-icon" src={status.favicon} alt="" />
  }
  return <span className="server-icon server-icon-letter">{name.slice(0, 1).toUpperCase()}</span>
}

export function ServersPage(): ReactNode {
  const { settings, featured, toast, setConsoleOpen } = useApp()
  const [servers, setServers] = useState<ServerEntry[]>([])
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [form, setForm] = useState({ name: '', address: '' })
  const [editing, setEditing] = useState<ServerEntry | null>(null)
  const [editName, setEditName] = useState('')
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [configStatus, setConfigStatus] = useState<ServerStatus | undefined>()
  const [instances, setInstances] = useState<Instance[]>([])
  const [target, setTarget] = useState('')

  const refreshPings = useCallback(async (list?: ServerEntry[]) => {
    const current = list
    setRefreshing(true)
    try {
      const [result, cozy] = await Promise.all([
        api.servers.pingAll(),
        (async () => {
          const promo = await api.server.config()
          setConfig(promo)
          if (!promo.ip) return undefined
          return api.servers.ping(promo.ip, promo.port).catch(() => undefined)
        })()
      ])
      setStatuses((prev) => {
        const next = { ...prev, ...result }
        if (cozy) next.__cozy = cozy
        return next
      })
      if (current) setServers(current)
    } catch (error) {
      toast('error', 'Не удалось проверить серверы', formatError(error))
    } finally {
      setRefreshing(false)
    }
  }, [toast])

  const refreshList = useCallback(async () => {
    try {
      const list = await api.servers.list()
      setServers(list)
      await refreshPings(list)
    } catch (error) {
      toast('error', 'Не удалось загрузить серверы', formatError(error))
    } finally {
      setLoading(false)
    }
  }, [refreshPings, toast])

  useEffect(() => {
    void refreshList()
    void api.instances
      .list()
      .then(setInstances)
      .catch(() => undefined)
    const timer = setInterval(() => void refreshPings(), 45000)
    return () => clearInterval(timer)
  }, [refreshList, refreshPings])

  const targetVersion = useMemo(() => {
    if (target) {
      const instance = instances.find((item) => item.id === target)
      if (instance) return instance.versionId
    }
    return settings?.lastVersion || featured[0]?.id || ''
  }, [target, instances, settings?.lastVersion, featured])

  const join = async (
    host: string,
    port: number,
    instanceId?: string
  ): Promise<void> => {
    if (!targetVersion) {
      toast('error', 'Сначала выберите версию Minecraft')
      return
    }
    setConsoleOpen(true)
    try {
      await api.servers.join(host, port, targetVersion, instanceId)
    } catch (error) {
      toast('error', 'Не удалось подключиться к серверу', formatError(error))
    }
  }

  const add = async (): Promise<void> => {
    if (!form.address.trim()) {
      toast('error', 'Укажите адрес сервера')
      return
    }
    setAddBusy(true)
    try {
      await api.servers.add({ name: form.name.trim(), address: form.address.trim() })
      setAdding(false)
      setForm({ name: '', address: '' })
      toast('success', 'Сервер добавлен')
      await refreshList()
    } catch (error) {
      toast('error', 'Не удалось добавить сервер', formatError(error))
    } finally {
      setAddBusy(false)
    }
  }

  const saveName = async (): Promise<void> => {
    if (!editing) return
    try {
      await api.servers.update(editing.id, { name: editName })
      setEditing(null)
      await refreshList()
    } catch (error) {
      toast('error', 'Не удалось переименовать сервер', formatError(error))
    }
  }

  const toggleFavorite = async (server: ServerEntry): Promise<void> => {
    try {
      await api.servers.update(server.id, { favorite: !server.favorite })
      setServers((prev) =>
        prev.map((item) => (item.id === server.id ? { ...item, favorite: !item.favorite } : item))
      )
    } catch (error) {
      toast('error', 'Не удалось обновить сервер', formatError(error))
    }
  }

  const remove = async (server: ServerEntry): Promise<void> => {
    try {
      await api.servers.remove(server.id)
      toast('info', 'Сервер удалён', server.name)
      await refreshList()
    } catch (error) {
      toast('error', 'Не удалось удалить сервер', formatError(error))
    }
  }

  const importDat = async (): Promise<void> => {
    try {
      const result = await api.servers.import()
      toast(
        result.imported ? 'success' : 'info',
        result.imported ? `Импортировано серверов: ${result.imported}` : 'Новых серверов не найдено',
        result.files.length ? result.files.join('\n') : 'Файл servers.dat не найден'
      )
      await refreshList()
    } catch (error) {
      toast('error', 'Не удалось импортировать servers.dat', formatError(error))
    }
  }

  const sorted = useMemo(
    () =>
      [...servers].sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
          a.name.localeCompare(b.name)
      ),
    [servers]
  )

  return (
    <div className="page servers-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Живой статус</span>
          <h1>Серверы</h1>
        </div>
        <div className="heading-actions">
          <Button variant="ghost" icon="download" onClick={() => void importDat()}>
            Импорт servers.dat
          </Button>
          <Button
            variant="ghost"
            icon="refresh"
            loading={refreshing}
            onClick={() => void refreshPings()}
          >
            Обновить
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Добавить сервер
          </Button>
        </div>
      </div>

      <div className="server-target">
        <span>Заходить с версией</span>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">{settings?.lastVersion || featured[0]?.id || 'выберите версию'}</option>
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>
              Сборка: {instance.name} ({instance.versionId})
            </option>
          ))}
        </select>
        <span className="server-target-hint">Для сборки используется её версия и моды</span>
      </div>

      {config ? (
        <article className="server-card server-card-cozy">
          <ServerIcon status={configStatus} name="CozyPOLIT" />
          <div className="server-main">
            <div className="server-name-row">
              <h3>{config.title || 'CozyPOLIT'}</h3>
              <Badge tone="warm">закреплён</Badge>
              {config.ip ? pingLabel(configStatus) : <Badge tone="neutral">скоро</Badge>}
            </div>
            <p>{config.subtitle || 'Официальный сервер JorneyMC'}</p>
            <div className="server-meta">
              {config.ip ? <span>{config.ip}:{config.port}</span> : <span>Адрес появится к открытию</span>}
              {configStatus?.version ? <span>{configStatus.version}</span> : null}
              {configStatus?.motd ? <span className="server-motd">{configStatus.motd}</span> : null}
            </div>
          </div>
          <Button
            variant="primary"
            icon="play"
            disabled={!config.ip}
            onClick={() => void join(config.ip, config.port, target || undefined)}
          >
            {config.ip ? 'Играть' : 'Скоро'}
          </Button>
        </article>
      ) : null}

      {loading ? (
        <div className="empty-state">
          <Spinner size={22} />
          <p>Загружаем серверы…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="globe" size={26} />
          </span>
          <h3>Список пуст</h3>
          <p>Добавьте сервер вручную или импортируйте servers.dat из папки .minecraft.</p>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Добавить сервер
          </Button>
        </div>
      ) : (
        <div className="server-list">
          {sorted.map((server) => {
            const status = statuses[server.id]
            return (
              <article className="server-card" key={server.id}>
                <ServerIcon status={status} name={server.name} />
                <div className="server-main">
                  <div className="server-name-row">
                    <h3>{server.name}</h3>
                    {server.favorite ? <Badge tone="warm">избранное</Badge> : null}
                    {pingLabel(status)}
                  </div>
                  <div className="server-meta">
                    <span>
                      {server.host}:{server.port}
                    </span>
                    {status?.version ? <span>{status.version}</span> : null}
                    {status?.error && !status.online ? (
                      <span className="server-error">{status.error}</span>
                    ) : null}
                  </div>
                  {status?.motd ? <p className="server-motd">{status.motd}</p> : null}
                </div>
                <div className="server-actions">
                  <button
                    type="button"
                    className={`icon-btn${server.favorite ? ' is-active' : ''}`}
                    title={server.favorite ? 'Убрать из избранного' : 'В избранное'}
                    onClick={() => void toggleFavorite(server)}
                  >
                    <Icon name="sparkles" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Переименовать"
                    onClick={() => {
                      setEditing(server)
                      setEditName(server.name)
                    }}
                  >
                    <Icon name="settings" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Удалить"
                    onClick={() => void remove(server)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                  <Button
                    variant="primary"
                    icon="play"
                    onClick={() => void join(server.host, server.port, target || undefined)}
                  >
                    Войти
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={adding}
        icon="globe"
        title="Добавить сервер"
        subtitle="Адрес можно указать с портом: play.example.com:25565"
        dismissable={!addBusy}
        onClose={() => setAdding(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={addBusy}>
              Отмена
            </Button>
            <Button variant="primary" loading={addBusy} onClick={() => void add()}>
              Добавить
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Название" wide>
            <input
              value={form.name}
              placeholder="Необязательно"
              maxLength={64}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Адрес" wide>
            <input
              value={form.address}
              placeholder="play.example.com:25565"
              spellCheck={false}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        icon="settings"
        title="Название сервера"
        dismissable
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => void saveName()}>
              Сохранить
            </Button>
          </>
        }
      >
        <Field label="Название" wide>
          <input
            value={editName}
            maxLength={64}
            onChange={(event) => setEditName(event.target.value)}
          />
        </Field>
      </Modal>
    </div>
  )
}
