import { describe, it, expect } from 'vitest'
import { buildZetaCaptured, normalizeGuest, buildZetaPersonaPresets } from './zeta'

const PLOT = {
  id: '7672da02-d9df-42d1-ba70-894cd25f7369',
  name: '한윤재',
  imageUrl: 'https://image.zeta-ai.io/plot-cover.png',
  shortDescription: '학교의 카사노바가 내 남자친구다',
  longDescription: '윤재와 Guest은 오래전부터 함께였다',
  unlimitedAllowed: true,
  hashtags: ['대형견', '소꿉친구'],
  characters: [
    {
      id: 'e177e4e5-6648-4f7a-bea2-466cc1e03b7e',
      name: '한윤재',
      description: '192cm 남성. Guest을 진심으로 좋아한다.',
      imageUrl: 'https://image.zeta-ai.io/profile.png',
    },
  ],
  chatProfiles: [
    { id: 'cp1', name: '{{user}}', summary: '유저 공가능', description: '나이:22살', imageUrl: 'https://x/u.png' },
  ],
  intros: [
    {
      conversation: {
        messages: [
          { type: 'text', content: '*Guest의 원룸은 고요했다.*', senderType: 'BOT', senderId: '_NARRATOR_' },
          { type: 'text', content: '"야 나 잘건데 어깨 좀 빌려줘."', senderType: 'BOT', senderId: 'e177e4e5-6648-4f7a-bea2-466cc1e03b7e' },
        ],
        cyoaChoices: null,
      },
    },
  ],
}

describe('normalizeGuest', () => {
  it('Guest를 {{user}}로 치환한다', () => {
    expect(normalizeGuest('Guest의 방')).toBe('{{user}}의 방')
  })
  it('Guest가 없으면 그대로', () => {
    expect(normalizeGuest('윤재의 방')).toBe('윤재의 방')
  })
})

describe('buildZetaCaptured', () => {
  const cap = buildZetaCaptured(PLOT, 'https://zeta-ai.io/ko/plots/7672da02-d9df-42d1-ba70-894cd25f7369/profile')

  it('title은 빈 문자열(캐릭터명 덮어쓰기 방지)', () => {
    expect(cap.title).toBe('')
  })
  it('universeUrl은 canonical 플롯 URL', () => {
    expect(cap.universeUrl).toContain('zeta-ai.io')
    expect(cap.universeUrl).toContain('7672da02')
  })
  it('zetaMeta에 원본 plot 전체 보존', () => {
    expect(cap.zetaMeta).toBe(PLOT)
  })
  it('assembledResult.title은 plot.name', () => {
    expect(cap.assembledResult!.title).toBe('한윤재')
  })
  it('hashtags가 tags로 매핑', () => {
    expect(cap.assembledResult!.tags).toEqual(['대형견', '소꿉친구'])
  })
  it('unlimitedAllowed=true면 safetyLevel=relaxed', () => {
    expect(cap.assembledResult!.safetyLevel).toBe('relaxed')
  })
  it('캐릭터 description의 Guest가 치환됨', () => {
    expect(cap.assembledResult!.characters[0].additionalInfo).toContain('{{user}}')
    expect(cap.assembledResult!.characters[0].additionalInfo).not.toContain('Guest')
  })
  it('캐릭터 avatarUrl은 character.imageUrl', () => {
    expect(cap.assembledResult!.characters[0].avatarUrl).toBe('https://image.zeta-ai.io/profile.png')
  })
  it('인트로 메시지들이 openingMessage로 join되고 Guest 치환됨', () => {
    const op = cap.assembledResult!.characters[0].openingMessage
    expect(op).toContain('{{user}}의 원룸')
    expect(op).toContain('어깨 좀 빌려줘')
    expect(op).toContain('\n\n')
  })
})

describe('buildZetaCaptured (CYOA 선택지 있는 플롯)', () => {
  const PLOT_WITH_CYOA = {
    ...PLOT,
    intros: [
      {
        conversation: {
          messages: [
            { type: 'text', content: '*문이 열렸다.*', senderType: 'BOT', senderId: '_NARRATOR_' },
          ],
          cyoaChoices: {
            choices: [
              { text: 'Guest는 서윤을 선택한다', title: '' },
              { text: 'Guest는 태윤을 선택한다', title: '' },
            ],
          },
        },
      },
    ],
  }
  const cap = buildZetaCaptured(PLOT_WITH_CYOA, 'https://zeta-ai.io/ko/plots/x/profile')

  it('cyoaChoices가 도입부 뒤에 선택지 목록으로 붙고 Guest 치환됨', () => {
    const op = cap.assembledResult!.characters[0].openingMessage
    expect(op).toContain('*문이 열렸다.*')
    expect(op).toContain('[시작 선택지]')
    expect(op).toContain('1. {{user}}는 서윤을 선택한다')
    expect(op).toContain('2. {{user}}는 태윤을 선택한다')
  })

  it('cyoaChoices가 null이면 선택지 블록 없음(기존 동작 유지)', () => {
    const op = cap.assembledResult!.characters[0].openingMessage
    const capNoChoices = buildZetaCaptured(PLOT, 'https://zeta-ai.io/ko/plots/x/profile')
    expect(capNoChoices.assembledResult!.characters[0].openingMessage).not.toContain('[시작 선택지]')
    expect(op).not.toBe(capNoChoices.assembledResult!.characters[0].openingMessage)
  })
})

describe('buildZetaPersonaPresets (chatProfiles → 페르소나)', () => {
  it('summary를 이름으로, description을 본문으로(name "{{user}}"는 무시)', () => {
    const r = buildZetaPersonaPresets([
      { name: '{{user}}', summary: '거대한 땅에 떨어진 문명인 여자', description: '배를 탔다가 침몰하여 표류했다', imageUrl: 'https://img/p.png' },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('거대한 땅에 떨어진 문명인 여자')
    expect(r[0].additionalInfo).toBe('배를 탔다가 침몰하여 표류했다')
    expect(r[0].avatarUrl).toBe('https://img/p.png')
  })
  it('summary가 없으면 description 첫 줄을 이름으로', () => {
    const r = buildZetaPersonaPresets([{ description: '첫 줄 요약\n둘째 줄' }])
    expect(r[0].name).toBe('첫 줄 요약')
  })
  it('본문 없으면 제외, 배열 아니면 빈 배열', () => {
    expect(buildZetaPersonaPresets([{ summary: '이름만' }])).toEqual([])
    expect(buildZetaPersonaPresets(undefined)).toEqual([])
  })
})
