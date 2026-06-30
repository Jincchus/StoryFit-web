import { describe, it, expect } from 'vitest'
import { stripChoiceArtifacts, applyLightFixes, parseStoryChoices } from './responseControl'

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
