import { NextRequest, NextResponse } from 'next/server'
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
          role: m.role,
          content: m.content,
          aiModel: m.aiModel,
          characterId: m.characterId,
          parentId: null,
          isSelected: true,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          chapter: m.chapter,
          createdAt: m.createdAt,
        })),
      },
    },
  })

  return NextResponse.json({ id: branch.id }, { status: 201 })
}
