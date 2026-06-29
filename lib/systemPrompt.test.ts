import { describe, it, expect } from 'vitest'
import { replacePlaceholders, buildStorySystemPrompt, buildMultiStorySystemPrompt, matchLorebook } from './systemPrompt'
import type { Character, LorebookEntry } from '@/types'

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

describe('프롬프트 조립 순서 — 정적 프리픽스 유지 (implicit cache)', () => {
  const character: Character = {
    id: 'char-1', name: '철수', tags: [], additionalInfo: '',
    exampleDialogues: '철수 : "안녕"', safetyLevel: 'standard',
    temperature: 0.9, frequencyPenalty: 0.3, isPreset: false,
  }

  it('가변 블록(상태·스탯·인벤)은 캐릭터 설정·예시 대화보다 뒤에 온다', () => {
    const prompt = buildStorySystemPrompt({
      character,
      statusTimeline: '마왕성 탐험 중',
      statsConfig: [{ name: '호감도', value: 50, min: 0, max: 100 }],
      inventory: [{ name: '열쇠', qty: 1 }],
    })
    expect(prompt.indexOf('[예시 대화]')).toBeLessThan(prompt.indexOf('[현재 상태]'))
    expect(prompt.indexOf('[캐릭터 설정]')).toBeLessThan(prompt.indexOf('[현재 스탯]'))
    expect(prompt.indexOf('[현재 스탯]')).toBeLessThan(prompt.indexOf('[현재 인벤토리]'))
  })

  it('비밀설정(secretSettings)은 캐릭터 블록 안에 포함되고 플레이스홀더가 치환된다', () => {
    const prompt = buildStorySystemPrompt({
      character: { ...character, secretSettings: '[OOC] {{user}}의 정체는 첩자다.' },
      personaCharacter: { name: '민수' },
    })
    expect(prompt).toContain('[비밀설정]')
    expect(prompt).toContain('민수의 정체는 첩자다.')
    // 정적 캐릭터 블록 안(예시 대화 앞)에 위치
    expect(prompt.indexOf('[비밀설정]')).toBeLessThan(prompt.indexOf('[예시 대화]'))
  })

  it('secretSettings가 없으면 [비밀설정] 블록은 포함되지 않는다', () => {
    const prompt = buildStorySystemPrompt({ character })
    expect(prompt).not.toContain('[비밀설정]')
  })
})

describe('페르소나 치환 토글(flipPersonaPlaceholders)', () => {
  const persona = { name: '민수', additionalInfo: '{{char}}는 {{user}}를 짝사랑하는 소꿉친구다' }
  const character = { name: '지영', kind: 'custom', safetyLevel: 'standard', defaultAI: 'gemini' } as any

  it('flip ON(기본): {{char}}→페르소나, {{user}}→AI캐릭터', () => {
    const out = buildStorySystemPrompt({ character, personaCharacter: persona })
    expect(out).toContain('민수는 지영을 짝사랑하는 소꿉친구다')
  })

  it('flip OFF: {{char}}→AI캐릭터, {{user}}→페르소나', () => {
    const out = buildStorySystemPrompt({ character, personaCharacter: persona, flipPersonaPlaceholders: false })
    expect(out).toContain('지영은 민수를 짝사랑하는 소꿉친구다')
  })
})

describe('matchLorebook', () => {
  const entry = (keyword: string[], over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: 'lb-1',
    keyword, content: '내용', priority: 0, scanDepth: 5, isEnabled: true,
    ...over,
  })
  const msgs = (...contents: string[]) => contents.map(content => ({ content }))

  it('한글 키워드는 조사가 붙어도 매칭된다', () => {
    expect(matchLorebook([entry(['마왕성'])], msgs('마왕성은 어두웠다'))).toHaveLength(1)
    expect(matchLorebook([entry(['루나'])], msgs('루나가 웃었다'))).toHaveLength(1)
  })

  it('한글 키워드가 본문에 없으면 매칭되지 않는다', () => {
    expect(matchLorebook([entry(['마왕성'])], msgs('평화로운 마을이다'))).toHaveLength(0)
  })

  it('라틴 키워드는 단어 경계를 지킨다', () => {
    expect(matchLorebook([entry(['art'])], msgs('the start of it'))).toHaveLength(0)
    expect(matchLorebook([entry(['art'])], msgs('art is long'))).toHaveLength(1)
  })

  it('비활성 엔트리는 제외하고 scanDepth 밖의 메시지는 스캔하지 않는다', () => {
    expect(matchLorebook([entry(['마왕성'], { isEnabled: false })], msgs('마왕성은 어두웠다'))).toHaveLength(0)
    expect(matchLorebook([entry(['마왕성'], { scanDepth: 1 })], msgs('마왕성에 도착했다', '날씨가 좋다'))).toHaveLength(0)
  })
})

describe('빠른전개(fastPace)', () => {
  const character = { name: '지영', kind: 'custom', safetyLevel: 'standard', defaultAI: 'gemini' } as any
  it('fastPace=true면 빠른 전개 블록이 포함된다', () => {
    const out = buildStorySystemPrompt({ character, fastPace: true })
    expect(out).toContain('[전개 속도 — 다른 모든 속도 지시보다 우선]')
  })
  it('fastPace 미지정이면 빠른 전개 블록이 없다', () => {
    const out = buildStorySystemPrompt({ character })
    expect(out).not.toContain('[전개 속도 — 다른 모든 속도 지시보다 우선]')
  })
})

describe('응답 길이 min/max', () => {
  const character = { name: '지영', kind: 'custom', safetyLevel: 'standard', defaultAI: 'gemini' } as any
  it('min·max 모두 있으면 범위로 출력', () => {
    const out = buildStorySystemPrompt({ character, styleConfig: { length: { min: 300, max: 600 } } as any })
    expect(out).toContain('응답 길이: 300~600자')
  })
  it('레거시 문자열 length는 무시(출력 없음)', () => {
    const out = buildStorySystemPrompt({ character, styleConfig: { length: '짧게' } as any })
    expect(out).not.toContain('응답 길이')
  })
})

describe('합의 게이팅(adultGating)', () => {
  const character = { name: '지영', kind: 'custom', safetyLevel: 'standard', defaultAI: 'gemini' } as any
  it('adultGating 미지정(기본 true)이면 게이팅 블록 포함', () => {
    const out = buildStorySystemPrompt({ character })
    expect(out).toContain('[성애 진입 — 합의·맥락 전제]')
  })
  it('adultGating=false면 게이팅 블록 없음', () => {
    const out = buildStorySystemPrompt({ character, adultGating: false })
    expect(out).not.toContain('[성애 진입 — 합의·맥락 전제]')
  })
})

describe('멀티 base 선택지 허용', () => {
  const chars = [
    { name: 'A', kind: 'custom', safetyLevel: 'standard', defaultAI: 'gemini' },
    { name: 'B', kind: 'custom', safetyLevel: 'standard', defaultAI: 'gemini' },
  ] as any
  it('멀티 base에 선택지 금지 문구가 없다', () => {
    const out = buildMultiStorySystemPrompt({ characters: chars })
    expect(out).not.toContain('Do NOT offer choices')
  })
})
