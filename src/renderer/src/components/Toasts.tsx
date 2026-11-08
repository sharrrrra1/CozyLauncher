import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { useApp, type ToastKind } from '../state/AppContext'

const ICON: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'info'
}

export function Toasts(): ReactNode {
  const { toasts, dismissToast } = useApp()

  if (!toasts.length) return null

  return (
    <div className="toasts" role="region" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>
          <span className="toast-icon">
            <Icon name={ICON[item.kind]} size={16} />
          </span>
          <div className="toast-text">
            <strong>{item.title}</strong>
            {item.message ? <span>{item.message}</span> : null}
          </div>
          <button className="toast-close" onClick={() => dismissToast(item.id)} aria-label="Закрыть">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
