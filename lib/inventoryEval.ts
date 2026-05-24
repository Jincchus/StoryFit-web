import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai/gemini'
import type { InventoryItem } from '@/types'

function extractJson(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/)
  return match ? match[0] : raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
}

export function triggerInventoryEvaluation(
  convId: string,
  userMsg: string,
  aiMsg: string,
  currentInventory: InventoryItem[],
): void {
  evalAndUpdate(convId, userMsg, aiMsg, currentInventory).catch(err =>
    console.error('[inventoryEval] error:', err),
  )
}

async function evalAndUpdate(
  convId: string,
  userMsg: string,
  aiMsg: string,
  currentInventory: InventoryItem[],
): Promise<void> {
  const inventoryList = currentInventory.length > 0
    ? currentInventory.map(i => `${i.name}(${i.qty}개)`).join(', ')
    : '없음'

  const systemPrompt = '당신은 인터랙티브 스토리의 인벤토리 관리자입니다. 스토리 교환을 보고 아이템 변화를 JSON으로만 반환합니다.'
  const userPrompt = `다음 스토리 교환을 보고 아이템 변화를 평가하세요.

유저 행동: ${userMsg}
스토리 전개: ${aiMsg.slice(0, 400)}

현재 인벤토리: ${inventoryList}

규칙:
- 획득한 아이템은 "add" 배열에, 소모·분실한 아이템은 "remove" 배열에 포함
- 변화가 없으면 두 배열 모두 빈 배열
- 아이템 이름은 스토리 맥락에 맞게 구체적으로
- JSON만 반환. 예: {"add":[{"name":"마법 열쇠","qty":1,"description":"낡은 탑의 문을 열 수 있다"}],"remove":[{"name":"횃불","qty":1}]}
- 변화 없으면: {"add":[],"remove":[]}`

  try {
    const raw = await generateText(systemPrompt, userPrompt)
    const jsonStr = extractJson(raw)
    const delta: { add: InventoryItem[]; remove: { name: string; qty: number }[] } = JSON.parse(jsonStr)

    let updated = [...currentInventory]

    for (const item of delta.remove ?? []) {
      const idx = updated.findIndex(i => i.name === item.name)
      if (idx === -1) continue
      updated[idx] = { ...updated[idx], qty: updated[idx].qty - item.qty }
      if (updated[idx].qty <= 0) updated.splice(idx, 1)
    }

    for (const item of delta.add ?? []) {
      const idx = updated.findIndex(i => i.name === item.name)
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + item.qty }
      } else {
        updated.push({ name: item.name, qty: item.qty, description: item.description })
      }
    }

    await prisma.conversation.update({
      where: { id: convId },
      data: { inventory: updated },
    })
  } catch {
    // silent fail — inventory eval is non-critical
  }
}
