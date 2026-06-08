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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim())
}

function extractNextFlightText(html: string): string {
  const chunks: string[] = []
  const re = /self\.__next_f\.push\(\[1,("(?:(?:\\.|[^"\\])*)")\]\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(match[1]))
    } catch {
      // Ignore malformed chunks; the visible HTML fallback may still work.
    }
  }

  return stripHtml(chunks.join('\n'))
}

function cleanZetaText(text: string): string {
  let cleaned = text

  const profileIdx = cleaned.indexOf('추천 대화 프로필')
  if (profileIdx > 1200) {
    const prefix = cleaned.slice(0, profileIdx).split(/\s+/).slice(-80).join(' ')
    cleaned = `${prefix} ${cleaned.slice(profileIdx)}`
  }

  // 추천 콘텐츠/크리에이터 정보 이후는 불필요한 데이터
  const cutMarkers = ['크리에이터', '출시일', '마음에 들었다면', 'Creator', 'Release date']
  for (const marker of cutMarkers) {
    const idx = cleaned.indexOf(marker)
    if (idx > 300) { cleaned = cleaned.slice(0, idx); break }
  }

  // 사이트 로고명("제타"/"Zeta")이 맨 앞에 오면 제거
  return cleaned
    .replace(/^(제타|Zeta)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function preprocessZetaText(html: string): string {
  const visibleText = cleanZetaText(stripHtml(html))
  const flightText = cleanZetaText(extractNextFlightText(html))
  const text = visibleText.length >= 300 ? visibleText : flightText
  return text.slice(0, 12000)
}

function cleanWhifText(text: string): string {
  let cleaned = text

  const cutMarkers = ['크리에이터', '출시일', '마음에 들었다면', 'Creator', 'Release date']
  for (const marker of cutMarkers) {
    const idx = cleaned.indexOf(marker)
    if (idx > 300) { cleaned = cleaned.slice(0, idx); break }
  }

  return cleaned
    .replace(/^(윕|WHIF)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractZetaIntroText(text: string, characterNames: string[]): string {
  const introIdx = text.lastIndexOf('인트로')
  if (introIdx < 0) return ''

  let intro = text.slice(introIdx + '인트로'.length).trim()
  for (const marker of ['크리에이터', '출시일', '마음에 들었다면', 'Creator', 'Release date']) {
    const idx = intro.indexOf(marker)
    if (idx > 0) { intro = intro.slice(0, idx).trim(); break }
  }

  for (const name of characterNames) {
    if (!name) continue
    const re = new RegExp(`^${escapeRegExp(name)}\\s+`)
    if (re.test(intro) && intro.replace(re, '').trim().length > 20) {
      intro = intro.replace(re, '').trim()
      break
    }
  }

  return intro.slice(0, 5000)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function extractZetaPlotImage(html: string, url: string): string {
  const plotIdMatch = url.match(/\/plots\/([0-9a-f-]{36})/i)
  if (!plotIdMatch) return ''
  const re = new RegExp(`https://image\\.zeta-ai\\.io/plot-(?:intro|cover)-image/${escapeRegExp(plotIdMatch[1])}/[0-9a-f-]+\\.(?:jpe?g|png|webp)`, 'i')
  const match = html.match(re)
  return match ? match[0] : ''
}

async function importFromZeta(url: string, userId: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5',
    },
  })
  console.log('[zeta-import] fetch status:', res.status, 'content-type:', res.headers.get('content-type'))
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)

  const html = await res.text()
  console.log('[zeta-import] html length:', html.length, '| first 200:', html.slice(0, 200).replace(/\n/g, ' '))

  const lorebookUrls = extractLorebookUrls(html)
  const imageUrl = extractZetaPlotImage(html, url)
  console.log('[zeta-import] image url:', imageUrl)
  const text = preprocessZetaText(html)
  console.log('[zeta-import] text length:', text.length, '| first 300:', text.slice(0, 300).replace(/\n/g, ' '))
  if (text.length < 100) throw new Error('Zeta 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')

  const systemPrompt = '당신은 텍스트에서 롤플레잉 캐릭터 정보를 추출하는 파서입니다. 반드시 JSON만 반환하세요.'
  const userPrompt = `아래 텍스트에서 등장하는 모든 캐릭터 정보를 추출해 JSON으로 반환하세요. 캐릭터가 여러 명이면 모두 포함하세요.

텍스트:
${text}

반환 형식 (마크다운 없이 JSON만):
{"characters":[{"name":"캐릭터 이름","gender":"남성 또는 여성 또는 빈 문자열","additionalInfo":"나이·외모·직업·성격·배경 등을 자연스럽게 서술","openingMessage":"첫 메시지/인트로가 있으면 입력, 없으면 빈 문자열","exampleDialogues":"예시 대화가 있으면 입력, 없으면 빈 문자열"}],"tags":["태그1","태그2"],"scenarioNote":"줄거리/세계관 설명","title":"작품 제목 또는 주인공 이름"}

규칙:
- characters 배열에 텍스트에 나오는 모든 캐릭터 포함 (한 명이어도 배열로)
- tags는 # 기호로 표시된 태그에서 최대 10개, # 없이 문자열만
- 정보가 없는 필드는 빈 문자열`

  let parsed: any
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt, 4096)
      console.log('[zeta-import] raw AI response length:', raw.length, '| first 500:', raw.slice(0, 500).replace(/\n/g, ' '))
      const match = raw.match(/\{[\s\S]*\}/)
      console.log('[zeta-import] json match found:', !!match, match ? match[0].slice(0, 200) : 'NONE')
      parsed = JSON.parse(match ? match[0] : raw)
      break
    } catch (e: any) {
      console.log('[zeta-import] parse error attempt', i, ':', e?.message)
      if (i === 1) throw new Error('AI 파싱에 실패했습니다')
    }
  }

  console.log('[zeta-import] parsed characters count:', Array.isArray(parsed.characters) ? parsed.characters.length : 'N/A')
  console.log('[zeta-import] parsed:', JSON.stringify(parsed).slice(0, 500))
  const firstParsedChar = Array.isArray(parsed.characters) ? parsed.characters[0] : parsed
  const name = String(firstParsedChar?.name ?? parsed.name ?? '').trim()
  if (!name) throw new Error('캐릭터 이름을 찾을 수 없습니다')

  let additionalInfo = String(parsed.additionalInfo ?? '').trim()
  if (parsed.scenarioNote?.trim()) {
    additionalInfo += `\n\n[줄거리]\n${parsed.scenarioNote.trim()}`
  }

  const rawChars = Array.isArray(parsed.characters) ? parsed.characters : [parsed]
  const characterNames = rawChars.map((c: any) => String(c?.name ?? '').trim()).filter(Boolean)
  const introText = extractZetaIntroText(text, characterNames)
  console.log('[zeta-import] intro length:', introText.length, '| first 300:', introText.slice(0, 300).replace(/\n/g, ' '))
  const charTags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 15).map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15) : []
  const scenarioDescription = (parsed.scenarioNote?.trim() || '').slice(0, 5000)
  const firstName = String(rawChars[0]?.name ?? '').trim() || '캐릭터'
  const collectionTitle = (parsed.title?.trim() || firstName).slice(0, 200)
  const isMulti = rawChars.length > 1
  const title = (parsed.title?.trim() || `${firstName}${isMulti ? ' 외' : ''}와의 대화`).slice(0, 200)

  // 캐릭터 먼저 생성 (collectionId는 나중에 연결)
  const createdChars = await Promise.all(
    rawChars.map((c: any, i: number) =>
      prisma.character.create({
        data: {
          name: String(c.name ?? `캐릭터${i + 1}`).trim().slice(0, 100),
          gender: String(c.gender ?? '').slice(0, 20),
          tags: charTags,
          additionalInfo: String(c.additionalInfo ?? '').trim().slice(0, 10000),
          exampleDialogues: String(c.exampleDialogues ?? '').slice(0, 20000),
          openingMessage: String(i === 0 && introText ? introText : c.openingMessage ?? '').slice(0, 5000),
          isAutoCreated: true,
          creatorId: userId,
          ...(i === 0 && imageUrl ? { avatarUrl: imageUrl } : {}),
        },
      })
    )
  )

  // 대화 생성
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

  // 컬렉션 생성 — conversationId로 대화와 연결 (제목 변경/삭제 연동의 기준)
  const collection = await prisma.characterCollection.create({
    data: { title, sourceUrl: url, userId, conversationId: conversation.id },
  })

  // 캐릭터에 collectionId 연결
  await prisma.character.updateMany({
    where: { id: { in: createdChars.map(c => c.id) } },
    data: { collectionId: collection.id },
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

function extractMetaContent(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
  ]
  for (const re of patterns) {
    const match = html.match(re)
    if (match) return decodeHtmlEntities(match[1])
  }
  return ''
}

function cleanMeltingTitle(title: string): string {
  return title.replace(/\s*-\s*멜팅\s*$/i, '').trim()
}

async function importFromMelting(url: string, userId: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5',
    },
  })
  console.log('[melting-import] fetch status:', res.status, 'content-type:', res.headers.get('content-type'))
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)

  const html = await res.text()
  console.log('[melting-import] html length:', html.length)

  const ogTitle = cleanMeltingTitle(extractMetaContent(html, 'og:title'))
  const ogImage = extractMetaContent(html, 'og:image')
  const text = extractMetaContent(html, 'og:description').slice(0, 12000)
  console.log('[melting-import] og:title:', ogTitle, '| description length:', text.length, '| image:', ogImage)
  if (text.length < 100) throw new Error('멜팅 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')

  const systemPrompt = '당신은 텍스트에서 롤플레잉 캐릭터 정보를 추출하는 파서입니다. 반드시 JSON만 반환하세요.'
  const userPrompt = `아래는 "${ogTitle || '주인공'}" 캐릭터의 소개 텍스트입니다. 등장하는 모든 캐릭터 정보를 추출해 JSON으로 반환하세요. 캐릭터가 여러 명이면 모두 포함하되, 첫 번째는 반드시 주인공인 "${ogTitle || '주인공'}"이어야 합니다.

텍스트:
${text}

반환 형식 (마크다운 없이 JSON만):
{"characters":[{"name":"캐릭터 이름","gender":"남성 또는 여성 또는 빈 문자열","additionalInfo":"나이·외모·직업·성격·배경 등을 자연스럽게 서술","openingMessage":"첫 메시지/인트로가 있으면 입력, 없으면 빈 문자열","exampleDialogues":"예시 대화가 있으면 입력, 없으면 빈 문자열"}],"tags":["태그1","태그2"],"scenarioNote":"줄거리/세계관 설명","title":"작품 제목 또는 주인공 이름"}

규칙:
- characters 배열에 텍스트에 나오는 모든 캐릭터 포함 (한 명이어도 배열로)
- tags는 # 기호로 표시된 태그에서 최대 10개, # 없이 문자열만
- 정보가 없는 필드는 빈 문자열`

  let parsed: any
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt, 4096)
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : raw)
      break
    } catch (e: any) {
      console.log('[melting-import] parse error attempt', i, ':', e?.message)
      if (i === 1) throw new Error('AI 파싱에 실패했습니다')
    }
  }

  const firstParsedChar = Array.isArray(parsed.characters) ? parsed.characters[0] : parsed
  const name = String(firstParsedChar?.name ?? parsed.name ?? ogTitle ?? '').trim()
  if (!name) throw new Error('캐릭터 이름을 찾을 수 없습니다')

  const rawChars = Array.isArray(parsed.characters) ? parsed.characters : [parsed]
  const charTags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 15).map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15) : []
  const scenarioDescription = (parsed.scenarioNote?.trim() || '').slice(0, 5000)
  const firstName = String(rawChars[0]?.name ?? '').trim() || ogTitle || '캐릭터'
  const isMulti = rawChars.length > 1
  const title = (parsed.title?.trim() || `${firstName}${isMulti ? ' 외' : ''}와의 대화`).slice(0, 200)

  // 캐릭터 먼저 생성 (대표 이미지는 멜팅 og:image를 그대로 사용)
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
          ...(i === 0 && ogImage ? { avatarUrl: ogImage } : {}),
        },
      })
    )
  )

  // 대화 생성
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
      characters: { create: createdChars.map((c, i) => ({ characterId: c.id, turnOrder: i })) },
    },
  })

  // 컬렉션 생성 — conversationId로 대화와 연결 (제목 변경/삭제 연동의 기준)
  const collection = await prisma.characterCollection.create({
    data: { title, sourceUrl: url, userId, conversationId: conversation.id },
  })

  // 캐릭터에 collectionId 연결
  await prisma.character.updateMany({
    where: { id: { in: createdChars.map(c => c.id) } },
    data: { collectionId: collection.id },
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

async function importFromWhif(url: string, userId: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5',
    },
  })
  console.log('[whif-import] fetch status:', res.status, 'content-type:', res.headers.get('content-type'))
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)

  const html = await res.text()
  console.log('[whif-import] html length:', html.length)

  const visibleText = cleanWhifText(stripHtml(html))
  const flightText = cleanWhifText(extractNextFlightText(html))
  const text = (visibleText.length >= 300 ? visibleText : flightText).slice(0, 12000)

  if (text.length < 100) throw new Error('Whif 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')

  const systemPrompt = '당신은 텍스트에서 롤플레잉 캐릭터 정보를 추출하는 파서입니다. 반드시 JSON만 반환하세요.'
  const userPrompt = `아래 텍스트에서 등장하는 모든 캐릭터 정보를 추출해 JSON으로 반환하세요. 캐릭터가 여러 명이면 모두 포함하세요.

텍스트:
${text}

반환 형식 (마크다운 없이 JSON만):
{"characters":[{"name":"캐릭터 이름","gender":"남성 또는 여성 또는 빈 문자열","additionalInfo":"나이·외모·직업·성격·배경 등을 자연스럽게 서술","openingMessage":"첫 메시지/인트로가 있으면 입력, 없으면 빈 문자열","exampleDialogues":"예시 대화가 있으면 입력, 없으면 빈 문자열"}],"tags":["태그1","태그2"],"scenarioNote":"줄거리/세계관 설명","title":"작품 제목 또는 주인공 이름"}

규칙:
- characters 배열에 텍스트에 나오는 모든 캐릭터 포함 (한 명이어도 배열로)
- tags는 # 기호로 표시된 태그에서 최대 10개, # 없이 문자열만
- 정보가 없는 필드는 빈 문자열`

  let parsed: any
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt, 4096)
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : raw)
      break
    } catch (e: any) {
      console.log('[whif-import] parse error attempt', i, ':', e?.message)
      if (i === 1) throw new Error('AI 파싱에 실패했습니다')
    }
  }

  const firstParsedChar = Array.isArray(parsed.characters) ? parsed.characters[0] : parsed
  const name = String(firstParsedChar?.name ?? parsed.name ?? '').trim()
  if (!name) throw new Error('캐릭터 이름을 찾을 수 없습니다')

  const rawChars = Array.isArray(parsed.characters) ? parsed.characters : [parsed]
  const characterNames = rawChars.map((c: any) => String(c?.name ?? '').trim()).filter(Boolean)
  const introText = extractZetaIntroText(text, characterNames)
  const charTags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 15).map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15) : []
  const scenarioDescription = (parsed.scenarioNote?.trim() || '').slice(0, 5000)
  const firstName = String(rawChars[0]?.name ?? '').trim() || '캐릭터'
  const isMulti = rawChars.length > 1
  const title = (parsed.title?.trim() || `${firstName}${isMulti ? ' 외' : ''}와의 대화`).slice(0, 200)

  // 캐릭터 먼저 생성
  const createdChars = await Promise.all(
    rawChars.map((c: any, i: number) =>
      prisma.character.create({
        data: {
          name: String(c.name ?? `캐릭터${i + 1}`).trim().slice(0, 100),
          gender: String(c.gender ?? '').slice(0, 20),
          tags: charTags,
          additionalInfo: String(c.additionalInfo ?? '').trim().slice(0, 10000),
          exampleDialogues: String(c.exampleDialogues ?? '').slice(0, 20000),
          openingMessage: String(i === 0 && introText ? introText : c.openingMessage ?? '').slice(0, 5000),
          isAutoCreated: true,
          creatorId: userId,
        },
      })
    )
  )

  // 대화 생성
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
      characters: { create: createdChars.map((c, i) => ({ characterId: c.id, turnOrder: i })) },
    },
  })

  // 컬렉션 생성
  const collection = await prisma.characterCollection.create({
    data: { title, sourceUrl: url, userId, conversationId: conversation.id },
  })

  // 캐릭터에 collectionId 연결
  await prisma.character.updateMany({
    where: { id: { in: createdChars.map(c => c.id) } },
    data: { collectionId: collection.id },
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

function matchesHost(url: string, ...domains: string[]): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return domains.some(d => hostname === d || hostname.endsWith(`.${d}`))
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { url } = await req.json()
  if (!url?.trim()) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })

  if (matchesHost(url, 'zeta-ai.io')) {
    try {
      const result = await importFromZeta(url.trim(), userId)
      return NextResponse.json(result, { status: 201 })
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? '제타 가져오기 실패' }, { status: 400 })
    }
  }

  if (matchesHost(url, 'melting.chat')) {
    try {
      const result = await importFromMelting(url.trim(), userId)
      return NextResponse.json(result, { status: 201 })
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? '멜팅 가져오기 실패' }, { status: 400 })
    }
  }

  if (matchesHost(url, 'whif.io', 'whif.club')) {
    try {
      const result = await importFromWhif(url.trim(), userId)
      return NextResponse.json(result, { status: 201 })
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? 'Whif 가져오기 실패' }, { status: 400 })
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
