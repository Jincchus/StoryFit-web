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

// Firestore Chatbots/{id} 문서(fields) 형태 — 원어는 베트남어, ko 번역 포함(실제 페이로드 모사).
const koMap = (obj: Record<string, any>) => ({
  mapValue: {
    fields: Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, Array.isArray(v)
        ? { arrayValue: { values: v.map((s: string) => ({ stringValue: s })) } }
        : { stringValue: String(v) }]),
    ),
  },
})

const fields = {
  name: { stringValue: 'Dạ Thời Lý' },
  gender: { stringValue: 'MALE' },
  description: { stringValue: 'vi tagline' },
  greetingMessage: { stringValue: 'vi greeting' },
  initSituation: { stringValue: 'vi init' },
  primaryGenre: { stringValue: 'MODERN_ROMANCE' },
  ageRestriction: { stringValue: 'MINOR_ALLOWED' },
  chatbotImageUrl: { stringValue: 'https://img.lovey/x.jpg' },
  characterSheet: { stringValue: '## Name\nDạ Thời Lý\n## Background Story\nvi background' },
  instructionInfos: {
    mapValue: {
      fields: {
        relationships: { mapValue: { fields: { 아내: { stringValue: '플레이어 본인' } } } },
        additionalInfos: { arrayValue: { values: [{ stringValue: '비밀: 사실 재벌가' }] } },
      },
    },
  },
  translatedInstructionInfos: {
    mapValue: {
      fields: {
        ko: koMap({
          name: '다 티 리',
          job: '마피아',
          age: '26',
          appearance: '검은 머리 거구',
          characteristic: '어리광쟁이에 울보',
          speechPattern: '항상 젖을 달라고 보챈다',
          backgroundStory: '당신의 남편이다',
          greetingMessage: '여보, 나 왔어',
          initSituation: '퇴근하자마자 달려와 어리광',
          description: '흐앙 여보',
          likes: '스킨십',
          dislikes: '무관심',
          hashtagNames: ['다정함', '#적극적', '소유욕_갑'],
        }),
      },
    },
  },
}

describe('assembleLoveydovey', () => {
  it('한국어 번역(translatedInstructionInfos.ko)을 1순위로 사용한다', () => {
    const r = assembleLoveydovey(fields)
    const c = r.characters[0]
    expect(c.name).toBe('다 티 리')
    expect(c.gender).toBe('남성')
    expect(c.openingMessage).toBe('여보, 나 왔어')
    expect(r.scenarioDescription).toBe('퇴근하자마자 달려와 어리광') // initSituation 우선
  })

  it('설정 본문에 구조화 필드(외형·성격·말투·배경·관계·추가)를 라벨 블록으로 합친다', () => {
    const c = assembleLoveydovey(fields).characters[0]
    expect(c.additionalInfo).toContain('직업: 마피아')
    expect(c.additionalInfo).toContain('나이: 26')
    expect(c.additionalInfo).toContain('■ 외형\n검은 머리 거구')
    expect(c.additionalInfo).toContain('■ 성격\n어리광쟁이에 울보')
    expect(c.additionalInfo).toContain('■ 말투\n항상 젖을 달라고 보챈다')
    expect(c.additionalInfo).toContain('■ 배경 이야기\n당신의 남편이다')
    expect(c.additionalInfo).toContain('아내: 플레이어 본인')      // relationships
    expect(c.additionalInfo).toContain('비밀: 사실 재벌가')        // additionalInfos
  })

  it('해시태그를 정리해 태그로 사용(# 제거·_ 공백)', () => {
    const r = assembleLoveydovey(fields)
    expect(r.tags).toEqual(['다정함', '적극적', '소유욕 갑'])
  })

  it('해시태그 없으면 장르를 태그로 폴백', () => {
    const noTags = JSON.parse(JSON.stringify(fields))
    delete noTags.translatedInstructionInfos.mapValue.fields.ko.mapValue.fields.hashtagNames
    expect(assembleLoveydovey(noTags).tags).toEqual(['현대로맨스'])
  })

  it('구조화 본문이 비면 characterSheet로 폴백', () => {
    const bare = {
      name: { stringValue: 'A' },
      characterSheet: { stringValue: '## Name\nA\n## Background\nfull sheet' },
    }
    expect(assembleLoveydovey(bare).characters[0].additionalInfo).toContain('full sheet')
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
