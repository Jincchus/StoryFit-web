import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generatePlotOutline, parsePlotOutline } from '@/lib/plotOutline'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const totalChapters = Math.min(30, Math.max(2, parseInt(body.totalChapters) || 6))

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { include: { character: { select: { name: true, tags: true, additionalInfo: true } } } },
      messages: { where: { isSelected: true, isStreaming: false }, orderBy: { createdAt: 'desc' }, take: 12 },
    },
  })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  if (conv.mode !== 'story' && conv.mode !== 'multiStory') {
    return NextResponse.json({ error: '스토리 모드에서만 사용할 수 있습니다.' }, { status: 400 })
  }

  const characterLines = conv.characters
    .map(cc => `${cc.character.name}${cc.character.tags?.length ? ` (${cc.character.tags.join(', ')})` : ''}: ${(cc.character.additionalInfo ?? '').slice(0, 300)}`)
    .join('\n')

  const storySoFar = conv.messages.length > 1
    ? [...conv.messages].reverse().map(m => `${m.role === 'user' ? '유저' : 'AI'}: ${m.content.slice(0, 400)}`).join('\n')
    : ''

  const generated = await generatePlotOutline({
    scenario: conv.scenarioDescription,
    characterLines,
    totalChapters,
    storySoFar,
    currentChapter: conv.chapter,
  })
  if (!generated) return NextResponse.json({ error: '설계도 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 })

  const prevMode = parsePlotOutline(conv.plotOutline)?.mode ?? 'auto'
  const outline = { ...generated, mode: prevMode }
  await prisma.conversation.update({ where: { id: params.id }, data: { plotOutline: outline as unknown as Prisma.InputJsonValue } })
  return NextResponse.json(outline)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  const conv = await prisma.conversation.findUnique({ where: { id: params.id }, select: { userId: true, plotOutline: true } })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const outline = parsePlotOutline(conv.plotOutline)
  if (!outline) return NextResponse.json({ error: '설계도가 없습니다.' }, { status: 400 })

  let next = { ...outline }
  if (body.mode === 'choice' || body.mode === 'auto') next.mode = body.mode

  // 챕터 개별 편집(수동 보정): chapters 배열이 오면 검증 후 반영. Tikita 원작 에피소드도 재생성 없이 수정 가능.
  if (Array.isArray(body.chapters)) {
    if (body.chapters.length === 0) return NextResponse.json({ error: '챕터가 비었습니다.' }, { status: 400 })
    const parsed = parsePlotOutline({
      ...next,
      chapters: body.chapters,
      totalChapters: body.chapters.length,
      ending: typeof body.ending === 'string' ? body.ending : next.ending,
    })
    if (!parsed) return NextResponse.json({ error: '챕터 형식이 올바르지 않습니다.' }, { status: 400 })
    next = { ...parsed, mode: next.mode, source: outline.source }
  } else if (typeof body.ending === 'string') {
    next.ending = body.ending
  }

  await prisma.conversation.update({ where: { id: params.id }, data: { plotOutline: next as unknown as Prisma.InputJsonValue } })
  return NextResponse.json(next)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({ where: { id: params.id }, select: { userId: true } })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  await prisma.conversation.update({ where: { id: params.id }, data: { plotOutline: Prisma.DbNull } })
  return NextResponse.json({ ok: true })
}
