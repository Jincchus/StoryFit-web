import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

export async function authenticateAdmin(req: NextRequest): Promise<string | null> {
  try {
    const userId = await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '')
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, isActive: true } })
    if (!user?.isAdmin || !user.isActive) return null
    return userId
  } catch { return null }
}

export async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const token = getTokenFromHeader(req.headers.get('authorization'))
  if (!token) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    const userId = await verifyAccessToken(token)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, isActive: true } })
    if (!user?.isAdmin || !user.isActive) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    return { userId }
  } catch {
    return NextResponse.json({ error: '인증이 만료되었습니다.' }, { status: 401 })
  }
}
