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
    if (!byId.has(label.id)) continue
    handled.add(label.id)
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

  const characters: AssembledCharacter[] = chars.map((c, i) => ({
    name: (c.name || '캐릭터').trim(),
    gender: (c.gender || '').trim(),
    additionalInfo: joinByIds(accs[i].additionalInfo, byId),
    openingMessage: joinByIds(accs[i].openingMessage, byId),
    exampleDialogues: joinByIds(accs[i].exampleDialogues, byId),
  }))

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

export { OPENING_TABS, DETAIL_TABS, joinByIds }
