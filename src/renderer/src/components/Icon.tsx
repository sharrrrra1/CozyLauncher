import {
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  Folder,
  FolderInput,
  Gamepad2,
  Globe,
  House,
  Info,
  LogOut,
  MemoryStick,
  Minus,
  Monitor,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Square,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  UserRound,
  UserRoundPlus,
  Wifi,
  X,
  type LucideIcon
} from 'lucide-react'
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
  | 'palette'
  | 'import'
  | 'youtube'
  | 'discord'

const LUCIDE: Record<Exclude<IconName, 'youtube' | 'discord'>, LucideIcon> = {
  home: House,
  versions: Box,
  user: UserRound,
  settings: Settings,
  play: Play,
  stop: Square,
  download: Download,
  trash: Trash2,
  folder: Folder,
  java: Coffee,
  memory: MemoryStick,
  monitor: Monitor,
  check: Check,
  x: X,
  search: Search,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  arrowRight: ArrowRight,
  copy: Copy,
  refresh: RefreshCw,
  logout: LogOut,
  plus: Plus,
  minus: Minus,
  square: Square,
  restore: Copy,
  terminal: SquareTerminal,
  shield: Shield,
  sparkles: Sparkles,
  external: ExternalLink,
  info: Info,
  alert: TriangleAlert,
  gamepad: Gamepad2,
  clock: Clock,
  globe: Globe,
  userPlus: UserRoundPlus,
  wifi: Wifi,
  palette: Palette,
  import: FolderInput
}

const BRAND_PATHS: Record<'youtube' | 'discord', JSX.Element> = {
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <path d="M10.2 9.2v5.6L15.2 12z" fill="currentColor" stroke="none" />
    </>
  ),
  discord: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M19.7 5.8a16.2 16.2 0 0 0-4-1.25l-.5 1.02a14.9 14.9 0 0 0-6.4 0L8.3 4.55a16.2 16.2 0 0 0-4 1.25C1.9 9.4 1.2 12.9 1.55 16.35a16.3 16.3 0 0 0 4.95 2.5l1.05-1.72a10.4 10.4 0 0 1-1.65-.8l.41-.31a11.6 11.6 0 0 0 9.38 0l.41.31a10.4 10.4 0 0 1-1.65.8l1.05 1.72a16.3 16.3 0 0 0 4.95-2.5c.4-4.05-.68-7.5-2.75-10.55ZM8.7 14.15c-.92 0-1.67-.84-1.67-1.87s.73-1.88 1.67-1.88c.93 0 1.68.85 1.67 1.88 0 1.03-.74 1.87-1.67 1.87Zm6.6 0c-.92 0-1.67-.84-1.67-1.87s.73-1.88 1.67-1.88c.93 0 1.68.85 1.67 1.88 0 1.03-.74 1.87-1.67 1.87Z"
      fill="currentColor"
      stroke="none"
    />
  )
}

export interface IconProps {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export function Icon({ name, size = 20, className, strokeWidth = 1.7 }: IconProps): JSX.Element {
  if (name === 'youtube' || name === 'discord') {
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
        {BRAND_PATHS[name]}
      </svg>
    )
  }
  const Glyph = LUCIDE[name]
  const filled = name === 'play' || name === 'stop'
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden="true"
      focusable="false"
    />
  )
}
