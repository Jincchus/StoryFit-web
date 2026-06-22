'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { sortByOption, type SortOption } from '@/lib/listSort'
import { useScrollRestore } from '@/lib/useScrollRestore'
import { useInfiniteScroll } from '@/lib/useInfiniteScroll'
import { useFavorites } from '@/lib/useFavorites'
import { viewCounts } from '@/lib/centerCounts'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { useDisplayName } from '@/lib/useDisplayName'

interface TingleCol {
  id: string; title: string; coverImageUrl: string; tags: string[]; description?: string
  sourceUrl: string
  characters: { id: string; name: string; avatarUrl: string | null }[]
  completed?: boolean; started?: boolean; createdAt?: string; lastActivityAt?: string
}

function detectTingleType(sourceUrl: string) {
  if (sourceUrl.includes('/universes/')) return { label: '서사', color: '#a78bfa' }
  if (sourceUrl.includes('/scenes/')) return { label: '테마', color: '#06bfd6' }
  return { label: '캐릭터', color: '#ff5776' }
}

function detailPath(col: TingleCol) {
  const url = col.sourceUrl
  if (url.includes('/universes/')) {
    const m = url.match(/\/universes\/(\d+)/)
    return m ? `/tingle/universes/${m[1]}` : `/tingle/characters/${col.id}`
  }
  if (url.includes('/scenes/')) {
    const m = url.match(/\/scenes\/(\d+)/)
    return m ? `/tingle/scenes/${m[1]}` : `/tingle/characters/${col.id}`
  }
  return `/tingle/characters/${col.id}`
}

