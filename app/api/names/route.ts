import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const names = await prisma.randomName.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json(names.map(n => ({ name: n.name, category: n.category, gender: n.gender })))
}
