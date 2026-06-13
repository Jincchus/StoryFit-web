import type { Opening } from '@/types'

export function getOpenings(character?: { openingMessage?: string; openingMessages?: Opening[] } | null): Opening[] {
  if (character?.openingMessages?.length) return character.openingMessages
  if (character?.openingMessage?.trim()) {
    return [{ id: 'default', title: '기본 도입부', content: character.openingMessage }]
  }
  return []
}
