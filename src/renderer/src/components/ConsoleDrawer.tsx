import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useApp } from '../state/AppContext'
import type { LaunchPhase } from '@shared/types'

const PHASE_LABEL: Record<LaunchPhase, string> = {
  preparing: 'Подготовка',
  java: 'Проверка Java',
  starting: 'Запуск',
  running: 'Игра работает',
  exited: 'Игра закрыта',
  error: 'Ошибка',
  stopped: 'Остановлено'
}

function statusText(
  phase: LaunchPhase | undefined,
  message: string | undefined,
  versionId: string | undefined
): string {
  if (!phase) return 'Готов к запуску'
  if (phase === 'running') return `Minecraft ${versionId ?? ''} работает`
  if ((phase === 'exited' || phase === 'stopped') && versionId) {
    return `${PHASE_LABEL[phase]} · ${versionId}`
  }
  return message ? `${PHASE_LABEL[phase]} · ${message}` : PHASE_LABEL[phase]
}

export function ConsoleDrawer(): ReactNode {
  const { logs, consoleOpen, setConsoleOpen, launchState, clearLogs, stop, settings } = useApp()
  const scroller = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!consoleOpen) return
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [logs, consoleOpen])

  const phase = launchState?.phase
  const active = phase === 'running' || phase === 'starting' || phase === 'preparing' || phase === 'java'

  return (
    <div className={`console${consoleOpen ? ' is-open' : ''}`}>
      <div className="console-panel" aria-hidden={!consoleOpen}>
        <div className="console-head">
          <span className="console-title">
            <Icon name="terminal" size={14} /> Консоль игры
          </span>
          <span className="console-meta">
            {launchState?.versionId ? `Minecraft ${launchState.versionId}` : 'Вывод Java-процесса'}
          </span>
          <div className="console-actions">
            <button className="console-btn" onClick={clearLogs} disabled={!logs.length}>
              Очистить
            </button>
            <button className="console-btn" onClick={() => setConsoleOpen(false)}>
              <Icon name="chevronDown" size={14} />
            </button>
          </div>
        </div>
        <div className="console-lines" ref={scroller}>
          {logs.length === 0 ? (
            <div className="console-empty">
              <span className="console-empty-icon">
                <Icon name="terminal" size={22} />
              </span>
              <p>Здесь появится вывод Minecraft.</p>
              <span>Запустите игру, чтобы увидеть логи в реальном времени.</span>
            </div>
          ) : (
            logs.map((line, index) => (
              <div key={`${line.time}-${index}`} className={`log-line log-${line.stream}`}>
                <span className="log-time">
                  {new Date(line.time).toLocaleTimeString('ru-RU', { hour12: false })}
                </span>
                <span className="log-text">{line.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="console-bar">
        <button
          className={`console-toggle${consoleOpen ? ' is-open' : ''}`}
          onClick={() => setConsoleOpen(!consoleOpen)}
        >
          <Icon name="terminal" size={15} />
          <span>{consoleOpen ? 'Скрыть консоль' : 'Консоль'}</span>
          <Icon name="chevronDown" size={13} />
        </button>

        <div className={`console-status phase-${phase ?? 'idle'}`}>
          <span className="status-dot" />
          <span className="console-status-text">
            {statusText(phase, launchState?.message, launchState?.versionId)}
          </span>
        </div>

        <div className="console-bar-right">
          {settings ? <span className="console-chip">{settings.ramMb} МБ RAM</span> : null}
          {active ? (
            <button className="btn btn-danger btn-small" onClick={() => void stop()}>
              <Icon name="stop" size={13} />
              Остановить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
