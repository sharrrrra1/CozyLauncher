import { useId, type JSX } from 'react'
import { BLOCK_MARK_SVG } from '@shared/block-mark'

export interface StickerProps {
  className?: string
  size?: number
}

function useUid(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`
}

export function GrassBlock({ className, size = 64 }: StickerProps): JSX.Element {
  const top = useUid('gt')
  const dirt = useUid('gd')
  const outline = '#15251b'
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={top} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fe36a" />
          <stop offset="0.5" stopColor="#6ec93f" />
          <stop offset="1" stopColor="#4aa62c" />
        </linearGradient>
        <linearGradient id={dirt} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a06a3b" />
          <stop offset="1" stopColor="#6f4524" />
        </linearGradient>
      </defs>
      <polygon points="32,4 60,18 32,32 4,18" fill={`url(#${top})`} />
      <polygon points="4,18 32,32 32,60 4,46" fill={`url(#${dirt})`} />
      <polygon points="60,18 32,32 32,60 60,46" fill="#5c3a1e" />
      <polygon points="4,18 32,32 32,38 4,24" fill="#63bf3a" />
      <polygon points="60,18 32,32 32,38 60,24" fill="#4c9c2c" />
      <g opacity="0.55" fill="#3f7d22">
        <rect x="14" y="15" width="5" height="3" transform="skewX(-27)" />
        <rect x="38" y="13" width="4" height="3" transform="skewX(27)" />
        <rect x="26" y="22" width="4" height="3" transform="skewX(-27)" />
      </g>
      <g opacity="0.5" fill="#4a2c13">
        <rect x="10" y="30" width="5" height="5" />
        <rect x="20" y="42" width="4" height="4" />
        <rect x="44" y="34" width="4" height="4" />
        <rect x="51" y="43" width="3" height="3" />
      </g>
      <polygon
        points="32,4 60,18 32,32 4,18"
        fill="none"
        stroke={outline}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <polygon
        points="4,18 32,32 32,60 4,46"
        fill="none"
        stroke={outline}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <polygon
        points="60,18 32,32 32,60 60,46"
        fill="none"
        stroke={outline}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <polyline
        points="4,18 32,4 60,18"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Chest({ className, size = 64 }: StickerProps): JSX.Element {
  const wood = useUid('ch')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={wood} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c98a4a" />
          <stop offset="1" stopColor="#7c4c21" />
        </linearGradient>
      </defs>
      <rect x="9" y="25" width="46" height="30" rx="3" fill={`url(#${wood})`} stroke="#33200c" strokeWidth="2.4" />
      <path d="M7 20a4 4 0 0 1 4-4h42a4 4 0 0 1 4 4v9H7Z" fill="#b97a3d" stroke="#33200c" strokeWidth="2.4" />
      <rect x="7" y="29" width="50" height="4" fill="#5c3817" opacity="0.7" />
      <rect x="15" y="33" width="3" height="22" fill="#5c3817" opacity="0.45" />
      <rect x="46" y="33" width="3" height="22" fill="#5c3817" opacity="0.45" />
      <rect x="28" y="29" width="8" height="12" rx="2" fill="#f2c45c" stroke="#4a3410" strokeWidth="2" />
      <circle cx="32" cy="35" r="1.8" fill="#4a3410" />
      <rect x="12" y="22" width="34" height="2.5" rx="1" fill="#ffffff" opacity="0.18" />
    </svg>
  )
}

export function Torch({ className, size = 64 }: StickerProps): JSX.Element {
  const glow = useUid('tg')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="20" r="26" fill={`url(#${glow})`} />
      <rect x="28" y="24" width="8" height="34" rx="2" fill="#9a6535" stroke="#3a2410" strokeWidth="2" />
      <rect x="30" y="26" width="2.4" height="30" fill="#c48951" opacity="0.7" />
      <path d="M32 6c9 10 8 18 0 23-8-5-9-13 0-23Z" fill="#ff9a3c" stroke="#7a3410" strokeWidth="1.8" />
      <path d="M32 13c4 6 4 11 0 14-4-3-4-8 0-14Z" fill="#ffd35c" />
      <path d="M32 18c1.6 2.6 1.6 4.6 0 6-1.6-1.4-1.6-3.4 0-6Z" fill="#fff6c9" />
      <circle cx="46" cy="10" r="1.6" fill="#ffcc66" opacity="0.9" />
      <circle cx="18" cy="16" r="1.2" fill="#ffcc66" opacity="0.7" />
    </svg>
  )
}

export function ShieldCheck({ className, size = 64 }: StickerProps): JSX.Element {
  const face = useUid('sh')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ef0b4" />
          <stop offset="0.55" stopColor="#4fce85" />
          <stop offset="1" stopColor="#2c9a63" />
        </linearGradient>
      </defs>
      <path
        d="M32 6 55 14v17c0 13-9.8 22.8-23 27C18.8 53.8 9 44 9 31V14z"
        fill={`url(#${face})`}
        stroke="#173a29"
        strokeWidth="2.4"
      />
      <path
        d="M32 10.5 51 17.4V31c0 11-8 19.4-19 23.2C21 50.4 13 42 13 31V17.4z"
        fill="none"
        stroke="#d7ffe8"
        strokeOpacity="0.35"
        strokeWidth="1.4"
      />
      <path
        d="M21.5 31.5 28.5 38.5 43 23.5"
        fill="none"
        stroke="#0f3323"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.5 31.5 28.5 38.5 43 23.5"
        fill="none"
        stroke="#eafff2"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="18" r="2.2" fill="#ffffff" opacity="0.45" />
    </svg>
  )
}

export function LogoMark({ className, size = 44 }: StickerProps): JSX.Element {
  return (
    <span className={`logo-mark ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: BLOCK_MARK_SVG }}
      />
    </span>
  )
}
