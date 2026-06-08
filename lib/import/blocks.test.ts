import { describe, it, expect } from 'vitest'
import { splitIntoBlocks } from './blocks'

describe('splitIntoBlocks', () => {
  it('빈 줄 기준으로 문단을 나누고 전역 id를 매긴다', () => {
    const blocks = splitIntoBlocks([
      { tab: '상세 설명', text: '첫 번째 문단입니다. 충분히 긴 설명 텍스트가 들어 있어요.\n\n두 번째 문단도 충분히 길게 작성된 설명 텍스트입니다.' },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ id: 0, text: '첫 번째 문단입니다. 충분히 긴 설명 텍스트가 들어 있어요.', tabHint: '상세 설명' })
    expect(blocks[1].id).toBe(1)
    expect(blocks[1].tabHint).toBe('상세 설명')
  })

  it('40자 미만 짧은 조각은 같은 섹션 직전 블록에 병합한다', () => {
    const blocks = splitIntoBlocks([
      { tab: null, text: '이 문단은 충분히 길어서 독립 블록이 되기에 모자람이 없는 설명입니다.\n\n짧은 꼬리.' },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('이 문단은 충분히 길어서 독립 블록이 되기에 모자람이 없는 설명입니다.\n\n짧은 꼬리.')
  })

  it('섹션이 다르면 id는 이어지고 tabHint는 각자 유지된다', () => {
    const blocks = splitIntoBlocks([
      { tab: '상세 설명', text: '상세 설명 섹션의 충분히 긴 본문 문단 텍스트입니다 여기.' },
      { tab: '첫 장면', text: '첫 장면 섹션의 충분히 긴 본문 문단 텍스트입니다 여기에.' },
    ])
    expect(blocks.map(b => b.id)).toEqual([0, 1])
    expect(blocks[0].tabHint).toBe('상세 설명')
    expect(blocks[1].tabHint).toBe('첫 장면')
  })

  it('빈 텍스트 섹션은 블록을 만들지 않는다', () => {
    const blocks = splitIntoBlocks([{ tab: null, text: '   \n\n   ' }])
    expect(blocks).toHaveLength(0)
  })
})
