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
- 머리말·맺음말 금지: "다음은 …요약입니다" 같은 안내 문장 없이 불릿만 출력

대화:\n${transcript}`

  // relaxed(BLOCK_NONE): NSFW 롤플레이 대화도 요약할 수 있게(차단 시 빈 요약 → 빈 메모리 방지)
  const raw = await generateText(systemPrompt, userPrompt, 1024, 'relaxed')
  // 모델이 붙이는 머리말("다음은 … 요약입니다.")을 제거 — 한정된 메모리 주입 칸을 잡음으로 낭비하지 않게.
  return raw
    .replace(/^\s*(?:다음은|아래는)[^\n]*?(?:요약|정리)[^\n]*(?::|입니다\.?|\.)?\s*\n+/, '')
    .trim()
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
    // 선택된 메시지 전체를 시간순으로 로드(id·createdAt). 커버리지 계산과 요약 fetch에 함께 쓴다.
    const allMsgs = await prisma.message.findMany({
      where: { conversationId, isSelected: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true },
    })

    // 각 메모리가 커버하는 createdAt 구간을 만든다(유효 앵커 기준).
    // ⚠️ 과거 버그: '가장 늦은 메모리 end까지가 전부 요약됐다'는 연속 가정으로 summarizedCount를
    //    계산했다. 분기 복사·재생성으로 메모리가 드문드문해지면(중간 빈 구간 + 늦은 위치의 메모리),
    //    그 값이 부풀어 앞의 거대한 빈 구간을 영영 요약하지 않았다(요약 영구 정지).
    //    이제 메모리 range를 createdAt 구간으로 환산해 '실제 미커버 메시지'만 골라 요약한다.
    const mems = await prisma.memory.findMany({
      where: { conversationId },
      select: { messageRangeStart: true, messageRangeEnd: true },
    })
    const msgTime = new Map(allMsgs.map(m => [m.id, m.createdAt.getTime()]))
    const intervals: [number, number][] = []
    for (const mem of mems) {
      const s = msgTime.get(mem.messageRangeStart)
      const e = msgTime.get(mem.messageRangeEnd)
      const lo = s ?? e
      const hi = e ?? s
      if (lo != null && hi != null) intervals.push([Math.min(lo, hi), Math.max(lo, hi)])
    }

    // 모든 메모리의 앵커가 사라진 극단 케이스(전부 댕글링)는 처음부터 전체 재요약 시 대량 중복이
    // 생기므로 건드리지 않는다. (정상 흐름에선 도달하지 않음)
    if (mems.length > 0 && intervals.length === 0) return

    // 어떤 메모리 range에도 안 들어가는 '미커버' 메시지만 추린다. 이미 요약된 구간은 다시
    // 요약하지 않으므로 중복이 안 생기고, 분기/삭제로 생긴 빈 구간만 앞에서부터 메운다.
    const uncovered = allMsgs.filter(m => {
      const t = m.createdAt.getTime()
      return !intervals.some(([lo, hi]) => t >= lo && t <= hi)
    })
    if (uncovered.length < SUMMARIZE_EVERY) return

    const chunkIds = uncovered.slice(0, SUMMARIZE_EVERY).map(m => m.id)
    const messages = await prisma.message.findMany({
      where: { id: { in: chunkIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true },
    })
    if (messages.length < SUMMARIZE_EVERY) return

    const summary = await summarizeMessages(messages, characterSystemPrompt)
    // 빈 요약(안전 차단·일시 오류 등)은 저장하지 않는다 — 다음 트리거에 재시도.
    // (저장하면 빈 장기 메모리가 생기고, 카운트에 잡혀 그 구간이 영구 누락됨)
    if (!summary.trim()) {
      console.warn(`[memorySummarization] 빈 요약 — 저장 건너뜀 (conv=${conversationId})`)
      return
    }
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
    }).catch(err => console.error('[memorySummarization] isSummarizing 잠금 해제 실패 — 요약이 멈출 수 있음:', err))
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
  return generateText(systemPrompt, buildCoreMemoryPrompt(summaries, existingCoreMemory), 4096, 'relaxed')
}

export async function compressCoreMemory(
  coreMemory: string,
  characterContext: string,
): Promise<string> {
  const systemPrompt = `당신은 롤플레이 대화의 '핵심 기억' 정리 전문가입니다.
핵심 기억은 AI가 대화 내내 절대 잊으면 안 되는 '지속 사실·관계 상태'와 '현재 상황·미해결 줄거리'입니다.
캐릭터 설정: ${characterContext}`

  const userPrompt = `아래 '핵심 기억'을 정보 손실 없이 정리하세요.
목표는 "줄이기"가 아니라 "중복·중언부언을 합쳐 깔끔하게 만들기"입니다.

[항상 보존 — 절대 삭제 금지]
- 인물의 정체·비밀, 약속·계약·거래 조건
- 인물 간 관계의 현재 상태
- 확정된 외형·신체·능력 변화, 중요 소지품
- 미해결 과제·목표·예고된 위협

[삭제해도 되는 경우 — 오직 아래 두 가지뿐]
1. 완전히 동일한 중복 항목 → 하나로 합친다.
2. 같은 텍스트 안에서 뒤쪽 정보가 앞 정보를 명백히 덮어쓴 경우, 옛 값만 제거한다.
   (예: "A에 있음" → 이후 "B로 이동"이면 위치만 최신값으로 갱신)

규칙:
- 위 두 경우가 아니면 무조건 보존한다. 애매하면 남긴다.
- "오래돼 보인다", "사소해 보인다"는 삭제 사유가 아니다.
- 사실이 서로 모순되면 최신 정보를 채택하되, 사실 자체는 잃지 않는다.
- 여러 항목을 합칠 땐 정보를 빠뜨리지 말고 한 항목에 모은다.
- 구조(카테고리·불릿)는 유지한다.
- 추측 금지 — 아래에 명시된 내용만 사용한다.
- 반드시 한국어로 작성한다.

핵심 기억:
${coreMemory.trim()}`

  // 무손실 정리를 위해 동적 thinking(-1) 활성화 + 출력 토큰 상향(길이 압박으로 인한 절삭 방지)
  return generateText(systemPrompt, userPrompt, 8192, 'relaxed', -1)
}
