import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { brokerGet, brokerSubscribe } from '@/lib/streamBroker'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string; msgId: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({ where: { id: params.id }, select: { userId: true } })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const msg = await prisma.message.findUnique({ where: { id: params.msgId }, select: { conversationId: true } })
  if (!msg || msg.conversationId !== params.id) return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 })

  const initial = brokerGet(params.msgId)
  if (!initial) return NextResponse.json({ error: '진행 중인 스트림이 없습니다.' }, { status: 404 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      let lastLen = 0
      let closed = false
      let unsub = () => {}
      let heartbeat: ReturnType<typeof setInterval> | null = null

      const cleanup = () => {
        if (closed) return
        closed = true
        unsub()
        if (heartbeat) clearInterval(heartbeat)
        try { controller.close() } catch {}
      }

      const push = (payload: object) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)) } catch { cleanup() }
      }

      const sendState = () => {
        const cur = brokerGet(params.msgId)
        if (!cur) { push({ done: true }); cleanup(); return }
        if (cur.text.length > lastLen) {
          push({ chunk: cur.text.slice(lastLen) })
          lastLen = cur.text.length
        }
        if (cur.done) {
          push({ done: true, error: cur.errored })
          cleanup()
        }
      }

      push({ snapshot: initial.text })
      lastLen = initial.text.length
      if (initial.done) {
        push({ done: true, error: initial.errored })
        cleanup()
        return
      }

      unsub = brokerSubscribe(params.msgId, sendState)
      heartbeat = setInterval(() => {
        if (closed) return
        try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { cleanup() }
      }, 15000)
      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
