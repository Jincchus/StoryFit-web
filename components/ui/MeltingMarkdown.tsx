'use client'

interface MeltingMarkdownProps {
  text: string
}

function renderInline(line: string) {
  const parts: React.ReactNode[] = []
  let i = 0
  let k = 0
  while (i < line.length) {
    if (line.slice(i, i + 2) === '**') {
      const end = line.indexOf('**', i + 2)
      if (end !== -1) {
        parts.push(<strong key={k++}>{line.slice(i + 2, end)}</strong>)
        i = end + 2
        continue
      }
    }
    let j = i + 1
    while (j < line.length && line.slice(j, j + 2) !== '**') j++
    parts.push(<span key={k++}>{line.slice(i, j)}</span>)
    i = j
  }
  return parts
}

export default function MeltingMarkdown({ text }: MeltingMarkdownProps) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length) {
      blocks.push(<ul key={key++} className="melting-md-list">{listItems}</ul>)
      listItems = []
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushList()
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushList()
      blocks.push(<h3 key={key++} className="melting-md-h">{heading[2]}</h3>)
      continue
    }
    if (/^-{3,}$/.test(line)) {
      flushList()
      blocks.push(<hr key={key++} className="melting-md-hr" />)
      continue
    }
    const item = line.match(/^[*\-]\s+(.*)$/)
    if (item) {
      listItems.push(<li key={key++}>{renderInline(item[1])}</li>)
      continue
    }
    flushList()
    blocks.push(<p key={key++} className="melting-md-p">{renderInline(line)}</p>)
  }
  flushList()

  return <div className="melting-md">{blocks}</div>
}
