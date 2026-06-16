import { describe, it, expect } from 'vitest'
import { chapterLabel, deriveChapterBoundaries, buildChapterMeta } from './chapters'

describe('chapterLabel', () => {
  const plot = { chapters: [{ index: 1, title: '운명의 만남' }, { index: 3, title: '배신' }] }
  it('plotOutline에 제목이 있으면 「제목」을 포함한다', () => {
    expect(chapterLabel(3, plot)).toBe('3화 「배신」')
  })
  it('제목이 없으면 N화만 반환한다', () => {
    expect(chapterLabel(2, plot)).toBe('2화')
  })
  it('plotOutline이 없으면 N화만 반환한다', () => {
    expect(chapterLabel(5, null)).toBe('5화')
  })
  it('제목이 공백뿐이면 N화만 반환한다', () => {
    expect(chapterLabel(1, { chapters: [{ index: 1, title: '   ' }] })).toBe('1화')
  })
})

describe('deriveChapterBoundaries', () => {
  it('챕터가 바뀌는 첫 메시지만 경계로 표시한다 (맨 첫 메시지는 제외)', () => {
    const msgs = [
      { id: 'a', chapter: 1 }, { id: 'b', chapter: 1 },
      { id: 'c', chapter: 2 }, { id: 'd', chapter: 3 },
    ]
    const b = deriveChapterBoundaries(msgs)
    expect(b.get('a')).toBeUndefined()
    expect(b.get('b')).toBeUndefined()
    expect(b.get('c')).toBe(2)
    expect(b.get('d')).toBe(3)
  })
  it('chapter 미지정은 1로 본다', () => {
    const b = deriveChapterBoundaries([{ id: 'a' }, { id: 'b', chapter: 2 }])
    expect(b.get('b')).toBe(2)
  })
})

describe('buildChapterMeta', () => {
  it('각 챕터의 첫 메시지 id를 챕터 오름차순으로 모은다', () => {
    const msgs = [
      { id: 'a', chapter: 1 }, { id: 'b', chapter: 1 },
      { id: 'c', chapter: 2 }, { id: 'd', chapter: 2 }, { id: 'e', chapter: 3 },
    ]
    expect(buildChapterMeta(msgs)).toEqual([
      { chapter: 1, firstMessageId: 'a' },
      { chapter: 2, firstMessageId: 'c' },
      { chapter: 3, firstMessageId: 'e' },
    ])
  })
})
