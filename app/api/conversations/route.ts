import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generatePlotOutline } from '@/lib/plotOutline'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const isWhif = searchParams.get('isWhif') === 'true'
  const mode = searchParams.get('mode')
  const characterId = searchParams.get('characterId')

  const whereClause: any = {
    userId,
    rootConversationId: null,
    isArchived: false,
    mode: mode ? mode : { not: 'assistant' },
  }

  if (isWhif) {
    whereClause.sourceUrl = { contains: 'whif.' }
  }

  if (characterId) {
    whereClause.characters = { some: { characterId } }
  }

  const conversations = await prisma.conversation.findMany({
    where: whereClause,
    include: {
      characters: { include: { character: { select: { id: true, name: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      personaCharacter: { select: { name: true } },
    },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
  })
  return NextResponse.json(conversations)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const title = String(body.title ?? '').trim().slice(0, 200)
  if (!title) return NextResponse.json({ error: 'title은 필수입니다.' }, { status: 400 })

  const mode = ['story', 'multiStory', 'assistant'].includes(body.mode) ? body.mode : 'story'
  const isAssistant = mode === 'assistant'

  const characterIds: string[] = Array.isArray(body.characterIds)
    ? body.characterIds.slice(0, 10).map(String)
    : body.characterId ? [String(body.characterId)] : []
  if (!isAssistant && characterIds.length === 0) return NextResponse.json({ error: 'characterId가 필요합니다.' }, { status: 400 })

  // Find collections of selected characters to determine sourceUrl and lorebooks
  const selectedChars = await prisma.character.findMany({
    where: { id: { in: characterIds } },
    select: { collectionId: true },
  })
  const collectionIds = Array.from(new Set(selectedChars.map(c => c.collectionId).filter(Boolean))) as string[]

  let convSourceUrl = body.sourceUrl ?? ''
  let tikitaPlotOutline: any = null
  let colDescription = ''
  if (collectionIds.length > 0) {
    const col = await prisma.characterCollection.findFirst({
      where: { id: { in: collectionIds } },
      select: { sourceUrl: true, tikitaMeta: true, description: true }
    })
    if (!convSourceUrl && col?.sourceUrl) {
      convSourceUrl = col.sourceUrl
    }
    if (col?.description?.trim()) {
      colDescription = col.description.trim()
    }
    const episodes = (col?.tikitaMeta as any)?.episodes
    if (Array.isArray(episodes) && episodes.length > 0) {
      tikitaPlotOutline = {
        totalChapters: episodes.length,
        mode: 'auto',
        ending: '',
        chapters: episodes,
        source: 'tikita',
      }
    }
  }

  // 페르소나 캐릭터를 상대 캐릭터의 컬렉션에 합류시켜 캐릭터 디테일/완결창에서 함께 노출
  const personaCharacterId: string | null = body.personaCharacterId ?? null
  if (personaCharacterId && collectionIds.length > 0) {
    const persona = await prisma.character.findFirst({
      where: { id: personaCharacterId, creatorId: userId },
      select: { collectionId: true },
    })
    if (persona && !persona.collectionId) {
      await prisma.character.update({
        where: { id: personaCharacterId },
        data: { collectionId: collectionIds[0] },
      })
    }
  }

  // 전역 개인 기본값 — body에 명시 안 되면 항상 이 값이 새 방의 기본으로 주입됨(생성 후엔 방별 독립).
  const settings = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultTemperature: true, defaultFrequencyPenalty: true, defaultMaxOutputTokens: true, defaultThinkingBudget: true, defaultSafetyLevel: true },
  })

  // extraCollectionIds: 팅글 서사/테마 — 서버에서 additionalInfo 읽어 scenarioDescription에 합산
  const rawExtraIds: string[] = Array.isArray(body.extraCollectionIds)
    ? body.extraCollectionIds.map(String).filter(Boolean)
    : []
  const validatedExtras: string[] = rawExtraIds.length > 0
    ? (await prisma.characterCollection.findMany({
        where: { id: { in: rawExtraIds }, userId },
        select: { id: true },
      })).map(c => c.id)
    : []

  let scenarioDescription = body.scenarioDescription ?? ''
  // 클라이언트가 scenarioDescription을 따로 보내지 않았고 컬렉션에 배경 설명이 있으면 자동 주입
  if (!scenarioDescription && colDescription) {
    scenarioDescription = colDescription
  }
  if (validatedExtras.length > 0) {
    const extraCols = await prisma.characterCollection.findMany({
      where: { id: { in: validatedExtras } },
      select: {
        id: true, title: true, sourceUrl: true,
        characters: { select: { additionalInfo: true }, take: 1 },
      },
    })
    const extraParts = extraCols.map(col => {
      const txt = col.characters[0]?.additionalInfo?.trim() ?? ''
      if (!txt) return null
      const label = col.sourceUrl?.includes('/universes/') ? '서사' : col.sourceUrl?.includes('/scenes/') ? '테마' : null
      return label ? `[${label}: ${col.title}]\n${txt}` : null
    }).filter(Boolean) as string[]
    if (extraParts.length > 0) {
      scenarioDescription = [scenarioDescription, ...extraParts].filter(Boolean).join('\n\n')
    }
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title,
      mode,
      currentAI: body.currentAI ?? 'gemini',
      personaCharacterId: body.personaCharacterId ?? null,
      scenarioDescription,
      tags: body.tags ?? [],
      temperature: body.temperature ?? settings?.defaultTemperature ?? 0.9,
      frequencyPenalty: body.frequencyPenalty ?? settings?.defaultFrequencyPenalty ?? 0.3,
      maxOutputTokens: body.maxOutputTokens ?? settings?.defaultMaxOutputTokens ?? 8192,
      thinkingBudget: body.thinkingBudget ?? settings?.defaultThinkingBudget ?? 0,
      safetyLevel: body.safetyLevel ?? settings?.defaultSafetyLevel ?? 'standard',
      statsEnabled: body.statsEnabled ?? false,
      statsConfig: body.statsConfig ?? null,
      inventoryEnabled: body.inventoryEnabled ?? false,
      inventory: body.inventoryEnabled ? ([] as any) : undefined,
      styleConfig: body.styleConfig ?? null,
      suggestRepliesEnabled: body.suggestRepliesEnabled ?? false,
      enrichInputMode: body.enrichInputMode ?? false,
      autoChapterEnabled: body.autoChapterEnabled ?? false,
      sourceUrl: convSourceUrl,
      ...(tikitaPlotOutline ? { plotOutline: tikitaPlotOutline, chapter: 1 } : {}),
      ...(characterIds.length > 0 ? {
        characters: {
          create: characterIds.map((id, idx) => ({ characterId: id, turnOrder: idx })),
        },
      } : {}),
    },
    include: { characters: { include: { character: true } }, messages: true },
  })

  // Clone collection-level lorebooks to this conversation
  const allCollectionIds = Array.from(new Set([...collectionIds, ...validatedExtras]))

  if (allCollectionIds.length > 0) {
    const collectionLorebooks = await prisma.lorebook.findMany({
      where: { collectionId: { in: allCollectionIds } },
    })

    if (collectionLorebooks.length > 0) {
      await Promise.all(
        collectionLorebooks.map(lb =>
          prisma.lorebook.create({
            data: {
              keyword: lb.keyword,
              content: lb.content,
              priority: lb.priority,
              scanDepth: lb.scanDepth,
              conversationId: conversation.id,
            },
          })
        )
      )
    }
  }

  // 도입부(첫 메시지)는 항상 1번 캐릭터(turnOrder 0 = characterIds[0]) 것 하나만 사용한다.
  // 멀티 대화여도 참여자 전원의 도입부를 깔지 않는다.
  const chars = conversation.characters.map(cc => cc.character)
  const firstChar = chars.find(c => c.id === characterIds[0]) ?? chars[0]
  const openingContent = body.openingMessage !== undefined
    ? String(body.openingMessage || '').trim()
    : (firstChar?.openingMessage || '').trim()

  if (firstChar && openingContent) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: openingContent,
        characterId: firstChar.id,
        chapter: 1,
        isSelected: true,
        isStreaming: false,
      },
    })
  }

  const plotChapters = parseInt(body.plotChapters)
  if (!isAssistant && !tikitaPlotOutline && plotChapters >= 2) {
    const characterLines = conversation.characters
      .map(cc => `${cc.character.name}${cc.character.tags?.length ? ` (${cc.character.tags.join(', ')})` : ''}: ${(cc.character.additionalInfo ?? '').slice(0, 300)}`)
      .join('\n')
    const openingText = openingContent.slice(0, 2000)
    generatePlotOutline({
      scenario: conversation.scenarioDescription,
      characterLines,
      totalChapters: Math.min(30, plotChapters),
      storySoFar: openingText,
      currentChapter: 1,
    }).then(outline => {
      if (outline) {
        return prisma.conversation.update({
          where: { id: conversation.id },
          data: { plotOutline: { ...outline, mode: 'auto' } as any },
        })
      }
    }).catch(err => console.error('[plotOutline] 신규 대화 설계도 생성 실패:', err))
  }

  return NextResponse.json(conversation, { status: 201 })
}
