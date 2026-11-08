import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { InstallProgress, VersionStatus, VersionSummary } from '@shared/types'
import { Badge, Button, ProgressBar } from './ui'
import { Icon } from './Icon'
import { VersionArt } from './VersionArt'
import { formatBytes, formatDate, formatSpeed, versionTypeLabel } from '../lib/api'

export function VersionRow({
  version,
  status,
  install,
  active,
  onSelect,
  onInstall,
  onCancel,
  onRemove,
  onPlay
}: {
  version: VersionSummary
  status?: VersionStatus
  install?: InstallProgress
  active: boolean
  onSelect: () => void
  onInstall: () => void
  onCancel: () => void
  onRemove: () => void
  onPlay: () => void
}): ReactNode {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const installing = install && !['done', 'error', 'cancelled'].includes(install.phase)
  const installed = status?.installed ?? false
  const percent = install && install.total > 0 ? (install.done / install.total) * 100 : 0

  const armRemove = (): void => {
    if (armed) {
      onRemove()
      setArmed(false)
      return
    }
    setArmed(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setArmed(false), 4000)
  }

  return (
    <div
      className={`version-row${active ? ' is-active' : ''}${installing ? ' is-installing' : ''}`}
    >
      <button className="row-select" onClick={onSelect} aria-label={`Выбрать ${version.id}`} />
      <span className="row-thumb">
        <VersionArt versionId={version.id} />
      </span>
      <span className="row-name">
        <strong>{version.id}</strong>
        <span>{versionTypeLabel(version.type)}</span>
      </span>
      <span className="row-date">{formatDate(version.releaseTime)}</span>
      <span className="row-size">{installed ? formatBytes(status?.sizeBytes) : '—'}</span>
      <span className="row-badge">
        {installed ? (
          <Badge tone="accent">
            <Icon name="check" size={11} /> Установлена
          </Badge>
        ) : (
          <Badge tone="neutral">Не установлена</Badge>
        )}
      </span>

      <div className="row-actions">
        {installing ? (
          <Button variant="outline" className="btn-small" onClick={onCancel}>
            Отмена
          </Button>
        ) : installed ? (
          <>
            <Button
              variant={active ? 'primary' : 'soft'}
              icon="play"
              className="btn-small"
              onClick={onPlay}
            >
              Играть
            </Button>
            <button
              className={`icon-btn icon-danger${armed ? ' is-armed' : ''}`}
              onClick={armRemove}
              title={armed ? 'Нажмите ещё раз для удаления' : 'Удалить версию'}
              aria-label="Удалить версию"
            >
              <Icon name={armed ? 'alert' : 'trash'} size={15} />
            </button>
          </>
        ) : (
          <Button variant="soft" icon="download" className="btn-small" onClick={onInstall}>
            Скачать
          </Button>
        )}
      </div>

      {installing && install ? (
        <div className="row-progress">
          <div className="row-progress-head">
            <span className="row-progress-label">
              {install.label}
              {install.file ? <em>{install.file}</em> : null}
            </span>
            <span className="row-progress-meta">
              {install.total > 0
                ? `${install.done} / ${install.total} · ${Math.round(percent)}%`
                : formatBytes(install.totalBytes)}
              {install.speed ? ` · ${formatSpeed(install.speed)}` : ''}
            </span>
          </div>
          <ProgressBar value={percent} height={5} animated />
        </div>
      ) : null}

      {install?.phase === 'error' ? (
        <div className="row-error">
          <Icon name="alert" size={13} />
          <span>{install.message ?? 'Не удалось установить версию'}</span>
          <button className="link-btn" onClick={onInstall}>
            Повторить
          </button>
        </div>
      ) : null}
    </div>
  )
}
