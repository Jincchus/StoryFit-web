'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIsAdmin } from '@/lib/authClient'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import { api } from '@/lib/api'

const BASE_ICONS = [
  { label: '채팅 목록', icon: PixelIcons.chat, href: '/chatlist' },
  { label: '새 대화', icon: <PixelAvatar kind="ai" size={38} />, href: '/conversations/new' },
  { label: 'AI 채팅', icon: PixelIcons.bot, href: '/assistant' },
  { label: '캐릭터', icon: <PixelAvatar kind="custom" size={38} />, href: '/characters' },
  { label: '서재', icon: PixelIcons.book, href: '/library' },
  { label: '설정', icon: PixelIcons.sliders, href: '/settings' },
]

const ADMIN_ICON = { label: '관리자\n패널', icon: PixelIcons.settings, href: '/admin' }

const STEPS = [
  { num: 1, label: '캐릭터 고르기', desc: '프리셋 선택 or 직접 만들기', href: '/characters', icon: <PixelAvatar kind="custom" size={20} /> },
  { num: 2, label: '대화 시작', desc: '캐릭터를 골라 시작!', href: '/conversations/new', icon: PixelIcons.chat },
]

export default function HomePage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importCollectionId, setImportCollectionId] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    setIsAdmin(getIsAdmin())
    if (!localStorage.getItem('sf_onboarded')) setShowGuide(true)
    api.get('/api/collections').then(setCollections).catch(() => {})
  }, [])

  const dismissGuide = () => {
    localStorage.setItem('sf_onboarded', '1')
    setShowGuide(false)
  }

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setImportError('')
    try {
      const result = await api.post('/api/characters/import', { url: importUrl.trim(), collectionId: importCollectionId || undefined })
      setImportUrl('')
      setImportCollectionId('')
      setShowImport(false)
      router.push(`/conversations/new?from=${result.conversationId}`)
    } catch (e: any) {
      setImportError(e.message ?? '가져오기에 실패했습니다')
    } finally {
      setImporting(false)
    }
  }

  const icons = isAdmin ? [...BASE_ICONS, ADMIN_ICON] : BASE_ICONS

  return (
    <>
      {showGuide && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100 }} onClick={dismissGuide} />
          <div className="win" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101, width: 'min(380px, 90vw)' }}>
            <div className="win-title">
              <div className="win-title-l"><span>StoryFit 시작하기</span></div>
              <div className="win-controls"><button onClick={dismissGuide}>×</button></div>
            </div>
            <div className="win-body vstack" style={{ gap: 10 }}>
              <div className="tiny muted">처음이신가요? 아래 순서대로 진행하면 바로 시작할 수 있어요.</div>
              <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                {STEPS.map((step, i) => (
                  <div key={step.num} onClick={() => { dismissGuide(); router.push(step.href) }}
                    style={{ flex: '1 1 100px', minWidth: 90, border: '1.5px solid var(--chrome-border)', borderRadius: 'var(--radius)', padding: '8px 10px', cursor: 'pointer', background: 'var(--chrome-face)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="hstack" style={{ gap: 5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--hot-pink)', fontSize: 11 }}>0{step.num}</span>
                      {i < STEPS.length - 1 && <span className="tiny muted" style={{ marginLeft: 'auto', fontSize: 9 }}>→ 다음</span>}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{step.label}</div>
                    <div className="tiny muted">{step.desc}</div>
                  </div>
                ))}
              </div>
              <button className="btn ghost" style={{ fontSize: 10, alignSelf: 'flex-end' }} onClick={dismissGuide}>이미 알고 있어요 ×</button>
            </div>
          </div>
        </>
      )}

      {showImport && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} onClick={() => { setShowImport(false); setImportError('') }} />
          <div className="win" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101, width: 'min(380px, 90vw)' }}>
            <div className="win-title">
              <div className="win-title-l"><span>설정 가져오기</span></div>
              <div className="win-controls"><button onClick={() => { setShowImport(false); setImportError('') }}>×</button></div>
            </div>
            <div className="win-body vstack" style={{ gap: 10 }}>
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                Zeta 플롯 프로필 URL을 입력하면 캐릭터와 대화 설정을 자동으로 가져옵니다.
              </div>
              <div className="tiny muted" style={{ fontSize: 10, padding: '6px 8px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)', lineHeight: 1.5 }}>
                예: https://zeta-ai.io/ko/plots/xxx/profile
              </div>
              <input
                className="field"
                placeholder="URL 붙여넣기"
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
                autoFocus
                disabled={importing}
              />
              {collections.length > 0 && (
                <div>
                  <div className="tiny muted" style={{ marginBottom: 4 }}>컬렉션에 추가 <span style={{ opacity: 0.6 }}>(선택)</span></div>
                  <select
                    className="field"
                    value={importCollectionId}
                    onChange={e => setImportCollectionId(e.target.value)}
                    disabled={importing}
                  >
                    <option value="">새 컬렉션 자동 생성</option>
                    {collections.map(col => (
                      <option key={col.id} value={col.id}>{col.title}</option>
                    ))}
                  </select>
                </div>
              )}
              {importError && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {importError}</div>}
              <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => { setShowImport(false); setImportError('') }}>취소</button>
                <button className="btn primary" style={{ fontSize: 11 }} disabled={importing || !importUrl.trim()} onClick={handleImport}>
                  {importing ? '가져오는 중...' : '가져오기'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flexWrap: 'wrap',
        gap: 14,
        padding: '10px 4px 10px 4px',
        alignItems: 'flex-start',
        alignContent: 'flex-start',
        maxHeight: 'calc(100dvh - 80px)',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}>
        {icons.map(({ label, icon, href }) => (
          <div key={label} className="di" onClick={() => router.push(href)} style={{ cursor: 'pointer' }}>
            <div className="di-pic">
              {typeof icon === 'string'
                ? <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center' }}>{icon}</div>
                : icon}
            </div>
            <span style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>{label}</span>
          </div>
        ))}
        <div className="di" onClick={() => setShowImport(true)} style={{ cursor: 'pointer' }}>
          <div className="di-pic">
            <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', fontSize: 26 }}>↓</div>
          </div>
          <span style={{ textAlign: 'center' }}>설정{'\n'}가져오기</span>
        </div>
      </div>

      {!showGuide && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }} onClick={() => setShowGuide(true)}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--hot-pink)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.25)', border: '2px solid rgba(255,255,255,0.2)' }}>?</div>
          <div style={{ fontSize: 9, color: 'var(--ink-soft)', fontWeight: 600 }}>가이드</div>
        </div>
      )}
    </>
  )
}
