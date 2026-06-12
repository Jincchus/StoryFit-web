import { describe, it, expect } from 'vitest'
import { needsResponseRevision, stripChoiceArtifacts, applyLightFixes, parseStoryChoices } from './responseControl'

describe('needsResponseRevision', () => {
  it('350자 미만이고 다른 위반이 없으면 재작성하지 않는다', () => {
    expect(needsResponseRevision('짧은 응답이지만 정상이다.', { allowChoices: false })).toBe(false)
  })

  it('allowChoices=false인데 선택지 패턴이 있어도 재작성하지 않는다 (light fix 대상)', () => {
    const text = '철수가 문을 열었다.\n\n어떻게 하시겠습니까?'
    expect(needsResponseRevision(text, { allowChoices: false })).toBe(false)
  })

  it('allowChoices=true인데 선택지 블록에 금지된 이름이 있으면 재작성한다', () => {
    const text = `철수가 문을 열었다.\n---\n1. 영수: 들어간다\n2. 그냥 돌아간다`
    expect(needsResponseRevision(text, { allowChoices: true, forbiddenChoiceNames: ['영수'] })).toBe(true)
  })

  it('allowChoices=true인데 본문에 필수 인물 대사가 없으면 재작성한다', () => {
    const text = `아무 일도 일어나지 않았다.\n---\n1. 행동 A\n2. 행동 B`
    expect(needsResponseRevision(text, { allowChoices: true, requiredBodyNames: ['영수'] })).toBe(true)
  })

  it('유저 페르소나의 행동을 임의로 서술하면 재작성한다', () => {
    const text = '당신은 깊은 한숨을 쉬며 고개를 떨궜다. 그리고 한참을 그렇게 서 있었다가 천천히 자리에서 일어났다.'
    expect(needsResponseRevision(text, { allowChoices: false })).toBe(true)
  })

  it('본문 중간의 마크다운 구분선 뒤에 필수 인물 대사가 있어도 본문으로 인식한다', () => {
    const text = `장면 묘사가 이어졌다.\n---\n철수 : "이제 시작이야"\n---\n1. 행동 A\n2. 행동 B`
    expect(needsResponseRevision(text, { allowChoices: true, requiredBodyNames: ['철수'] })).toBe(false)
  })
})

describe('parseStoryChoices', () => {
  it('번호 매김을 제거하고 선택지를 추출한다', () => {
    const { body, choices } = parseStoryChoices('철수가 문을 열었다.\n---\n1. 들어간다\n2) 돌아간다\n③ 기다린다')
    expect(body).toBe('철수가 문을 열었다.')
    expect(choices).toEqual(['들어간다', '돌아간다', '기다린다'])
  })

  it('들여쓰기된 구분선도 인식한다', () => {
    const { choices } = parseStoryChoices('본문이다.\n  ---  \n1. 행동 A\n2. 행동 B')
    expect(choices).toEqual(['행동 A', '행동 B'])
  })

  it('구분선 뒤가 선택지 형식이 아니면(본문 중간 가로줄) 선택지로 오인하지 않는다', () => {
    const text = '1부가 끝났다.\n---\n2부가 시작되며 이야기가 이어졌다.'
    const { body, choices } = parseStoryChoices(text)
    expect(choices).toEqual([])
    expect(body).toBe(text)
  })
})

describe('stripChoiceArtifacts', () => {
  it('구분선이 있으면 선택지 블록을 제거하고 본문만 남긴다', () => {
    const text = '철수가 문을 열었다.\n---\n1. 들어간다\n2. 돌아간다'
    expect(stripChoiceArtifacts(text)).toBe('철수가 문을 열었다.')
  })

  it('구분선이 없으면 끝의 선택지/질문 줄만 제거한다', () => {
    const text = '철수가 문을 열었다.\n\n어떻게 하시겠습니까?'
    expect(stripChoiceArtifacts(text)).toBe('철수가 문을 열었다.')
  })

  it('선택지 패턴이 없으면 그대로 둔다', () => {
    const text = '철수가 문을 열고 들어갔다.'
    expect(stripChoiceArtifacts(text)).toBe('철수가 문을 열고 들어갔다.')
  })

  it('본문 중간 가로줄만 있고 선택지가 없으면 본문을 자르지 않는다', () => {
    const text = '1부가 끝났다.\n---\n2부가 시작되며 이야기가 이어졌다.'
    expect(stripChoiceArtifacts(text)).toBe(text)
  })
})

describe('applyLightFixes', () => {
  it('allowChoices=false면 선택지 흔적을 제거한다', () => {
    const text = '철수가 문을 열었다.\n---\n1. 들어간다\n2. 돌아간다'
    expect(applyLightFixes(text, { allowChoices: false })).toBe('철수가 문을 열었다.')
  })

  it('allowChoices=true면 그대로 둔다', () => {
    const text = '철수가 문을 열었다.\n---\n1. 들어간다\n2. 돌아간다'
    expect(applyLightFixes(text, { allowChoices: true })).toBe(text)
  })
})
