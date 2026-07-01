import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

// 이 캐릭터가 등장하는 (분기 아닌) 내 대화방 id 목록.
async function roomIdsForCharacter(characterId: string, userId: string): Promise<string[]> {
  const links = await prisma.conversationCharacter.findMany({
    where: { characterId, conversation: { userId, rootConversationId: null } },
    select: { conversationId: true },
  })
  return Array.from(new Set(links.map(l => l.conversationId)))
}

// GET: 반영 대상 요약 { total, progressed } — progressed=대화가 이미 진행된 방(선택 메시지 6개 이상).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const char = await prisma.character.findUnique({ where: { id: params.id }, select: { creatorId: true } })
  if (!char || char.creatorId !== userId) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const convIds = await roomIdsForCharacter(params.id, userId)
  if (convIds.length === 0) return NextResponse.json({ total: 0, progressed: 0 })

  const grouped = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: convIds }, isSelected: true },
    _count: { _all: true },
  })
  const progressed = grouped.filter(g => g._count._all >= 6).length
  return NextResponse.json({ total: convIds.length, progressed })
}

// POST: 기존 대화방의 도입부(첫 assistant 메시지)를 이 캐릭터의 현재 openingMessage로 교체.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const char = await prisma.character.findUnique({ where: { id: params.id }, select: { creatorId: true, openingMessage: true } })
  if (!char || char.creatorId !== userId) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const newOpening = (char.openingMessage ?? '').trim()
  if (!newOpening) return NextResponse.json({ error: '도입부가 비어 있습니다.' }, { status: 400 })

  const convIds = await roomIdsForCharacter(params.id, userId)
  if (convIds.length === 0) return NextResponse.json({ updated: 0 })

  // 각 대화방에서 이 캐릭터의 '첫' assistant 메시지(=도입부)만 골라 교체.
  const openings = await prisma.message.findMany({
    where: { conversationId: { in: convIds }, role: 'assistant', characterId: params.id },
    orderBy: { createdAt: 'asc' },
    distinct: ['conversationId'],
    select: { id: true },
  })
  if (openings.length === 0) return NextResponse.json({ updated: 0 })

  const res = await prisma.message.updateMany({
    where: { id: { in: openings.map(o => o.id) } },
    data: { content: newOpening },
  })
  return NextResponse.json({ updated: res.count })
}
