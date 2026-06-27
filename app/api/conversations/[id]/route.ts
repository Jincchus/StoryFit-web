import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { replacePlaceholders } from '@/lib/systemPrompt'


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { displayName: true } },
      characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } },
      messages: { orderBy: { createdAt: 'asc' }, where: { isSelected: true } },
      personaCharacter: { select: { id: true, name: true, avatarUrl: true, tags: true, additionalInfo: true } },
      characterCollection: { select: { id: true } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
  const charNames = conv.characters.map((cc: any) => cc.character?.name).filter(Boolean)
  conv.messages = conv.messages.map(m =>
    m.role === 'assistant'
      ? { ...m, content: replacePlaceholders(m.content, personaName, charNames) }
      : m
  )

  return NextResponse.json(conv)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const { soloCharacterId, characterIds, ...rest } = body
  const allowed = ['title', 'currentAI', 'chatModel', 'personaCharacterId', 'coreMemory', 'statusTimeline', 'scenarioDescription', 'isPinned', 'isArchived', 'branchDescription', 'inventory', 'styleConfig', 'isAutoCreated', 'mode', 'tags', 'autoChapterEnabled', 'enrichInputMode', 'personaAutoMode', 'fastPaceEnabled', 'adultGatingEnabled', 'temperature', 'frequencyPenalty', 'maxOutputTokens', 'thinkingBudget', 'safetyLevel']
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([k]) => allowed.includes(k)))

  const conv = await prisma.conversation.updateMany({ where: { id: params.id, userId }, data })
  if (conv.count === 0) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  // 제목 변경 시 연결된 컬렉션 제목도 동기화
  if (data.title) {
    await prisma.characterCollection.updateMany({
      where: { conversationId: params.id },
      data: { title: data.title as string },
    })
  }

  // 스토리 모드: 선택된 캐릭터 1명만 남기고 나머지 제거 (소유권 확인)
  if (soloCharacterId) {
    const owned = await prisma.character.findFirst({
      where: { id: soloCharacterId, OR: [{ creatorId: userId }, { isPreset: true }] },
      select: { id: true },
    })
    if (!owned) return NextResponse.json({ error: '유효하지 않은 캐릭터입니다.' }, { status: 400 })
    await prisma.conversationCharacter.deleteMany({
      where: { conversationId: params.id, characterId: { not: soloCharacterId } },
    })
  }

  // 멀티스토리 모드: 캐릭터 목록 전체 교체 (소유권 확인)
  if (Array.isArray(characterIds) && characterIds.length > 0) {
    const owned = await prisma.character.findMany({
      where: { id: { in: characterIds }, OR: [{ creatorId: userId }, { isPreset: true }] },
      select: { id: true },
    })
    if (owned.length !== characterIds.length) {
      return NextResponse.json({ error: '유효하지 않은 캐릭터가 포함되어 있습니다.' }, { status: 400 })
    }
    await prisma.$transaction([
      prisma.conversationCharacter.deleteMany({ where: { conversationId: params.id } }),
      ...characterIds.map((charId: string, i: number) =>
        prisma.conversationCharacter.create({
          data: { conversationId: params.id, characterId: charId, turnOrder: i },
        })
      ),
    ])
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const target = await prisma.conversation.findFirst({
    where: { id: params.id, userId },
    select: { id: true, rootConversationId: true, isArchived: true, isPinned: true },
  })
  if (!target) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  // 분기는 rootConversationId 문자열로만 묶인 별도 Conversation이므로, 루트만 지우면
  // 남은 분기들이 고아가 되어 채팅리스트/서재(둘 다 루트 기준)에서 사라진다.
  if (target.rootConversationId === null) {
    const children = await prisma.conversation.findMany({
      where: { userId, rootConversationId: params.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (children.length > 0) {
      const [newRoot, ...rest] = children
      await prisma.$transaction([
        // 가장 오래된 분기를 새 루트로 승격 (보관/고정 등 표시 위치 계승)
        prisma.conversation.update({
          where: { id: newRoot.id },
          data: {
            rootConversationId: null,
            branchFromMessageId: null,
            branchDescription: '',
            isArchived: target.isArchived,
            isPinned: target.isPinned,
          },
        }),
        // 나머지 분기들을 새 루트에 재연결
        ...(rest.length > 0
          ? [prisma.conversation.updateMany({
              where: { userId, id: { in: rest.map(c => c.id) } },
              data: { rootConversationId: newRoot.id },
            })]
          : []),
        // 기존 루트 삭제 (메시지는 onDelete: Cascade)
        prisma.conversation.delete({ where: { id: params.id } }),
      ])
      return new NextResponse(null, { status: 204 })
    }
  }

  await prisma.conversation.delete({ where: { id: params.id } })
  return new NextResponse(null, { status: 204 })
}
