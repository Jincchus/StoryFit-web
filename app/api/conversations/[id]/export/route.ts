import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { replacePlaceholders } from '@/lib/systemPrompt'
import { parseStoryChoices } from '@/lib/responseControl'

function toNovelText(content: string): string {
  return content
    .split('\n')
    .filter(line => !line.trim().startsWith('🎲 판정'))
    .join('\n')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .trim()
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: {
      userId: true,
      title: true,
      scenarioDescription: true,
      createdAt: true,
      personaCharacter: { select: { name: true } },
      characters: { orderBy: { turnOrder: 'asc' }, select: { character: { select: { name: true } } } },
      messages: {
        where: { isSelected: true, isStreaming: false },
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true },
      },
    },
  })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const personaName = conv.personaCharacter?.name ?? '나'
  const charName = conv.characters[0]?.character.name ?? ''

  const parts: string[] = []
  parts.push(conv.title)
  parts.push('═'.repeat(Math.min(40, Math.max(10, conv.title.length * 2))))
  parts.push('')
  if (conv.scenarioDescription.trim()) {
    parts.push(replacePlaceholders(conv.scenarioDescription, personaName, charName))
    parts.push('')
    parts.push('─'.repeat(30))
    parts.push('')
  }

  for (const m of conv.messages) {
    const replaced = replacePlaceholders(m.content, personaName, charName)
    if (m.role === 'user') {
      const text = toNovelText(replaced)
      if (text) parts.push(`▷ ${text}`)
    } else {
      const { body } = parseStoryChoices(replaced)
      const text = toNovelText(body)
      if (text) parts.push(text)
    }
    parts.push('')
  }

  parts.push('─'.repeat(30))
  parts.push(`${new Date(conv.createdAt).toLocaleDateString('ko-KR')} 시작 · StoryFit에서 내보냄`)

  const filename = encodeURIComponent(`${conv.title.replace(/[\\/:*?"<>|]/g, '_')}.txt`)
  return new NextResponse(parts.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}
