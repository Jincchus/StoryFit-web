import { describe, it, expect } from 'vitest'
import { assemble, buildFallback } from './assemble'
import type { Block, Classification } from './types'

const blocks: Block[] = [
  { id: 0, text: '시안은 27세 기사단장이다. 냉정하지만 속은 따뜻하다.', tabHint: '상세 설명' },
  { id: 1, text: '"늦었군. 기다리고 있었다."', tabHint: '첫 장면' },
  { id: 2, text: '왕국은 오랜 전쟁의 끝자락에 있다.', tabHint: '상세 설명' },
]

describe('assemble — 단일 캐릭터', () => {
  it('필드별로 원본 텍스트를 그대로 결합한다', () => {
    const classification: Classification = {
      title: '시안과의 대화',
      tags: ['판타지', '기사'],
      characters: [{ index: 0, name: '시안', gender: '남성' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
        { id: 2, owner: null, field: 'scenario' },
      ],
    }
    const r = assemble(blocks, classification)
    expect(r.characters).toHaveLength(1)
    expect(r.characters[0].name).toBe('시안')
    expect(r.characters[0].additionalInfo).toBe('시안은 27세 기사단장이다. 냉정하지만 속은 따뜻하다.')
    expect(r.characters[0].openingMessage).toBe('"늦었군. 기다리고 있었다."')
    expect(r.scenarioDescription).toBe('왕국은 오랜 전쟁의 끝자락에 있다.')
    expect(r.tags).toEqual(['판타지', '기사'])
    expect(r.title).toBe('시안과의 대화')
  })

  it('조립된 모든 본문은 원본 블록의 부분문자열이다 (verbatim 보장)', () => {
    const classification: Classification = {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
      ],
    }
    const r = assemble(blocks, classification)
    const source = blocks.map(b => b.text).join('\n')
    for (const part of r.characters[0].additionalInfo.split('\n\n')) {
      expect(source).toContain(part)
    }
    expect(source).toContain(r.characters[0].openingMessage)
  })

  it('title이 비면 첫 캐릭터 이름을 쓴다', () => {
    const classification: Classification = {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [{ id: 0, owner: 0, field: 'additionalInfo' }],
    }
    expect(assemble(blocks, classification).title).toBe('시안')
  })
})

describe('assemble — 다중 캐릭터/백스톱/누락', () => {
  const multi: Block[] = [
    { id: 0, text: '아린은 마법사다. 호기심 많고 장난기가 넘친다 정말로요.', tabHint: '상세 설명' },
    { id: 1, text: '카이는 검사다. 과묵하고 충직한 성격을 지니고 있습니다.', tabHint: '상세 설명' },
    { id: 2, text: '두 사람은 같은 길드 소속으로 오래 함께해 왔습니다 그동안.', tabHint: '상세 설명' },
    { id: 3, text: '"준비됐어? 모험을 시작하자!" 아린이 외쳤다 신나게요.', tabHint: '첫 장면' },
  ]

  it('owner별로 각 캐릭터에 verbatim 분리한다 (다중 주인공)', () => {
    const r = assemble(multi, {
      title: '아린과 카이', tags: [],
      characters: [{ index: 0, name: '아린', gender: '여성' }, { index: 1, name: '카이', gender: '남성' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 1, field: 'additionalInfo' },
        { id: 2, owner: null, field: 'scenario' },
        { id: 3, owner: 0, field: 'openingMessage' },
      ],
    })
    expect(r.characters).toHaveLength(2)
    expect(r.characters[0].additionalInfo).toContain('아린은 마법사')
    expect(r.characters[1].additionalInfo).toContain('카이는 검사')
    expect(r.scenarioDescription).toContain('같은 길드')
  })

  it('라벨 안 된 블록은 탭 백스톱으로 흡수한다 (첫 장면→openingMessage, 상세 설명→additionalInfo)', () => {
    const r = assemble(multi, {
      title: '', tags: [],
      characters: [{ index: 0, name: '아린', gender: '' }],
      blocks: [{ id: 0, owner: 0, field: 'additionalInfo' }], // 1,2,3은 라벨 누락
    })
    // 3번(첫 장면)은 오프닝으로, 1·2번(상세 설명)은 0번 additionalInfo로
    expect(r.characters[0].openingMessage).toContain('모험을 시작하자')
    expect(r.characters[0].additionalInfo).toContain('카이는 검사')
    expect(r.characters[0].additionalInfo).toContain('같은 길드')
  })

  it('owner가 잘못된 index면 0번으로 떨어진다', () => {
    const r = assemble(multi, {
      title: '', tags: [],
      characters: [{ index: 0, name: '아린', gender: '' }],
      blocks: [{ id: 0, owner: 9, field: 'additionalInfo' }],
    })
    expect(r.characters[0].additionalInfo).toContain('아린은 마법사')
  })

  it('ignore 라벨 블록은 결과에 포함되지 않는다 (단, "첫 장면" 탭은 시작 메시지로 강제 배정)', () => {
    const r = assemble(multi, {
      title: '', tags: [],
      characters: [{ index: 0, name: '아린', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: null, field: 'ignore' },
        { id: 2, owner: null, field: 'ignore' },
        { id: 3, owner: null, field: 'ignore' },
      ],
    })
    expect(r.characters[0].additionalInfo).toBe('아린은 마법사다. 호기심 많고 장난기가 넘친다 정말로요.')
    expect(r.scenarioDescription).toBe('')
    expect(r.characters[0].openingMessage).toBe('"준비됐어? 모험을 시작하자!" 아린이 외쳤다 신나게요.')
  })
})

