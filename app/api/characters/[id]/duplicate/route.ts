import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const source = await prisma.character.findUnique({ where: { id: params.id } })
  if (!source) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
  if (source.isPreset || source.creatorId !== userId) {
    return NextResponse.json({ error: '복제 권한이 없습니다.' }, { status: 403 })
  }

  const created = await prisma.$transaction(async (tx) => {
    const dup = await tx.character.create({
      data: {
        name: `${source.name} (복제)`.slice(0, 100),
        gender: source.gender,
        avatarUrl: source.avatarUrl,
        tags: source.tags,
        additionalInfo: source.additionalInfo,
        secretSettings: source.secretSettings,
        exampleDialogues: source.exampleDialogues,
        openingMessage: source.openingMessage,
        openingMessages: (source.openingMessages ?? undefined) as any,
        safetyLevel: source.safetyLevel,
        temperature: source.temperature,
        frequencyPenalty: source.frequencyPenalty,
        maxOutputTokens: source.maxOutputTokens,
        thinkingBudget: source.thinkingBudget,
        defaultAI: source.defaultAI,
        relatedImages: source.relatedImages,
        creatorId: userId,
        collectionId: null,
        isPreset: false,
        isAutoCreated: false,
      },
    })

    return dup
  })

  return NextResponse.json(created, { status: 201 })
}
