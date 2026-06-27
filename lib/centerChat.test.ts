import { describe, it, expect } from 'vitest'
import { buildPersonaCandidates } from './centerChat'

const c = (id: string, name = id) => ({ id, name, gender: '', avatarUrl: null })

describe('buildPersonaCandidates', () => {
  it('AI 캐릭터는 후보에서 제외한다', () => {
    const out = buildPersonaCandidates({ collectionChars: [c('a'), c('b')], standaloneCards: [], aiCharIds: ['a'] })
    expect(out.map(x => x.id)).toEqual(['b'])
  })

  it('멀티 동료 + standalone를 합치고 id 중복은 제거한다', () => {
    const out = buildPersonaCandidates({ collectionChars: [c('b')], standaloneCards: [c('b'), c('d')], aiCharIds: ['a'] })
    expect(out.map(x => x.id)).toEqual(['b', 'd'])
  })
})
