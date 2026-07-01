import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai/gemini'
import type { StatEntry, InventoryItem } from '@/types'
import type { PlotOutline } from '@/lib/plotOutline'

// 시간 경과 추적 앵커: statusTimeline 맨 앞에 절대 시점을 유지해 "어젯밤"류 오인식을 막는다.
// (기존엔 상대적 시간대만 추적해, 큰 시간 점프 후 AI가 경과 시간을 잃어버렸다.)
const TIME_ANCHOR_HINT = '• 시점: (이야기 내 현재 날짜·시각), Day N (이야기 시작을 Day 1로 한 누적 경과일)'
const TIME_ANCHOR_RULE =
  '- statusTimeline 첫 줄은 반드시 위 "• 시점:" 앵커여야 한다. 이전 상태의 시점을 읽어, 이번 교환에서 흐른 시간만큼 진행하라: ' +
  '"다음 날/이튿날"=Day +1, "며칠 후"=+3일 안팎, "일주일 후/뒤"=+7일, "한 달 후"=+30일, "N년 후"=+365N일 식으로 Day와 날짜를 함께 더한다. ' +
  '하룻밤을 보냈으면 최소 +1일. 같은 씬이라 시간이 거의 안 흘렀으면 시각만 갱신하고 Day는 유지. 절대 과거로 되돌리지 마라.'

// 복장 상태 추적: "누가 뭘 입었나"만이 아니라, 벗은 옷의 위치까지 한 벌=한 곳으로 관리해
// "이미 입은 옷을 또 줍는" 류의 모순을 막는다.
const CLOTHING_STATE_RULE =
  '- 복장은 인물별로 "착용 중"과 "벗어둔 것(+위치: 바닥·의자·가방 등)"을 구분해 적는다. 한 벌은 반드시 한 곳에만 존재한다: ' +
  '벗으면 그 옷을 어디에 뒀는지 위치를 남기고, 다시 입으면 "벗어둔" 목록에서 그 옷을 삭제한다. ' +
  '이미 다시 입은 옷을 누가 또 줍거나, 치운 옷이 다시 바닥에 생기는 모순을 만들지 마라.'

// 연속성 추적 4종: 정보 비대칭 / 공간 배치·오브젝트 / 미래 약속·예정 / 감정·갈등.
// 각 항목은 해당될 때만 statusTimeline에 "•" 줄로 남긴다(불필요하면 생략).
const CONTINUITY_RULES =
  '- 정보 비대칭: 각 인물은 자신이 아는 것만 안다. 유저의 속마음, 아직 밝혀지지 않은 이름·비밀·정보를 아는 것처럼 행동하게 하지 마라. 인물이 새로 알게 됐거나 아직 모르는 핵심 사실이 있으면 "• 정보:" 줄에 적는다.\n' +
  '- 공간 배치: 주요 인물의 위치·자세(앉음/누움/서있음)·거리, 누가 무엇을 들고 있는지, 환경 상태(문 잠김·조명·창문 등)를 "• 배치:" 줄에 유지한다. 순간이동이나 치운 물건의 재등장 금지.\n' +
  '- 미래 약속: 등장한 약속·데드라인·조건("내일 만나기로", "3일 후 시험", "~하면 ~한다")을 "• 예정:" 줄에 (가능하면 Day 기준) 기록하고 이행·취소 전까지 유지한다. 시점(Day)이 그 지점을 지나면 반영한다.\n' +
  '- 감정·갈등: 각 인물의 현재 감정과 미해결 갈등을 "• 감정/갈등:" 줄에 유지한다. 화남·삐짐·불신 등은 서사적으로 해소되기 전까지 임의로 리셋하지 마라.'

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

function clipMiddle(text: string, head: number, tail: number): string {
  if (text.length <= head + tail) return text
  return text.slice(0, head) + '\n…(중략)…\n' + text.slice(-tail)
}

function needsEval(userMsg: string, aiMsg: string, hasStats: boolean, hasInventory: boolean): { stats: boolean; inventory: boolean } {
  const text = userMsg + ' ' + aiMsg
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
  currentTimeline: string
  currentStats: StatEntry[] | null
  currentInventory: InventoryItem[] | null
  statsEnabled: boolean
  inventoryEnabled: boolean
  autoChapterEnabled: boolean
  plotOutline?: PlotOutline | null
  currentChapter?: number
}

interface StoryEvalResult {
  statsDelta: Record<string, number>
  inventoryDelta: { add: InventoryItem[]; remove: { name: string; qty: number }[] }
  statusTimeline: string
  newChapter: boolean
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

  const plotChapter = opts.plotOutline?.chapters.find(c => c.index === (opts.currentChapter ?? 1))
  const chapterRule = plotChapter
    ? `- newChapter: 현재 챕터의 목표와 핵심 사건이 지금까지의 전개에서 **실제로 이루어졌고** 전환 조건(완료 상태)이 충족됐을 때만 true. 아직 진행 중이거나 일부만 됐으면 false(감정·분위기가 무르익은 것만으로는 넘기지 마라). 목표: "${plotChapter.goal}" / 핵심 사건: "${(plotChapter.events ?? []).join(', ') || '(없음)'}" / 전환 조건: "${plotChapter.transition}"`
    : `- newChapter: 장소·시간대가 근본적으로 전환(큰 시간 점프 또는 완전히 새로운 장소/상황으로 이동)됐을 때만 true, 아니면 false`

