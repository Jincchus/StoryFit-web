// Chub.ai(=CharacterHub) 외국 센터 가져오기.
// chara_card_v2 카드를 받아 매핑표대로 조립 → AI 번역 → Captured 반환.
// 국내 센터처럼 assembledResult를 직접 채워 classify 단계를 건너뛴다(필드가 이미 구조화됨).
import { parsePngTavernCard, type TavernCard } from '@/lib/tavernCard'
import type { Captured, AssembledCharacter } from './types'
import { translateCard } from './translate'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// URL에서 {author}/{slug} 추출. 지원: chub.ai/characters/{a}/{s}, characterhub.org/...
export function parseChubUrl(url: string): { author: string; slug: string } {
  const m = url.match(/\/characters\/([^/]+)\/([^/?#]+)/i)
  if (!m) throw new Error('Chub 캐릭터 URL이 아닙니다 (/characters/{author}/{slug} 형식 필요)')
  return { author: decodeURIComponent(m[1]), slug: decodeURIComponent(m[2]) }
}

// Chub 노드 메타(태그·아바타)를 GET으로 조회. 실패해도 치명적이지 않다.
async function fetchChubNode(author: string, slug: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.chub.ai/api/characters/${author}/${slug}?full=true`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json?.node ?? json ?? null
  } catch {
    return null
  }
}

// 카드 본문 확보: 공식 download(tavern PNG)로 chara_card_v2를 결정적으로 받는다.
// 실패 시 node.definition에서 추출 폴백.
async function fetchChubCard(author: string, slug: string, node: any | null): Promise<TavernCard> {
  const fullPath = `${author}/${slug}`
  try {
    const res = await fetch('https://api.chub.ai/api/characters/download', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'tavern', fullPath, version: 'main' }),
    })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      const card = parsePngTavernCard(buf)
      if (card?.name) return card
    }
  } catch {
    // download 실패 → 아래 node 폴백
  }

  // 폴백: node.definition(snake_case 변형)에서 필드 추출
  const def = node?.definition ?? node
  if (def?.name || node?.name) {
    return {
      name: def?.name ?? node?.name ?? '',
      description: def?.description ?? node?.description ?? '',
      personality: def?.personality ?? '',
      scenario: def?.scenario ?? '',
      first_mes: def?.first_message ?? def?.first_mes ?? '',
      mes_example: def?.example_dialogs ?? def?.mes_example ?? '',
      system_prompt: def?.system_prompt ?? '',
      creator_notes: def?.description ?? node?.tagline ?? '',
      alternate_greetings: def?.alternate_greetings ?? [],
      tags: def?.tags ?? [],
    }
  }
  throw new Error('Chub 카드를 가져올 수 없습니다.')
}

export async function captureChub(url: string): Promise<Captured> {
  const { author, slug } = parseChubUrl(url)
  const node = await fetchChubNode(author, slug)
  const card = await fetchChubCard(author, slug, node)
  if (!card.name?.trim()) throw new Error('Chub 카드에 이름이 없습니다.')

  // 태그: 카드 내장 tags + 노드 topics 합치기(노드 쪽이 실제 태그인 경우가 많음).
  const nodeTopics: string[] = Array.isArray(node?.topics) ? node.topics.map((t: any) => String(t)) : []
  const tags = [...(card.tags ?? []), ...nodeTopics]

  // 아바타: v1은 외부 URL만 → Chub 공개 아바타 CDN 사용.
  const avatarUrl: string =
    node?.avatar_url || node?.max_res_url || `https://avatars.charhub.io/avatars/${author}/${slug}/avatar.webp`

  // 번역 전 조립(원문 그대로). name/gender/avatar는 비번역.
  const raw: AssembledCharacter = {
    name: card.name.trim(),
    gender: '', // chara_card_v2엔 성별 필드 없음 → 사용자가 edit에서 채움
    tags,
    additionalInfo: [
      card.description?.trim(),
      card.personality?.trim() && `[성격]\n${card.personality.trim()}`,
      card.creator_notes?.trim() && `[제작자 메모]\n${card.creator_notes.trim()}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    openingMessage: card.first_mes?.trim() ?? '',
    openingMessages: [card.first_mes, ...(card.alternate_greetings ?? [])]
      .map((c) => (c ?? '').trim())
      .filter(Boolean)
      .map((content, i) => ({ id: String(i), title: `도입부 ${i + 1}`, content })),
    exampleDialogues: card.mes_example?.trim() ?? '',
    avatarUrl,
  }

  if (!raw.additionalInfo.trim()) throw new Error('Chub 카드에 캐릭터 설명이 없습니다.')

  // 번역 + 태그 정규화
  const { character, scenarioDescription } = await translateCard(raw, card.scenario?.trim() ?? '')

  console.log(
    `[chub-import] ok — name=${character.name} tags=${character.tags?.length ?? 0} openings=${character.openingMessages?.length ?? 1}`,
  )

  return {
    sections: [],
    title: character.name,
    imageUrl: avatarUrl,
    assembledResult: {
      characters: [character],
      scenarioDescription,
      tags: character.tags ?? [],
      title: character.name,
    },
  }
}
