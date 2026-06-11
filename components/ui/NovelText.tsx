'use client'

import { Fragment } from 'react'

interface NovelTextProps {
  text: string
}

const HR_RE = /^[-_=—]{3,}$/
const HEADING_RE = /^#{1,6}\s+(.*)/

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < line.length) {
    if (line.slice(i, i + 7) === '{{img::') {
      const end = line.indexOf('}}', i + 7)
      if (end !== -1) {
        const imgUrl = line.slice(i + 7, end)
        parts.push(<img key={`${keyPrefix}-${key++}`} src={imgUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0', display: 'block' }} />)
        i = end + 2
        continue
      }
    }
    if (line.slice(i, i + 2) === '**') {
      const end = line.indexOf('**', i + 2)
      if (end !== -1) {
        parts.push(<strong key={`${keyPrefix}-${key++}`}>{line.slice(i + 2, end)}</strong>)
        i = end + 2
        continue
      }
    }
    if (line[i] === '`') {
      const end = line.indexOf('`', i + 1)
      if (end !== -1) {
        parts.push(<code key={`${keyPrefix}-${key++}`}>{line.slice(i + 1, end)}</code>)
        i = end + 1
        continue
      }
    }
    if (line[i] === '*') {
      const end = line.indexOf('*', i + 1)
      if (end !== -1) {
        parts.push(<em key={`${keyPrefix}-${key++}`} className="novel-action">{line.slice(i + 1, end)}</em>)
        i = end + 1
        continue
      }
    }
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1)
      if (end !== -1) {
        parts.push(<strong key={`${keyPrefix}-${key++}`} className="novel-dialogue">{line.slice(i, end + 1)}</strong>)
        i = end + 1
        continue
      }
    }
    let j = i + 1
    while (j < line.length && line[j] !== '*' && line[j] !== '"' && line[j] !== '`' && line.slice(j, j + 2) !== '**') j++
    parts.push(<span key={`${keyPrefix}-${key++}`}>{line.slice(i, j)}</span>)
    i = j
  }

  return parts
}

export default function NovelText({ text }: NovelTextProps) {
  const lines = text.split('\n')

  return (
    <>
      {lines.map((line, li) => {
        const trimmed = line.trim()
        if (HR_RE.test(trimmed)) {
          return <hr key={li} className="novel-hr" />
        }
        const headingMatch = trimmed.match(HEADING_RE)
        if (headingMatch) {
          return <div key={li} className="novel-heading">{renderInline(headingMatch[1], `h${li}`)}</div>
        }
        return (
          <Fragment key={li}>
            {renderInline(line, `l${li}`)}
            {li < lines.length - 1 && <br />}
          </Fragment>
        )
      })}
    </>
  )
}
