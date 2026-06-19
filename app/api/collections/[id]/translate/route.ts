import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { translateContent } from '@/lib/import/translate'
import type { AssembledCharacter } from '@/lib/import/types'

// 비활성 언어 스냅샷(번역 토글용).
interface ChubAlt {
  additionalInfo: string
  openingMessage: string
  openingMessages: any
  exampleDialogues: string
  scenarioDescription: string
}

// Chub 캐릭터 원문↔번역 토글.
// - 처음: 원문(en)을 한국어로 번역해 본문에 쓰고, 원문을 alt에 캐시 → activeLang='ko'
// - 이후: 캐시된 alt와 본문을 맞바꿔 토글(Gemini 미호출)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collection = await prisma.characterCollection.findFirst({
    where: { id: params.id, userId },
    include: { characters: true },
  })
  if (!collection) return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  if (!collection.sourceUrl.includes('chub.ai')) {
    return NextResponse.json({ error: '번역은 Chub 센터 캐릭터만 지원합니다.' }, { status: 400 })
  }
  const char = collection.characters[0]
  if (!char) return NextResponse.json({ error: '캐릭터가 없습니다.' }, { status: 400 })

  const meta = (collection.chubMeta as any) ?? { activeLang: 'en', alt: null }

  // 현재 본문 스냅샷
  const current: ChubAlt = {
    additionalInfo: char.additionalInfo,
    openingMessage: char.openingMessage,
    openingMessages: char.openingMessages ?? null,
    exampleDialogues: char.exampleDialogues,
    scenarioDescription: collection.description,
  }

  let next: ChubAlt
  let nextMeta: { activeLang: 'en' | 'ko'; alt: ChubAlt }

  if (meta.alt) {
    // 캐시 있음 → 단순 토글(맞바꿈)
    next = meta.alt as ChubAlt
    nextMeta = { activeLang: meta.activeLang === 'en' ? 'ko' : 'en', alt: current }
  } else {
    // 최초 → 원문(en)을 번역
    const raw: AssembledCharacter = {
      name: char.name,
      gender: char.gender,
      tags: char.tags,
      additionalInfo: char.additionalInfo,
      openingMessage: char.openingMessage,
      openingMessages: (char.openingMessages as any) ?? undefined,
      exampleDialogues: char.exampleDialogues,
    }
    const { character, scenarioDescription } = await translateContent(raw, collection.description)
    next = {
      additionalInfo: character.additionalInfo,
      openingMessage: character.openingMessage,
      openingMessages: character.openingMessages ?? null,
      exampleDialogues: character.exampleDialogues,
      scenarioDescription,
    }
    nextMeta = { activeLang: 'ko', alt: current } // 원문을 alt에 보관
  }

  await prisma.character.update({
    where: { id: char.id },
    data: {
      additionalInfo: next.additionalInfo,
      openingMessage: next.openingMessage,
      openingMessages: next.openingMessages,
      exampleDialogues: next.exampleDialogues,
    },
  })
  await prisma.characterCollection.update({
    where: { id: collection.id },
    data: { description: next.scenarioDescription, chubMeta: nextMeta as any },
  })

  const updated = await prisma.characterCollection.findFirst({
    where: { id: collection.id, userId },
    include: { characters: true },
  })
  return NextResponse.json(updated)
}
