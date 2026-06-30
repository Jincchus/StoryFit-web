import { describe, it, expect } from 'vitest'
import { parseBabechatUrl, assembleBabechat } from './babechat'

describe('parseBabechatUrl', () => {
  it('character uuid 추출', () => {
    expect(parseBabechatUrl('https://babechat.ai/characters/27a400a6-c60b-48db-88b9-47fcf3547ce2'))
      .toBe('27a400a6-c60b-48db-88b9-47fcf3547ce2')
  })
  it('형식이 아니면 throw', () => {
    expect(() => parseBabechatUrl('https://babechat.ai/dashboard')).toThrow()
  })
})

describe('assembleBabechat', () => {
  const data = {
    name: '한서윤',
    description: '축제 마지막 날 여자친구를 빼앗겼다',
    targetGender: 'all',
    isAdult: false,
    tags: ['바람', '배신', '피폐'],
    profileImage: 'https://img/p.webp',
    mainImage: 'https://img/m.webp',
    characterDetails: {
      details: '18세. 긴 흑발에 회보라색 눈동자.',
      jobs: ['학생'],
      height: '170cm',
      interests: ['독서'],
      likes: [], dislikes: [], location: '', weight: '',
    },
    startingScenarios: [
      { id: 'a', initialTitle: '오빠 너무 좋아', initialAction: '작은아버지 부부가 출장을 떠나며...', initialMessage: '안녕 오빠', replySuggestions: [], order: 0 },
      { id: 'b', initialTitle: '두번째', initialAction: '다른 상황', initialMessage: '두번째 메시지', order: 1 },
    ],
  }

  it('기본 필드를 매핑한다', () => {
    const r = assembleBabechat(data)
    const c = r.characters[0]
    expect(c.name).toBe('한서윤')
    expect(c.gender).toBe('') // all → ''
    expect(c.tags).toEqual(['바람', '배신', '피폐'])
    expect(r.scenarioDescription).toContain('축제')
  })

  it('characterDetails를 additionalInfo로 합친다', () => {
    const c = assembleBabechat(data).characters[0]
    expect(c.additionalInfo).toContain('18세')
    expect(c.additionalInfo).toContain('직업: 학생')
    expect(c.additionalInfo).toContain('키: 170cm')
    expect(c.additionalInfo).toContain('관심사: 독서')
  })

  it('startingScenarios를 도입부(상황+메시지)로 변환한다', () => {
    const c = assembleBabechat(data).characters[0]
    expect(c.openingMessages).toHaveLength(2)
    expect(c.openingMessages![0].title).toBe('오빠 너무 좋아')
    expect(c.openingMessages![0].content).toContain('작은아버지')
    expect(c.openingMessages![0].content).toContain('안녕 오빠')
    expect(c.openingMessage).toContain('작은아버지')
  })

  it('female/male 성별 매핑, 성인 등급', () => {
    expect(assembleBabechat({ ...data, targetGender: 'female' }).characters[0].gender).toBe('여성')
    expect(assembleBabechat({ ...data, targetGender: 'male' }).characters[0].gender).toBe('남성')
    expect(assembleBabechat({ ...data, isAdult: true }).safetyLevel).toBe('relaxed')
    expect(assembleBabechat(data).safetyLevel).toBe('standard')
  })

  it('startingScenarios 없으면 top-level initial* 사용', () => {
    const noScenarios = { ...data, startingScenarios: [], initialAction: '상황', initialMessage: '메시지' }
    const c = assembleBabechat(noScenarios).characters[0]
    expect(c.openingMessage).toContain('상황')
    expect(c.openingMessage).toContain('메시지')
  })

  it('도입부의 인라인 img:[코드] 토큰을 제거한다', () => {
    const withImg = {
      ...data,
      startingScenarios: [],
      initialTitle: '기본',
      initialAction: 'img:[2raut]\n트럭에 치였다\n\nimg:[2q1fa]\n여신이 나타난다',
      initialMessage: 'img:[dm3k0]\n\n"안녕"',
    }
    const c = assembleBabechat(withImg).characters[0]
    expect(c.openingMessage).not.toContain('img:[')
    expect(c.openingMessage).toContain('트럭에 치였다')
    expect(c.openingMessage).toContain('여신이 나타난다')
    expect(c.openingMessage).toContain('"안녕"')
    expect(c.openingMessage).not.toMatch(/\n{3,}/) // 토큰 자리에 빈 줄만 남지 않음
  })

  it('profileImages 갤러리를 relatedImages로(order 정렬·hidden 제외)', () => {
    const withGallery = {
      ...data,
      profileImages: {
        여신: { url: 'https://img/g2.webp', order: 2, hidden: false },
        트럭: { url: 'https://img/g1.webp', order: 1, hidden: false },
        비밀: { url: 'https://img/hidden.webp', order: 3, hidden: true },
      },
    }
    const c = assembleBabechat(withGallery).characters[0]
    expect(c.relatedImages).toEqual(['https://img/g1.webp', 'https://img/g2.webp'])
  })

  it('profileImages 없으면 emotionImages로 폴백', () => {
    const c = assembleBabechat({ ...data, emotionImages: { 기쁨: 'https://img/e1.webp' } }).characters[0]
    expect(c.relatedImages).toEqual(['https://img/e1.webp'])
  })

  it('갤러리 없으면 relatedImages 미설정', () => {
    expect(assembleBabechat(data).characters[0].relatedImages).toBeUndefined()
  })

  it('이름 없으면 throw', () => {
    expect(() => assembleBabechat({})).toThrow()
  })
})
