import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'


export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const personas = await prisma.userPersona.findMany({ where: { userId } })
  return NextResponse.json(personas)

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })

  const persona = await prisma.userPersona.create({
    data: { userId, name: body.name, gender: body.gender ?? '', description: body.description ?? '', additionalInfo: body.additionalInfo ?? '' },
  })
  return NextResponse.json(persona, { status: 201 })
}
