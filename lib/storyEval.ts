import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai/gemini'
import type { StatEntry, InventoryItem } from '@/types'

// ── JSON 추출 헬퍼 ──────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/)
  return match ? match[0] : raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
}

// ── 아이템 퍼지 매칭 ────────────────────────────────────────────────────────

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
  return editDistance(na, nb) <= Math.max(1, Math.floor(Math.min(na.length, nb.length) * 0.3))
}

// ── 게이트: 변화 가능성이 없으면 스킵 ───────────────────────────────────────

const STAT_KEYWORDS = /호감|신뢰|친밀|관계|감정|분노|두려|공포|행복|슬픔|체력|마나|경험|레벨|포인트|점수|수치|stat|level|exp|hp|mp/i
const INVENTORY_KEYWORDS = /획득|얻|줬|받|건네|떨어뜨|잃|잃어|소모|사용|아이템|물건|검|칼|지팡이|방패|갑옷|포션|열쇠|동전|금화|item|obtain|drop|lose|pick/i

function needsEval(userMsg: string, aiMsg: string, hasStats: boolean, hasInventory: boolean): { stats: boolean; inventory: boolean } {
  const text = userMsg + ' ' + aiMsg.slice(0, 600)
  return {
    stats: hasStats && STAT_KEYWORDS.test(text),
    inventory: hasInventory && INVENTORY_KEYWORDS.test(text),
  }
}

// ── 단일 통합 평가 ──────────────────────────────────────────────────────────

interface StoryEvalOptions {
  convId: string
  msgId: string
  userMsg: string
  aiMsg: string
  currentStats: StatEntry[] | null
  currentInventory: InventoryItem[] | null
  statsEnabled: boolean
  inventoryEnabled: boolean
}

interface StoryEvalResult {
  statsDelta: Record<string, number>
  inventoryDelta: { add: InventoryItem[]; remove: { name: string; qty: number }[] }
  statusTimeline: string
}

async function evalStory(opts: StoryEvalOptions): Promise<StoryEvalResult | null> {
  const { stats: needsStats, inventory: needsInventory } = needsEval(
    opts.userMsg, opts.aiMsg,
    opts.statsEnabled && (opts.currentStats?.length ?? 0) > 0,
    opts.inventoryEnabled,
  )

  // 모두 스킵 조건일 때도 statusTimeline은 항상 갱신
  const statsSection = needsStats && opts.currentStats
    ? `\n현재 스탯: ${opts.currentStats.map(s => `${s.name}(현재:${s.value})`).join(', ')}`
    : ''
  const inventorySection = needsInventory && opts.currentInventory
    ? `\n현재 인벤토리: ${opts.currentInventory.length > 0 ? opts.currentInventory.map(i => `${i.name}(${i.qty}개)`).join(', ') : '없음'}`
    : ''

  const systemPrompt = '당신은 인터랙티브 스토리의 상태 관리자입니다. 스토리 교환을 분석해 JSON만 반환합니다.'
  const userPrompt = `아래 스토리 교환을 분석해 JSON으로 반환하세요.

유저 행동: ${opts.userMsg}
스토리 전개: ${opts.aiMsg.slice(0, 1200)}
${statsSection}${inventorySection}

반환 형식 (JSON만, 설명 없이):
{
  "stats": {},
  "inventory": { "add": [], "remove": [] },
  "statusTimeline": "현재 씬 상태를 3~5줄 불릿으로 요약 (장소·시간·동석인물·핵심상황)"
}

규칙:
- stats: 변화 있는 스탯만 포함 (변화량 -10~+10 정수). 스탯 평가 대상 아니면 {}
- inventory.add: 획득 아이템. inventory.remove: 소모·분실 아이템. 변화 없으면 빈 배열
- statusTimeline: 반드시 작성. 현재 씬 상태를 간결하게 불릿(•) 형식으로`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt)
      const parsed: any = JSON.parse(extractJson(raw))
      return {
        statsDelta: (needsStats && parsed.stats) ? parsed.stats : {},
        inventoryDelta: (needsInventory && parsed.inventory) ? parsed.inventory : { add: [], remove: [] },
        statusTimeline: typeof parsed.statusTimeline === 'string' ? parsed.statusTimeline.trim() : '',
      }
    } catch {
      if (attempt === 1) return null
    }
  }
  return null
}

