import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const token = req.cookies.get('accessToken')?.value
  if (token && !req.headers.get('authorization')) {
    const headers = new Headers(req.headers)
    headers.set('authorization', `Bearer ${token}`)
    return NextResponse.next({ request: { headers } })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
