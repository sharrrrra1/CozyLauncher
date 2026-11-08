import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Account } from '@shared/types'
import { api } from '../lib/api'

const SKIN_TONES = ['#f0c9a4', '#e3b087', '#c98d63', '#a76b46', '#7d4c30', '#5c3521']
const HAIR_TONES = ['#2c1d14', '#4a2c1a', '#6f4423', '#8a5a2c', '#d9b45b', '#3a3a44', '#8d3f2b']
const SHIRT_TONES = ['#2f8f5b', '#3a6ea5', '#8b5cb8', '#c05a5a', '#c08a3a', '#357a7f']

function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function PixelAvatar({ name, size }: { name: string; size: number }): ReactNode {
  const palette = useMemo(() => {
    const hash = hashString(name.toLowerCase() || 'steve')
    return {
      skin: SKIN_TONES[hash % SKIN_TONES.length],
      hair: HAIR_TONES[(hash >>> 3) % HAIR_TONES.length],
      shirt: SHIRT_TONES[(hash >>> 7) % SHIRT_TONES.length],
      style: (hash >>> 11) % 3,
      eye: (hash >>> 13) % 2 === 0 ? '#2a3a4a' : '#3b2a1c'
    }
  }, [name])

  const pixels: ReactNode[] = []
  for (let row = 0; row < 8; row += 1) {
    const fill = palette.skin
    pixels.push(<rect key={`base-${row}`} x={1} y={row} width={6} height={1} fill={fill} />)
  }
  pixels.push(<rect key="skin-edge-l" x={0} y={1} width={1} height={7} fill={palette.skin} />)
  pixels.push(<rect key="skin-edge-r" x={7} y={1} width={1} height={7} fill={palette.skin} />)

  const fringeRows = 2
  for (let row = 0; row < fringeRows; row += 1) {
    pixels.push(<rect key={`hair-${row}`} x={0} y={row} width={8} height={1} fill={palette.hair} />)
  }
  if (palette.style === 1) {
    pixels.push(<rect key="hair-side" x={0} y={2} width={1} height={2} fill={palette.hair} />)
    pixels.push(<rect key="hair-side2" x={7} y={2} width={1} height={1} fill={palette.hair} />)
  } else if (palette.style === 2) {
    pixels.push(<rect key="hair-side" x={0} y={2} width={1} height={1} fill={palette.hair} />)
    pixels.push(<rect key="hair-side2" x={7} y={2} width={1} height={2} fill={palette.hair} />)
  }
  pixels.push(<rect key="hair-shine" x={1} y={0} width={3} height={1} fill="rgba(255,255,255,0.12)" />)

  pixels.push(<rect key="eye-l" x={2} y={4} width={1} height={1} fill={palette.eye} />)
  pixels.push(<rect key="eye-r" x={5} y={4} width={1} height={1} fill={palette.eye} />)
  pixels.push(<rect key="cheek" x={1} y={5} width={1} height={1} fill="rgba(255,220,200,0.16)" />)
  pixels.push(<rect key="nose" x={3} y={5} width={2} height={1} fill="rgba(0,0,0,0.18)" />)
  pixels.push(<rect key="mouth" x={3} y={6} width={2} height={1} fill="rgba(60,20,20,0.65)" />)
  pixels.push(<rect key="shirt" x={0} y={7} width={8} height={1} fill={palette.shirt} />)
  pixels.push(<rect key="collar" x={3} y={7} width={2} height={1} fill="rgba(255,255,255,0.28)" />)

  return (
    <svg viewBox="0 0 8 8" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      {pixels}
    </svg>
  )
}

export function Avatar({
  account,
  size = 44,
  glow = false
}: {
  account: Account | null
  size?: number
  glow?: boolean
}): ReactNode {
  const [head, setHead] = useState<string | null>(null)

  useEffect(() => {
    if (!account || account.type !== 'microsoft') {
      setHead(null)
      return
    }
    let alive = true
    api.accounts
      .head(account.id)
      .then((url) => {
        if (alive) setHead(url)
      })
      .catch(() => {
        if (alive) setHead(null)
      })
    return () => {
      alive = false
    }
  }, [account?.id, account?.type])

  const style = { width: size, height: size }

  if (account?.type === 'microsoft' && head) {
    return (
      <div
        className={`avatar avatar-skin${glow ? ' is-glow' : ''}`}
        style={{
          ...style,
          backgroundImage: `url(${head}), url(${head})`,
          backgroundSize: '800% 800%, 800% 800%',
          backgroundPosition: '14.2857% 14.2857%, 71.4286% 14.2857%',
          backgroundRepeat: 'no-repeat, no-repeat',
          imageRendering: 'pixelated'
        }}
        aria-hidden="true"
      />
    )
  }

  return (
    <div
      className={`avatar avatar-pixel${glow ? ' is-glow' : ''}${account?.type === 'microsoft' ? ' is-ms' : ''}`}
      style={style}
    >
      {account ? (
        <PixelAvatar name={account.name} size={size} />
      ) : (
        <span style={{ fontSize: size * 0.4 }}>?</span>
      )}
    </div>
  )
}
