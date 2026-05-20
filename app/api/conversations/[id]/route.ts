import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

async function authenticate(req: NextRequest) {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } },
      messages: { orderBy: { createdAt: 'asc' }, where: { isSelected: true } },
      userPersona: { select: { id: true, name: true } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(conv)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const allowed = ['title', 'currentAI', 'userPersonaId', 'coreMemory', 'statusTimeline', 'scenarioDescription']
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))

  const cacheInvalidatingFields = ['coreMemory', 'statusTimeline', 'scenarioDescription', 'userPersonaId']
  if (Object.keys(data).some(k => cacheInvalidatingFields.includes(k))) {
    data.geminiCacheId = null
    data.geminiCacheExpiry = null
  }

  const conv = await prisma.conversation.update({ where: { id: params.id }, data })
  return NextResponse.json(conv)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  await prisma.conversation.delete({ where: { id: params.id } })
  return new NextResponse(null, { status: 204 })
}
