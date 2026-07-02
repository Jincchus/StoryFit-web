import type { Captured, AssembledCharacter, PersonaPreset } from './types'

export function normalizeGuest(text: string): string {
  return text.split('Guest').join('{{user}}')
}

// 구두점/특수문자 한 글자이거나, 거의 모든 문장에 등장하는 대명사/조사/일반 동사 위주의
// 키워드를 가진 항목은 "공통 작성 규칙"형 로어북일 가능성이 높다. 정보를 버리지 않고
// 등록은 하되, 토큰 캡(1,000자) 경쟁에서 캐릭터 고유 World Info에 밀리도록 우선순위만 낮춘다.
const PUNCTUATION_ONLY_KEYWORD = /^[.?!*"'~,]$/

const GENERIC_KEYWORDS = new Set([
  '나', '너', '그', '이', '저', '우리', '내', '제',
  '한다', '했다', '그랬다', '있다', '없다',
  '말', '생각', '보다', '듣다', '알다',
  '행동', '대사', '서술', '감정', '성격', '묘사',
  '세계관', '충돌', '금지', '환경', '유지', '반복', '간결', '답변',
  '결국', '이제', '앞으로', '서로', '끝', '원래', '본인',
  '손', '몸', '얼굴', '숨',
])

const HIGH_PRIORITY = 10
const LOW_PRIORITY = -10

function isGenericKeyword(keyword: string): boolean {
  return PUNCTUATION_ONLY_KEYWORD.test(keyword) || GENERIC_KEYWORDS.has(keyword)
}

export function extractZetaLorebookEntries(plot: any): { keyword: string[]; content: string; priority?: number }[] {
  const lorebooks = Array.isArray(plot?.lorebooks) ? plot.lorebooks : []
  const entries: { keyword: string[]; content: string; priority?: number }[] = []
  for (const lorebook of lorebooks) {
    const items = Array.isArray(lorebook?.items) ? lorebook.items : []
    for (const item of items) {
      const keywords: string[] = Array.isArray(item?.keywords) ? item.keywords.filter(Boolean) : []
      if (keywords.length === 0) continue
      if (!item.content) continue
      const genericRatio = keywords.filter(isGenericKeyword).length / keywords.length
      entries.push({
        keyword: keywords.map((k: string) => normalizeGuest(k)),
        content: normalizeGuest(String(item.content)),
        priority: genericRatio >= 0.5 ? LOW_PRIORITY : HIGH_PRIORITY,
      })
    }
  }
  return entries
}

// 일부 플롯은 도입부에 CYOA 선택지(cyoaChoices.choices[])가 있다 —
// 플레이어가 어떤 인물/입장으로 시작할지 고르는 첫 유저 대사 후보들.
// 별도 선택 UI 없이, 도입부 본문 뒤에 후보 목록으로 붙여 정보 손실만 막는다.
function buildZetaChoicesBlock(choices: any): string {
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const lines = choices
    .map((c: any) => String(c?.text ?? '').trim())
    .filter(Boolean)
    .map((text: string, i: number) => `${i + 1}. ${text}`)
  return lines.length ? `[시작 선택지]\n${lines.join('\n')}` : ''
}

function buildZetaOpenings(intros: any): { id: string; title: string; content: string }[] {
  if (!Array.isArray(intros)) return []
  return intros
    .map((intro, idx) => {
      const messages = intro?.conversation?.messages ?? []
      const parts = (Array.isArray(messages) ? messages : [])
        .map((m: any) => String(m?.content ?? ''))
        .filter(Boolean)
      const choicesBlock = buildZetaChoicesBlock(intro?.conversation?.cyoaChoices?.choices)
      if (choicesBlock) parts.push(choicesBlock)
      return {
        id: `intro_${idx}`,
        title: idx === 0 ? '기본 도입부' : `도입부 ${idx + 1}`,
        content: normalizeGuest(parts.join('\n\n')),
      }
    })
    .filter(o => o.content.trim().length > 0)
}

// plot.chatProfiles → 제작자 페르소나 프리셋. name은 "{{user}}"/뷰어 닉네임이라 신뢰 불가 →
// summary(한 줄 요약)를 페르소나 이름으로, description을 본문으로 쓴다.
export function buildZetaPersonaPresets(chatProfiles: any): PersonaPreset[] {
  if (!Array.isArray(chatProfiles)) return []
  const out: PersonaPreset[] = []
  for (const p of chatProfiles) {
    const summary = String(p?.summary ?? '').trim()
    const description = normalizeGuest(String(p?.description ?? '').trim())
    const name = (summary || description.split('\n')[0]).slice(0, 60).trim()
    if (!name || !description) continue
    out.push({ name, additionalInfo: description, avatarUrl: String(p?.imageUrl ?? '') || undefined })
  }
  return out
}

export function buildZetaCaptured(plot: any, canonicalUrl: string): Captured {
  const rawChars = Array.isArray(plot.characters) ? plot.characters : []
  const hashtags = Array.isArray(plot.hashtags) ? plot.hashtags : []
  const openings = buildZetaOpenings(plot.intros)
  const safetyLevel = plot.unlimitedAllowed ? 'relaxed' : 'standard'

  // longDescription/characters[].description가 비어있는 플롯은 about에 본문이 들어있음
  const aboutChars = Array.isArray(plot.about?.characters) ? plot.about.characters : []
  const aboutScenario = Array.isArray(plot.about?.contents)
    ? plot.about.contents.map((c: any) => c?.content).filter(Boolean).join('\n\n')
    : ''

  const characters: AssembledCharacter[] = rawChars.map((c: any, i: number) => {
    const aboutChar = aboutChars.find((ac: any) => ac.characterId === c.id || ac.id === c.id) ?? aboutChars[i]
    return {
      name: c.name || plot.name || '캐릭터',
      gender: '',
      tags: hashtags,
      additionalInfo: normalizeGuest(String(c.description || aboutChar?.description || '')),
      openingMessage: i === 0 ? (openings[0]?.content ?? '') : '',
      openingMessages: i === 0 && openings.length > 1 ? openings : undefined,
      exampleDialogues: '',
      avatarUrl: c.imageUrl || '',
    }
  })

  if (characters.length === 0) {
    characters.push({
      name: plot.name || '캐릭터',
      gender: '',
      tags: hashtags,
      additionalInfo: normalizeGuest(String(plot.longDescription || aboutScenario || '')),
      openingMessage: openings[0]?.content ?? '',
      openingMessages: openings.length > 1 ? openings : undefined,
      exampleDialogues: '',
      avatarUrl: plot.imageUrl || '',
    })
  }

  return {
    sections: [],
    title: '',
    imageUrl: plot.imageUrl || rawChars[0]?.imageUrl || '',
    universeUrl: canonicalUrl,
    assembledResult: {
      characters,
      scenarioDescription: normalizeGuest(String(plot.longDescription || aboutScenario || '')),
      tags: hashtags,
      title: plot.name || '캐릭터',
      safetyLevel,
      coverImageUrl: plot.imageUrl || '',
    },
    ...(buildZetaPersonaPresets(plot.chatProfiles).length ? { personaPresets: buildZetaPersonaPresets(plot.chatProfiles) } : {}),
    zetaMeta: plot,
  }
}
