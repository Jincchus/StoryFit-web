import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } },
      messages: { orderBy: { createdAt: 'asc' }, where: { isSelected: true } },
      personaCharacter: { select: { id: true, name: true, avatarUrl: true, tags: true, additionalInfo: true } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(conv)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const allowed = ['title', 'currentAI', 'personaCharacterId', 'coreMemory', 'statusTimeline', 'scenarioDescription', 'isPinned', 'isArchived', 'branchDescription', 'inventory', 'styleConfig', 'isAutoCreated', 'mode', 'tags']
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))

  const conv = await prisma.conversation.updateMany({ where: { id: params.id, userId }, data })
  if (conv.count === 0) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  // 제목 변경 시 연결된 컬렉션 제목도 동기화
  if (data.title) {
    await prisma.characterCollection.updateMany({
      where: { conversationId: params.id },
      data: { title: data.title as string },
    })
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

  // URL import로 연결된 컬렉션 제거 (캐릭터는 보존, collectionId만 null로)
  // Character FK에 ON DELETE SET NULL이 설정되어 있어 컬렉션 삭제 시 자동 처리됨
  await prisma.characterCollection.deleteMany({ where: { conversationId: params.id } })

  // 루트(v1)를 삭제할 때 남은 분기가 있으면, 가장 오래된 분기를 새 루트로 승격한다.
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
