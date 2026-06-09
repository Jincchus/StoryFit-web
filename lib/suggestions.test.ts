import { describe, it, expect } from 'vitest'
import { buildSuggestionPrompt, parseSuggestions } from './suggestions'

describe('parseSuggestions', () => {
  it('정상 JSON에서 최대 3개 추출', () => {
    const raw = '```json\n{"suggestions":["*고개를 끄덕인다*","\\"그래서요?\\"","아무 말도 하지 않는다"]}\n```'
    expect(parseSuggestions(raw)).toEqual(['*고개를 끄덕인다*', '"그래서요?"', '아무 말도 하지 않는다'])
  })
  it('3개 초과면 3개로 절단', () => {
    const raw = '{"suggestions":["a","b","c","d","e"]}'
    expect(parseSuggestions(raw)).toEqual(['a', 'b', 'c'])
  })
  it('빈 문자열·공백 항목 제거', () => {
    const raw = '{"suggestions":["a","","  ","b"]}'
    expect(parseSuggestions(raw)).toEqual(['a', 'b'])
  })
  it('JSON 파싱 실패 시 빈 배열', () => {
    expect(parseSuggestions('완전 깨진 응답')).toEqual([])
  })
  it('suggestions 키 없으면 빈 배열', () => {
    expect(parseSuggestions('{"foo":1}')).toEqual([])
  })
})

describe('buildSuggestionPrompt', () => {
  const history = [
    { role: 'user', content: '안녕' },
    { role: 'assistant', content: '*그가 돌아본다* "왔어?"' },
  ]
  const { systemPrompt, userPrompt } = buildSuggestionPrompt(history, '지민')

  it('systemPrompt는 JSON 반환 지시 포함', () => {
    expect(systemPrompt).toContain('JSON')
  })
  it('userPrompt에 페르소나 이름 포함', () => {
    expect(userPrompt).toContain('지민')
  })
  it('userPrompt에 최근 대사 포함', () => {
    expect(userPrompt).toContain('왔어?')
  })
  it('userPrompt에 suggestions 형식 명시', () => {
    expect(userPrompt).toContain('suggestions')
  })
})
