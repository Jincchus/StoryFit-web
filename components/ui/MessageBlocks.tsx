'use client'
import { parseBlocks } from '@/lib/parseBlocks'

function NarrationText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1) {
        parts.push(<em key={key++}>{text.slice(i + 1, end)}</em>)
        i = end + 1
        continue
      }
    }
    if (text[i] === '\n') {
      parts.push(<br key={key++} />)
      i++
    } else {
      let j = i + 1
      while (j < text.length && text[j] !== '*' && text[j] !== '\n') j++
      parts.push(<span key={key++}>{text.slice(i, j)}</span>)
      i = j
    }
  }
  return <>{parts}</>
}

export default function MessageBlocks({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className="msg-blocks">
      {blocks.map((block, i) => {
        if (block.type === 'narration') {
          return (
            <div key={i} className="narration-block">
              <NarrationText text={block.text} />
            </div>
          )
        }
        if (block.type === 'dialogue') {
          return <div key={i} className="bubble">{block.text}</div>
        }
        return <div key={i} className="bubble thought-bubble">{block.text}</div>
      })}
    </div>
  )
}
