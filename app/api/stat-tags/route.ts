import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tags = await prisma.statTag.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(tags.map(t => t.name))
}
