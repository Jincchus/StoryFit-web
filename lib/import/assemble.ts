import type {
  AssembledCharacter, AssembledResult, Block, Classification, PresetField,
} from './types'

const OPENING_TABS = ['첫 장면', '첫장면', '인트로']
const DETAIL_TABS = ['상세 설명']
const CHAR_FIELDS: PresetField[] = ['additionalInfo', 'openingMessage', 'exampleDialogues']

interface Acc {
  additionalInfo: number[]
  openingMessage: number[]
  exampleDialogues: number[]
}

function joinByIds(ids: number[], byId: Map<number, Block>): string {
  return ids
    .slice()
    .sort((a, b) => a - b)
    .map(id => byId.get(id)?.text ?? '')
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

const MAX_EXAMPLE_QUOTES = 20

// 본문에 등장하는 따옴표 대사를 그대로 추려낸다 (재서술 없는 verbatim 추출).
// AI가 예시 대화 블록을 못 찾았을 때 캐릭터 말투를 보강하는 용도 — 추출한 문장은
// 항상 원문의 부분문자열이므로 verbatim 보장이 깨지지 않는다.
function extractQuotes(...texts: string[]): string[] {
  const re = /"([^"\n]{4,300})"|“([^”\n]{4,300})”/g
  const seen = new Set<string>()
  const quotes: string[] = []
  for (const text of texts) {
    if (!text) continue
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const q = (m[1] ?? m[2] ?? '').trim()
      if (q && !seen.has(q)) { seen.add(q); quotes.push(q) }
    }
  }
  return quotes
}

export function assemble(blocks: Block[], classification: Classification): AssembledResult {
  const byId = new Map(blocks.map(b => [b.id, b]))
  const chars = classification.characters.length > 0
    ? classification.characters
    : [{ index: 0, name: classification.title || '캐릭터', gender: '' }]

  const accs: Acc[] = chars.map(() => ({ additionalInfo: [], openingMessage: [], exampleDialogues: [] }))
  const scenarioIds: number[] = []
  const handled = new Set<number>()

  const ownerIndex = (owner: number | null) => {
    if (owner === null || owner < 0 || owner >= accs.length) return 0
    return owner
  }

  for (const label of classification.blocks) {
    const block = byId.get(label.id)
    if (!block) continue
    handled.add(label.id)

    // "첫 장면"/"인트로" 탭 블록은 시작 메시지로 그대로 쓴다 — AI가 다른 필드로
    // 잘못 분류하거나 ignore 처리해도 무시하고 강제 배정한다 (사용자 확인 완료:
    // 멜팅의 "첫 장면"은 가공 없이 그대로 시작 메시지로 사용해야 할 값).
    if (block.tabHint && OPENING_TABS.includes(block.tabHint)) {
      accs[ownerIndex(label.owner)].openingMessage.push(label.id)
      continue
    }

    if (label.field === 'ignore') continue
    if (label.field === 'scenario') { scenarioIds.push(label.id); continue }
    if (CHAR_FIELDS.includes(label.field)) {
      accs[ownerIndex(label.owner)][label.field as keyof Acc].push(label.id)
    }
  }

  // 백스톱: 라벨이 안 붙은 블록을 탭 힌트/기본 규칙으로 흡수 (누락 0)
  for (const block of blocks) {
    if (handled.has(block.id)) continue
    if (block.tabHint && OPENING_TABS.includes(block.tabHint)) accs[0].openingMessage.push(block.id)
    else if (block.tabHint && DETAIL_TABS.includes(block.tabHint)) accs[0].additionalInfo.push(block.id)
    else scenarioIds.push(block.id)
  }

  const characters: AssembledCharacter[] = chars.map((c, i) => {
    const additionalInfo = joinByIds(accs[i].additionalInfo, byId)
    const openingMessage = joinByIds(accs[i].openingMessage, byId)
    let exampleDialogues = joinByIds(accs[i].exampleDialogues, byId)

    // AI가 예시 대화 블록을 분류하지 못했으면, 시작 메시지·설정 본문에 등장하는
    // 따옴표 대사를 그대로 추려 캐릭터 말투로 보강한다 (사용자 확인 완료: 본문 속
    // 말투를 확인해 캐릭터 말투에 추가해야 할 값 — 단, 재서술 없이 verbatim로).
    if (!exampleDialogues) {
      const quotes = extractQuotes(openingMessage, additionalInfo).slice(0, MAX_EXAMPLE_QUOTES)
      if (quotes.length) exampleDialogues = quotes.map(q => `"${q}"`).join('\n')
    }

    return {
      name: (c.name || '캐릭터').trim(),
      gender: (c.gender || '').trim(),
      additionalInfo,
      openingMessage,
      exampleDialogues,
    }
  })

  const tags = (classification.tags ?? [])
    .map(t => String(t).trim())
    .filter(Boolean)
    .slice(0, 15)

  return {
    characters,
    scenarioDescription: joinByIds(scenarioIds, byId),
    tags,
    title: (classification.title || characters[0]?.name || '캐릭터').trim(),
  }
}

export function buildFallback(blocks: Block[], opts: { name: string }): AssembledResult {
  const byId = new Map(blocks.map(b => [b.id, b]))
  const openingIds: number[] = []
  const detailIds: number[] = []

  for (const block of blocks) {
    if (block.tabHint && OPENING_TABS.includes(block.tabHint)) openingIds.push(block.id)
    else detailIds.push(block.id)
  }

  const name = (opts.name || '캐릭터').trim()
  return {
    characters: [{
      name,
      gender: '',
      additionalInfo: joinByIds(detailIds, byId),
      openingMessage: joinByIds(openingIds, byId),
      exampleDialogues: '',
    }],
    scenarioDescription: '',
    tags: [],
    title: name,
  }
}

export { OPENING_TABS, DETAIL_TABS, joinByIds }
