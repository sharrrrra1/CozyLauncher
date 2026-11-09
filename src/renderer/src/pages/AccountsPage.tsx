import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Account, AuthStep } from '@shared/types'
import { useApp } from '../state/AppContext'
import { Avatar } from '../components/Avatar'
import { Badge, Button, Modal, Spinner } from '../components/ui'
import { Icon } from '../components/Icon'
import { Chest, ShieldCheck } from '../components/Stickers'
import { McSprite } from '../components/McSprite'
import { api, formatError, shortUuid } from '../lib/api'

const NICK_PATTERN = /^[A-Za-z0-9_]{3,16}$/

const AUTH_STEPS: { id: AuthStep; label: string }[] = [
  { id: 'opening', label: 'Открываем окно Microsoft' },
  { id: 'waiting', label: 'Вход и код авторизации' },
  { id: 'xbox', label: 'Профиль Xbox Live' },
  { id: 'minecraft', label: 'Лицензия Minecraft' },
  { id: 'profile', label: 'Загрузка профиля игрока' }
]

const STEP_ORDER: Record<AuthStep, number> = {
  opening: 0,
  waiting: 1,
  xbox: 2,
  minecraft: 3,
  profile: 4,
  done: 5,
  error: -1
}

function AccountTile({
  account,
  current,
  busy,
  onSelect,
  onRefresh,
  onRemove
}: {
  account: Account
  current: boolean
  busy: boolean
  onSelect: () => void
  onRefresh: () => void
  onRemove: () => void
}): ReactNode {
  return (
    <article className={`account-tile${current ? ' is-current' : ''}`}>
      <button className="account-tile-main" onClick={onSelect}>
        <Avatar account={account} size={52} glow={current} />
        <span className="account-tile-name">
          <strong>{account.name}</strong>
          <span>
            {account.type === 'microsoft' ? 'Microsoft' : 'Офлайн'}
            {' · '}
            {shortUuid(account.uuid)}
          </span>
        </span>
        {current ? (
          <Badge tone="accent">
            <Icon name="check" size={11} /> Активен
          </Badge>
        ) : null}
      </button>
      <div className="account-tile-actions">
        {account.type === 'microsoft' ? (
          <button
            className="icon-btn"
            onClick={onRefresh}
            disabled={busy}
            title="Обновить сессию Microsoft"
            aria-label="Обновить сессию Microsoft"
          >
            {busy ? <Spinner size={14} /> : <Icon name="refresh" size={15} />}
          </button>
        ) : null}
        <button
          className="icon-btn icon-danger"
          onClick={onRemove}
          title="Удалить аккаунт"
          aria-label="Удалить аккаунт"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      {account.needsReauth ? (
        <span className="account-warning">
          <Icon name="alert" size={12} /> Требуется повторный вход
        </span>
      ) : null}
    </article>
  )
}

function OfflineModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): ReactNode {
  const { addOffline } = useApp()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  const valid = NICK_PATTERN.test(name.trim())

  const submit = async (): Promise<void> => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await addOffline(name.trim())
      onClose()
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Офлайн-аккаунт"
      subtitle="Профиль для игры без интернета и на серверах без лицензии"
      icon="userPlus"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" icon="check" onClick={() => void submit()} disabled={!valid} loading={busy}>
            Создать профиль
          </Button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span>Никнейм</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
            placeholder="Steve"
            maxLength={16}
            spellCheck={false}
          />
          <span className={`field-hint${name && !valid ? ' is-bad' : ''}`}>
            3–16 символов: латиница, цифры и нижнее подчёркивание
          </span>
        </label>
        <div className="form-note">
          <McSprite kind="heart" size={27} />
          <span>
            UUID будет вычислен детерминированно — тот же ник всегда даёт тот же профиль,
            поэтому инвентарь и мир останутся на месте.
          </span>
        </div>
        {error ? (
          <div className="form-error">
            <Icon name="alert" size={15} />
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function MicrosoftModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): ReactNode {
  const { addMicrosoft, authProgress } = useApp()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open) {
      started.current = false
      setError(null)
      setBusy(false)
      return
    }
    if (started.current) return
    started.current = true
    setBusy(true)
    setError(null)
    addMicrosoft()
      .then(() => onClose())
      .catch((reason) => setError(formatError(reason)))
      .finally(() => setBusy(false))
  }, [open, attempt, addMicrosoft, onClose])

  const stepIndex = authProgress ? STEP_ORDER[authProgress.step] : 0
  const activeMessage = authProgress?.message
  const canClose = !busy

  return (
    <Modal
      open={open}
      onClose={canClose ? onClose : () => undefined}
      dismissable={canClose}
      title="Вход через Microsoft"
      subtitle="Официальный аккаунт Mojang / Xbox Live"
      icon="shield"
      width={500}
      footer={
        error ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
            <Button
              variant="primary"
              icon="refresh"
              onClick={() => {
                started.current = false
                setAttempt((value) => value + 1)
              }}
            >
              Попробовать снова
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose} disabled={!canClose}>
            {canClose ? 'Закрыть' : 'Ожидаем вход в окне Microsoft…'}
          </Button>
        )
      }
    >
      <div className="ms-flow">
        <div className="ms-flow-head">
          <span className="ms-logo">
            <ShieldCheck size={44} />
          </span>
          <div>
            <strong>{error ? 'Вход не завершён' : busy ? 'Выполняем вход' : 'Готово'}</strong>
            <span>
              {error
                ? 'Проверьте подключение и попробуйте снова'
                : activeMessage ?? 'Открылось отдельное окно авторизации Microsoft'}
            </span>
          </div>
          {busy && !error ? <Spinner size={20} /> : null}
        </div>

        <ol className="ms-steps">
          {AUTH_STEPS.map((step, index) => {
            const state = error
              ? index <= Math.max(0, stepIndex)
                ? 'failed'
                : 'idle'
              : stepIndex > index
                ? 'done'
                : stepIndex === index
                  ? 'active'
                  : 'idle'
            return (
              <li key={step.id} className={`ms-step is-${state}`}>
                <span className="ms-step-icon">
                  {state === 'done' ? (
                    <Icon name="check" size={12} />
                  ) : state === 'active' ? (
                    <Spinner size={12} />
                  ) : (
                    <span className="ms-step-dot" />
                  )}
                </span>
                <span>{step.label}</span>
              </li>
            )
          })}
        </ol>

        {error ? (
          <div className="form-error">
            <Icon name="alert" size={15} />
            <span>{error}</span>
          </div>
        ) : (
          <p className="ms-hint">
            <Icon name="info" size={14} />
            Войдите в аккаунт Microsoft в открывшемся окне. Лаунчер не видит ваш пароль — он
            получает только токен доступа. Закройте окно Microsoft, чтобы отменить вход.
          </p>
        )}
      </div>
    </Modal>
  )
}

