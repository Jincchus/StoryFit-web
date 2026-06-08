import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const preset = await prisma.promptPreset.findUnique({ where: { id: params.id } })
  if (!preset || preset.userId !== userId) {
    return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 100)
  if (typeof body.content === 'string') data.content = body.content.slice(0, 8000)
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (typeof body.order === 'number') data.order = Math.round(body.order)

  const updated = await prisma.promptPreset.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const preset = await prisma.promptPreset.findUnique({ where: { id: params.id } })
  if (!preset || preset.userId !== userId) {
    return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 404 })
  }

  await prisma.promptPreset.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
