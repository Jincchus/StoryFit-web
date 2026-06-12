import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

function makeSnippet(content: string, query: string, radius = 60): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, radius * 2)
  const start = Math.max(0, idx - radius)
  const end = Math.min(content.length, idx + query.length + radius)
  return (start > 0 ? '…' : '') + content.slice(start, end).replace(/\n+/g, ' ') + (end < content.length ? '…' : '')
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const messages = await prisma.message.findMany({
    where: {
      isSelected: true,
      isStreaming: false,
      content: { contains: q, mode: 'insensitive' },
      conversation: { userId, mode: { not: 'assistant' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      conversation: {
        select: {
          id: true,
          title: true,
          isArchived: true,
          characters: { take: 1, orderBy: { turnOrder: 'asc' }, select: { character: { select: { name: true, avatarUrl: true } } } },
        },
      },
    },
  })

  return NextResponse.json({
    results: messages.map(m => ({
      messageId: m.id,
      role: m.role,
      snippet: makeSnippet(m.content, q),
      createdAt: m.createdAt,
      conversationId: m.conversation.id,
      convTitle: m.conversation.title,
      isArchived: m.conversation.isArchived,
      charName: m.conversation.characters[0]?.character.name ?? '',
      charAvatarUrl: m.conversation.characters[0]?.character.avatarUrl ?? null,
    })),
  })
}
