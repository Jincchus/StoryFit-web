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

// 받침(종성) 유무에 따라 "과/와" 조사를 고른다 — "강태헌과의 대화" vs "강태이와의 대화".
// 한글 음절이 아닌 문자로 끝나면(영문/기호 등) 기본값 "와"를 쓴다.
function josa과와(word: string): '과' | '와' {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return '와'
  return code % 28 === 0 ? '와' : '과'
}

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
  // 사이트가 제목(og:title 등)을 신뢰성 있게 제공하면 AI 분류 결과보다 우선한다 —
  // AI가 본문 속 플레이스홀더 토큰({캐릭터} 등)을 그대로 이름으로 뽑거나 엉뚱한
  // 제목을 짓는 문제를 원천 차단한다 (사용자 확인 완료: og:title은 가공 없이 그대로
  // 캐릭터명·대화방 제목으로 써야 할 값). 단, 출연진이 여럿인 앙상블/쇼 페이지는
  // og:title이 "사람 이름"이 아니라 "프로그램 제목"인 경우가 있어 — 이 경우 AI가
  // 식별한 개별 캐릭터 이름을 덮어쓰면 안 되므로 단일 캐릭터일 때만 적용한다.
  if (captured.title && !isMulti && result.characters[0]) result.characters[0].name = captured.title
  const firstName = result.characters[0]?.name || captured.title || '캐릭터'
  const titleSubject = `${firstName}${isMulti ? ' 외' : ''}`
  const title = captured.title
    ? `${titleSubject}${josa과와(titleSubject)}의 대화`
    : (result.title || `${titleSubject}${josa과와(titleSubject)}의 대화`).trim()

  const createdChars = await Promise.all(
    result.characters.map((c, i) => {
      // 각 캐릭터 고유 이미지 우선, 없으면 첫 캐릭터에만 캡처된 대표 이미지 적용
      const avatarUrl = c.avatarUrl || (i === 0 ? captured.imageUrl : '') || undefined
      return prisma.character.create({
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
          ...(avatarUrl ? { avatarUrl } : {}),
        },
      })
    })
  )

  const isWhif = matchesHost(url, 'whif.io', 'whif.club')

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title,
      mode: isWhif
        ? (isMulti ? 'tikiTaka' : 'roleplay')
        : (isMulti ? 'multiStory' : 'story'),
      currentAI: 'gemini',
      scenarioDescription: result.scenarioDescription,
      tags: result.tags,
      isAutoCreated: true,
      sourceUrl: url,
      safetyLevel: result.safetyLevel || 'standard',
      sourceLorebookUrls: captured.loreUrls && captured.loreUrls.length ? captured.loreUrls : undefined,
      characters: { create: createdChars.map((c, i) => ({ characterId: c.id, turnOrder: i })) },
    },
  })

  // 세계관(컬렉션) 이름은 대화방 접미사("과의 대화")를 빼고 깔끔하게 원본 제목(세계관 명칭) 또는 대표 캐릭터 이름으로 저장합니다.
  const collectionTitle = (captured.title || result.title || firstName).trim()
  const collection = await prisma.characterCollection.create({
    data: { title: collectionTitle, sourceUrl: url, userId, conversationId: conversation.id },
  })

  await prisma.character.updateMany({
    where: { id: { in: createdChars.map(c => c.id) } },
    data: { collectionId: collection.id },
  })

  // WHIF 백과사전(로어북) 항목이 있는 경우 자동 동기화 저장
  if (captured.lorebooks && captured.lorebooks.length > 0) {
    if (isWhif) {
      await Promise.all(
        captured.lorebooks.flatMap((entry) => [
          prisma.lorebook.create({
            data: {
              scope: 'collection',
              scopeId: collection.id,
              keyword: entry.keyword,
              content: entry.content,
              priority: entry.priority ?? 0,
              conversationId: null,
            },
          }),
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
        ])
      )
    } else {
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
  }

  const firstChar = createdChars[0]
  if (firstChar?.openingMessage?.trim()) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: firstChar.openingMessage.trim(),
        characterId: firstChar.id,
        isSelected: true,
        isStreaming: false,
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
    if (url.includes('/universes/')) {
      return NextResponse.json({ error: '세계관 URL은 직접 등록할 수 없습니다. 소속된 캐릭터 URL을 등록해주세요.' }, { status: 400 })
    }
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
