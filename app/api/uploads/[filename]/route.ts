import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  try {
    await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '')
  } catch {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const filename = path.basename(params.filename)
  const filePath = path.join(process.cwd(), 'uploads', 'avatars', filename)
  try {
    const buffer = await readFile(filePath)
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
