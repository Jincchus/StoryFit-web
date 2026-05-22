import { NextRequest } from 'next/server'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

export async function authenticate(req: NextRequest): Promise<string | null> {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}
