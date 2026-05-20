import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

async function authenticate(req: NextRequest) {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conversations = await prisma.conversation.findMany({
    where: { userId },
    include: {
      characters: { include: { character: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      userPersona: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(conversations)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  if (!body.characterId || !body.title) return NextResponse.json({ error: 'characterId와 title은 필수입니다.' }, { status: 400 })

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title: body.title,
      currentAI: body.currentAI ?? 'gemini',
      userPersonaId: body.userPersonaId ?? null,
      characters: { create: { characterId: body.characterId } },
    },
    include: { characters: { include: { character: true } }, messages: true },
  })
  return NextResponse.json(conversation, { status: 201 })
}
