export type BlockType = 'narration' | 'dialogue' | 'thought'
export interface Block { type: BlockType; text: string; speaker?: string }

const DQUOTES = ['"', '“', '”']
const SQUOTES = ["'", '‘', '’']

function findAny(text: string, chars: string[], from: number): number {
  let min = -1
  for (const c of chars) {
    const idx = text.indexOf(c, from)
    if (idx !== -1 && (min === -1 || idx < min)) min = idx
  }
  return min
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let i = 0
  let narration = ''

  const flushNarration = () => {
    const t = narration.trim()
    if (t) blocks.push({ type: 'narration', text: t })
    narration = ''
  }

  while (i < text.length) {
    const ch = text[i]

    if (DQUOTES.includes(ch)) {
      const end = findAny(text, DQUOTES, i + 1)
      if (end !== -1) {
        flushNarration()
        blocks.push({ type: 'dialogue', text: text.slice(i, end + 1) })
        i = end + 1
        continue
      }
    }

    if (SQUOTES.includes(ch)) {
      const end = findAny(text, SQUOTES, i + 1)
      if (end !== -1) {
        flushNarration()
        blocks.push({ type: 'thought', text: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    narration += ch
    i++
  }
  flushNarration()
  return blocks
}

const SPEAKER_RE = /^(.+?)\s*:\s*(.+)$/

export function parseNovelBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.split('\n')
  let narrationLines: string[] = []

  const flushNarration = () => {
    const t = narrationLines.join('\n').trim()
    if (t) blocks.push({ type: 'narration', text: t })
    narrationLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { narrationLines.push(''); continue }

    const match = trimmed.match(SPEAKER_RE)
    if (match) {
      const speaker = match[1].trim()
      const content = match[2].trim()

      if (DQUOTES.some(q => content.startsWith(q)) && DQUOTES.some(q => content.endsWith(q))) {
        flushNarration()
        blocks.push({ type: 'dialogue', speaker, text: content.slice(1, -1) })
        continue
      }
      if (SQUOTES.some(q => content.startsWith(q)) && SQUOTES.some(q => content.endsWith(q))) {
        flushNarration()
        blocks.push({ type: 'thought', speaker, text: content.slice(1, -1) })
        continue
      }
    }

    narrationLines.push(trimmed)
  }

  flushNarration()
  return blocks
}