describe('assemble — "첫 장면" 탭 강제 배정 (멜팅 회귀 수정)', () => {
  const sceneBlocks: Block[] = [
    { id: 0, text: '리아는 21세 검술 수련생이다.', tabHint: '상세 설명' },
    { id: 1, text: '"드디어 왔구나. 기다리고 있었어." 리아가 웃으며 말했다.', tabHint: '첫 장면' },
  ]

  it('AI가 다른 필드로 분류해도 "첫 장면" 탭은 시작 메시지로 강제 배정된다', () => {
    const r = assemble(sceneBlocks, {
      title: '', tags: [],
      characters: [{ index: 0, name: '리아', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'additionalInfo' },
      ],
    })
    expect(r.characters[0].openingMessage).toBe('"드디어 왔구나. 기다리고 있었어." 리아가 웃으며 말했다.')
    expect(r.characters[0].additionalInfo).toBe('리아는 21세 검술 수련생이다.')
  })

  it('AI가 ignore로 분류해도 "첫 장면" 탭은 시작 메시지로 강제 배정된다', () => {
    const r = assemble(sceneBlocks, {
      title: '', tags: [],
      characters: [{ index: 0, name: '리아', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'ignore' },
      ],
    })
    expect(r.characters[0].openingMessage).toBe('"드디어 왔구나. 기다리고 있었어." 리아가 웃으며 말했다.')
  })
})

describe('assemble — 따옴표 대사 verbatim 추출 (캐릭터 말투 보강)', () => {
  it('AI가 예시 대화를 분류하지 못하면 본문 인용구를 그대로 추려 채운다', () => {
    const r = assemble(blocks, {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
      ],
    })
    expect(r.characters[0].exampleDialogues).toBe('"늦었군. 기다리고 있었다."')
  })

  it('AI가 예시 대화를 분류했으면 추출 보강을 하지 않는다 (AI 라벨 우선)', () => {
    const withExample: Block[] = [
      ...blocks,
      { id: 3, text: '"이게 진짜 예시 대화입니다." 라고 시안이 말했다.', tabHint: null },
    ]
    const r = assemble(withExample, {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
        { id: 3, owner: 0, field: 'exampleDialogues' },
      ],
    })
    expect(r.characters[0].exampleDialogues).toBe('"이게 진짜 예시 대화입니다." 라고 시안이 말했다.')
  })

  it('인용구가 없으면 빈 문자열로 둔다', () => {
    const noQuote: Block[] = [
      { id: 0, text: '설정 텍스트에는 인용구가 전혀 없습니다 그렇습니다.', tabHint: '상세 설명' },
    ]
    const r = assemble(noQuote, {
      title: '', tags: [],
      characters: [{ index: 0, name: '무명', gender: '' }],
      blocks: [{ id: 0, owner: 0, field: 'additionalInfo' }],
    })
    expect(r.characters[0].exampleDialogues).toBe('')
  })
})

describe('buildFallback', () => {
  const blocks: Block[] = [
    { id: 0, text: '레이는 길잡이 소년이다. 밝고 거침없는 성격이라고 합니다.', tabHint: '상세 설명' },
    { id: 1, text: '"어서 와! 여기가 우리 마을이야." 레이가 손을 흔들었다 활짝.', tabHint: '첫 장면' },
  ]

  it('첫 장면은 openingMessage로, 나머지는 additionalInfo로 무손실 보존한다', () => {
    const r = buildFallback(blocks, { name: '레이' })
    expect(r.characters).toHaveLength(1)
    expect(r.characters[0].name).toBe('레이')
    expect(r.characters[0].openingMessage).toContain('우리 마을이야')
    expect(r.characters[0].additionalInfo).toContain('길잡이 소년')
  })

  it('탭 힌트가 없으면 전부 additionalInfo로 들어간다 (누락 0)', () => {
    const plain: Block[] = [
      { id: 0, text: '설정 A 충분히 길게 작성된 텍스트 본문입니다 여기까지요.', tabHint: null },
      { id: 1, text: '설정 B 충분히 길게 작성된 텍스트 본문입니다 여기까지요.', tabHint: null },
    ]
    const r = buildFallback(plain, { name: '무명' })
    expect(r.characters[0].additionalInfo).toContain('설정 A')
    expect(r.characters[0].additionalInfo).toContain('설정 B')
    expect(r.characters[0].openingMessage).toBe('')
  })
})
