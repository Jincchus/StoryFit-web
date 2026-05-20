import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StoryFit',
  description: '소설형 롤플레이 AI 채팅',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body data-art="retro">
        {children}
      </body>
    </html>
  )
}
