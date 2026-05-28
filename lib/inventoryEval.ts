import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai/gemini'
import type { InventoryItem } from '@/types'

function extractJson(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/)
  return match ? match[0] : raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
}

function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[a.length][b.length]
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const threshold = Math.max(1, Math.floor(Math.min(na.length, nb.length) * 0.3))
  return editDistance(na, nb) <= threshold
}

export function triggerInventoryEvaluation(
  convId: string,
  msgId: string,
  userMsg: string,
  aiMsg: string,
  currentInventory: InventoryItem[],
): void {
  evalAndUpdate(convId, msgId, userMsg, aiMsg, currentInventory).catch(err =>
    console.error('[inventoryEval] error:', err),
  )
}

async function evalAndUpdate(
  convId: string,
  msgId: string,
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
- 이미 인벤토리에 있는 아이템을 단순 언급한 것은 변화로 보지 않음
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
      const idx = updated.findIndex(i => fuzzyMatch(i.name, item.name))
      if (idx === -1) continue
      updated[idx] = { ...updated[idx], qty: updated[idx].qty - item.qty }
      if (updated[idx].qty <= 0) updated.splice(idx, 1)
    }

    for (const item of delta.add ?? []) {
      const idx = updated.findIndex(i => fuzzyMatch(i.name, item.name))
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + item.qty }
      } else {
        updated.push({ name: item.name, qty: item.qty, description: item.description })
      }
    }

    await Promise.all([
      prisma.conversation.update({ where: { id: convId }, data: { inventory: updated } }),
      prisma.message.update({ where: { id: msgId }, data: { inventoryDelta: delta } }),
    ])
  } catch {
    // silent fail — inventory eval is non-critical
  }
}

export async function rollbackInventoryDelta(
  convId: string,
  delta: { add: InventoryItem[]; remove: { name: string; qty: number }[] },
  currentInventory: InventoryItem[],
): Promise<InventoryItem[]> {
  let updated = [...currentInventory]

  for (const item of delta.add ?? []) {
    const idx = updated.findIndex(i => fuzzyMatch(i.name, item.name))
    if (idx === -1) continue
    updated[idx] = { ...updated[idx], qty: updated[idx].qty - item.qty }
    if (updated[idx].qty <= 0) updated.splice(idx, 1)
  }

  for (const item of delta.remove ?? []) {
    const idx = updated.findIndex(i => fuzzyMatch(i.name, item.name))
    if (idx !== -1) {
      updated[idx] = { ...updated[idx], qty: updated[idx].qty + item.qty }
    } else {
      updated.push({ name: item.name, qty: item.qty })
    }
  }

  await prisma.conversation.update({ where: { id: convId }, data: { inventory: updated } })
  return updated
}
