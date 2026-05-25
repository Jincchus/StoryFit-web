export type BlockType = 'narration' | 'dialogue' | 'thought'
export interface Block { type: BlockType; text: string; speaker?: string }

const DQUOTES = ['"', '“', '”']
const SQUOTES = ["'", '‘', '’']  // straight + curly single quotes

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

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    let i = 0
    let narration = ''

    const flushNarration = () => {
      const t = narration.trim()
      if (t) blocks.push({ type: 'narration', text: t })
      narration = ''
    }

    while (i < line.length) {
      const ch = line[i]

      if (DQUOTES.includes(ch)) {
        const end = findAny(line, DQUOTES, i + 1)
        if (end !== -1) {
          flushNarration()
          blocks.push({ type: 'dialogue', text: line.slice(i + 1, end) })
          i = end + 1
          continue
        }
      }

      if (SQUOTES.includes(ch)) {
        const isApostrophe = ch === "'" && i > 0 && /[a-zA-Z]/.test(line[i - 1])
        if (!isApostrophe) {
          const end = findAny(line, SQUOTES, i + 1)
          if (end !== -1) {
            flushNarration()
            blocks.push({ type: 'thought', text: line.slice(i + 1, end) })
            i = end + 1
            continue
          }
        }
      }

      narration += ch
      i++
    }

    flushNarration()
  }

  const merged: Block[] = []
  for (const block of blocks) {
    const last = merged[merged.length - 1]
    if (block.type === 'narration' && last?.type === 'narration') {
      last.text += '\n' + block.text
    } else {
      merged.push(block)
    }
  }
  return merged
}

const SPEAKER_RE = /^(.{1,20}?)\s*:\s*(.+)$/

function parseInlineContent(content: string, speaker: string): Block[] {
  const result: Block[] = []
  let i = 0
  let narration = ''

  const flushNarration = () => {
    const t = narration.trim()
    if (t) result.push({ type: 'narration', text: t })
    narration = ''
  }

  while (i < content.length) {
    const ch = content[i]

    if (DQUOTES.includes(ch)) {
      const end = findAny(content, DQUOTES, i + 1)
      if (end !== -1) {
        flushNarration()
        result.push({ type: 'dialogue', speaker, text: content.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    if (SQUOTES.includes(ch)) {
      const isApostrophe = ch === "'" && i > 0 && /[a-zA-Z]/.test(content[i - 1])
      if (!isApostrophe) {
        const end = findAny(content, SQUOTES, i + 1)
        if (end !== -1) {
          flushNarration()
          result.push({ type: 'thought', speaker, text: content.slice(i + 1, end) })
          i = end + 1
          continue
        }
      }
    }

    narration += ch
    i++
  }

  flushNarration()
  return result
}

export function parseNovelBlocks(text: string, personaName?: string): Block[] {
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

      const inlineBlocks = parseInlineContent(content, speaker)
      if (inlineBlocks.length > 0) {
        flushNarration()
        blocks.push(...inlineBlocks)
        continue
      }
    }

    // speaker 없는 단독 인용문 라인 → 직전 내레이션 컨텍스트로 화자 추정
    const dqMatch = trimmed.match(/^["""](.*)["""]$/)
    if (dqMatch) {
      const prevNarration = narrationLines.filter(l => l.trim()).slice(-2).join(' ')
      const personaPatterns = ['당신은', '당신이', '당신이', '당신의 목소리', '당신은']
      const isLikelyPersona =
        personaPatterns.some(p => prevNarration.includes(p)) ||
        (!!personaName && prevNarration.includes(personaName))
      flushNarration()
      blocks.push({ type: 'dialogue', text: dqMatch[1], speaker: isLikelyPersona ? '__persona__' : undefined })
      continue
    }
    const sqMatch = trimmed.match(/^['''](.*)[''']$/)
    if (sqMatch) {
      const prevNarration = narrationLines.filter(l => l.trim()).slice(-2).join(' ')
      const isLikelyPersona =
        prevNarration.includes('당신은') || prevNarration.includes('당신이') ||
        (!!personaName && prevNarration.includes(personaName))
      flushNarration()
      blocks.push({ type: 'thought', text: sqMatch[1], speaker: isLikelyPersona ? '__persona__' : undefined })
      continue
    }

    narrationLines.push(trimmed)
  }

  flushNarration()
  return blocks
}
