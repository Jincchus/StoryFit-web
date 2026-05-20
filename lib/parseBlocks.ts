export type BlockType = 'narration' | 'dialogue' | 'thought'
export interface Block { type: BlockType; text: string }

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
