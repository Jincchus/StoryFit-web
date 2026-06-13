import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 매시간 호스트 크론에서 호출:
// 0 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3002/api/cron/comeback-push
// 마지막 활동이 24~25시간 전인 대화를 찾아, 유저당 1건 재회 푸시를 보낸다.
// (1시간 윈도우라 크론이 매시간 돌면 대화당 정확히 1회 발송)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const now = Date.now()
  const from = new Date(now - 25 * 3600 * 1000)
  const to = new Date(now - 24 * 3600 * 1000)

  const convs = await prisma.conversation.findMany({
    where: {
      updatedAt: { gte: from, lt: to },
      isArchived: false,
      rootConversationId: null,
      mode: { not: 'assistant' },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      characters: {
        orderBy: { turnOrder: 'asc' },
        take: 1,
        select: { character: { select: { name: true } } },
      },
    },
  })
  if (convs.length === 0) return NextResponse.json({ sent: 0 })

  // 유저당 가장 최근 대화 1건만 — 푸시 스팸 방지
  const convByUser = new Map<string, typeof convs[number]>()
  for (const c of convs) {
    if (c.userId && !convByUser.has(c.userId)) convByUser.set(c.userId, c)
  }

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: Array.from(convByUser.keys()) } },
  })
  if (tokens.length === 0) return NextResponse.json({ sent: 0 })

  const messages: { to: string; title: string; body: string; data: { url: string } }[] = []
  for (const t of tokens) {
    const conv = convByUser.get(t.userId)
    const charName = conv?.characters[0]?.character.name
    if (!conv || !charName) continue
    messages.push({
      to: t.token,
      title: charName,
      body: `${charName}이(가) 당신을 기다리고 있어요. 💭`,
      data: { url: `/conversations/${conv.id}` },
    })
  }
  if (messages.length === 0) return NextResponse.json({ sent: 0 })

  let sent = 0
  const invalidTokens: string[] = []
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
      const json = await res.json()
      const results: { status: string; details?: { error?: string } }[] = json.data ?? []
      results.forEach((r, idx) => {
        if (r.status === 'ok') sent++
        else if (r.details?.error === 'DeviceNotRegistered') invalidTokens.push(chunk[idx].to)
      })
    } catch (err) {
      console.error('[comeback-push] Expo push 전송 실패:', err)
    }
  }

  if (invalidTokens.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } })
  }

  return NextResponse.json({ sent, removed: invalidTokens.length })
}
