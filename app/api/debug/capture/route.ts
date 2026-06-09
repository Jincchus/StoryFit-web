import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { renderWhifRaw, renderZetaRaw, matchesHost } from '@/lib/import/capture'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url 파라미터 필요' }, { status: 400 })

  if (matchesHost(url, 'zeta-ai.io')) {
    const raw = await renderZetaRaw(url)
    return NextResponse.json(raw)
  }

  const raw = await renderWhifRaw(url)
  return NextResponse.json(raw)
}