async function applyEval(opts: StoryEvalOptions, result: StoryEvalResult): Promise<void> {
  const updates: Promise<unknown>[] = []

  // 스탯 업데이트
  if (opts.statsEnabled && opts.currentStats && Object.keys(result.statsDelta).length > 0) {
    const updatedStats = opts.currentStats.map(s => {
      const delta = result.statsDelta[s.name] ?? 0
      return { ...s, value: Math.max(s.min, Math.min(s.max, s.value + delta)) }
    })
    updates.push(prisma.conversation.update({ where: { id: opts.convId }, data: { statsConfig: updatedStats } }))
    updates.push(prisma.message.update({ where: { id: opts.msgId }, data: { statsDelta: result.statsDelta } }))
  }

  // 인벤토리 업데이트
  if (opts.inventoryEnabled && opts.currentInventory) {
    const { add, remove } = result.inventoryDelta
    if (add.length > 0 || remove.length > 0) {
      let updated = [...opts.currentInventory]
      for (const item of remove ?? []) {
        const idx = updated.findIndex(i => fuzzyMatch(i.name, item.name))
        if (idx === -1) continue
        updated[idx] = { ...updated[idx], qty: updated[idx].qty - item.qty }
        if (updated[idx].qty <= 0) updated.splice(idx, 1)
      }
      for (const item of add ?? []) {
        const idx = updated.findIndex(i => fuzzyMatch(i.name, item.name))
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], qty: updated[idx].qty + item.qty }
        } else {
          updated.push({ name: item.name, qty: item.qty, description: item.description })
        }
      }
      updates.push(prisma.conversation.update({ where: { id: opts.convId }, data: { inventory: updated } }))
      updates.push(prisma.message.update({ where: { id: opts.msgId }, data: { inventoryDelta: result.inventoryDelta } }))
    }
  }

  // statusTimeline 업데이트 (항상)
  if (result.statusTimeline) {
    updates.push(prisma.conversation.update({ where: { id: opts.convId }, data: { statusTimeline: result.statusTimeline } }))
  }

  await Promise.all(updates)
}

export function triggerStoryEvaluation(opts: StoryEvalOptions): void {
  ;(async () => {
    const result = await evalStory(opts)
    if (result) await applyEval(opts, result)
  })().catch(err => console.error('[storyEval] error:', err))
}

// ── 롤플레이/소설 모드 씬 상태 자동 추적 ─────────────────────────────────────

const STATE_KEYWORDS = /옷|의상|입고|벗고|갈아입|착용|잠옷|교복|드레스|코트|시간|아침|오전|점심|오후|저녁|밤|새벽|자정|이동|들어|나와|방|집|밖|거리|카페|학교|사무실|arrived|wearing|changed|morning|evening|night|left|entered/i

export function triggerStateTracking(convId: string, userMsg: string, aiMsg: string, currentTimeline: string): void {
  if (!STATE_KEYWORDS.test(userMsg + ' ' + aiMsg.slice(0, 800))) return
  ;(async () => {
    const systemPrompt = '당신은 소설 씬의 물리적 상태를 추적하는 편집자입니다. JSON만 반환합니다.'
    const userPrompt = `아래 대화 교환을 읽고, 현재 씬의 물리적 상태를 JSON으로 반환하세요.

이전 상태:
${currentTimeline || '(없음)'}

유저 발화: ${userMsg.slice(0, 400)}
AI 응답: ${aiMsg.slice(0, 1000)}

반환 형식 (JSON만, 설명 없이):
{
  "statusTimeline": "현재 씬 상태를 불릿(•) 형식으로 3~5줄 요약. 반드시 포함: 시간대, 의상(누가 무엇을 입고 있는지), 장소, 현재 상황.",
  "newChapter": false
}

규칙:
- 이 대화에서 변화가 없으면 이전 상태를 그대로 유지
- 의상이 바뀌었으면 반드시 새 의상으로 업데이트
- 시간이 흘렀으면 반드시 새 시간대로 업데이트
- 장소가 바뀌었으면 반드시 새 장소로 업데이트
- newChapter: 장소·시간대가 근본적으로 전환(큰 시간 점프 또는 완전히 새로운 장소/상황으로 이동)됐을 때만 true, 아니면 false`

    try {
      const raw = await generateText(systemPrompt, userPrompt)
      const parsed: any = JSON.parse(extractJson(raw))
      const data: any = {}
      if (typeof parsed.statusTimeline === 'string' && parsed.statusTimeline.trim()) {
        data.statusTimeline = parsed.statusTimeline.trim()
      }
      if (parsed.newChapter === true) {
        data.chapter = { increment: 1 }
      }
      if (Object.keys(data).length > 0) {
        await prisma.conversation.update({ where: { id: convId }, data })
      }
    } catch {
      // silent fail — 상태 추적 실패는 대화에 영향 없음
    }
  })().catch(() => {})
}

// ── 롤백 (재생성·삭제 시 사용) ──────────────────────────────────────────────

export async function rollbackStatsDelta(
  convId: string,
  deltas: Record<string, number>,
  currentStats: StatEntry[],
): Promise<StatEntry[]> {
  const updated = currentStats.map(s => {
    const delta = deltas[s.name] ?? 0
    return { ...s, value: Math.max(s.min, Math.min(s.max, s.value - delta)) }
  })
  await prisma.conversation.update({ where: { id: convId }, data: { statsConfig: updated } })
  return updated
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
