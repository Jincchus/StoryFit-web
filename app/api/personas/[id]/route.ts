import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

async function getOwnedPersona(userId: string, id: string) {
  const persona = await prisma.userPersona.findUnique({ where: { id } })
  if (!persona) return null
  if (persona.userId !== userId) return null
  return persona
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const persona = await getOwnedPersona(userId, params.id)
  if (!persona) return NextResponse.json({ error: '페르소나를 찾을 수 없습니다.' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.userPersona.update({ where: { id: params.id }, data: body })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const persona = await getOwnedPersona(userId, params.id)
  if (!persona) return NextResponse.json({ error: '페르소나를 찾을 수 없습니다.' }, { status: 404 })

  await prisma.userPersona.delete({ where: { id: params.id } })
  return new NextResponse(null, { status: 204 })
}
