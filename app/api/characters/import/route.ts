import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { parsePngTavernCard, buildSystemPromptFromCard } from '@/lib/tavernCard'
import { generateText } from '@/lib/ai/gemini'

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

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractLorebookUrls(html: string): { url: string; name: string }[] {
  const matches = Array.from(html.matchAll(/href="(\/(?:ko|en)\/lorebooks\/[a-f0-9-]+)"[^>]*>([^<]*)</g))
  const seen = new Set<string>()
  return matches.flatMap(m => {
    const url = `https://zeta-ai.io${m[1]}`
    const name = m[2]?.trim() || url
    if (seen.has(url)) return []
    seen.add(url)
    return [{ url, name }]
  })
}

async function importFromZeta(url: string, userId: string, existingCollectionId?: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  })
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)

  const html = await res.text()
  const lorebookUrls = extractLorebookUrls(html)
  const text = stripHtml(html).slice(0, 8000)

  const systemPrompt = '당신은 웹페이지 텍스트에서 캐릭터 정보를 추출하는 파서입니다. JSON만 반환합니다.'
  const userPrompt = `아래는 제타(Zeta AI) 플롯/캐릭터 프로필 페이지의 텍스트입니다.
모든 등장 캐릭터 정보를 추출해 JSON으로 반환하세요. 캐릭터가 여러 명이면 모두 포함하세요.

페이지 텍스트:
${text}

반환 형식 (JSON만, 설명 없이):
{
  "characters": [
    {
      "name": "캐릭터 이름",
      "gender": "남성 또는 여성 또는 빈 문자열",
      "additionalInfo": "나이, 외모, 직업, 성격, 배경 등 모든 설정을 자연스럽게 정리한 텍스트",
      "openingMessage": "첫 메시지가 있으면 입력, 없으면 빈 문자열",
      "exampleDialogues": "예시 대화가 있으면 입력, 없으면 빈 문자열"
    }
  ],
  "tags": ["태그1", "태그2"],
  "scenarioNote": "줄거리/시나리오 설명 (있을 경우)",
  "title": "작품 제목 (있을 경우)"
}

규칙:
- characters: 페이지에 등장하는 모든 캐릭터를 배열로. 한 명이어도 배열로
- tags: 페이지의 태그/장르 태그에서 최대 10개, # 제거하고 문자열만
- additionalInfo: 외모·나이·직업·MBTI·성격 등을 한국어로 자연스럽게 서술
- 정보가 없는 필드는 빈 문자열로`

  let parsed: any
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt)
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : raw)
      break
    } catch { if (i === 1) throw new Error('AI 파싱에 실패했습니다') }
  }

  const firstParsedChar = Array.isArray(parsed.characters) ? parsed.characters[0] : parsed
  const name = String(firstParsedChar?.name ?? parsed.name ?? '').trim()
  if (!name) throw new Error('캐릭터 이름을 찾을 수 없습니다')

  let additionalInfo = String(parsed.additionalInfo ?? '').trim()
  if (parsed.scenarioNote?.trim()) {
    additionalInfo += `\n\n[줄거리]\n${parsed.scenarioNote.trim()}`
  }

  const rawChars = Array.isArray(parsed.characters) ? parsed.characters : [parsed]
  const charTags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 15).map((t: any) => String(t).slice(0, 50)) : []
  const scenarioDescription = String(parsed.scenarioNote ?? '').trim().slice(0, 5000)
  const firstName = String(rawChars[0]?.name ?? '').trim() || '캐릭터'
  const collectionTitle = String(parsed.title ?? firstName).trim().slice(0, 200)
  const title = String(parsed.title ?? `${firstName}${rawChars.length > 1 ? ' 외' : ''}와의 대화`).trim().slice(0, 200)
  const isMulti = rawChars.length > 1

  const collection = existingCollectionId
    ? await prisma.characterCollection.findFirst({ where: { id: existingCollectionId, userId } }) ?? await prisma.characterCollection.create({ data: { title: collectionTitle, sourceUrl: url, userId } })
    : await prisma.characterCollection.create({ data: { title: collectionTitle, sourceUrl: url, userId } })

  const createdChars = await Promise.all(
    rawChars.map((c: any, i: number) =>
      prisma.character.create({
        data: {
          name: String(c.name ?? `캐릭터${i + 1}`).trim().slice(0, 100),
          gender: String(c.gender ?? '').slice(0, 20),
          tags: charTags,
          additionalInfo: String(c.additionalInfo ?? '').trim().slice(0, 10000),
          exampleDialogues: String(c.exampleDialogues ?? '').slice(0, 20000),
          openingMessage: String(c.openingMessage ?? '').slice(0, 5000),
          isAutoCreated: true,
          creatorId: userId,
          collectionId: collection.id,
        },
      })
    )
  )

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title,
      mode: isMulti ? 'multiStory' : 'story',
      currentAI: 'gemini',
      scenarioDescription,
      tags: charTags,
      isAutoCreated: true,
      sourceUrl: url,
      sourceLorebookUrls: lorebookUrls.length > 0 ? lorebookUrls : undefined,
      characters: { create: createdChars.map((c, i) => ({ characterId: c.id, turnOrder: i })) },
    },
  })

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

  const { url, collectionId } = await req.json()
  if (!url?.trim()) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })

  if (url.includes('zeta-ai.io')) {
    try {
      const result = await importFromZeta(url.trim(), userId, collectionId ?? undefined)
      return NextResponse.json(result, { status: 201 })
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? '제타 가져오기 실패' }, { status: 400 })
    }
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
