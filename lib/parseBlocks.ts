export type BlockType = 'narration' | 'dialogue' | 'thought' | 'system' | 'constellation' | 'chat' | 'image'
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

    // ── 특수 블록 우선 처리 ──
    if (line.startsWith('[시스템:') && line.endsWith(']')) {
      blocks.push({ type: 'system', text: line.slice(5, -1).trim() })
      continue
    }
    if (line.startsWith('[알림:') && line.endsWith(']')) {
      blocks.push({ type: 'system', text: line.slice(4, -1).trim() })
      continue
    }
    if (line.startsWith('[성좌') && line.endsWith(']')) {
      blocks.push({ type: 'constellation', text: line.slice(1, -1).trim() })
      continue
    }
    if (line.startsWith('[채팅]') || line.startsWith('[인방채팅]')) {
      const isChatting = line.startsWith('[채팅]')
      const prefixLen = isChatting ? 4 : 6
      blocks.push({ type: 'chat', text: line.slice(prefixLen).trim() })
      continue
    }
    if (line.startsWith('{{img::') && line.endsWith('}}')) {
      blocks.push({ type: 'image', text: line.slice(7, -2) })
      continue
    }

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
            // 닫는 따옴표 뒤가 한글·영문자이거나, 여는 따옴표 앞(공백 제거)이 한글·영문자·원문자인 경우 인용부호로 간주
            const charAfterClose = line[end + 1]
            const lastNarChar = narration.trimEnd().slice(-1)
            const isInlineQuotation =
              (charAfterClose && /[가-힣a-zA-Z0-9]/.test(charAfterClose)) ||
              /[가-힣a-zA-Z0-9①-⑳]/.test(lastNarChar)
            if (!isInlineQuotation) {
              flushNarration()
              blocks.push({ type: 'thought', text: line.slice(i + 1, end) })
              i = end + 1
              continue
            }
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
          const charAfterClose = content[end + 1]
          const lastNarChar = narration.trimEnd().slice(-1)
          const isInlineQuotation =
            (charAfterClose && /[가-힣a-zA-Z0-9]/.test(charAfterClose)) ||
            /[가-힣a-zA-Z0-9①-⑳]/.test(lastNarChar)
          if (!isInlineQuotation) {
            flushNarration()
            result.push({ type: 'thought', speaker, text: content.slice(i + 1, end) })
            i = end + 1
            continue
          }
        }
      }
    }

    narration += ch
    i++
  }

  flushNarration()
  return result
}

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

    // ── 특수 블록 우선 처리 ──
    if (trimmed.startsWith('[시스템:') && trimmed.endsWith(']')) {
      flushNarration()
      blocks.push({ type: 'system', text: trimmed.slice(5, -1).trim() })
      continue
    }
    if (trimmed.startsWith('[알림:') && trimmed.endsWith(']')) {
      flushNarration()
      blocks.push({ type: 'system', text: trimmed.slice(4, -1).trim() })
      continue
    }
    if (trimmed.startsWith('[성좌') && trimmed.endsWith(']')) {
      flushNarration()
      blocks.push({ type: 'constellation', text: trimmed.slice(1, -1).trim() })
      continue
    }
    if (trimmed.startsWith('[채팅]') || trimmed.startsWith('[인방채팅]')) {
      flushNarration()
      const prefixLen = trimmed.startsWith('[채팅]') ? 4 : 6
      blocks.push({ type: 'chat', text: trimmed.slice(prefixLen).trim() })
      continue
    }
    if (trimmed.startsWith('{{img::') && trimmed.endsWith('}}')) {
      flushNarration()
      blocks.push({ type: 'image', text: trimmed.slice(7, -2) })
      continue
    }

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

    narrationLines.push(trimmed)
  }

  flushNarration()
  return blocks
}
