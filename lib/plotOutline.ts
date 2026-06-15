import { generateText } from '@/lib/ai/gemini'

export interface PlotChapter {
  index: number
  title: string
  goal: string
  events: string[]
  transition: string
}

export interface PlotOutline {
  totalChapters: number
  mode: 'auto' | 'choice'
  ending: string
  chapters: PlotChapter[]
  source?: 'tikita' | 'ai'
}

export function parsePlotOutline(raw: unknown): PlotOutline | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as any
  if (!Array.isArray(o.chapters) || o.chapters.length === 0) return null
  return {
    totalChapters: typeof o.totalChapters === 'number' ? o.totalChapters : o.chapters.length,
    mode: o.mode === 'choice' ? 'choice' : 'auto',
    ending: typeof o.ending === 'string' ? o.ending : '',
    chapters: o.chapters.map((c: any, i: number) => ({
      index: typeof c.index === 'number' ? c.index : i + 1,
      title: String(c.title ?? `${i + 1}챕터`),
      goal: String(c.goal ?? ''),
      events: Array.isArray(c.events) ? c.events.map(String) : [],
      transition: String(c.transition ?? ''),
    })),
    source: o.source === 'tikita' ? 'tikita' : 'ai',
  }
}

function extractJson(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/)
  return match ? match[0] : raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
}

export async function generatePlotOutline({
  scenario,
  characterLines,
  totalChapters,
  storySoFar,
  currentChapter,
}: {
  scenario: string
  characterLines: string
  totalChapters: number
  storySoFar?: string
  currentChapter?: number
}): Promise<Omit<PlotOutline, 'mode'> | null> {
  const progressSection = storySoFar?.trim()
    ? `\n[지금까지 진행된 스토리]\n${storySoFar.trim()}\n\n위 스토리는 이미 진행된 내용입니다. 현재 ${currentChapter ?? 1}챕터 진행 중이므로, ${currentChapter ?? 1}챕터 이전 내용은 이미 일어난 사건과 일치하게 작성하고, 이후 챕터는 이 흐름에서 자연스럽게 이어지도록 설계하세요.`
    : ''

  const systemPrompt = '당신은 장편 인터랙티브 소설의 플롯을 설계하는 스토리 아키텍트입니다. JSON만 반환합니다.'
  const userPrompt = `아래 설정으로 전체 ${totalChapters}챕터짜리 스토리 아크를 설계하세요.

[시나리오 배경]
${scenario || '(없음)'}

[등장인물]
${characterLines || '(없음)'}
${progressSection}

반환 형식 (JSON만, 설명 없이):
{
  "ending": "이 스토리가 도달할 결말 방향 1~2문장",
  "chapters": [
    {
      "index": 1,
      "title": "챕터 제목",
      "goal": "이 챕터에서 달성할 서사적 목표 1문장",
      "events": ["일어나야 할 핵심 사건 1", "핵심 사건 2"],
      "transition": "다음 챕터로 넘어가는 조건 1문장"
    }
  ]
}

규칙:
- 정확히 ${totalChapters}개의 챕터를 설계
- 기승전결 구조: 도입 → 갈등 축적 → 위기/절정 → 결말. 중반에는 내부 갈등·배신·상실 같은 굴곡을 반드시 배치
- 각 챕터의 events는 2~3개, 구체적인 사건으로 (추상적 표현 금지)
- 마지막 챕터는 결말을 완결시키는 챕터
- 모든 텍스트는 한국어로 작성`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt, 4096)
      const parsed = parsePlotOutline({ ...JSON.parse(extractJson(raw)), totalChapters })
      if (parsed && parsed.chapters.length > 0) {
        return { totalChapters, ending: parsed.ending, chapters: parsed.chapters }
      }
    } catch (err) {
      if (attempt === 1) console.error('[plotOutline] 생성 실패:', err)
    }
  }
  return null
}

export function buildPlotSection(outline: PlotOutline, currentChapter: number): string {
  const chapter = outline.chapters.find(c => c.index === currentChapter)
    ?? outline.chapters[outline.chapters.length - 1]
  const next = outline.chapters.find(c => c.index === chapter.index + 1)
  const isFinal = chapter.index >= outline.totalChapters

  const lines = [
    `[스토리 설계도 — 사용자에게 비공개]`,
    `전체 ${outline.totalChapters}챕터 중 현재 ${chapter.index}챕터 「${chapter.title}」 진행 중.`,
    `- 이 챕터의 목표: ${chapter.goal}`,
  ]
  if (chapter.events.length > 0) lines.push(`- 일어나야 할 핵심 사건: ${chapter.events.join(' / ')}`)
  if (chapter.transition) lines.push(`- 다음 챕터 전환 조건: ${chapter.transition}`)
  if (next) lines.push(`- 다음 챕터 예고: 「${next.title}」 — ${next.goal}`)
  if (outline.ending) lines.push(`- 최종 결말 방향: ${outline.ending}`)

  lines.push('')
  lines.push('지침:')
  lines.push('- 위 설계도의 내용을 사용자에게 직접 언급하거나 노출하지 마라. 스포일러 금지.')
  lines.push('- 챕터 목표를 향해 서사를 능동적으로 이끌어라. 전개가 정체되면(같은 장소·같은 화제가 반복되면) 핵심 사건 중 하나를 일으켜라.')
  lines.push('- 단, 사용자의 선택과 행동을 존중하며 자연스럽게 유도하라. 강제로 사건을 욱여넣지 마라.')
  if (isFinal) {
    lines.push('- 이 챕터가 마지막 챕터다. 남은 떡밥을 회수하고 결말을 향해 서사를 수렴시켜라.')
  }
  if (outline.mode === 'choice') {
    lines.push('- 챕터 목표가 달성되어 다음 챕터로 넘어갈 시점이 되면, 그 응답의 선택지 1~3번을 서로 다른 "다음 전개 방향" 후보로 제시하라.')
  }
  return lines.join('\n')
}
