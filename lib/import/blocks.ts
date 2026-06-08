import type { Block, CapturedSection } from './types'

const MIN_BLOCK_LEN = 20

export function splitIntoBlocks(sections: CapturedSection[]): Block[] {
  const blocks: Block[] = []
  let id = 0

  for (const section of sections) {
    const paras = section.text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)

    let lastInSection: Block | null = null

    for (const para of paras) {
      if (para.length < MIN_BLOCK_LEN && lastInSection) {
        lastInSection.text += `\n\n${para}`
        continue
      }
      const block: Block = { id: id++, text: para, tabHint: section.tab }
      blocks.push(block)
      lastInSection = block
    }
  }

  return blocks
}
