import type { CozyApi } from '@shared/types'

declare global {
  interface Window {
    cozy: CozyApi
  }
}

export {}