export function AccountsPage(): ReactNode {
  const {
    accounts,
    current,
    selectAccount,
    removeAccount,
    refreshAccountAuth,
    authBusy
  } = useApp()
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [msOpen, setMsOpen] = useState(false)
  const [removing, setRemoving] = useState<Account | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  const handleRefresh = async (id: string): Promise<void> => {
    setRefreshingId(id)
    try {
      await refreshAccountAuth(id)
    } catch {
      // the error toast is shown by the provider
    } finally {
      setRefreshingId(null)
    }
  }

  return (
    <div className="page accounts-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Профили</span>
          <h1>Аккаунты Minecraft</h1>
        </div>
        <div className="heading-actions">
          <Button variant="ghost" icon="userPlus" onClick={() => setOfflineOpen(true)}>
            Офлайн-профиль
          </Button>
          <Button variant="primary" icon="shield" onClick={() => setMsOpen(true)} disabled={authBusy}>
            Войти через Microsoft
          </Button>
        </div>
      </div>

      <section className="account-hero">
        <span className="account-hero-glow" />
        <div className="account-hero-avatar">
          <Avatar account={current} size={84} glow />
          {current ? (
            <span className={`account-type-pin${current.type === 'microsoft' ? ' is-ms' : ''}`}>
              <Icon name={current.type === 'microsoft' ? 'shield' : 'user'} size={12} />
            </span>
          ) : null}
        </div>
        <div className="account-hero-text">
          <span className="page-eyebrow">Текущий профиль</span>
          <h2>{current?.name ?? 'Аккаунт не выбран'}</h2>
          <div className="account-hero-meta">
            {current ? (
              <>
                <Badge tone={current.type === 'microsoft' ? 'info' : 'warm'}>
                  {current.type === 'microsoft' ? 'Microsoft' : 'Офлайн'}
                </Badge>
                <span className="mono">{current.uuid}</span>
                {current.needsReauth ? <Badge tone="rose">Нужен повторный вход</Badge> : null}
              </>
            ) : (
              <span>Создайте офлайн-профиль или подключите аккаунт Microsoft.</span>
            )}
          </div>
          <div className="account-hero-actions">
            {current?.type === 'microsoft' ? (
              <Button
                variant="soft"
                icon="refresh"
                loading={refreshingId === current.id}
                onClick={() => void handleRefresh(current.id)}
              >
                Обновить сессию
              </Button>
            ) : null}
            {current ? (
              <Button
                variant="ghost"
                icon="logout"
                onClick={() => setRemoving(current)}
              >
                Удалить профиль
              </Button>
            ) : (
              <Button variant="primary" icon="shield" onClick={() => setMsOpen(true)}>
                Подключить Microsoft
              </Button>
            )}
          </div>
        </div>
        <div className="account-hero-art" aria-hidden="true">
          <Chest size={104} className="account-art-chest" />
          <span className="account-art-spark spark-a" />
          <span className="account-art-spark spark-b" />
        </div>
      </section>

      <section className="accounts-section">
        <div className="section-head">
          <div>
            <h3>Все профили</h3>
            <p>{accounts.length ? `${accounts.length} сохранено на этом ПК` : 'Пока ни одного профиля'}</p>
          </div>
        </div>

        <div className="accounts-grid">
          {accounts.map((account) => (
            <AccountTile
              key={account.id}
              account={account}
              current={current?.id === account.id}
              busy={refreshingId === account.id}
              onSelect={() => {
                if (current?.id !== account.id) void selectAccount(account.id)
              }}
              onRefresh={() => void handleRefresh(account.id)}
              onRemove={() => setRemoving(account)}
            />
          ))}

          <button className="account-add" onClick={() => setOfflineOpen(true)}>
            <span className="account-add-icon">
              <Icon name="plus" size={20} />
            </span>
            <strong>Офлайн-профиль</strong>
            <span>Игра без интернета и лицензии</span>
          </button>

          <button className="account-add is-ms" onClick={() => setMsOpen(true)} disabled={authBusy}>
            <span className="account-add-icon">
              <Icon name="shield" size={20} />
            </span>
            <strong>Microsoft</strong>
            <span>Официальный вход Xbox Live</span>
          </button>
        </div>
      </section>

      <section className="account-info">
        <div className="account-info-card">
          <ShieldCheck size={34} />
          <div>
            <strong>Microsoft: всё официально</strong>
            <p>
              Нужен для серверов с лицензией, Realms и скинов. OAuth-вход проходит в отдельном
              окне, пароль не попадает в лаунчер, токены хранятся в зашифрованном виде.
            </p>
          </div>
        </div>
        <div className="account-info-card is-warm">
          <McSprite kind="creeper" size={32} />
          <div>
            <strong>Офлайн: просто и локально</strong>
            <p>
              Подходит для одиночной игры, модпаков и серверов с <code>online-mode=false</code>.
              Ник можно задать любой, а UUID остаётся стабильным между запусками.
            </p>
          </div>
        </div>
      </section>

      <p className="accounts-footnote">
        Профили хранятся локально в папке лаунчера. Удаление аккаунта не затрагивает миры,
        скриншоты и настройки версий.
        {api.app.version ? ` JorneyMC ${api.app.version}.` : ''}
      </p>

      <OfflineModal open={offlineOpen} onClose={() => setOfflineOpen(false)} />
      <MicrosoftModal open={msOpen} onClose={() => setMsOpen(false)} />

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Удалить аккаунт?"
        subtitle={removing ? `Профиль ${removing.name} будет удалён с этого ПК` : undefined}
        icon="logout"
        width={430}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                if (removing) void removeAccount(removing.id)
                setRemoving(null)
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p className="confirm-text">
          Миры и файлы игры останутся на месте. Если это аккаунт Microsoft, для повторного входа
          понадобится снова авторизоваться.
        </p>
      </Modal>
    </div>
  )
}
