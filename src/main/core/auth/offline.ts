import type { Account } from '@shared/types'
import { isValidNickname, offlineUuid } from '../uuid'

export function createOfflineAccount(name: string): Account {
  const trimmed = name.trim()
  if (!isValidNickname(trimmed)) {
    throw new Error('Ник должен содержать 3–16 символов: латиница, цифры и «_».')
  }
  const uuid = offlineUuid(trimmed)
  return {
    id: `offline:${uuid}`,
    type: 'offline',
    name: trimmed,
    uuid,
    createdAt: Date.now()
  }
}
