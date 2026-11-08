import type { JSX } from 'react'

export type IconName =
  | 'home'
  | 'versions'
  | 'user'
  | 'settings'
  | 'play'
  | 'stop'
  | 'download'
  | 'trash'
  | 'folder'
  | 'java'
  | 'memory'
  | 'monitor'
  | 'check'
  | 'x'
  | 'search'
  | 'chevronDown'
  | 'chevronRight'
  | 'arrowRight'
  | 'copy'
  | 'refresh'
  | 'logout'
  | 'plus'
  | 'minus'
  | 'square'
  | 'restore'
  | 'terminal'
  | 'shield'
  | 'sparkles'
  | 'external'
  | 'info'
  | 'alert'
  | 'gamepad'
  | 'clock'
  | 'globe'
  | 'userPlus'
  | 'wifi'

const ICONS: Record<IconName, JSX.Element> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5V21H3z" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  versions: (
    <>
      <path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.1 3.6-6.2 8-6.2s8 2.1 8 6.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.84l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.84.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.84l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.84-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.16.42.54.76 1 .97H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z" />
    </>
  ),
  play: <path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="none" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />,
  download: (
    <>
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6h17M9 6V4.2h6V6M18.8 6l-1 14.2H6.2L5.2 6" />
      <path d="M10 10.5v5.5M14 10.5v5.5" />
    </>
  ),
  folder: (
    <path d="M3 6.8A1.8 1.8 0 0 1 4.8 5h4.1l2 2h7.3A1.8 1.8 0 0 1 20 8.8v8.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2Z" />
  ),
  java: (
    <>
      <path d="M4 8.5h12v5.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M16 9.5h1.8a2.8 2.8 0 0 1 0 5.6H16" />
      <path d="M7 5.5c1-1 1-2 0-3M11 5.5c1-1 1-2 0-3" />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M7 11.5h10M7 14.5h6M6 17v2M10 17v2M14 17v2M18 17v2M6 7V5M10 7V5M14 7V5M18 7V5" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  check: <path d="M20 6.5 9.2 17.3 4.5 12.6" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.4-4.4" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowRight: <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
      <path d="M5.5 15V5.5A2 2 0 0 1 7.5 3.5H15" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.8 3.5v5h-5" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5" />
      <path d="M16 16.5 20.5 12 16 7.5M20.5 12H9" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  square: <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />,
  restore: (
    <>
      <rect x="4.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M8.5 8.5v-2a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-2" />
    </>
  ),
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="m7 9 3.5 3L7 15M12.5 15.5H17" />
    </>
  ),
  shield: <path d="M12 3 20 6v6c0 4.8-3.5 7.8-8 9-4.5-1.2-8-4.2-8-9V6z" />,
  sparkles: (
    <>
      <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9z" />
      <path d="M19 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  external: (
    <>
      <path d="M14 3.5h6.5V10M20.5 3.5 11 13" />
      <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21.2 20H2.8z" />
      <path d="M12 9.5v4.8M12 17.2v.2" />
    </>
  ),
  gamepad: (
    <>
      <path d="M17.3 5.5H6.7a4 4 0 0 0-4 3.6l-.6 5A4 4 0 0 0 6 18.5c1.1 0 2.1-.45 2.8-1.2L10 15.5h4l1.2 1.8c.7.75 1.7 1.2 2.8 1.2a4 4 0 0 0 3.9-4.4l-.6-5a4 4 0 0 0-4-3.6Z" />
      <path d="M7 10.5v3M5.5 12h3M15.7 11.2v.2M18 13.2v.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.4l3.4 2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.2 9.5h17.6M3.2 14.5h17.6M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9.5" cy="8" r="3.8" />
      <path d="M2.5 20.5c0-4 3.4-6 7-6 1.6 0 3.2.4 4.5 1.2" />
      <path d="M18 14v6M15 17h6" />
    </>
  ),
  wifi: (
    <>
      <path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0" />
      <circle cx="12" cy="19" r="0.8" fill="currentColor" stroke="none" />
    </>
  )
}

export interface IconProps {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export function Icon({ name, size = 20, className, strokeWidth = 1.7 }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}
