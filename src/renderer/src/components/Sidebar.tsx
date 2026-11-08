import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { Avatar } from './Avatar'
import { useApp } from '../state/AppContext'
import { formatBytes, api } from '../lib/api'
import { McSprite } from './McSprite'

export type PageId = 'home' | 'versions' | 'mods' | 'accounts' | 'settings'

const NAV: { id: PageId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'versions', label: 'Версии', icon: 'versions' },
  { id: 'mods', label: 'Моды', icon: 'sparkles' },
  { id: 'accounts', label: 'Аккаунты', icon: 'user' },
  { id: 'settings', label: 'Настройки', icon: 'settings' }
]

export function Sidebar({
  page,
  onNavigate
}: {
  page: PageId
  onNavigate: (page: PageId) => void
}): ReactNode {
  const { current, system, accounts, installs } = useApp()
  const activeInstalls = Object.values(installs).filter(
    (item) => !['done', 'error', 'cancelled'].includes(item.phase)
  ).length

  const memPercent = system ? Math.round(((system.totalMemMb - system.freeMemMb) / system.totalMemMb) * 100) : 0

  return (
    <aside className="sidebar">
      <div className="sidebar-glow" />
      <nav className="sidebar-nav">
        <span className="sidebar-eyebrow">Меню</span>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item${page === item.id ? ' is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="nav-label">{item.label}</span>
            {item.id === 'versions' && activeInstalls > 0 ? (
              <span className="nav-badge">{activeInstalls}</span>
            ) : null}
            <span className="nav-active-dot" />
          </button>
        ))}
      </nav>

      <div className="sidebar-art" aria-hidden="true">
        <McSprite kind="creeper" size={32} className="sidebar-creeper" />
        <div className="sidebar-tip">
          <strong>Совет</strong>
          <span>Удерживайте Shift при запуске, чтобы открыть папку игры.</span>
        </div>
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-meter">
        <div className="sidebar-meter-head">
          <span>
            <Icon name="memory" size={14} /> Память
          </span>
          <span className="sidebar-meter-value">{memPercent}%</span>
        </div>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${memPercent}%` }} />
        </div>
        <div className="sidebar-meter-foot">
          <span>{formatBytes(system?.freeMemMb ? system.freeMemMb * 1024 * 1024 : undefined)} свободно</span>
          <span>{formatBytes(system?.totalMemMb ? system.totalMemMb * 1024 * 1024 : undefined)}</span>
        </div>
      </div>

      <button className="sidebar-account" onClick={() => onNavigate('accounts')}>
        <Avatar account={current} size={38} glow />
        <span className="sidebar-account-text">
          <strong>{current?.name ?? 'Нет аккаунта'}</strong>
          <span>
            {current
              ? current.type === 'microsoft'
                ? 'Microsoft'
                : 'Офлайн'
              : 'Добавить аккаунт'}
          </span>
        </span>
        <span className="sidebar-account-more">
          <Icon name="chevronRight" size={16} />
        </span>
      </button>

      <span className="sidebar-footer">Версия {api.app.version} · {accounts.length} акк.</span>
    </aside>
  )
}
