import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { unlink } from 'fs/promises'
import path from 'path'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const { isShared } = await req.json()
  const updated = await prisma.uploadedImage.update({
    where: { id: params.id },
    data: { isShared },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const image = await prisma.uploadedImage.findUnique({ where: { id: params.id } })
  if (!image) return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 })

  await prisma.uploadedImage.delete({ where: { id: params.id } })

  const filePath = path.join(process.cwd(), 'uploads', 'avatars', image.filename)
  await unlink(filePath).catch(() => {})

  return NextResponse.json({ ok: true })
}
