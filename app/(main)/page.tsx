'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIsAdmin, apiLogout } from '@/lib/authClient'
import { api } from '@/lib/api'

interface RecentConv {
  id: string
  title: string
  mode: string
  updatedAt: string
  characters: { character: { name: string; avatarUrl?: string } }[]
  messages: { content: string }[]
}

type GuideItem = { emoji: string; label: string; desc: string; href?: string }

const GUIDE_SECTIONS: { title: string; items: GuideItem[] }[] = [
  {
    title: '🚀 시작하기',
    items: [
      { emoji: '🎭', label: '① 캐릭터 선택', desc: '/characters 에서 프리셋을 고르거나 직접 만드세요.', href: '/characters' },
      { emoji: '✨', label: '② 대화 설정', desc: '모드·페르소나·시나리오를 고른 뒤 대화를 시작하세요.', href: '/conversations/new' },
      { emoji: '💬', label: '③ 채팅 목록', desc: '진행 중인 대화는 채팅 목록에서 이어갈 수 있습니다.', href: '/chatlist' },
    ],
  },
  {
    title: '📥 외부 가져오기',
    items: [
      { emoji: '⚡', label: 'ZETA (zeta-ai.io)', desc: '플롯 프로필 URL을 붙여넣으면 캐릭터·설정을 자동으로 가져옵니다.', href: '/zeta' },
      { emoji: '🔥', label: 'Melting (melting.chat)', desc: '캐릭터 페이지 URL로 대화 상대를 바로 불러올 수 있습니다.', href: '/melting' },
      { emoji: '🪐', label: 'WHIF (whif.io)', desc: 'WHIF 센터에서 세계관 단위로 캐릭터를 관리하고 가져올 수 있습니다.', href: '/whif' },
      { emoji: '🎫', label: 'Tikita (tikita.ai)', desc: '스토리 URL을 붙여넣으면 캐릭터·첫 장면·설정을 자동으로 가져옵니다.', href: '/tikita' },
      { emoji: '🧩', label: 'Chub (chub.ai)', desc: '외국 센터. 캐릭터 URL을 붙여넣으면 AI가 한국어로 번역해 자동으로 가져옵니다.', href: '/chub' },
      { emoji: '💗', label: 'rofanai (rofan.ai)', desc: '로맨스 판타지 캐릭터 URL을 붙여넣으면 설정·첫 장면을 자동으로 가져옵니다.', href: '/rofan' },
      { emoji: '💞', label: 'loveydovey (loveydovey.ai)', desc: '캐릭터 URL을 붙여넣으면 메타데이터(이름·소개·장르·이미지)를 가져옵니다.', href: '/loveydovey' },
      { emoji: '🩵', label: 'babechat (babechat.ai)', desc: '캐릭터 URL을 붙여넣으면 설정·도입부를 가져옵니다. (관리자 인증 토큰 설정 필요)', href: '/babechat' },
    ],
  },
  {
    title: '🎮 대화 모드',
    items: [
      { emoji: '📖', label: '스토리', desc: 'AI가 장면을 서술하고 선택지를 제시하는 인터랙티브 소설.' },
      { emoji: '👥', label: '멀티스토리', desc: '여러 캐릭터가 함께 이야기 속에서 상호작용합니다.' },
    ],
  },
  {
    title: '⚙️ 주요 기능',
    items: [
      { emoji: '🎭', label: '내 역할 (페르소나)', desc: '대화 설정창에서 내가 연기할 캐릭터를 지정할 수 있습니다.' },
      { emoji: '📖', label: '로어북', desc: '키워드가 대화에 등장하면 관련 설정을 AI가 자동으로 참조합니다.' },
      { emoji: '🧠', label: '메모리 & 장기기억', desc: '긴 대화를 자동 요약해 AI가 대화 맥락을 장기간 유지합니다.' },
      { emoji: '🌿', label: '분기 (Branch)', desc: '대화 중 어느 지점에서든 스토리를 나눠 다른 결말을 탐색하세요.' },
    ],
  },
]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

function previewText(content: string): string {
  return content.replace(/\*[^*\n]+\*/g, '').replace(/\n+/g, ' ').trim().slice(0, 60)
}

