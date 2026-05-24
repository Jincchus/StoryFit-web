import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'
import { unlink } from 'fs/promises'
import path from 'path'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const { isShared } = await req.json()
  const updated = await prisma.uploadedImage.update({
    where: { id: params.id },
    data: { isShared },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const image = await prisma.uploadedImage.findUnique({ where: { id: params.id } })
  if (!image) return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 })

  await prisma.uploadedImage.delete({ where: { id: params.id } })

  const filePath = path.join(process.cwd(), 'uploads', 'avatars', image.filename)
  await unlink(filePath).catch(() => {})

  return NextResponse.json({ ok: true })
}
