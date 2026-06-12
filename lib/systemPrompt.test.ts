import { describe, it, expect } from 'vitest'
import { replacePlaceholders, buildStorySystemPrompt } from './systemPrompt'
import type { Character } from '@/types'

describe('replacePlaceholders', () => {
  it('치환 후 잘못된 조사를 교정한다', () => {
    expect(replacePlaceholders('{{user}}는 {{char}}이 좋다고 말했다', '민준', '철수')).toBe('민준은 철수가 좋다고 말했다')
  })

  it('기존 치환 패턴(guest, persona 등)도 그대로 동작하며 멱등이다', () => {
    expect(replacePlaceholders('guest는 persona를 만났다', '영수')).toBe('영수는 영수를 만났다')
  })
})

describe('buildOpeningSceneSection (buildStorySystemPrompt 경유)', () => {
  const baseCharacter: Character = {
    id: 'char-1',
    name: '철수',
    tags: [],
    additionalInfo: '',
    exampleDialogues: '',
    safetyLevel: 'standard',
    temperature: 0.9,
    frequencyPenalty: 0.3,
    isPreset: false,
  }

  it('openingScene이 있으면 연속성 지시문과 함께 [오프닝 장면] 섹션을 포함한다', () => {
    const prompt = buildStorySystemPrompt({
      character: baseCharacter,
      openingScene: '철수와 영수가 말다툼을 벌이고 있다.',
    })

    expect(prompt).toContain('[오프닝 장면 — 대화의 시작]')
    expect(prompt).toContain('철수와 영수가 말다툼을 벌이고 있다.')
    expect(prompt).toContain('현재 진행 중인 상황')
    expect(prompt).toContain('이어받아')
  })

  it('openingScene이 없으면 [오프닝 장면] 섹션이 포함되지 않는다', () => {
    const prompt = buildStorySystemPrompt({ character: baseCharacter })

    expect(prompt).not.toContain('[오프닝 장면 — 대화의 시작]')
  })
})
