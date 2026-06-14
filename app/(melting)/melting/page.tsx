'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { sortByOption, type SortOption } from '@/lib/listSort'
import { useScrollRestore } from '@/lib/useScrollRestore'
import TagFilterBar from '@/components/ui/TagFilterBar'
import { buildTagGroups, type CenterTagConfig } from '@/lib/tagGroups'
import { useFavorites } from '@/lib/useFavorites'

interface MChar {
  id: string; title: string; coverImageUrl: string; tags: string[]
  characters: { id: string; name: string; avatarUrl: string | null }[]
  completed?: boolean
  started?: boolean
  createdAt?: string
}

export default function MeltingListPage() {
  const router = useRouter()
  const [chars, setChars] = useState<MChar[]>([])
  const [view, setView] = useState<'active' | 'waiting' | 'completed' | 'favorites'>('active')
  const { isFav, toggleFav } = useFavorites()
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [sort, setSort] = useState<SortOption>('latest')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)
  const toggleSearch = () => setSearchOpen(o => { if (o) { setQuery(''); setSelectedTags([]) } return !o })

  useEffect(() => {
    setEditMode(localStorage.getItem('melting_edit') === '1')
    setSort((localStorage.getItem('melting_sort') as SortOption) || 'latest')
    setView((sessionStorage.getItem('melting_view') as typeof view) || 'active')
    fetchData()
    api.get('/api/center-tags').then(setTagConfig).catch(() => {})
  }, [])

  const handleSort = (v: SortOption) => {
    setSort(v); localStorage.setItem('melting_sort', v)
  }

  const handleView = (v: typeof view) => {
    setView(v); sessionStorage.setItem('melting_view', v)
  }

  const scrollRef = useScrollRestore(`melting_scroll_${view}`, !loading)

  const fetchData = async () => {
    setLoading(true)
    try { setChars(await api.get('/api/collections?isMelting=true')) }
    finally { setLoading(false) }
  }

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true); setMsg('')
    try {
      await api.post('/api/characters/import', { url: importUrl.trim() })
      setImportUrl(''); setMsg('✓ 가져왔습니다'); setMenuOpen(false)
      await fetchData()
    } catch (e: any) { setMsg('⚠ ' + (e.message ?? '가져오기 실패')) }
    finally { setImporting(false) }
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('melting_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const createCharacter = async () => {
    const title = prompt('새 캐릭터 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://melting.chat/local/${Date.now()}` })
    setMenuOpen(false); await fetchData()
  }

  const deleteChar = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  const matchesTag = (tags: string[]) => selectedTags.length === 0 || selectedTags.every(t => tags.includes(t))
  const matchesQuery = (title: string) => { const q = query.trim().toLowerCase(); return !q || title.toLowerCase().includes(q) }
  const toggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  const tagGroups = buildTagGroups(chars.flatMap(c => c.tags ?? []), tagConfig)
  const visibleChars = sortByOption(
    chars.filter(c =>
      (view === 'favorites' ? isFav('collection', c.id)
      : view === 'completed' ? c.completed
      : view === 'waiting' ? !c.started
      : !c.completed && !!c.started) && matchesTag(c.tags) && matchesQuery(c.title)
    ),
    sort, c => c.title, c => c.createdAt ?? ''
  )

  return (
    <>
      <div className="melting-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="melting-iconbtn" aria-label="홈으로" onClick={() => router.push('/')}>🏠</button>
          <div className="melting-logo">melting</div>
        </div>
        <button className="melting-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="melting-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input className="field" placeholder="https://melting.chat/..." value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
                style={{ fontSize: 12 }} />
              <button className="melting-menu-item"
                style={{ background: 'var(--m-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="melting-menu-item" onClick={createCharacter}>+ 새 캐릭터 만들기</button>
            <button className="melting-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'active' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('active')}>진행 중</button>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'waiting' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'waiting' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('waiting')}>대기</button>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'completed' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('completed')}>완결</button>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'favorites' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'favorites' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('favorites')}>★ 즐겨찾기</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: searchOpen ? 'var(--m-accent)' : 'var(--m-surface-2)', color: searchOpen ? '#fff' : 'var(--m-ink-soft)' }} onClick={toggleSearch}>🔍 검색</button>
          <select
            className="field"
            style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
            value={sort}
            onChange={e => handleSort(e.target.value as SortOption)}
          >
            <option value="latest">최신순</option>
            <option value="alpha">가나다순</option>
          </select>
        </div>
      </div>

      {searchOpen && (
        <>
          <div style={{ padding: '0 16px 8px' }}>
            <input
              className="field"
              style={{ fontSize: 12, width: '100%' }}
              placeholder="이름으로 검색"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} chipClass="melting-chip" accentVar="--m-accent" />
        </>
      )}

      <div className="melting-scroll" ref={scrollRef}>
        {loading ? (
          <div className="melting-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="melting-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 0 }} />
                <div className="melting-card-body">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleChars.length === 0 ? (
          selectedTags.length > 0 || query.trim()
            ? <div className="melting-empty">검색 결과가 없습니다.</div>
          : view === 'favorites'
            ? <div className="melting-empty">즐겨찾기한 캐릭터가 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
          : view === 'completed'
            ? <div className="melting-empty">완결한 캐릭터가 없습니다.</div>
            : view === 'waiting'
              ? <div className="melting-empty">대기 중인 캐릭터가 없습니다.</div>
              : chars.length === 0
                ? <div className="melting-empty">가져온 캐릭터가 없습니다<br />⋮ 메뉴에서 melting.chat 캐릭터 URL로 가져오세요.</div>
                : <div className="melting-empty">진행 중인 캐릭터가 없습니다.</div>
        ) : (
          <div className="melting-grid">
            {visibleChars.map(c => {
              const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
              return (
                <div key={c.id} className="melting-card" style={{ position: 'relative' }}
                  onClick={() => !editMode && router.push(`/melting/characters/${c.id}`)}>
                  {c.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--m-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                  {thumb ? <img className="melting-card-img" src={thumb} alt="" /> : <div className="melting-card-img" />}
                  <div className="melting-card-body">
                    <div className="melting-card-title">{c.title}</div>
                    {c.tags?.length > 0 && (
                      <div className="melting-card-tags">
                        {c.tags.slice(0, 3).map(t => <span key={t} className="melting-chip">#{t}</span>)}
                      </div>
                    )}
                  </div>
                  {editMode ? (
                    <button onClick={e => { e.stopPropagation(); deleteChar(c.id) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                        border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); toggleFav('collection', c.id) }}
                      aria-label="즐겨찾기"
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)',
                        border: 'none', color: isFav('collection', c.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isFav('collection', c.id) ? '★' : '☆'}</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
