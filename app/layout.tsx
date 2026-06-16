import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'StoryFit',
  description: '소설형 롤플레이 AI 채팅',
}

const PRE_PAINT_THEME = `
try {
  var t = localStorage.getItem('sf-theme') || 'dark'
  document.body.setAttribute('data-art', t)
  var ext = ['retro','modern','win95','pink','macos','modernwhite','maple','qplay','crazyarcade','block','cyworld','kakao','x','excel','retroexcel','whif','claude-dark','gpt-dark','gemini-dark']
  if (ext.indexOf(t) !== -1) {
    var l = document.createElement('link')
    l.id = 'theme-extra-css'
    l.rel = 'stylesheet'
    l.href = '/themes/' + t + '.css'
    document.head.appendChild(l)
  }
} catch (e) {}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body data-art="dark">
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_THEME }} />
        <ThemeProvider />
        {children}
      </body>
    </html>
  )
}
