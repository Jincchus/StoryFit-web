'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 커맨드 응답 전용 마크다운 렌더. 원시 HTML은 렌더하지 않음(react-markdown 기본 안전).
export default function MarkdownText({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
