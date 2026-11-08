import { type ReactNode } from 'react'
import photoHero from '../assets/art/photo-hero.webp'
import photoMeadow from '../assets/art/photo-meadow.webp'
import photoVillage from '../assets/art/photo-village.webp'
import photoIce from '../assets/art/photo-ice.webp'
import photoEvening from '../assets/art/photo-evening.webp'

const KNOWN: Record<string, number> = {
  '26.3': 0,
  '26.2': 1,
  '1.21.11': 2
}

function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return hash
}

export function versionVariant(id: string): number {
  return KNOWN[id] ?? hashId(id) % 4
}

const SCENES = {
  hero: photoHero,
  cards: [photoMeadow, photoVillage, photoIce, photoEvening]
} as const

export function VersionArt({
  versionId,
  className = '',
  caption,
  large = false
}: {
  versionId: string
  className?: string
  caption?: string
  large?: boolean
}): ReactNode {
  const variant = versionVariant(versionId)
  const image = large ? SCENES.hero : SCENES.cards[variant]

  return (
    <div className={`version-art has-photo v${variant}${large ? ' is-large' : ''} ${className}`.trim()}>
      <div className="art-photo" style={{ backgroundImage: `url(${image})` }} />
      <div className="art-vignette" />
      <div className="art-noise" />
      <div className="art-label">
        <span className="art-name">Minecraft</span>
        <span className="art-number">{versionId}</span>
        {caption ? <span className="art-caption">{caption}</span> : null}
      </div>
      <div className="art-shine" />
    </div>
  )
}
