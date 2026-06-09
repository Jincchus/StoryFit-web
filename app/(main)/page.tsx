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
  {
    label: 'WHIF 센터',
    icon: (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="38" height="38">
        <rect x="2" y="9" width="12" height="1" fill="#c084fc" />
        <rect x="1" y="8" width="14" height="1" fill="#a78bfa" />
        <rect x="5" y="3" width="6" height="6" fill="#8b5cf6" />
        <rect x="6" y="4" width="4" height="4" fill="#c084fc" />
        <rect x="7" y="5" width="2" height="2" fill="#fff" />
      </svg>
    ),
    href: '/whif'
  },
  { label: '서재', icon: PixelIcons.book, href: '/library' },
  { label: '설정', icon: PixelIcons.sliders, href: '/settings' },
]

const ADMIN_ICON = { label: '관리자\n패널', icon: PixelIcons.settings, href: '/admin' }

const GUIDE_SECTIONS = [
  {
    title: '🚀 시작하기',
    items: [
      { label: '① 캐릭터 선택', desc: '/characters 에서 프리셋을 고르거나 직접 만드세요.', href: '/characters' },
      { label: '② 대화 설정', desc: '모드·페르소나·시나리오를 고른 뒤 대화를 시작하세요.', href: '/conversations/new' },
      { label: '③ 채팅 목록', desc: '진행 중인 대화는 채팅 목록에서 이어갈 수 있습니다.', href: '/chatlist' },
    ],
  },
  {
    title: '📥 외부 가져오기',
    items: [
      { label: 'ZETA (zeta-ai.io)', desc: '플롯 프로필 URL을 붙여넣으면 캐릭터·설정을 자동으로 가져옵니다.' },
      { label: 'Melting (melting.chat)', desc: '캐릭터 페이지 URL로 대화 상대를 바로 불러올 수 있습니다.' },
      { label: 'WHIF (whif.io)', desc: 'WHIF 센터에서 세계관 단위로 캐릭터를 관리하고 가져올 수 있습니다.', href: '/whif' },
    ],
  },
  {
    title: '🎮 대화 모드',
    items: [
      { label: '📖 스토리', desc: 'AI가 장면을 서술하고 선택지를 제시하는 인터랙티브 소설.' },
      { label: '👥 멀티스토리', desc: '여러 캐릭터가 함께 이야기 속에서 상호작용합니다.' },
      { label: '💬 자유 대화 (그룹)', desc: '선택지 없이 여러 캐릭터가 소설식으로 번갈아 대화합니다.' },
    ],
  },
  {
    title: '⚙ 주요 기능',
    items: [
      { label: '내 역할 (페르소나)', desc: '대화 설정창에서 내가 연기할 캐릭터를 지정할 수 있습니다.' },
      { label: '로어북', desc: '키워드가 대화에 등장하면 관련 설정을 AI가 자동으로 참조합니다.' },
      { label: '메모리 & 장기기억', desc: '긴 대화를 자동 요약해 AI가 대화 맥락을 장기간 유지합니다.' },
      { label: '분기 (Branch)', desc: '대화 중 어느 지점에서든 스토리를 나눠 다른 결말을 탐색하세요.' },
    ],
  },
]

export default function HomePage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSavedId, setImportSavedId] = useState('')

  useEffect(() => {
    setIsAdmin(getIsAdmin())
    if (!localStorage.getItem('sf_onboarded')) setShowGuide(true)
  }, [])

  const dismissGuide = () => {
    localStorage.setItem('sf_onboarded', '1')
    setShowGuide(false)
  }

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setImportError('')
    setImportSavedId('')
    try {
      const result = await api.post('/api/characters/import', { url: importUrl.trim() })
      setImportUrl('')
      setImportSavedId(result.conversationId ?? '')
    } catch (e: any) {
      setImportError(e.message ?? '가져오기에 실패했습니다')
    } finally {
      setImporting(false)
    }
  }

  const closeImport = () => { setShowImport(false); setImportError(''); setImportSavedId('') }

  const icons = isAdmin ? [...BASE_ICONS, ADMIN_ICON] : BASE_ICONS

  return (
    <>
      {showGuide && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100 }} onClick={dismissGuide} />
          <div className="win" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101, width: 'min(420px, 92vw)', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
            <div className="win-title">
              <div className="win-title-l"><span>StoryFit 가이드</span></div>
              <div className="win-controls"><button onClick={dismissGuide}>×</button></div>
            </div>
            <div className="win-body vstack" style={{ gap: 14, overflowY: 'auto', flex: 1 }}>
              {GUIDE_SECTIONS.map(section => (
                <div key={section.title} className="vstack" style={{ gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hot-pink)', borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>{section.title}</div>
                  {section.items.map(item => (
                    <div
                      key={item.label}
                      onClick={() => { if (item.href) { dismissGuide(); router.push(item.href) } }}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--chrome-border)',
                        background: 'var(--chrome-face)',
                        cursor: item.href ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700 }}>
                        {item.label}
                        {item.href && <span style={{ color: 'var(--hot-pink)', marginLeft: 4, fontSize: 9 }}>→</span>}
                      </div>
                      <div className="tiny muted" style={{ lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              ))}
              <button className="btn ghost" style={{ fontSize: 10, alignSelf: 'flex-end' }} onClick={dismissGuide}>닫기 ×</button>
            </div>
          </div>
        </>
      )}

      {showImport && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} onClick={closeImport} />
          <div className="win" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101, width: 'min(380px, 90vw)' }}>
            <div className="win-title">
              <div className="win-title-l"><span>설정 가져오기</span></div>
              <div className="win-controls"><button onClick={closeImport}>×</button></div>
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
              {importError && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {importError}</div>}
              {importSavedId && (
                <div className="tiny" style={{ color: 'var(--accent)', lineHeight: 1.6 }}>
                  채팅 목록에 저장되었습니다. 채팅 목록에서 클릭하면 새 대화 설정을 이어서 열 수 있습니다.
                </div>
              )}
              <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {importSavedId && (
                  <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => router.push('/chatlist')}>채팅 목록</button>
                )}
                <button className="btn ghost" style={{ fontSize: 11 }} onClick={closeImport}>{importSavedId ? '닫기' : '취소'}</button>
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
        <div style={{ position: 'fixed', top: 14, right: 14, zIndex: 50, cursor: 'pointer' }} onClick={() => setShowGuide(true)}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--hot-pink)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', border: '2px solid rgba(255,255,255,0.2)' }}>?</div>
        </div>
      )}
    </>
  )
}
