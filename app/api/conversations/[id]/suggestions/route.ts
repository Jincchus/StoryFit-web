import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'
import { buildSuggestionPrompt, parseSuggestions } from '@/lib/suggestions'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, userId },
    include: {
      user: { select: { displayName: true } },
      personaCharacter: { select: { name: true } },
      messages: { orderBy: { createdAt: 'asc' }, where: { isSelected: true }, select: { role: true, content: true } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
  const history = conv.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }))

  const { systemPrompt, userPrompt } = buildSuggestionPrompt(history, personaName)
  const raw = await generateText(systemPrompt, userPrompt)
  const suggestions = parseSuggestions(raw)

  return NextResponse.json({ suggestions })
}
