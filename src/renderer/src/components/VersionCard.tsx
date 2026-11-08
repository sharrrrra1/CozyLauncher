import type { ReactNode } from 'react'
import type { FeaturedVersion, InstallProgress, VersionStatus } from '@shared/types'
import { Badge, Button, ProgressBar, Spinner } from './ui'
import { VersionArt } from './VersionArt'
import { formatBytes, formatSpeed } from '../lib/api'

export function VersionCard({
  item,
  status,
  install,
  active,
  onSelect,
  onInstall,
  onCancel,
  onPlay
}: {
  item: FeaturedVersion
  status?: VersionStatus
  install?: InstallProgress
  active: boolean
  onSelect: () => void
  onInstall: () => void
  onCancel: () => void
  onPlay: () => void
}): ReactNode {
  const installing = install && !['done', 'error', 'cancelled'].includes(install.phase)
  const installed = status?.installed ?? false
  const percent = install && install.total > 0 ? (install.done / install.total) * 100 : 0

  return (
    <article
      className={`version-card${active ? ' is-active' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <VersionArt versionId={item.id} caption={item.tagline} className="card-art" />

      <div className="card-body">
        <div className="card-line">
          <h3>Minecraft {item.id}</h3>
          <Badge tone={item.badge === 'LATEST' ? 'accent' : item.badge === 'STABLE' ? 'info' : 'warm'}>
            {item.badge}
          </Badge>
        </div>
        <p className="card-tagline">{item.tagline}</p>

        {installing && install ? (
          <div className="card-progress">
            <div className="card-progress-head">
              <span>{install.label}</span>
              <button
                className="link-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  onCancel()
                }}
              >
                Отмена
              </button>
            </div>
            <ProgressBar value={percent} height={6} animated />
            <span className="card-progress-meta">
              {Math.round(percent)}% · {formatSpeed(install.speed)}
            </span>
          </div>
        ) : (
          <div className="card-foot">
            {installed ? (
              <>
                <Button
                  variant="primary"
                  icon="play"
                  className="btn-small"
                  onClick={(event) => {
                    event.stopPropagation()
                    onPlay()
                  }}
                >
                  Играть
                </Button>
                <span className="card-size">{formatBytes(status?.sizeBytes)}</span>
              </>
            ) : (
              <>
                <Button
                  variant="soft"
                  icon="download"
                  className="btn-small"
                  onClick={(event) => {
                    event.stopPropagation()
                    onInstall()
                  }}
                >
                  Скачать
                </Button>
                <span className="card-size">не установлена</span>
              </>
            )}
          </div>
        )}
      </div>

      {active ? <span className="card-selected" aria-hidden="true" /> : null}
      {installing ? (
        <span className="card-installing">
          <Spinner size={12} />
        </span>
      ) : null}
    </article>
  )
}
