import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'StoryFit',
  description: '소설형 롤플레이 AI 채팅',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body data-art="retro">
        <ThemeProvider />
        {children}
      </body>
    </html>
  )
}
