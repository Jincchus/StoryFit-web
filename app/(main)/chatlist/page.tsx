'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ConvItem {
  id: string
  title: string
  mode: string
  currentAI: string
  updatedAt: string
  isPinned: boolean
  isAutoCreated: boolean
  tags: string[]
  sourceUrl: string
  characters: { character: { name: string; kind: string; avatarUrl?: string } }[]
  messages: { content: string }[]
  personaCharacter?: { name: string } | null
  suggestRepliesEnabled?: boolean
  autoChapterEnabled?: boolean
  chapter?: number
}

function getSource(sourceUrl: string): 'ZETA' | 'MELTING' | 'WHIF' | 'TIKITA' | 'CHUB' | 'ROFANAI' | 'LOVEYDOVEY' | 'STORYFIT' {
  if (sourceUrl?.includes('zeta-ai.io')) return 'ZETA'
  if (sourceUrl?.includes('melting.chat')) return 'MELTING'
  if (sourceUrl?.includes('whif.')) return 'WHIF'
  if (sourceUrl?.includes('tikita.ai')) return 'TIKITA'
  if (sourceUrl?.includes('chub.ai')) return 'CHUB'
  if (sourceUrl?.includes('rofan.ai')) return 'ROFANAI'
  if (sourceUrl?.includes('loveydovey.ai')) return 'LOVEYDOVEY'
  return 'STORYFIT'
}

function highlightMatch(snippet: string, query: string): React.ReactNode {
  const idx = snippet.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return snippet
  return (
    <>
      {snippet.slice(0, idx)}
      <mark style={{ background: 'var(--lavender)', color: 'var(--hot-pink)', fontWeight: 700, padding: 0 }}>
        {snippet.slice(idx, idx + query.length)}
      </mark>
      {snippet.slice(idx + query.length)}
    </>
  )
}

function previewText(content: string): string {
  return content
    .replace(/\*[^*\n]+\*/g, '')
    .replace(/\n+/g, ' ')
    .trim()
}

const MODE_LABEL: Record<string, string> = {
  multiStory: '👥 멀티스토리',
  story: '📖 스토리',
}

const MODE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'story', label: '📖 스토리' },
  { key: 'multi', label: '👥 멀티' },
] as const

type ModeFilter = typeof MODE_FILTERS[number]['key']

const SOURCE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'STORYFIT', label: 'STORYFIT' },
  { key: 'ZETA', label: 'ZETA' },
  { key: 'MELTING', label: 'MELTING' },
  { key: 'WHIF', label: 'WHIF' },
  { key: 'TIKITA', label: 'TIKITA' },
  { key: 'CHUB', label: 'CHUB' },
  { key: 'ROFANAI', label: 'rofanai' },
  { key: 'LOVEYDOVEY', label: 'loveydovey' },
] as const

type SourceFilter = typeof SOURCE_FILTERS[number]['key']

interface MsgSearchResult {
  messageId: string
  role: string
  snippet: string
  createdAt: string
  conversationId: string
  convTitle: string
  isArchived: boolean
  charName: string
  charAvatarUrl: string | null
}

const SOURCE_BADGE_COLOR: Record<string, string> = {
  ZETA: '#7c5cfc',
  MELTING: '#e85454',
  WHIF: '#4fa8e8',
  TIKITA: '#16b8a6',
  CHUB: '#ff6a3d',
  ROFANAI: '#e0529c',
  LOVEYDOVEY: '#ff5a5f',
}

