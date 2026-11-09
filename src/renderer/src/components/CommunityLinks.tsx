import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { Icon } from './Icon'

const YOUTUBE_URL = 'https://www.youtube.com/@antyqwerty984'
const DISCORD_HANDLE = 'whatt7575'

export function CommunityLinks({ compact = false }: { compact?: boolean }): ReactNode {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copyDiscord = (): void => {
    const fallback = (): void => {
      const area = document.createElement('textarea')
      area.value = DISCORD_HANDLE
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(DISCORD_HANDLE).catch(fallback)
    } else {
      fallback()
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className={`community${compact ? ' community-compact' : ''}`}>
      {compact ? null : (
        <div className="community-head">
          <strong>Автор лаунчера</strong>
          <span>видео, сборки и общение — здесь</span>
        </div>
      )}
      <div className="community-links">
        <button
          type="button"
          className="community-link"
          onClick={() => void api.shell.openExternal(YOUTUBE_URL)}
          title="Открыть канал на YouTube"
        >
          <span className="community-icon is-youtube">
            <Icon name="youtube" size={18} />
          </span>
          <span className="community-text">
            <strong>YouTube</strong>
            <span>@antyqwerty984</span>
          </span>
          <Icon name="external" size={14} />
        </button>
        <button
          type="button"
          className="community-link"
          onClick={copyDiscord}
          title="Скопировать ник Discord"
        >
          <span className="community-icon is-discord">
            <Icon name="discord" size={18} />
          </span>
          <span className="community-text">
            <strong>Discord</strong>
            <span>{DISCORD_HANDLE}</span>
          </span>
          <Icon name={copied ? 'check' : 'copy'} size={14} />
        </button>
      </div>
    </div>
  )
}