export default function HomePage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSavedId, setImportSavedId] = useState('')
  const [recent, setRecent] = useState<RecentConv[]>([])
  const [recentLoading, setRecentLoading] = useState(true)

  useEffect(() => {
    setIsAdmin(getIsAdmin())
    if (!localStorage.getItem('sf_onboarded')) setShowGuide(true)
    api.get('/api/conversations')
      .then((convs: RecentConv[]) => {
        const sorted = [...(convs ?? [])].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        setRecent(sorted.slice(0, 3))
      })
      .catch(() => {})
      .finally(() => setRecentLoading(false))
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

  const handleLogout = async () => {
    await apiLogout()
    router.replace('/login')
  }

  const shortcuts = [
    { emoji: '🤖', label: 'AI 채팅', onClick: () => router.push('/assistant') },
    { emoji: '🎭', label: '캐릭터', onClick: () => router.push('/characters') },
    { emoji: '📥', label: '가져오기', onClick: () => setShowImport(true) },
    { emoji: '📖', label: '가이드', onClick: () => router.push('/guide') },
    ...(isAdmin ? [{ emoji: '🔧', label: '관리자', onClick: () => router.push('/admin') }] : []),
    { emoji: '⏻', label: '로그아웃', onClick: handleLogout },
  ]

  return (
    <>
      {showGuide && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100 }} onClick={dismissGuide} />
          <div className="win" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101, width: 'min(420px, 92vw)', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
            <div className="win-title">
              <div className="win-title-l"><span>StoryFit 가이드</span></div>
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
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{item.emoji}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>
                          {item.label}
                          {item.href && <span style={{ color: 'var(--hot-pink)', marginLeft: 4, fontSize: 9 }}>→</span>}
                        </div>
                        <div className="tiny muted" style={{ lineHeight: 1.5, marginTop: 2 }}>{item.desc}</div>
                      </div>
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
              {importError && <div className="tiny" style={{ color: 'var(--red)' }}>⚠ {importError}</div>}
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

      <div className="scroll" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button className="btn primary" style={{ justifyContent: 'center', padding: '12px 14px', fontSize: 14 }} onClick={() => router.push('/conversations/new')}>
          ✨ 새 대화 시작
        </button>

        <div className="vstack" style={{ gap: 8 }}>
          <div className="spread">
            <div style={{ fontSize: 13, fontWeight: 700 }}>이어하기</div>
            {recent.length > 0 && (
              <button className="btn ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => router.push('/chatlist')}>전체 보기 ›</button>
            )}
          </div>
          {recentLoading ? (
            <>
              {[0, 1, 2].map(i => (
                <div key={i} className="skeleton-row" style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)' }}>
                  <div className="skeleton skeleton-thumb" style={{ borderRadius: '50%' }} />
                  <div className="skeleton-lines">
                    <div className="skeleton skeleton-line medium" />
                    <div className="skeleton skeleton-line short" />
                  </div>
                </div>
              ))}
            </>
          ) : recent.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>📖</div>
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>아직 진행 중인 이야기가 없어요.<br />새 대화를 시작해보세요.</div>
            </div>
          ) : (
            recent.map(c => {
              const char = c.characters[0]?.character
              const preview = c.messages[0]?.content ? previewText(c.messages[0].content) : ''
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/conversations/${c.id}`)}
                  style={{
                    appearance: 'none', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                    background: 'var(--pane)', border: '1px solid var(--hairline)', color: 'var(--ink)',
                  }}
                >
                  <div className="thumb" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: 'var(--bubble-other)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                    {char?.avatarUrl
                      ? <img src={char.avatarUrl} alt="" />
                      : <span style={{ fontSize: 18 }}>🎭</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                    {preview && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>
                    )}
                  </div>
                  <span className="tiny muted" style={{ flexShrink: 0 }}>{timeAgo(c.updatedAt)}</span>
                </button>
              )
            })
          )}
        </div>

        <div className="vstack" style={{ gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>바로가기</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {shortcuts.map(s => (
              <button
                key={s.label}
                onClick={s.onClick}
                style={{
                  appearance: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 8px', borderRadius: 'var(--radius-lg)',
                  background: 'var(--pane)', border: '1px solid var(--hairline)', color: 'var(--ink)',
                  fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
                }}
              >
                <span style={{ fontSize: 22 }}>{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
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