export default function ChatListPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<ConvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [query, setQuery] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent')
  const [msgResults, setMsgResults] = useState<MsgSearchResult[]>([])
  const [msgSearching, setMsgSearching] = useState(false)
  const [showMsgResults, setShowMsgResults] = useState(true)
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const touchStartRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setMsgResults([]); setMsgSearching(false); return }
    setMsgSearching(true)
    const timer = setTimeout(() => {
      api.get(`/api/search/messages?q=${encodeURIComponent(q)}`)
        .then(res => setMsgResults(res.results ?? []))
        .catch(() => setMsgResults([]))
        .finally(() => setMsgSearching(false))
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    api.get('/api/conversations')
      .then(setConversations)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }

  const exitSelect = () => { setSelecting(false); setSelected(new Set()) }

  const togglePin = async (e: React.MouseEvent, conv: ConvItem) => {
    e.stopPropagation()
    const next = !conv.isPinned
    setConversations(prev => {
      const updated = prev.map(c => c.id === conv.id ? { ...c, isPinned: next } : c)
      return [...updated].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    })
    await api.patch(`/api/conversations/${conv.id}`, { isPinned: next })
  }

  const archiveConv = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.patch(`/api/conversations/${id}`, { isArchived: true })
    setConversations(prev => prev.filter(c => c.id !== id))
  }

  const filtered = conversations.filter(c => {
    if (modeFilter === 'multi' && c.mode !== 'multiStory') return false
    if (modeFilter !== 'all' && modeFilter !== 'multi' && c.mode !== modeFilter) return false
    if (sourceFilter !== 'all' && getSource(c.sourceUrl) !== sourceFilter) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return c.title.toLowerCase().includes(q) ||
      c.characters.some(cc => cc.character.name.toLowerCase().includes(q))
  }).sort((a, b) => {
    if (sortBy === 'name') {
      const na = a.characters[0]?.character.name ?? a.title
      const nb = b.characters[0]?.character.name ?? b.title
      return na.localeCompare(nb, 'ko')
    }
    // recent: 핀 우선, 그 다음 updatedAt
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleting) return
    setDeleting(true)
    setConfirmBulk(false)
    try {
      await Promise.all(Array.from(selected).map(id => api.delete(`/api/conversations/${id}`)))
      setConversations(prev => prev.filter(c => !selected.has(c.id)))
      exitSelect()
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteOne = async (id: string) => {
    await api.delete(`/api/conversations/${id}`)
    setConversations(prev => prev.filter(c => c.id !== id))
    setConfirmDeleteId(null)
  }

  return (
    <>
    {confirmDeleteId && (
      <ConfirmDialog
        message="이 대화를 삭제할까요? 복구할 수 없습니다."
        onConfirm={() => handleDeleteOne(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    )}
    {confirmBulk && (
      <ConfirmDialog
        message={`선택한 대화 ${selected.size}개를 삭제할까요?`}
        onConfirm={handleDeleteSelected}
        onCancel={() => setConfirmBulk(false)}
      />
    )}
    <Win title="채팅 목록 (Chat List)" icon={PixelIcons.chat}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>최근 대화</div>
            <div className="tiny muted">{conversations.length}개의 진행 중인 롤플레이</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            {selecting ? (
              <>
                <button className="btn ghost" style={{ fontSize: 10 }} onClick={toggleAll}>
                  {selected.size === filtered.length ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  className="btn danger"
                  style={{ fontSize: 10 }}
                  disabled={selected.size === 0 || deleting}
                  onClick={() => setConfirmBulk(true)}
                >
                  {deleting ? '삭제 중...' : `✕ 삭제 (${selected.size})`}
                </button>
                <button className="btn ghost" style={{ fontSize: 10 }} onClick={exitSelect}>취소</button>
              </>
            ) : (
              <>
                {conversations.length > 0 && (
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setSelecting(true)}>☑ 선택</button>
                )}
                <button className="btn primary" onClick={() => router.push('/conversations/new')}>✦ 새 대화 시작</button>
              </>
            )}
          </div>
        </div>

        <div className="hstack" style={{ flexShrink: 0, gap: 6 }}>
          <input
            className="field"
            placeholder="대화 제목 또는 캐릭터명 검색..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          {query && (
            <button className="btn ghost" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => setQuery('')}>✕ 지우기</button>
          )}
        </div>

        {query.trim().length >= 2 && (
          <div style={{ flexShrink: 0, maxHeight: '40%', overflowY: 'auto', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)', background: 'var(--pane)' }}>
            <button
              className="acc-toggle"
              style={{ padding: '6px 10px', width: '100%' }}
              onClick={() => setShowMsgResults(v => !v)}
            >
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                💬 본문 검색 결과 {msgSearching ? '(검색 중...)' : `(${msgResults.length})`}
              </span>
              <span className={`acc-arrow ${showMsgResults ? 'open' : ''}`}>▼</span>
            </button>
            {showMsgResults && !msgSearching && msgResults.length === 0 && (
              <div className="tiny muted" style={{ padding: '4px 10px 8px' }}>대화 본문에서 일치하는 내용이 없습니다.</div>
            )}
            {showMsgResults && msgResults.map(r => (
              <div
                key={r.messageId}
                style={{ padding: '6px 10px', borderTop: '1px solid var(--chrome-border)', cursor: 'pointer' }}
                onClick={() => router.push(`/conversations/${r.conversationId}?msg=${r.messageId}`)}
              >
                <div className="spread" style={{ gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.convTitle}
                    {r.isArchived && <span style={{ marginLeft: 5, fontSize: 9, color: '#8b5cf6' }}>완결</span>}
                  </div>
                  <div className="tiny muted" style={{ flexShrink: 0 }}>
                    {new Date(r.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600 }}>{r.role === 'user' ? '나' : r.charName}</span>
                  {' · '}
                  {highlightMatch(r.snippet, query.trim())}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="hstack" style={{ flexShrink: 0, gap: 4, flexWrap: 'wrap' }}>
          {MODE_FILTERS.map(f => (
            <button
              key={f.key}
              className={`btn ${modeFilter === f.key ? 'primary' : 'ghost'}`}
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={() => setModeFilter(f.key)}
            >{f.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            className={`btn ${sortBy === 'name' ? 'primary' : 'ghost'}`}
            style={{ fontSize: 10, padding: '2px 8px' }}
            onClick={() => setSortBy(s => s === 'recent' ? 'name' : 'recent')}
            title="정렬 전환"
          >{sortBy === 'recent' ? '⏱ 최신순' : '가나다순'}</button>
        </div>

        <div className="hstack" style={{ flexShrink: 0, gap: 4, flexWrap: 'wrap' }}>
          {SOURCE_FILTERS.map(f => (
            <button
              key={f.key}
              className={`btn ${sourceFilter === f.key ? 'primary' : 'ghost'}`}
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={() => setSourceFilter(f.key)}
            >{f.label}</button>
          ))}
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton-row">
                <div className="skeleton skeleton-thumb" />
                <div className="skeleton-lines">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))
          ) : error ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
              <div style={{ fontSize: 32 }}>⚠</div>
              <div style={{ marginTop: 8, color: '#ff6b8a' }}>대화 목록을 불러오지 못했습니다</div>
              <div className="tiny" style={{ marginTop: 4 }}>잠시 후 새로고침 해주세요</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
              <svg viewBox="0 0 16 16" width="40" height="40" shapeRendering="crispEdges" style={{ display:'block', margin:'0 auto' }}>
                <rect x="1" y="4" width="3" height="2" fill="var(--hot-pink)"/>
                <rect x="4" y="3" width="2" height="1" fill="var(--hot-pink)"/>
                <rect x="6" y="2" width="2" height="1" fill="var(--hot-pink)"/>
                <rect x="8" y="2" width="2" height="1" fill="var(--hot-pink)"/>
                <rect x="10" y="3" width="2" height="1" fill="var(--hot-pink)"/>
                <rect x="12" y="4" width="3" height="2" fill="var(--hot-pink)"/>
                <rect x="1" y="6" width="14" height="3" fill="var(--hot-pink)"/>
                <rect x="2" y="9" width="12" height="2" fill="var(--hot-pink)"/>
                <rect x="3" y="11" width="10" height="2" fill="var(--hot-pink)"/>
                <rect x="5" y="13" width="6" height="1" fill="var(--hot-pink)"/>
                <rect x="6" y="14" width="4" height="1" fill="var(--hot-pink)"/>
                <rect x="7" y="15" width="2" height="1" fill="var(--hot-pink)"/>
              </svg>
              {query.trim() || modeFilter !== 'all' || sourceFilter !== 'all'
                ? <div style={{ marginTop: 8 }}>검색 결과가 없어요</div>
                : <>
                    <div style={{ marginTop: 8 }}>아직 시작한 롤플레이가 없어요</div>
                    <div className="tiny" style={{ marginTop: 4 }}>위의 <b>새 대화 시작</b> 버튼을 눌러보세요</div>
                  </>
              }
            </div>
          ) : filtered.map(conv => {
            const char = conv.characters[0]?.character
            const lastLine = conv.messages[0]?.content ?? ''
            const when = new Date(conv.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            const isChecked = selected.has(conv.id)

            return (
              <div key={conv.id} className="swipe-wrap">
                {!selecting && swipedId === conv.id && (
                  <div className="swipe-actions">
                    <button
                      style={{ background: 'var(--accent)' }}
                      aria-label={conv.isPinned ? '핀 해제' : '상단 고정'}
                      onClick={e => { togglePin(e, conv); setSwipedId(null) }}
                    >📌</button>
                    <button
                      style={{ background: '#8b5cf6' }}
                      aria-label="서재로 보내기"
                      onClick={e => { archiveConv(e, conv.id); setSwipedId(null) }}
                    >📚</button>
                    <button
                      style={{ background: 'var(--red)' }}
                      aria-label="삭제"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(conv.id); setSwipedId(null) }}
                    >🗑</button>
                  </div>
                )}
              <div
                className={`row swipe-content${swipedId === conv.id ? ' open' : ''}`}
                style={{
                  position: 'relative',
                  cursor: selecting ? 'pointer' : undefined,
                  background: isChecked ? 'var(--lavender)' : conv.isPinned ? 'var(--pane)' : 'var(--paper)',
                  borderLeft: conv.isPinned ? '2px solid var(--hot-pink)' : undefined,
                }}
                onTouchStart={e => {
                  touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
                }}
                onTouchEnd={e => {
                  if (selecting) return
                  const dx = e.changedTouches[0].clientX - touchStartRef.current.x
                  const dy = Math.abs(e.changedTouches[0].clientY - touchStartRef.current.y)
                  if (dy > 40) return
                  if (dx < -40) setSwipedId(conv.id)
                  else if (dx > 40) setSwipedId(null)
                }}
                onClick={() => {
                  if (swipedId === conv.id) { setSwipedId(null); return }
                  if (swipedId) { setSwipedId(null) }
                  selecting ? toggleSelect(conv.id) : router.push(conv.isAutoCreated ? `/conversations/new?from=${conv.id}` : `/conversations/${conv.id}`)
                }}
              >
                {selecting && (
                  <div style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 22 }}>
                    <div style={{
                      width: 18, height: 18,
                      border: `2px solid ${isChecked ? 'var(--hot-pink)' : 'var(--chrome-border)'}`,
                      background: isChecked ? 'var(--hot-pink)' : 'transparent',
                      borderRadius: 2,
                      display: 'grid', placeItems: 'center',
                      flexShrink: 0,
                    }}>
                      {isChecked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                    </div>
                  </div>
                )}
                <div className="thumb">
                  {char?.avatarUrl
                    ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <PixelAvatar kind={char?.kind as any} size={36} />
                  }
                </div>
                <div className="meta">
                  <h4>
                    {conv.isPinned && <span style={{ color: 'var(--hot-pink)', marginRight: 4, fontSize: 10 }}>📌</span>}
                    {conv.title}
                    {conv.personaCharacter && <span className="muted" style={{ fontWeight: 400 }}> · {conv.personaCharacter.name}로 플레이</span>}
                  </h4>
                  <p className="muted" style={{ fontSize: 10, marginBottom: 2 }}>{char?.name}</p>
                  <p>{previewText(lastLine)}</p>
                </div>
                <div className="vstack" style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <div className="hstack" style={{ gap: 4 }}>
                    {conv.isAutoCreated && <span style={{ fontSize: 8, fontWeight: 700, background: '#4fa8e8', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>설정 필요</span>}
                    {getSource(conv.sourceUrl) !== 'STORYFIT' && (
                      <span style={{ fontSize: 8, fontWeight: 700, background: SOURCE_BADGE_COLOR[getSource(conv.sourceUrl)] ?? '#666', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>{getSource(conv.sourceUrl)}</span>
                    )}
                    <span className="mode-badge" style={{ fontSize: 8 }}>{MODE_LABEL[conv.mode] ?? conv.mode}</span>
                    {conv.autoChapterEnabled && (conv.chapter ?? 1) > 1 && (
                      <span className="melting-chapter-badge" style={{ fontSize: 8, marginLeft: 4 }}>{conv.chapter ?? 1}장</span>
                    )}
                  </div>
                  <span className="when">{when}</span>
                  {!selecting && (
                    <div className="hstack row-inline-actions" style={{ gap: 4 }}>
                      <button
                        className={`btn ${conv.isPinned ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 10, padding: '3px 8px' }}
                        onClick={e => togglePin(e, conv)}
                        title={conv.isPinned ? '핀 해제' : '상단 고정'}
                      >📌</button>
                      <button
                        className="btn ghost"
                        style={{ fontSize: 10, padding: '3px 8px' }}
                        onClick={e => archiveConv(e, conv.id)}
                        title="서재로 보내기"
                      >📚</button>
                      <button
                        className="btn danger"
                        style={{ fontSize: 10, padding: '3px 8px', minWidth: 44 }}
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(conv.id) }}
                      >✕ 삭제</button>
                    </div>
                  )}
                </div>
              </div>
              </div>
            )
          })}
        </div>
      </div>
    </Win>
    </>
  )
}
