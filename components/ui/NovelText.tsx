'use client'

interface NovelTextProps {
  text: string
}

export default function NovelText({ text }: NovelTextProps) {
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < text.length) {
    if (text.slice(i, i + 7) === '{{img::') {
      const end = text.indexOf('}}', i + 7)
      if (end !== -1) {
        const imgUrl = text.slice(i + 7, end)
        parts.push(<img key={key++} src={imgUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0', display: 'block' }} />)
        i = end + 2
        continue
      }
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1) {
        parts.push(<em key={key++} className="novel-action">{text.slice(i + 1, end)}</em>)
        i = end + 1
        continue
      }
    }
    if (text[i] === '"') {
      const end = text.indexOf('"', i + 1)
      if (end !== -1) {
        parts.push(<strong key={key++} className="novel-dialogue">{text.slice(i, end + 1)}</strong>)
        i = end + 1
        continue
      }
    }
    if (text[i] === '\n') {
      parts.push(<br key={key++} />)
      i++
    } else {
      let j = i + 1
      while (j < text.length && text[j] !== '*' && text[j] !== '"' && text[j] !== '\n') j++
      parts.push(<span key={key++}>{text.slice(i, j)}</span>)
      i = j
    }
  }

  return <>{parts}</>
}
