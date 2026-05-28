import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai/gemini'
import type { StatEntry } from '@/types'

function extractJson(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/)
  return match ? match[0] : raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
}

export function triggerStatsEvaluation(
  convId: string,
  msgId: string,
  userMsg: string,
  aiMsg: string,
  currentStats: StatEntry[],
): void {
  evalAndUpdate(convId, msgId, userMsg, aiMsg, currentStats).catch(err =>
    console.error('[statsEval] error:', err),
  )
}

async function evalAndUpdate(
  convId: string,
  msgId: string,
  userMsg: string,
  aiMsg: string,
  currentStats: StatEntry[],
): Promise<void> {
  const statList = currentStats.map(s => `${s.name}(현재:${s.value})`).join(', ')
  const systemPrompt = '당신은 인터랙티브 스토리의 스탯 평가자입니다. 유저의 선택과 AI의 반응을 보고 각 스탯의 변화량을 JSON으로만 반환합니다.'
  const userPrompt = `다음 스토리 교환을 보고 스탯 변화를 평가하세요.

유저 선택: ${userMsg}
AI 반응 (요약): ${aiMsg.slice(0, 400)}

현재 스탯: ${statList}

규칙:
- 변화가 있는 스탯만 포함 (0인 스탯은 제외)
- 변화량은 -10 ~ +10 사이 정수
- JSON만 반환. 예: {"호감도": 3, "신뢰도": -1}
- 없으면 {} 반환`

  let raw = ''
  try {
    raw = await generateText(systemPrompt, userPrompt)
    const jsonStr = extractJson(raw)
    const deltas: Record<string, number> = JSON.parse(jsonStr)

    const updated = currentStats.map(s => {
      const delta = deltas[s.name] ?? 0
      return { ...s, value: Math.max(s.min, Math.min(s.max, s.value + delta)) }
    })

    await Promise.all([
      prisma.conversation.update({ where: { id: convId }, data: { statsConfig: updated } }),
      prisma.message.update({ where: { id: msgId }, data: { statsDelta: deltas } }),
    ])
  } catch {
    // silent fail — stats eval is non-critical
  }
}

export async function rollbackStatsDelta(
  convId: string,
  deltas: Record<string, number>,
  currentStats: StatEntry[],
): Promise<StatEntry[]> {
  const updated = currentStats.map(s => {
    const delta = deltas[s.name] ?? 0
    return { ...s, value: Math.max(s.min, Math.min(s.max, s.value - delta)) }
  })
  await prisma.conversation.update({ where: { id: convId }, data: { statsConfig: updated } })
  return updated
}
