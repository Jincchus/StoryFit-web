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
    let pendingPrefix = ''

    for (const para of paras) {
      if (para.length < MIN_BLOCK_LEN) {
        // "## 세계관" 같은 짧은 마크다운 제목은 이전 블록이 아닌 다음 블록의 제목이다 —
        // 이전 블록에 붙이면 분류기가 그 제목을 직전 캐릭터 설명에 합쳐버리고, 정작
        // 본문(다음 블록)은 제목 없이 분류돼 엉뚱한 필드로 갈라진다.
        if (/^#+\s/.test(para)) {
          pendingPrefix += (pendingPrefix ? '\n\n' : '') + para
          continue
        }
        if (lastInSection) {
          lastInSection.text += `\n\n${para}`
          continue
        }
      }
      const text = pendingPrefix ? `${pendingPrefix}\n\n${para}` : para
      pendingPrefix = ''
      const block: Block = { id: id++, text, tabHint: section.tab }
      blocks.push(block)
      lastInSection = block
    }
    if (pendingPrefix && lastInSection) {
      lastInSection.text += `\n\n${pendingPrefix}`
    }
  }

  return blocks
}
