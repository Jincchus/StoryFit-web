import { describe, it, expect } from 'vitest'
import { mapTingleWorldBooks, assembleTingleCharacter, assembleTingleUniverse, assembleTingleScene } from './tingle'

describe('mapTingleWorldBooks', () => {
  it('공개(isHideContent 없음) 항목을 title을 keyword로 매핑한다', () => {
    const data = { worldBooks: [{ id: '1', title: '피의 맹세', publicContent: '가문의 인장이자 마력의 증표.', priority: 5 }] }
    expect(mapTingleWorldBooks(data)).toEqual([{ keyword: ['피의 맹세'], content: '가문의 인장이자 마력의 증표.', priority: 5 }])
  })

  it('isHideContent:true인 항목은 제외한다 (실측: 서버가 publicContent도 빈 문자열로 내려줌)', () => {
    const data = {
      worldBooks: [
        { id: '27325', title: '13살의 너에게 그리고 26살의...', type: 'text', publicContent: '', isHideContent: true },
      ],
    }
    expect(mapTingleWorldBooks(data)).toEqual([])
  })

  it('content나 title이 없으면 제외한다', () => {
    expect(mapTingleWorldBooks({ worldBooks: [{ title: '', publicContent: '내용' }] })).toEqual([])
    expect(mapTingleWorldBooks({ worldBooks: [{ title: '제목', publicContent: '' }] })).toEqual([])
  })

  it('worldBooks가 배열이 아니면 빈 배열', () => {
    expect(mapTingleWorldBooks({})).toEqual([])
    expect(mapTingleWorldBooks(undefined)).toEqual([])
  })
})

describe('assembleTingleCharacter', () => {
  // composite 스키마 실측 예시(job/personality/speakingStyle/favorites 구조화, "장도현" 유사)
  const composite = {
    name: '장도현',
    gender: '남성',
    age: 33,
    introduction: '나를 위해 별도 따다 주겠다는 마피아 보스.',
    job: '국제 조직 한국 지부 대표',
    personality: '냉정,무자비,카리스마',
    speakingStyle: '"보고는 간단하게."',
    favorites: '야간 드라이브,재즈 라운지',
    characterDetails: '',
    backgroundDetails: '',
    otherDetails: '',
    creatorComment: '',
    openings: [
      { id: '1', title: '도입부', content: '어두운 창고 안...', displayOrder: 0 },
    ],
  }

  const baseExtra = {
    coverImageUrl: 'https://asset.tingle.chat/cover.webp',
    tags: ['로맨스', '마피아'],
    safetyLevel: 'standard' as const,
    lorebooks: [],
    linkedRelations: '',
    sceneInfo: '',
    relatedImages: [],
  }

  it('composite 구조화 필드(직업/성격/말투/좋아하는 것)를 라벨 블록으로 조립한다', () => {
    const r = assembleTingleCharacter(composite, baseExtra)
    const c = r.assembledResult!.characters[0]
    expect(c.name).toBe('장도현')
    expect(c.additionalInfo).toContain('직업: 국제 조직 한국 지부 대표')
    expect(c.additionalInfo).toContain('■ 성격\n냉정,무자비,카리스마')
    expect(c.additionalInfo).toContain('■ 말투\n"보고는 간단하게."')
    expect(c.additionalInfo).toContain('■ 좋아하는 것\n야간 드라이브,재즈 라운지')
  })

  it('unified 스키마(job/personality 없이 otherDetails만)도 그대로 담는다', () => {
    // "Z-07 육아대작전"류 실측: 구조화 필드 없이 otherDetails 하나에 4인 그룹 상세가 다 들어있음
    const unified = {
      name: 'Z-07 육아대작전',
      gender: '기타',
      age: 20,
      introduction: '문제아 부대의 시끌벅적 육아일기',
      job: '', personality: '', speakingStyle: '', favorites: '',
      characterDetails: '', backgroundDetails: '',
      otherDetails: '⚠︎ 사카린 (Saccharin) | 남성\n189cm...\n\n🐥 꼬마 | 여성 | 만 5세 추정\n키는 100cm...',
      creatorComment: '',
      openings: [{ id: '1', title: '이걸 우리더러 어쩌라고요.', content: 'ROOM 0의 명령서가...', displayOrder: 0 }],
    }
    const c = assembleTingleCharacter(unified, baseExtra).assembledResult!.characters[0]
    expect(c.additionalInfo).toContain('사카린 (Saccharin)')
    expect(c.additionalInfo).toContain('꼬마 | 여성')
  })

  it('다중 도입부는 openingMessages로, 단일이면 openingMessage만', () => {
    const multi = { ...composite, openings: [
      { id: '1', title: 'A', content: '첫번째', displayOrder: 0 },
      { id: '2', title: 'B', content: '두번째', displayOrder: 1 },
    ] }
    const c = assembleTingleCharacter(multi, baseExtra).assembledResult!.characters[0]
    expect(c.openingMessages).toHaveLength(2)
    expect(c.openingMessage).toBe('첫번째')

    const single = assembleTingleCharacter(composite, baseExtra).assembledResult!.characters[0]
    expect(single.openingMessages).toBeUndefined()
    expect(single.openingMessage).toContain('어두운 창고')
  })

  it('연결된 서사(linkedRelations)를 exampleDialogues로, 연결된 테마(sceneInfo)를 [세계관] 블록으로 반영', () => {
    const extra = { ...baseExtra, linkedRelations: '아내: 플레이어 본인', sceneInfo: '2026년, 서울' }
    const r = assembleTingleCharacter(composite, extra)
    expect(r.assembledResult!.characters[0].exampleDialogues).toBe('아내: 플레이어 본인')
    expect(r.assembledResult!.characters[0].additionalInfo).toContain('[세계관]\n2026년, 서울')
  })

  it('로어북이 있으면 result.lorebooks에, 없으면 undefined', () => {
    const withLore = assembleTingleCharacter(composite, { ...baseExtra, lorebooks: [{ keyword: ['키워드'], content: '내용' }] })
    expect(withLore.lorebooks).toEqual([{ keyword: ['키워드'], content: '내용' }])
    expect(assembleTingleCharacter(composite, baseExtra).lorebooks).toBeUndefined()
  })

  it('공개 트리거 이미지가 있으면 relatedImages로 반영', () => {
    const r = assembleTingleCharacter(composite, { ...baseExtra, relatedImages: ['https://asset.tingle.chat/a.webp'] })
    expect(r.assembledResult!.characters[0].relatedImages).toEqual(['https://asset.tingle.chat/a.webp'])
  })
})

