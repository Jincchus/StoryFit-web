'use client'
import { useState } from 'react'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import ProfileTab from './_components/ProfileTab'
import ParamsTab from './_components/ParamsTab'
import ThemeTab from './_components/ThemeTab'
import SecurityTab from './_components/SecurityTab'
import StatsTab from './_components/StatsTab'
import ExportTab from './_components/ExportTab'

type Tab = 'profile' | 'params' | 'security' | 'stats' | 'export' | 'theme'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: '프로필·프롬프트' },
  { id: 'params', label: '파라미터' },
  { id: 'theme', label: '테마' },
  { id: 'security', label: '보안' },
  { id: 'stats', label: '통계' },
  { id: 'export', label: '내보내기' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')

  return (
    <Win title="설정" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 0, flex: 1, minHeight: 0 }}>
        {/* 탭 바 */}
        <div className="hstack" style={{ gap: 2, padding: '4px 4px 0', borderBottom: '1px solid var(--chrome-border)', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`btn ${tab === t.id ? 'primary' : 'ghost'}`}
              style={{ fontSize: 10, padding: '3px 10px', borderRadius: '3px 3px 0 0', minHeight: 24 }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 12 }}>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'params' && <ParamsTab />}
          {tab === 'theme' && <ThemeTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'stats' && <StatsTab />}
          {tab === 'export' && <ExportTab />}
        </div>
      </div>
    </Win>
  )
}
