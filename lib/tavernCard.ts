const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

interface CardData {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  system_prompt?: string
  creator_notes?: string
  // chara_card_v2 확장 필드 (Chub full API 등에서 내려옴)
  tags?: string[]
  alternate_greetings?: string[]
  character_book?: { entries?: { keys?: string[]; content?: string; insertion_order?: number }[] }
}

interface CardV2 {
  spec: 'chara_card_v2'
  data: CardData
}

export type TavernCard = CardData

export function parsePngTavernCard(buf: Buffer): TavernCard | null {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return null

  let offset = 8
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii')

    if (type === 'tEXt') {
      const data = buf.subarray(offset + 8, offset + 8 + length)
      const nullIdx = data.indexOf(0)
      if (nullIdx !== -1 && data.subarray(0, nullIdx).toString('latin1') === 'chara') {
        try {
          const json = Buffer.from(data.subarray(nullIdx + 1).toString('latin1'), 'base64').toString('utf-8')
          const parsed = JSON.parse(json) as CardData | CardV2
          return 'spec' in parsed ? parsed.data : parsed
        } catch { return null }
      }
    }

    if (type === 'IEND') break
    offset += 12 + length
  }
  return null
}

export function buildSystemPromptFromCard(card: TavernCard): string {
  if (card.system_prompt?.trim()) return card.system_prompt.trim()
  return [card.description, card.personality, card.scenario]
    .map(s => s?.trim())
    .filter(Boolean)
    .join('\n\n')
}
