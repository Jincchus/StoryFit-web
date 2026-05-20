import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'avatars')
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

async function authenticate(req: NextRequest) {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const isShared = formData.get('isShared') === 'true'

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: '이미지 파일만 업로드 가능합니다.' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '5MB 이하 파일만 업로드 가능합니다.' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filename = `${randomUUID()}.${ext}`

  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()))

  const record = await prisma.uploadedImage.create({
    data: { filename, isShared, uploaderId: userId },
  })

  return NextResponse.json({ url: `/api/uploads/${filename}`, id: record.id }, { status: 201 })
}

export async function GET() {
  const images = await prisma.uploadedImage.findMany({
    where: { isShared: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(images.map(img => ({ id: img.id, url: `/api/uploads/${img.filename}` })))
}