  const systemPrompt = '당신은 인터랙티브 스토리의 상태 관리자입니다. 스토리 교환을 분석해 JSON만 반환합니다.'
  const userPrompt = `아래 스토리 교환을 분석해 JSON으로 반환하세요.

이전 상태:
${opts.currentTimeline || '(없음)'}

유저 행동: ${opts.userMsg}
스토리 전개: ${clipMiddle(opts.aiMsg, 1200, 600)}
${statsSection}${inventorySection}

반환 형식 (JSON만, 설명 없이):
{
  "stats": {},
  "inventory": { "add": [], "remove": [] },
  "statusTimeline": "'${TIME_ANCHOR_HINT}'을 첫 줄로, 이어서 해당되는 항목만 불릿(•)으로: 배치(장소·인물 위치/자세·환경), 복장(착용/벗어둔+위치), 신체(부상·컨디션), 정보(누가 뭘 아는/모르는지), 예정(약속·데드라인), 감정/갈등. 시점 줄은 항상 포함",
  "newChapter": false
}

규칙:
- stats: 변화 있는 스탯만 포함 (변화량 -10~+10 정수). 스탯 평가 대상 아니면 {}
- inventory.add: 획득 아이템. inventory.remove: 소모·분실 아이템. 변화 없으면 빈 배열
- statusTimeline: 반드시 작성. 이전 상태를 기반으로 이번 교환의 변화만 반영해 갱신. 이번 교환에서 언급되지 않은 항목(의상·부상·장소 등)은 이전 상태 그대로 유지
${TIME_ANCHOR_RULE}
- 의상·부상·신체 변화(예: 옷을 갈아입음, 다침, 붕대를 감음, 흉터)는 명시적으로 회복·변경되기 전까지 반드시 유지
${CLOTHING_STATE_RULE}
${CONTINUITY_RULES}
${chapterRule}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt)
      const parsed: any = JSON.parse(extractJson(raw))
      return {
        statsDelta: (needsStats && parsed.stats) ? parsed.stats : {},
        inventoryDelta: (needsInventory && parsed.inventory) ? parsed.inventory : { add: [], remove: [] },
        statusTimeline: typeof parsed.statusTimeline === 'string' ? parsed.statusTimeline.trim() : '',
        newChapter: parsed.newChapter === true,
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

  // 챕터 자동 증가 (플롯 설계도가 있으면 autoChapter 설정과 무관하게 동작, 총 챕터 수 초과 금지)
  if (result.newChapter && (opts.autoChapterEnabled || opts.plotOutline)) {
    const total = opts.plotOutline?.totalChapters
    if (!total || (opts.currentChapter ?? 1) < total) {
      updates.push(prisma.conversation.update({ where: { id: opts.convId }, data: { chapter: { increment: 1 } } }))
    }
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

export function triggerStateTracking(convId: string, userMsg: string, aiMsg: string, currentTimeline: string, autoChapterEnabled: boolean): void {
  if (!STATE_KEYWORDS.test(userMsg + ' ' + aiMsg)) return
  ;(async () => {
    const systemPrompt = '당신은 소설 씬의 물리적 상태를 추적하는 편집자입니다. JSON만 반환합니다.'
    const userPrompt = `아래 대화 교환을 읽고, 현재 씬의 물리적 상태를 JSON으로 반환하세요.

이전 상태:
${currentTimeline || '(없음)'}

유저 발화: ${userMsg.slice(0, 400)}
AI 응답: ${clipMiddle(aiMsg, 1000, 500)}

반환 형식 (JSON만, 설명 없이):
{
  "statusTimeline": "'${TIME_ANCHOR_HINT}'을 첫 줄로, 이어서 해당되는 항목만 불릿(•)으로: 배치(장소·인물 위치/자세·환경), 복장(착용/벗어둔+위치), 신체, 정보(누가 뭘 아는/모르는지), 예정(약속·데드라인), 감정/갈등. 시점 줄은 항상 포함.",
  "newChapter": false
}

규칙:
- 이 대화에서 변화가 없으면 이전 상태를 그대로 유지(단 시점 앵커 줄은 항상 유지)
${TIME_ANCHOR_RULE}
- 의상이 바뀌었으면 반드시 새 의상으로 업데이트
${CLOTHING_STATE_RULE}
${CONTINUITY_RULES}
- 장소가 바뀌었으면 반드시 새 장소로 업데이트
- newChapter: 장소·시간대가 근본적으로 전환(큰 시간 점프 또는 완전히 새로운 장소/상황으로 이동)됐을 때만 true, 아니면 false`

    try {
      const raw = await generateText(systemPrompt, userPrompt)
      const parsed: any = JSON.parse(extractJson(raw))
      const data: any = {}
      if (typeof parsed.statusTimeline === 'string' && parsed.statusTimeline.trim()) {
        data.statusTimeline = parsed.statusTimeline.trim()
      }
      if (parsed.newChapter === true && autoChapterEnabled) {
        data.chapter = { increment: 1 }
      }
      if (Object.keys(data).length > 0) {
        await prisma.conversation.update({ where: { id: convId }, data })
      }
    } catch (err) {
      console.error('[stateTracking] 상태 추적 실패:', err)
    }
  })().catch(err => console.error('[stateTracking] error:', err))
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
