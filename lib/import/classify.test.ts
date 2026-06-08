import { describe, it, expect } from 'vitest'
import { buildClassifyPrompt, parseClassification } from './classify'
import type { Block } from './types'

const blocks: Block[] = [
  { id: 0, text: '시안은 기사단장.', tabHint: '상세 설명' },
  { id: 1, text: '"늦었군."', tabHint: '첫 장면' },
]

describe('buildClassifyPrompt', () => {
  it('블록 id와 본문, 복사 금지 지시를 포함한다', () => {
    const p = buildClassifyPrompt(blocks)
    expect(p).toContain('[0]')
    expect(p).toContain('시안은 기사단장.')
    expect(p).toContain('상세 설명')
    expect(p).toMatch(/복사|재서술/)
  })
})

describe('parseClassification', () => {
  it('마크다운 펜스를 걷어내고 JSON을 파싱한다', () => {
    const raw = '```json\n{"title":"시안","tags":["기사"],"characters":[{"index":0,"name":"시안","gender":"남성"}],"blocks":[{"id":0,"owner":0,"field":"additionalInfo"}]}\n```'
    const c = parseClassification(raw)
    expect(c.characters[0].name).toBe('시안')
    expect(c.blocks[0].field).toBe('additionalInfo')
  })

  it('알 수 없는 field는 ignore로 정규화한다', () => {
    const raw = '{"title":"","tags":[],"characters":[{"index":0,"name":"x","gender":""}],"blocks":[{"id":0,"owner":0,"field":"weird"}]}'
    expect(parseClassification(raw).blocks[0].field).toBe('ignore')
  })

  it('characters가 비면 throw 한다', () => {
    const raw = '{"title":"","tags":[],"characters":[],"blocks":[]}'
    expect(() => parseClassification(raw)).toThrow()
  })

  it('JSON이 아니면 throw 한다', () => {
    expect(() => parseClassification('전혀 JSON 아님')).toThrow()
  })
})
