'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
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
    'div', 'span', 'p', 'br', 'section', 'small', 'details', 'summary', 'article',
  ],
  // inline style + 공용 sf-* 클래스만 허용한다.
  // className은 아래 화이트리스트 값만 통과(앱의 다른 CSS/기능 클래스 오용 방지).
  // script·onclick·javascript: 등은 defaultSchema가 계속 차단하므로 스크립트 실행 XSS는 막힌다.
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'style',
      ['className',
        // 메신저
        'sf-bubble', 'sf-bubble-left', 'sf-bubble-right', 'sf-name', 'sf-time',
        // 카드/상태창
        'sf-card', 'sf-card-title', 'sf-row', 'sf-muted',
        // 게시판/댓글
        'sf-post', 'sf-post-title', 'sf-post-meta', 'sf-post-body', 'sf-comment', 'sf-comment-author',
        // 알림·태그·구분선·스탯바
        'sf-notice', 'sf-tag', 'sf-divider', 'sf-bar', 'sf-bar-fill',
      ],
    ],
  },
}

export default function MarkdownText({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
