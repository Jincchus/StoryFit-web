import { describe, it, expect } from 'vitest'
import { parseLoveydoveyUrl, assembleLoveydovey } from './loveydovey'

describe('parseLoveydoveyUrl', () => {
  it('character id 추출', () => {
    expect(parseLoveydoveyUrl('https://www.loveydovey.ai/characters/xrw5CfC29kK2LEtpO0qU?lang=ko'))
      .toBe('xrw5CfC29kK2LEtpO0qU')
  })
  it('app 서브도메인도 추출', () => {
    expect(parseLoveydoveyUrl('https://app.loveydovey.ai/characters/abc123XYZ'))
      .toBe('abc123XYZ')
  })
  it('형식이 아니면 throw', () => {
    expect(() => parseLoveydoveyUrl('https://loveydovey.ai/')).toThrow()
  })
})

describe('assembleLoveydovey', () => {
  // Firestore REST 문서(fields) 형태
  const fields = {
    name: { stringValue: '梁程' },
    description: { stringValue: 'zh tagline' },
    primaryGenre: { stringValue: 'MODERN_ROMANCE' },
    ageRestriction: { stringValue: 'MINOR_ALLOWED' },
    chatbotImageUrl: { stringValue: 'https://img.rofan/x.jpg' },
    translatedInstructionInfos: {
      mapValue: {
        fields: {
          ko: {
            mapValue: {
              fields: {
                name: { stringValue: '량청' },
                description: { stringValue: '서른이면 남자도 늙는 법이라던데' },
                job: { stringValue: '대표이사 / 연상 약혼자' },
                age: { stringValue: '30' },
              },
            },
          },
        },
      },
    },
  }

  it('한국어 메타를 우선 사용한다', () => {
    const r = assembleLoveydovey(fields)
    const c = r.characters[0]
    expect(c.name).toBe('량청')
    expect(r.scenarioDescription).toContain('서른이면')
    expect(c.additionalInfo).toContain('직업: 대표이사')
    expect(c.additionalInfo).toContain('나이: 30')
    expect(c.additionalInfo).toContain('장르: 현대로맨스')
  })

  it('장르를 태그로, 도입부는 빈값', () => {
    const r = assembleLoveydovey(fields)
    expect(r.tags).toEqual(['현대로맨스'])
    expect(r.characters[0].openingMessage).toBe('')
    expect(r.characters[0].exampleDialogues).toBe('')
  })

  it('성인 등급은 relaxed', () => {
    const adult = { ...fields, ageRestriction: { stringValue: 'ADULT' } }
    expect(assembleLoveydovey(adult).safetyLevel).toBe('relaxed')
    expect(assembleLoveydovey(fields).safetyLevel).toBe('standard')
  })

  it('이름 없으면 throw', () => {
    expect(() => assembleLoveydovey({})).toThrow()
  })
})
