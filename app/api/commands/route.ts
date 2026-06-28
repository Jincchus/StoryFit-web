import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { validateCommandName } from '@/lib/commands'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const commands = await prisma.userCommand.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(commands)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { name, instruction, description } = await req.json()
  const nameErr = validateCommandName(name)
  if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 })
  if (!instruction?.trim()) return NextResponse.json({ error: '지시문을 입력하세요.' }, { status: 400 })
  const dup = await prisma.userCommand.findUnique({ where: { userId_name: { userId, name: name.trim() } } })
  if (dup) return NextResponse.json({ error: '같은 이름의 커맨드가 이미 있습니다.' }, { status: 400 })
  const created = await prisma.userCommand.create({
    data: { userId, name: name.trim(), instruction: instruction.trim(), description: (description ?? '').trim() },
  })
  return NextResponse.json(created, { status: 201 })
}
