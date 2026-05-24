import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const convId = searchParams.get('id')

  if (convId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: convId, userId },
      include: {
        characters: { include: { character: { select: { id: true, name: true } } }, orderBy: { turnOrder: 'asc' } },
        messages: { where: { isSelected: true }, orderBy: { createdAt: 'asc' } },
        personaCharacter: { select: { id: true, name: true } },
      },
    })
    if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
    const date = new Date().toISOString().slice(0, 10)
    const safe = conv.title.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 40)
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), conversation: conv }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="storyfit-${safe}-${date}.json"`,
      },
    })
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId },
    include: {
      characters: { include: { character: { select: { id: true, name: true } } }, orderBy: { turnOrder: 'asc' } },
      messages: { where: { isSelected: true }, orderBy: { createdAt: 'asc' } },
      personaCharacter: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), conversations }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="storyfit-export-${date}.json"`,
    },
  })
}