describe('assembleTingleUniverse', () => {
  const extra = { coverImageUrl: 'https://asset.tingle.chat/u.webp', tags: ['SF'], safetyLevel: 'standard' as const }

  it('introduction을 본문/시나리오설명으로, relationships+privateRelationships를 exampleDialogues로 합친다', () => {
    const data = {
      name: 'Z-07 미처분분견',
      introduction: '본 문서는 존재하지 아니한다.',
      relationships: ['⚠︎ 극비 문서'],
      privateRelationships: ['비공개 관계 설정'],
    }
    const r = assembleTingleUniverse(data, extra)
    const c = r.assembledResult!.characters[0]
    expect(c.name).toBe('Z-07 미처분분견')
    expect(c.additionalInfo).toBe('본 문서는 존재하지 아니한다.')
    expect(c.exampleDialogues).toBe('⚠︎ 극비 문서\n비공개 관계 설정')
    expect(r.assembledResult!.scenarioDescription).toBe('본 문서는 존재하지 아니한다.')
  })

  it('worldBook이 있으면 lorebooks로 반영', () => {
    const data = { name: '서사', introduction: '', worldBooks: [{ title: '로어', publicContent: '내용' }] }
    expect(assembleTingleUniverse(data, extra).lorebooks).toEqual([{ keyword: ['로어'], content: '내용', priority: 0 }])
  })
})

describe('assembleTingleScene', () => {
  const extra = { coverImageUrl: 'https://asset.tingle.chat/s.webp', tags: ['현대'], safetyLevel: 'standard' as const }

  it('introduction/timeFrame/otherDetails를 합쳐 시나리오 설명을 구성한다', () => {
    const data = { name: '[FILE: UNREGISTERED]', introduction: 'ORD-0은 비인가 조직이다.', timeFrame: '현대', otherDetails: '문서 등급: 극비' }
    const r = assembleTingleScene(data, extra)
    const c = r.assembledResult!.characters[0]
    expect(c.additionalInfo).toContain('ORD-0은 비인가 조직이다.')
    expect(c.additionalInfo).toContain('[시간대] 현대')
    expect(c.additionalInfo).toContain('문서 등급: 극비')
  })
})
