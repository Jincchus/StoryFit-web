import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { parsePngTavernCard, buildSystemPromptFromCard } from '@/lib/tavernCard'
import { captureMelting, captureWhif, captureZeta, matchesHost } from '@/lib/import/capture'
import { splitIntoBlocks } from '@/lib/import/blocks'
import { classifyBlocks } from '@/lib/import/classify'
import { assemble, buildFallback } from '@/lib/import/assemble'
import type { Captured } from '@/lib/import/types'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'avatars')

interface CardShape {
  name: string; description: string; personality: string; scenario: string
  first_mes: string; mes_example: string; system_prompt?: string
}

function parseTavernJson(json: any): CardShape {
  const data = json?.spec === 'chara_card_v2' ? json.data : json
  return {
    name: data?.name ?? '',
    description: data?.description ?? '',
    personality: data?.personality ?? '',
    scenario: data?.scenario ?? '',
    first_mes: data?.first_mes ?? '',
    mes_example: data?.mes_example ?? '',
    system_prompt: data?.system_prompt ?? '',
  }
}

async function runImport(captured: Captured, url: string, userId: string) {
  let result
  if (captured.assembledResult) {
    result = captured.assembledResult
  } else {
    const blocks = splitIntoBlocks(captured.sections)
    if (blocks.length === 0) throw new Error('가져올 텍스트가 없습니다')

    try {
      const classification = await classifyBlocks(blocks)
      if (!classification.title) classification.title = captured.title
      result = assemble(blocks, classification)
    } catch (e: any) {
      console.log('[import] 분류 실패 — 무손실 폴백:', e?.message)
      result = buildFallback(blocks, { name: captured.title || '캐릭터' })
    }
  }

  const isMulti = result.characters.length > 1
  const firstName = result.characters[0]?.name || captured.title || '캐릭터'
  const title = (result.title || `${firstName}${isMulti ? ' 외' : ''}와의 대화`).trim()

  const createdChars = await Promise.all(
    result.characters.map((c, i) =>
      prisma.character.create({
        data: {
          name: c.name.slice(0, 100),
          gender: c.gender.slice(0, 20),
          tags: result.tags,
          additionalInfo: c.additionalInfo,
          exampleDialogues: c.exampleDialogues,
          openingMessage: c.openingMessage,
          safetyLevel: result.safetyLevel || 'standard',
          isAutoCreated: true,
          creatorId: userId,
          ...(i === 0 && captured.imageUrl ? { avatarUrl: captured.imageUrl } : {}),
        },
      })
    )
  )

  const conversation = await prisma.conversation.create({
    data: {
      userId, title, mode: isMulti ? 'multiStory' : 'story', currentAI: 'gemini',
      scenarioDescription: result.scenarioDescription,
      tags: result.tags, isAutoCreated: true, sourceUrl: url,
      safetyLevel: result.safetyLevel || 'standard',
      sourceLorebookUrls: captured.loreUrls && captured.loreUrls.length ? captured.loreUrls : undefined,
      characters: { create: createdChars.map((c, i) => ({ characterId: c.id, turnOrder: i })) },
    },
  })

  // WHIF 백과사전(로어북) 항목이 있는 경우 자동 동기화 저장
  if (captured.lorebooks && captured.lorebooks.length > 0) {
    await Promise.all(
      captured.lorebooks.map((entry) =>
        prisma.lorebook.create({
          data: {
            scope: 'conversation',
            scopeId: conversation.id,
            keyword: entry.keyword,
            content: entry.content,
            priority: entry.priority ?? 0,
            conversationId: conversation.id,
          },
        })
      )
    )
  }

  const collection = await prisma.characterCollection.create({
    data: { title, sourceUrl: url, userId, conversationId: conversation.id },
  })
  await prisma.character.updateMany({
    where: { id: { in: createdChars.map(c => c.id) } },
    data: { collectionId: collection.id },
  })

  const firstChar = createdChars[0]
  if (firstChar?.openingMessage?.trim()) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id, role: 'assistant',
        content: firstChar.openingMessage.trim(), characterId: firstChar.id,
        isSelected: true, isStreaming: false,
      },
    })
  }

  return { characterId: firstChar?.id, conversationId: conversation.id, collectionId: collection.id }
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { url } = await req.json()
  if (!url?.trim()) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })

  if (matchesHost(url, 'zeta-ai.io')) {
    try { return NextResponse.json(await runImport(await captureZeta(url.trim()), url.trim(), userId), { status: 201 }) }
    catch (e: any) { return NextResponse.json({ error: e.message ?? '제타 가져오기 실패' }, { status: 400 }) }
  }
  if (matchesHost(url, 'melting.chat')) {
    try { return NextResponse.json(await runImport(await captureMelting(url.trim()), url.trim(), userId), { status: 201 }) }
    catch (e: any) { return NextResponse.json({ error: e.message ?? '멜팅 가져오기 실패' }, { status: 400 }) }
  }
  if (matchesHost(url, 'whif.io', 'whif.club')) {
    try { return NextResponse.json(await runImport(await captureWhif(url.trim()), url.trim(), userId), { status: 201 }) }
    catch (e: any) { return NextResponse.json({ error: e.message ?? 'Whif 가져오기 실패' }, { status: 400 }) }
  }

  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    return NextResponse.json({ error: 'URL에서 파일을 가져올 수 없습니다.' }, { status: 400 })
  }

  if (res.headers.get('content-length') && Number(res.headers.get('content-length')) > 20 * 1024 * 1024) {
    return NextResponse.json({ error: '20MB 이하 파일만 가능합니다.' }, { status: 400 })
  }

  const contentType = res.headers.get('content-type') ?? ''
  const buf = Buffer.from(await res.arrayBuffer())

  let card: CardShape | null = null
  let isPng = false

  if (contentType.includes('json') || url.endsWith('.json')) {
    try {
      card = parseTavernJson(JSON.parse(buf.toString('utf-8')))
    } catch {
      return NextResponse.json({ error: '유효한 Tavern Card JSON이 아닙니다.' }, { status: 400 })
    }
  } else {
    const pngCard = parsePngTavernCard(buf)
    if (!pngCard) return NextResponse.json({ error: '유효한 Tavern Card PNG가 아닙니다.' }, { status: 400 })
    card = pngCard
    isPng = true
  }

  const name = card.name?.trim()
  if (!name) return NextResponse.json({ error: '카드에 이름이 없습니다.' }, { status: 400 })

  const additionalInfo = buildSystemPromptFromCard(card)
  if (!additionalInfo.trim()) return NextResponse.json({ error: '캐릭터 설명이 없습니다.' }, { status: 400 })

  let avatarUrl: string | undefined
  if (isPng) {
    const filename = `${randomUUID()}.png`
    await mkdir(UPLOAD_DIR, { recursive: true })
    await writeFile(path.join(UPLOAD_DIR, filename), buf)
    await prisma.uploadedImage.create({ data: { filename, isShared: false, uploaderId: userId } })
    avatarUrl = `/api/uploads/${filename}`
  }

  const character = await prisma.character.create({
    data: {
      name,
      additionalInfo,
      tags: [],
      exampleDialogues: card.mes_example?.trim() ?? '',
      ...(avatarUrl ? { avatarUrl } : {}),
      creatorId: userId,
    },
  })

  return NextResponse.json(character, { status: 201 })
}
