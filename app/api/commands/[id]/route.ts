import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { validateCommandName } from '@/lib/commands'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const existing = await prisma.userCommand.findUnique({ where: { id: params.id } })
  if (!existing || existing.userId !== userId) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 })
  const { name, instruction, description } = await req.json()
  const data: { name?: string; instruction?: string; description?: string } = {}
  if (name !== undefined) {
    const nameErr = validateCommandName(name)
    if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 })
    if (name.trim() !== existing.name) {
      const dup = await prisma.userCommand.findUnique({ where: { userId_name: { userId, name: name.trim() } } })
      if (dup) return NextResponse.json({ error: '같은 이름의 커맨드가 이미 있습니다.' }, { status: 400 })
    }
    data.name = name.trim()
  }
  if (instruction !== undefined) {
    if (!instruction.trim()) return NextResponse.json({ error: '지시문을 입력하세요.' }, { status: 400 })
    data.instruction = instruction.trim()
  }
  if (description !== undefined) data.description = description.trim()
  const updated = await prisma.userCommand.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const existing = await prisma.userCommand.findUnique({ where: { id: params.id } })
  if (!existing || existing.userId !== userId) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 })
  await prisma.userCommand.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
