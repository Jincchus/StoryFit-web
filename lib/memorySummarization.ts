import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai/gemini'
import { generateEmbedding } from '@/lib/embedding'

const SUMMARIZE_EVERY = 10

async function summarizeMessages(
  messages: { role: string; content: string }[],
  characterSystemPrompt: string,
): Promise<string> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? '유저' : '캐릭터'}: ${m.content}`)
    .join('\n')

  const systemPrompt = `당신은 롤플레이 대화 요약 전문가입니다. 캐릭터 설정: ${characterSystemPrompt}`
  const userPrompt = `아래 대화를 4~6개의 불릿 포인트로 요약하세요.

우선순위 (높은 것부터):
1. 관계 변화 · 감정 변화 · 중요한 결정 (반드시 포함)
2. 장소·시간·상황 전환
3. 외모·의상·소지품 변화
4. 주요 행동과 사건 전개

규칙:
- 추측하지 말고 대화에 명시된 내용만 작성
- 각 항목은 "•" 로 시작
- 반드시 한국어로 작성

대화:\n${transcript}`

  return generateText(systemPrompt, userPrompt)
}

export async function triggerMemorySummarization(
  conversationId: string,
  characterSystemPrompt: string,
): Promise<void> {
  // DB-level atomic lock to prevent concurrent summarization runs
  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, isSummarizing: false },
    data: { isSummarizing: true },
  })
  if (updated.count === 0) return // Already summarizing!

  try {
    const totalMessages = await prisma.message.count({
      where: { conversationId, isSelected: true },
    })
    const expectedCount = Math.floor(totalMessages / SUMMARIZE_EVERY)
    if (expectedCount === 0) return

    const existingMemoryCount = await prisma.memory.count({ where: { conversationId } })
    if (existingMemoryCount >= expectedCount) return

    const skipCount = existingMemoryCount * SUMMARIZE_EVERY
    const messages = await prisma.message.findMany({
      where: { conversationId, isSelected: true },
      orderBy: { createdAt: 'asc' },
      skip: skipCount,
      take: SUMMARIZE_EVERY,
    })
    if (messages.length < SUMMARIZE_EVERY) return

    const summary = await summarizeMessages(messages, characterSystemPrompt)
    const memory = await prisma.memory.create({
      data: {
        conversationId,
        summary,
        messageRangeStart: messages[0].id,
        messageRangeEnd: messages[messages.length - 1].id,
      },
    })

    generateEmbedding(summary).then(embedding => {
      const vector = `[${embedding.join(',')}]`
      return prisma.$executeRawUnsafe(
        `UPDATE "Memory" SET embedding = $1::vector WHERE id = $2`,
        vector,
        memory.id,
      )
    }).catch(err => console.error('[memorySummarization] embedding error:', err))
  } finally {
    // Release the DB lock
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { isSummarizing: false },
    }).catch(() => {})
  }
}

// 다중선택 승격 시: 선택 요약들을 '핵심 기억'으로 압축하는 user 프롬프트
export function buildCoreMemoryPrompt(summaries: string[], existingCoreMemory: string): string {
  return `아래 대화 요약들을 '핵심 기억'으로 정리하세요.

[지속 상태] — 지금도 유효한 것만, 사건 나열 없이:
1. 인물 간 관계의 현재 상태와 변화 (예: 적대→신뢰, 연인이 됨, 비밀 공유)
2. 누적된 감정의 결과 — 지금 서로에게 갖는 감정
3. 절대 잊으면 안 되는 확정 사실 — 정체·비밀·약속·중요 설정/소지품
4. 현재까지 확정된 외형·신체·능력 변화
5. 현재 위치·상황 — 지금 어디서 무엇을 하는 중인지 + 그렇게 된 직접적 이유 (과정 나열 X, '현재 상태와 계기'만)
6. 미해결 과제·현재 목표·예고된 위협 — 아직 끝나지 않은 일, 하려던 것, 다가오는 위험

규칙:
- 모든 항목: 중복 제거, 추측 금지(요약에 명시된 것만), 각 항목 "•", 한국어.
- 사실이 서로 모순되면 최신 정보를 우선한다.
- 아래 '이미 적힌 핵심메모리'에 있는 내용은 반복하지 말 것:
${existingCoreMemory.trim() || '(없음)'}

대화 요약들:
${summaries.join('\n\n')}`
}

export async function condenseForCoreMemory(
  summaries: string[],
  existingCoreMemory: string,
  characterContext: string,
): Promise<string> {
  const systemPrompt = `당신은 롤플레이 대화의 '핵심 기억' 정리 전문가입니다.
핵심 기억은 AI가 대화 내내 절대 잊으면 안 되는 '지속 사실·관계 상태'와 '현재 상황·미해결 줄거리'입니다.
캐릭터 설정: ${characterContext}`
  return generateText(systemPrompt, buildCoreMemoryPrompt(summaries, existingCoreMemory))
}
