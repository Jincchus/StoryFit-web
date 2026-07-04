import { describe, it, expect } from 'vitest'
import { splitRofanSections, splitByRule } from './rofanSections'

describe('splitRofanSections', () => {
  it('임포터가 붙인 마커대로 캐릭터 소개/세계관/유저 역할/제작자 코멘트로 나눈다', () => {
    const info = ['페르소나 본문', '[세계관]\n세계 설정', '[유저 역할]\n유저는 신입', '[제작자 메모]\n추천 모델'].join('\n\n')
    const s = splitRofanSections(info)
    expect(s).toEqual([
      { title: '캐릭터 소개', body: '페르소나 본문' },
      { title: '세계관', body: '세계 설정' },
      { title: '유저 역할', body: '유저는 신입' },
      { title: '제작자 코멘트', body: '추천 모델' },
    ])
  })

  it('세계관만 있는 경우 캐릭터 소개 + 세계관 두 섹션', () => {
    const s = splitRofanSections('본문\n\n[세계관]\n세계')
    expect(s).toEqual([
      { title: '캐릭터 소개', body: '본문' },
      { title: '세계관', body: '세계' },
    ])
  })

  it('마커가 없으면 전체를 단일 섹션으로(제목은 introTitle)', () => {
    expect(splitRofanSections('그냥 설명 전부', '상세 설정')).toEqual([{ title: '상세 설정', body: '그냥 설명 전부' }])
  })

  it('빈 입력은 빈 배열', () => {
    expect(splitRofanSections('   ')).toEqual([])
  })

  it('마커가 본문 중간(줄 시작 아님)에 있으면 분리하지 않는다', () => {
    const s = splitRofanSections('설정에 [세계관] 언급이 있음')
    expect(s).toEqual([{ title: '캐릭터 소개', body: '설정에 [세계관] 언급이 있음' }])
  })

  it('캐릭터 소개(선행 본문)가 없고 세계관으로 시작해도 처리', () => {
    const s = splitRofanSections('[세계관]\n세계만')
    expect(s).toEqual([{ title: '세계관', body: '세계만' }])
  })

  it('마커 순서가 뒤바뀌어도 등장 순서대로 처리', () => {
    const s = splitRofanSections('본문\n\n[제작자 메모]\n메모\n\n[세계관]\n세계')
    expect(s).toEqual([
      { title: '캐릭터 소개', body: '본문' },
      { title: '제작자 코멘트', body: '메모' },
      { title: '세계관', body: '세계' },
    ])
  })
})

describe('splitByRule', () => {
  it('--- 구분선으로 조각을 나눈다', () => {
    const body = '태묵 설정\n\n---\n\n백운해 설정\n\n---\n\n{{user}} 설정'
    expect(splitByRule(body)).toEqual(['태묵 설정', '백운해 설정', '{{user}} 설정'])
  })
  it('구분선이 없으면 원문 하나만', () => {
    expect(splitByRule('그냥 설정')).toEqual(['그냥 설정'])
  })
  it('본문 중간의 하이픈(구분선 아님)은 나누지 않는다', () => {
    expect(splitByRule('앞 - 뒤 인라인')).toEqual(['앞 - 뒤 인라인'])
  })
  it('빈 입력은 빈 배열', () => {
    expect(splitByRule('   ')).toEqual([])
  })
  it('---- (4개 이상)도 구분선으로 인정', () => {
    expect(splitByRule('A\n----\nB')).toEqual(['A', 'B'])
  })
})
