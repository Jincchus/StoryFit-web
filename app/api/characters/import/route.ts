import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'
import { parsePngTavernCard, buildSystemPromptFromCard } from '@/lib/tavernCard'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'avatars')

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: '20MB 이하 파일만 가능합니다.' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const card = parsePngTavernCard(buf)
  if (!card) return NextResponse.json({ error: '유효한 Tavern Card PNG가 아닙니다.' }, { status: 400 })

  const name = card.name?.trim()
  if (!name) return NextResponse.json({ error: '카드에 이름이 없습니다.' }, { status: 400 })

  const systemPrompt = buildSystemPromptFromCard(card)
  if (!systemPrompt.trim()) return NextResponse.json({ error: '캐릭터 설명이 없습니다.' }, { status: 400 })

  const filename = `${randomUUID()}.png`
  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(path.join(UPLOAD_DIR, filename), buf)
  await prisma.uploadedImage.create({ data: { filename, isShared: false, uploaderId: userId } })

  const character = await prisma.character.create({
    data: {
      name,
      description: card.description?.trim() ?? '',
      systemPrompt,
      exampleDialogues: card.mes_example?.trim() ?? '',
      avatarUrl: `/api/uploads/${filename}`,
      creatorId: userId,
    },
  })

  return NextResponse.json(character, { status: 201 })
}

async function authenticate(req: NextRequest) {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}
