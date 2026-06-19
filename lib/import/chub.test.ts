import { describe, it, expect } from 'vitest'
import { parseChubUrl, stripChubAuthorNotes } from './chub'
import { applyTagMap, finalizeTags } from './tagMap'

describe('stripChubAuthorNotes', () => {
  it('모델 추천·인트로 개수·NOTE/blacklist·구분선을 제거한다', () => {
    const src = [
      '------',
      'Works flawlessly with regular GPT-4, Claude Sonnet/Opus seem alright too!',
      '',
      'Four whole intros are included!',
      '',
      '*NOTE: If I catch you bullying any of my bots I WILL blacklist you*',
      '--------------',
    ].join('\n')
    expect(stripChubAuthorNotes(src)).toBe('')
  })

  it('실제 캐릭터 설정 본문은 보존한다', () => {
    const src = [
      'Aria is a clumsy guardian angel who loves snacks.',
      'She wears a light brown hoodie and has white wings.',
      'Follow me on patreon for more!',
    ].join('\n')
    const out = stripChubAuthorNotes(src)
    expect(out).toContain('guardian angel who loves snacks')
    expect(out).toContain('white wings')
    expect(out).not.toMatch(/patreon/i)
  })

  it('빈 입력은 빈 문자열', () => {
    expect(stripChubAuthorNotes('')).toBe('')
  })
})

describe('parseChubUrl', () => {
  it('chub.ai 표준 URL에서 author/slug 추출', () => {
    expect(parseChubUrl('https://chub.ai/characters/alice/cool-bot')).toEqual({ author: 'alice', slug: 'cool-bot' })
  })
  it('www·쿼리·해시가 붙어도 추출', () => {
    expect(parseChubUrl('https://www.chub.ai/characters/bob/my_char?foo=1#x')).toEqual({ author: 'bob', slug: 'my_char' })
  })
  it('URL 인코딩된 세그먼트 디코드', () => {
    expect(parseChubUrl('https://chub.ai/characters/a%20b/c%2Dd')).toEqual({ author: 'a b', slug: 'c-d' })
  })
  it('형식이 아니면 throw', () => {
    expect(() => parseChubUrl('https://chub.ai/search?q=x')).toThrow()
  })
})

describe('applyTagMap', () => {
  it('알려진 태그는 한글로 매핑(대소문자 무시)', () => {
    const { resolved, unresolved } = applyTagMap(['Female', 'SCI-FI', 'Tsundere'])
    expect(resolved).toEqual(['여성', 'SF', '츤데레'])
    expect(unresolved).toEqual([])
  })
  it('미정의 태그는 unresolved로', () => {
    const { resolved, unresolved } = applyTagMap(['Female', 'Werewolf'])
    expect(resolved).toEqual(['여성'])
    expect(unresolved).toEqual(['Werewolf'])
  })
  it('빈 문자열 태그는 무시', () => {
    const { resolved, unresolved } = applyTagMap(['  ', 'Fantasy'])
    expect(resolved).toEqual(['판타지'])
    expect(unresolved).toEqual([])
  })
})

describe('finalizeTags', () => {
  it('중복 제거 + 공백 정리', () => {
    expect(finalizeTags(['판타지', ' 판타지 ', 'SF'])).toEqual(['판타지', 'SF'])
  })
  it('최대 15개로 제한', () => {
    const many = Array.from({ length: 20 }, (_, i) => `태그${i}`)
    expect(finalizeTags(many)).toHaveLength(15)
  })
})
