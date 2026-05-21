import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

const GEMINI_FLASH_INPUT_PER_M = 0.15
const GEMINI_FLASH_OUTPUT_PER_M = 0.60

export async function GET(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const [totals, daily] = await Promise.all([
    prisma.message.aggregate({
      where: { role: 'assistant' },
      _sum: { inputTokens: true, outputTokens: true },
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
  ])

  const totalInput = Number(totals._sum.inputTokens ?? 0)
  const totalOutput = Number(totals._sum.outputTokens ?? 0)
  const totalCostUsd = (totalInput / 1_000_000) * GEMINI_FLASH_INPUT_PER_M
    + (totalOutput / 1_000_000) * GEMINI_FLASH_OUTPUT_PER_M

  return NextResponse.json({
    total: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      costUsd: Math.round(totalCostUsd * 10000) / 10000,
    },
    daily: daily.map(d => ({
      date: String(d.date),
      inputTokens: Number(d.input),
      outputTokens: Number(d.output),
      count: Number(d.count),
      costUsd: Math.round(
        ((Number(d.input) / 1_000_000) * GEMINI_FLASH_INPUT_PER_M
          + (Number(d.output) / 1_000_000) * GEMINI_FLASH_OUTPUT_PER_M) * 10000
      ) / 10000,
    })),
  })
}
