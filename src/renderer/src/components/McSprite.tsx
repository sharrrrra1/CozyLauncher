import { type JSX } from 'react'
import mcCreeper from '../assets/mc/mc-creeper.png'
import mcDiamond from '../assets/mc/mc-diamond.png'
import mcGrass from '../assets/mc/mc-grass.png'
import mcHeart from '../assets/mc/mc-heart.png'
import mcPotion from '../assets/mc/mc-potion-berry.png'
import mcXp from '../assets/mc/mc-xp.png'

const SPRITES = {
  creeper: mcCreeper,
  diamond: mcDiamond,
  grass: mcGrass,
  heart: mcHeart,
  potion: mcPotion,
  xp: mcXp
} as const

export type SpriteKind = keyof typeof SPRITES

/** Размер в CSS px должен делиться на сторону тексела спрайта, иначе пиксель-арт плывёт. */
export function McSprite({
  kind,
  size,
  className = ''
}: {
  kind: SpriteKind
  size: number
  className?: string
}): JSX.Element {
  return (
    <img
      className={`mc-sprite ${className}`.trim()}
      src={SPRITES[kind]}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  )
}
