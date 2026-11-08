import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }): ReactNode {
  return (
    <span
      className={`spinner ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  animated = false,
  height = 8,
  label
}: {
  value: number
  max?: number
  tone?: 'accent' | 'warm' | 'muted'
  animated?: boolean
  height?: number
  label?: string
}): ReactNode {
  const safeMax = max > 0 ? max : 1
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100))
  return (
    <div
      className={`progress progress-${tone}${animated ? ' is-animated' : ''}`}
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-label={label}
    >
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-thumb" />
    </button>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className = ''
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warm' | 'info' | 'rose'
  className?: string
}): ReactNode {
  return <span className={`badge badge-${tone} ${className}`.trim()}>{children}</span>
}

export function Modal({
  open,
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  width = 460,
  dismissable = true
}: {
  open: boolean
  title: string
  subtitle?: string
  icon?: IconName
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  dismissable?: boolean
}): ReactNode {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissable) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissable, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissable) onClose()
      }}
    >
      <div
        className="modal"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-head">
          <div className="modal-head-text">
            <h2 id={titleId}>
              {icon ? (
                <span className="modal-icon">
                  <Icon name={icon} size={18} />
                </span>
              ) : null}
              {title}
            </h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {dismissable ? (
            <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
              <Icon name="x" size={18} />
            </button>
          ) : null}
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}

type ButtonVariant = 'primary' | 'ghost' | 'soft' | 'danger' | 'outline'

export function Button({
  variant = 'soft',
  icon,
  iconRight,
  loading,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  icon?: IconName
  iconRight?: IconName
  loading?: boolean
}): ReactNode {
  return (
    <button
      {...rest}
      className={`btn btn-${variant} ${className}`.trim()}
      disabled={rest.disabled || loading}
    >
      {loading ? <Spinner size={15} /> : icon ? <Icon name={icon} size={17} /> : null}
      <span>{children}</span>
      {iconRight && !loading ? <Icon name={iconRight} size={16} /> : null}
    </button>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  wide = false
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
  wide?: boolean
}): ReactNode {
  return (
    <div className={`field${wide ? ' field-wide' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}
