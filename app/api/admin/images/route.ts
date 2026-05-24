import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const images = await prisma.uploadedImage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(images)
}
