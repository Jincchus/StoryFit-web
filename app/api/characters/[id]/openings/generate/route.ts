import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'
import type { SafetyLevel } from '@/types'

// 멜팅 등에서 가져온 "첫 장면" 중 미해금 도입부는 미리보기(앞부분)까지만 있다 —
// 제목 + 미리보기와 기본 도입부의 문체를 참고해 AI가 나머지를 이어 써서 완성한다.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { openingId } = await req.json().catch(() => ({}))
  if (!openingId) return NextResponse.json({ error: 'openingId가 필요합니다.' }, { status: 400 })

  const character = await prisma.character.findUnique({ where: { id: params.id } })
  if (!character) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
  if (character.creatorId !== userId) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  const openings = Array.isArray(character.openingMessages) ? (character.openingMessages as any[]) : []
  const target = openings.find(o => o?.id === openingId)
  if (!target) return NextResponse.json({ error: '도입부를 찾을 수 없습니다.' }, { status: 404 })

  const referenceOpening = openings.find(o => o?.id !== openingId)?.content || character.openingMessage || ''

  const systemPrompt = '당신은 인터랙티브 노벨의 "첫 장면"을 작성하는 작가입니다. 주어진 제목과 미리보기, 참고 문체를 바탕으로 완결된 첫 장면을 이어서 작성합니다. 결과는 본문 텍스트만 반환하고, 설명이나 따옴표로 감싸지 않습니다.'
  const userPrompt = `[캐릭터 이름]
${character.name}

[캐릭터 설정]
${(character.additionalInfo || '').slice(0, 2000)}

[참고 문체 — 기존 기본 도입부]
${referenceOpening.slice(0, 3000)}

[이어서 완성할 도입부]
제목: ${target.title || ''}
미리보기:
${String(target.content || '').slice(0, 1500)}

지침:
- 위 미리보기로 시작된 장면을 자연스럽게 이어서, 하나의 완결된 "첫 장면"으로 작성하라.
- 문체는 [참고 문체]와 동일하게 맞춘다: 행동·묘사는 *이렇게* 별표로 감싸고, 대화는 "이렇게" 그대로 표기한다. <desc>, <talk> 같은 태그는 절대 쓰지 않는다.
- {유저}, {캐릭터}, [유저] 같은 placeholder가 있다면 그대로 유지한다.
- 분량은 참고 문체와 비슷하게 작성한다.
- 미리보기 내용을 그대로 반복하지 말고, 그 다음부터 자연스럽게 이어 써라.`

  let generated = ''
  try {
    generated = await generateText(systemPrompt, userPrompt, 2048, character.safetyLevel as SafetyLevel)
  } catch {
    return NextResponse.json({ error: '생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 })
  }
  if (!generated.trim()) return NextResponse.json({ error: '생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 })

  const content = `${String(target.content || '').trim()}\n\n${generated.trim()}`
  const updatedOpenings = openings.map(o => o?.id === openingId ? { ...o, content } : o)

  await prisma.character.update({
    where: { id: params.id },
    data: { openingMessages: updatedOpenings },
  })

  return NextResponse.json({ openingMessages: updatedOpenings })
}
