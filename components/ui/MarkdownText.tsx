'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// 커맨드 응답 전용 마크다운 렌더.
// AI가 마크다운 대신 HTML(메신저 말풍선 등)로 응답하는 경우가 있어 rehype-raw로 실제 렌더하되,
// rehype-sanitize로 <script>·이벤트 핸들러(onClick 등)·javascript: URL을 제거해 XSS를 막는다.
// (커맨드 응답은 본인이 만든 커맨드로 본인에게만 렌더되지만, 방어적으로 정화한다.)
const schema = {
  ...defaultSchema,
  // 말풍선 스타일링을 위해 style/class와 레이아웃 태그를 허용한다.
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'div', 'span', 'p', 'br', 'section', 'small', 'details', 'summary',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'style', 'className', 'class'],
  },
}

export default function MarkdownText({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
