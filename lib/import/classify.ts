import type { Block, Classification, PresetField } from './types'
import { generateText } from '@/lib/ai/gemini'

const FIELDS: PresetField[] = ['additionalInfo', 'openingMessage', 'exampleDialogues', 'scenario', 'ignore']

export function buildClassifyPrompt(blocks: Block[]): string {
  const listing = blocks
    .map(b => `[${b.id}]${b.tabHint ? ` (${b.tabHint})` : ''} ${b.text}`)
    .join('\n\n')

  return `아래는 롤플레잉 캐릭터 페이지에서 추출한 번호 매긴 텍스트 블록입니다.
각 블록이 "어느 캐릭터의 어느 필드"인지 분류하세요.

⚠️ 매우 중요: 블록 텍스트를 절대 복사하거나 재서술하지 마세요. 오직 블록 id(숫자)와 라벨만 출력합니다.

블록:
${listing}

반환 형식 (마크다운 없이 JSON만):
{"title":"작품/주인공 제목","tags":["태그1"],"characters":[{"index":0,"name":"이름","gender":"남성|여성|"}],"blocks":[{"id":0,"owner":0,"field":"additionalInfo"}]}

규칙:
- characters: 원문이 독립 항목으로 따로 서술한 인물만. 대등한 주인공이 여럿이면 모두 포함, 단순 조연/언급은 넣지 말 것.
- owner: 그 블록이 명확히 특정 캐릭터를 설명하면 그 index, 세계관/줄거리/공용이면 null.
- field: additionalInfo(설정·성격·외모), openingMessage(첫 장면/인트로 대사), exampleDialogues(예시 대화), scenario(세계관/줄거리), ignore(사이트 UI·잡음).
- 모든 블록 id를 빠짐없이 한 번씩 분류하세요.`
}

export function parseClassification(raw: string): Classification {
  const match = raw.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(match ? match[0] : raw)

  const characters = Array.isArray(parsed.characters)
    ? parsed.characters
        .map((c: any, i: number) => ({
          index: typeof c?.index === 'number' ? c.index : i,
          name: String(c?.name ?? '').trim(),
          gender: String(c?.gender ?? '').trim(),
        }))
        .filter((c: any) => c.name)
    : []

  if (characters.length === 0) throw new Error('분류 결과에 캐릭터가 없습니다')

  const blocks = Array.isArray(parsed.blocks)
    ? parsed.blocks
        .filter((b: any) => typeof b?.id === 'number')
        .map((b: any) => ({
          id: b.id,
          owner: typeof b?.owner === 'number' ? b.owner : null,
          field: (FIELDS.includes(b?.field) ? b.field : 'ignore') as PresetField,
        }))
    : []

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15)
    : []

  return { title: String(parsed.title ?? '').trim(), tags, characters, blocks }
}

// AI 호출 + 파싱 + 2회 재시도. 실패 시 throw (호출 측에서 buildFallback으로 폴백).
export async function classifyBlocks(blocks: Block[]): Promise<Classification> {
  const systemPrompt = '당신은 텍스트 블록을 캐릭터 필드로 분류하는 분류기입니다. 텍스트를 복사하지 말고 반드시 JSON만 반환하세요.'
  const userPrompt = buildClassifyPrompt(blocks)

  let lastErr: unknown
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt, 2048)
      return parseClassification(raw)
    } catch (e) {
      lastErr = e
      console.log('[import-classify] parse error attempt', i, ':', (e as any)?.message)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('분류 실패')
}
