import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const { branchFromMessageId, description } = body
  if (!branchFromMessageId) return NextResponse.json({ error: 'branchFromMessageId가 필요합니다.' }, { status: 400 })

  const source = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { orderBy: { turnOrder: 'asc' } },
      messages: { where: { isSelected: true, isStreaming: false }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!source || source.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const branchMsgIdx = source.messages.findIndex(m => m.id === branchFromMessageId)
  if (branchMsgIdx === -1) return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 })
  const messagesToCopy = source.messages.slice(0, branchMsgIdx + 1)
  const branchMsgCreatedAt = source.messages[branchMsgIdx].createdAt

  // 새 메시지 id를 미리 생성해 원본→분기 id 매핑을 만든다(메모리 range 리매핑에 사용).
  const msgIdMap = new Map<string, string>()
  for (const m of messagesToCopy) msgIdMap.set(m.id, randomUUID())

  // 분기 시점까지의 장기 메모리를 '원본 그대로' 복제한다(분기 후부터 개별 관리).
  // ⚠️ 과거 버그: messageRangeEnd가 복사 메시지에 없으면 메모리를 통째로 버렸다. 그런데
  //    재생성/편집으로 end 메시지가 삭제되면 그 메모리는 댕글링(레코드는 살아있고 end 포인터만
  //    죽음)이 되는데, 분기 시 그 댕글링 메모리(=실제 과거 요약)가 전부 증발했다.
  //    이제: end/start 앵커가 복사 범위에 있으면 새 id로 리매핑, 앵커가 죽은 댕글링이라도
  //    분기 시점 '이전'에 생성된 메모리(과거 history)면 보존한다. 분기 시점 '이후'의
  //    메모리(다른 타임라인 사건 요약)만 제외한다.
  const sourceMemories = await prisma.memory.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  const memIdMap = new Map<string, string>() // oldMemId -> newMemId
  const memoryCreates = sourceMemories
    .filter(mem =>
      msgIdMap.has(mem.messageRangeEnd) ||
      msgIdMap.has(mem.messageRangeStart) ||
      mem.createdAt <= branchMsgCreatedAt
    )
    .map(mem => {
      const newId = randomUUID()
      memIdMap.set(mem.id, newId)
      return {
        id: newId,
        summary: mem.summary,
        // 복사된 메시지면 새 id로, 죽은 앵커면 원본 값을 그대로 둔다(원본 상태 무손실 복제).
        messageRangeStart: msgIdMap.get(mem.messageRangeStart) ?? msgIdMap.get(mem.messageRangeEnd) ?? mem.messageRangeStart,
        messageRangeEnd: msgIdMap.get(mem.messageRangeEnd) ?? msgIdMap.get(mem.messageRangeStart) ?? mem.messageRangeEnd,
        promoted: mem.promoted,
        createdAt: mem.createdAt,
      }
    })

  const rootId = source.rootConversationId ?? source.id

  const branch = await prisma.conversation.create({
    data: {
      userId,
      title: source.title,
      mode: source.mode,
      currentAI: source.currentAI,
      personaCharacterId: source.personaCharacterId,
      scenarioDescription: source.scenarioDescription,
      coreMemory: source.coreMemory,
      statusTimeline: source.statusTimeline,
      tags: source.tags,
      temperature: source.temperature,
      frequencyPenalty: source.frequencyPenalty,
      safetyLevel: source.safetyLevel,
      statsEnabled: source.statsEnabled,
      statsConfig: source.statsConfig ?? undefined,
      inventoryEnabled: source.inventoryEnabled,
      inventory: (source.inventory as any) ?? undefined,
      sourceUrl: source.sourceUrl,
      chapter: source.chapter,
      autoChapterEnabled: source.autoChapterEnabled,
      plotOutline: (source.plotOutline as any) ?? undefined,
      styleConfig: (source.styleConfig as any) ?? undefined,
      suggestRepliesEnabled: source.suggestRepliesEnabled,
      enrichInputMode: source.enrichInputMode,
      maxOutputTokens: source.maxOutputTokens,
      thinkingBudget: source.thinkingBudget,
      rootConversationId: rootId,
      branchFromMessageId,
      branchDescription: String(description ?? '').trim().slice(0, 100),
      characters: {
        create: source.characters.map(cc => ({ characterId: cc.characterId, turnOrder: cc.turnOrder })),
      },
      messages: {
        create: messagesToCopy.map(m => ({
          id: msgIdMap.get(m.id)!,
          role: m.role,
          content: m.content,
          aiModel: m.aiModel,
          characterId: m.characterId,
          // 원본 parentId를 새 id로 리매핑한다. 진짜 오프닝(원래 parentId=null)만 null로 남고
          // 나머지는 트리 체인을 유지한다. null로 뭉개면 splitRecentAndOpening이 모든 응답을
          // openingScene으로 오인해 매 턴 수십만 토큰을 전송하게 된다.
          parentId: m.parentId ? (msgIdMap.get(m.parentId) ?? null) : null,
          isSelected: true,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          chapter: m.chapter,
          createdAt: m.createdAt,
        })),
      },
      memories: memoryCreates.length > 0 ? { create: memoryCreates } : undefined,
    },
  })

  // 임베딩은 Prisma가 다루지 못하는(vector) 타입이라 원본에서 직접 복사 — 의미 검색 유지.
  for (const [oldMemId, newMemId] of Array.from(memIdMap)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Memory" SET embedding = (SELECT embedding FROM "Memory" WHERE id = $1) WHERE id = $2`,
      oldMemId,
      newMemId,
    ).catch(err => console.error('[branch] 메모리 임베딩 복사 실패:', err))
  }

  return NextResponse.json({ id: branch.id }, { status: 201 })
}
