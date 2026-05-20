export type BlockType = 'narration' | 'dialogue' | 'thought'
export interface Block { type: BlockType; text: string; speaker?: string }

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
    // double quotes: ASCII " or Unicode " "
    if (ch === '"' || ch === '“' || ch === '”') {
      const openQ = ch
      const closeQ = openQ === '“' ? '”' : '"'
      const end = text.indexOf(closeQ, i + 1)
      if (end !== -1) {
        flushNarration()
        blocks.push({ type: 'dialogue', text: text.slice(i, end + 1) })
        i = end + 1
        continue
      }
    }
    // single quotes: ASCII ' or Unicode ' '
    if (ch === "'" || ch === '‘' || ch === '’') {
      const closeQ = ch === '‘' ? '’' : "'"
      const end = text.indexOf(closeQ, i + 1)
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

      if ((content.startsWith('"') && content.endsWith('"')) ||
          (content.startsWith('“') && content.endsWith('”'))) {
        flushNarration()
        blocks.push({ type: 'dialogue', speaker, text: content.slice(1, -1) })
        continue
      }
      if ((content.startsWith("'") && content.endsWith("'")) ||
          (content.startsWith('‘') && content.endsWith('’'))) {
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
