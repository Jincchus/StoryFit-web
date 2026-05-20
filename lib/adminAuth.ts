import { NextRequest } from 'next/server'
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
