import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const images = await prisma.uploadedImage.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(images)
}
