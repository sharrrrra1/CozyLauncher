import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { LogoMark } from './Stickers'
import { useApp } from '../state/AppContext'

export function TitleBar(): ReactNode {
  const [maximized, setMaximized] = useState(false)
  const { consoleOpen, setConsoleOpen, launchState } = useApp()

  useEffect(() => {
    let alive = true
    api.window.isMaximized().then((value) => {
      if (alive) setMaximized(value)
    })
    const off = api.window.onMaximizedChange(setMaximized)
    return () => {
      alive = false
      off()
    }
  }, [])

  const running = launchState?.phase === 'running' || launchState?.phase === 'starting'

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <LogoMark size={22} />
        <span className="titlebar-name">Cozy Launcher</span>
        <span className="titlebar-tag">Minecraft</span>
      </div>

      <div className="titlebar-center">
        {running ? (
          <button className="titlebar-status is-live" onClick={() => setConsoleOpen(!consoleOpen)}>
            <span className="pulse-dot" />
            {launchState?.versionId} запущен
          </button>
        ) : null}
      </div>

      <div className="titlebar-actions">
        <button
          className={`titlebar-btn${consoleOpen ? ' is-active' : ''}`}
          onClick={() => setConsoleOpen(!consoleOpen)}
          title="Консоль игры"
          aria-label="Консоль игры"
        >
          <Icon name="terminal" size={15} />
        </button>
        <span className="titlebar-divider" />
        <button
          className="titlebar-btn"
          onClick={() => api.window.minimize()}
          title="Свернуть"
          aria-label="Свернуть"
        >
          <Icon name="minus" size={15} />
        </button>
        <button
          className="titlebar-btn"
          onClick={() => api.window.maximize()}
          title={maximized ? 'Восстановить' : 'Развернуть'}
          aria-label={maximized ? 'Восстановить' : 'Развернуть'}
        >
          <Icon name={maximized ? 'restore' : 'square'} size={13} />
        </button>
        <button
          className="titlebar-btn is-close"
          onClick={() => api.window.close()}
          title="Закрыть"
          aria-label="Закрыть"
        >
          <Icon name="x" size={15} />
        </button>
      </div>
    </header>
  )
}
