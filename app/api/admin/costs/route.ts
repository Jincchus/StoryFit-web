import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

const INPUT_PER_M = 1.25
const OUTPUT_PER_M = 10.00
const KRW_PER_USD = 1380

function calcCost(input: number, output: number) {
  return (input / 1_000_000) * INPUT_PER_M + (output / 1_000_000) * OUTPUT_PER_M
}

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [totals, thisMonth, lastMonth, daily, monthly] = await Promise.all([
    prisma.message.aggregate({
      where: { role: 'assistant' },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    }),
    prisma.message.aggregate({
      where: { role: 'assistant', createdAt: { gte: thisMonthStart } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    }),
    prisma.message.aggregate({
      where: { role: 'assistant', createdAt: { gte: lastMonthStart, lt: thisMonthStart } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    }),
    prisma.$queryRaw<{ date: string; input: bigint; output: bigint; count: bigint }[]>`
      SELECT
        DATE("createdAt" AT TIME ZONE 'Asia/Seoul') AS date,
        SUM("inputTokens") AS input,
        SUM("outputTokens") AS output,
        COUNT(*) AS count
      FROM "Message"
      WHERE role = 'assistant'
      GROUP BY DATE("createdAt" AT TIME ZONE 'Asia/Seoul')
      ORDER BY date DESC
      LIMIT 30
    `,
    prisma.$queryRaw<{ month: string; input: bigint; output: bigint; count: bigint }[]>`
      SELECT
        TO_CHAR("createdAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
        SUM("inputTokens") AS input,
        SUM("outputTokens") AS output,
        COUNT(*) AS count
      FROM "Message"
      WHERE role = 'assistant'
      GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `,
  ])

  const todayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const thisMonthInput = Number(thisMonth._sum.inputTokens ?? 0)
  const thisMonthOutput = Number(thisMonth._sum.outputTokens ?? 0)
  const thisMonthCost = calcCost(thisMonthInput, thisMonthOutput)
  const projectedCost = todayOfMonth > 0 ? (thisMonthCost / todayOfMonth) * daysInMonth : 0

  const toRow = (d: { input: bigint; output: bigint; count: bigint }) => {
    const inp = Number(d.input)
    const out = Number(d.output)
    const costUsd = calcCost(inp, out)
    return { inputTokens: inp, outputTokens: out, count: Number(d.count), costUsd: Math.round(costUsd * 100000) / 100000, costKrw: Math.round(costUsd * KRW_PER_USD) }
  }

  return NextResponse.json({
    krwPerUsd: KRW_PER_USD,
    pricing: { inputPerM: INPUT_PER_M, outputPerM: OUTPUT_PER_M, model: 'Gemini 2.5 Pro' },
    total: { ...toRow({ input: BigInt(totals._sum.inputTokens ?? 0), output: BigInt(totals._sum.outputTokens ?? 0), count: BigInt(totals._count.id) }) },
    thisMonth: {
      ...toRow({ input: BigInt(thisMonth._sum.inputTokens ?? 0), output: BigInt(thisMonth._sum.outputTokens ?? 0), count: BigInt(thisMonth._count.id) }),
      projectedCostUsd: Math.round(projectedCost * 100000) / 100000,
      projectedCostKrw: Math.round(projectedCost * KRW_PER_USD),
      daysElapsed: todayOfMonth,
      daysInMonth,
    },
    lastMonth: toRow({ input: BigInt(lastMonth._sum.inputTokens ?? 0), output: BigInt(lastMonth._sum.outputTokens ?? 0), count: BigInt(lastMonth._count.id) }),
    monthly: monthly.map(m => ({ month: String(m.month), ...toRow(m) })),
    daily: daily.map(d => ({ date: String(d.date), ...toRow(d) })),
  })
}
