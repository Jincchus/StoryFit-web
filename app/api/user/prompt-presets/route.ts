import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { isPromptPresetMode } from '@/lib/promptPresets'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const presets = await prisma.promptPreset.findMany({
    where: { userId },
    orderBy: [{ mode: 'asc' }, { order: 'asc' }],
  })
  return NextResponse.json(presets)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  if (!isPromptPresetMode(body.mode)) {
    return NextResponse.json({ error: '잘못된 모드입니다.' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''
  const content = typeof body.content === 'string' ? body.content.slice(0, 8000) : ''
  if (!name || !content.trim()) {
    return NextResponse.json({ error: '이름과 내용을 입력해주세요.' }, { status: 400 })
  }

  const count = await prisma.promptPreset.count({ where: { userId, mode: body.mode } })
  if (count >= 20) {
    return NextResponse.json({ error: '모드별로 최대 20개까지 등록할 수 있습니다.' }, { status: 400 })
  }

  const preset = await prisma.promptPreset.create({
    data: { userId, mode: body.mode, name, content, enabled: true, order: count },
  })
  return NextResponse.json(preset, { status: 201 })
}