export default function TingleListPage() {
  const router = useRouter()
  const [cols, setCols] = useState<TingleCol[]>([])
  const [view, setView] = useState<'active' | 'waiting' | 'completed' | 'favorites'>('active')
  const { isFav, toggleFav } = useFavorites()
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [sort, setSort] = useState<SortOption>('latest')
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const userName = useDisplayName()
  const toggleSearch = () => setSearchOpen(o => { if (o) setQuery(''); return !o })

  useEffect(() => {
    setEditMode(localStorage.getItem('tg_edit') === '1')
    setSort((localStorage.getItem('tg_sort') as SortOption) || 'latest')
    setView((sessionStorage.getItem('tg_view') as typeof view) || 'active')
    fetchData()
  }, [])

  const handleSort = (v: SortOption) => {
    setSort(v); localStorage.setItem('tg_sort', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }
  const handleView = (v: typeof view) => { setView(v); sessionStorage.setItem('tg_view', v) }

  const scrollRef = useScrollRestore(`tg_scroll_${view}`, !loading)
  const { count, sentinelRef } = useInfiniteScroll([view, sort, query, randomSeed], scrollRef)

  const fetchData = async () => {
    setLoading(true)
    try { setCols(await api.get('/api/collections?isTingle=true')) }
    finally { setLoading(false) }
  }

  const handleImport = async () => {
    const urls = importUrl.split('\n').map(u => u.trim()).filter(Boolean)
    if (urls.length === 0 || importing) return
    setImporting(true)
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < urls.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${urls.length})`)
      try { await api.post('/api/characters/import', { url: urls[i] }); ok++ }
      catch { failed.push(urls[i]) }
    }
    setImportUrl(failed.join('\n'))
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.length}개 실패` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) setMenuOpen(false)
    await fetchData()
    setImporting(false)
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('tg_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deleteCol = async (id: string) => {
    if (!confirm('이 항목을 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  const matchesQuery = (c: TingleCol) => {
    const q = query.trim().toLowerCase()
    return !q || c.title.toLowerCase().includes(q) || c.tags?.some(t => t.toLowerCase().includes(q))
  }

  const counts = viewCounts(cols)
  const visible = sortByOption(
    cols.filter(c =>
      (view === 'favorites' ? isFav('collection', c.id)
      : view === 'completed' ? c.completed
      : view === 'waiting' ? !c.started
      : !c.completed && !!c.started) && matchesQuery(c)
    ),
    sort, c => c.title, c => c.createdAt ?? '', c => c.lastActivityAt ?? c.createdAt ?? '', randomSeed
  )

  return (
    <>
      <div className="tingle-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="tingle-iconbtn" aria-label="홈으로" onClick={() => router.push('/')}>🏠</button>
          <div className="tingle-logo">tingle</div>
        </div>
        <button className="tingle-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="tingle-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea
                className="field"
                placeholder="팅글 URL (캐릭터·서사·테마) — 줄 단위 여러 개 가능"
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                rows={3}
                style={{ fontSize: 12, resize: 'vertical' }}
              />
              <button
                className="tingle-menu-item"
                style={{ background: 'var(--tg-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing}
                onClick={handleImport}
              >{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="tingle-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['active', 'waiting', 'completed', 'favorites'] as const).map(v => (
            <button key={v} className="tingle-chip"
              style={{ cursor: 'pointer', border: 'none', background: view === v ? 'var(--tg-accent)' : 'var(--tg-surface-2)', color: view === v ? '#fff' : 'var(--tg-ink-soft)' }}
              onClick={() => handleView(v)}>
              {v === 'active' ? `진행 중 ${counts.active}` : v === 'waiting' ? `대기 ${counts.waiting}` : v === 'completed' ? `완결 ${counts.completed}` : '★ 즐겨찾기'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="tingle-chip"
            style={{ cursor: 'pointer', border: 'none', background: searchOpen ? 'var(--tg-accent)' : 'var(--tg-surface-2)', color: searchOpen ? '#fff' : 'var(--tg-ink-soft)' }}
            onClick={toggleSearch}>🔍</button>
          <select className="field" style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }} value={sort} onChange={e => handleSort(e.target.value as SortOption)}>
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
          </select>
        </div>
      </div>

      {searchOpen && (
        <div style={{ padding: '0 16px 8px' }}>
          <input className="field" style={{ fontSize: 12, width: '100%' }} placeholder="이름·태그로 검색"
            value={query} onChange={e => setQuery(e.target.value)} autoFocus />
        </div>
      )}

      <div className="tingle-scroll" ref={scrollRef}>
        {loading ? (
          <div className="tingle-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="tingle-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 0 }} />
                <div className="tingle-card-body">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="tingle-empty">
            {query.trim()
              ? '검색 결과가 없습니다.'
              : view === 'favorites' ? '즐겨찾기한 항목이 없습니다.'
              : view === 'completed' ? '완결한 항목이 없습니다.'
              : view === 'waiting' ? '대기 중인 항목이 없습니다.'
              : cols.length === 0
                ? '가져온 항목이 없습니다.\n⋮ 메뉴에서 팅글 URL을 붙여넣어 가져오세요.\n(관리자 설정에서 인증 토큰 설정 필요)'
                : '진행 중인 항목이 없습니다.'}
          </div>
        ) : (
          <div className="tingle-grid">
            {visible.slice(0, count).map(c => {
              const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
              const type = detectTingleType(c.sourceUrl)
              const charNames = c.characters.map(ch => ch.name)
              const desc = c.description?.trim()
                ? replaceDisplayPlaceholders(c.description, userName, charNames)
                : ''
              return (
                <div key={c.id} className="tingle-card" style={{ position: 'relative' }}
                  onClick={() => !editMode && router.push(detailPath(c))}>
                  {c.completed && (
                    <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--tg-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>
                  )}
                  {thumb
                    ? <img className="tingle-card-img" src={thumb} alt="" />
                    : <div className="tingle-card-img" style={{ display: 'grid', placeItems: 'center', fontSize: 32 }}>🎭</div>
                  }
                  <div className="tingle-card-body">
                    <div className="tingle-card-title">{c.title}</div>
                    {desc && (
                      <div style={{ fontSize: 11, color: 'var(--tg-ink-soft)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{desc}</div>
                    )}
                    <div className="tingle-card-tags">
                      <span className="tingle-chip" style={{ background: type.color, color: '#fff' }}>{type.label}</span>
                      {c.tags?.slice(0, 2).map(t => (
                        <span key={t} className="tingle-chip">#{t}</span>
                      ))}
                    </div>
                  </div>
                  {editMode ? (
                    <button onClick={e => { e.stopPropagation(); deleteCol(c.id) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); toggleFav('collection', c.id) }}
                      aria-label="즐겨찾기"
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', color: isFav('collection', c.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 24, height: 24, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isFav('collection', c.id) ? '★' : '☆'}</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </>
  )
}
