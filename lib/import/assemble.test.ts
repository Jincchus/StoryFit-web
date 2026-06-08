import { describe, it, expect } from 'vitest'
import { assemble } from './assemble'
import type { Block, Classification } from './types'

const blocks: Block[] = [
  { id: 0, text: '시안은 27세 기사단장이다. 냉정하지만 속은 따뜻하다.', tabHint: '상세 설명' },
  { id: 1, text: '"늦었군. 기다리고 있었다."', tabHint: '첫 장면' },
  { id: 2, text: '왕국은 오랜 전쟁의 끝자락에 있다.', tabHint: '상세 설명' },
]

describe('assemble — 단일 캐릭터', () => {
  it('필드별로 원본 텍스트를 그대로 결합한다', () => {
    const classification: Classification = {
      title: '시안과의 대화',
      tags: ['판타지', '기사'],
      characters: [{ index: 0, name: '시안', gender: '남성' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
        { id: 2, owner: null, field: 'scenario' },
      ],
    }
    const r = assemble(blocks, classification)
    expect(r.characters).toHaveLength(1)
    expect(r.characters[0].name).toBe('시안')
    expect(r.characters[0].additionalInfo).toBe('시안은 27세 기사단장이다. 냉정하지만 속은 따뜻하다.')
    expect(r.characters[0].openingMessage).toBe('"늦었군. 기다리고 있었다."')
    expect(r.scenarioDescription).toBe('왕국은 오랜 전쟁의 끝자락에 있다.')
    expect(r.tags).toEqual(['판타지', '기사'])
    expect(r.title).toBe('시안과의 대화')
  })

  it('조립된 모든 본문은 원본 블록의 부분문자열이다 (verbatim 보장)', () => {
    const classification: Classification = {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
      ],
    }
    const r = assemble(blocks, classification)
    const source = blocks.map(b => b.text).join('\n')
    for (const part of r.characters[0].additionalInfo.split('\n\n')) {
      expect(source).toContain(part)
    }
    expect(source).toContain(r.characters[0].openingMessage)
  })

  it('title이 비면 첫 캐릭터 이름을 쓴다', () => {
    const classification: Classification = {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [{ id: 0, owner: 0, field: 'additionalInfo' }],
    }
    expect(assemble(blocks, classification).title).toBe('시안')
  })
})
