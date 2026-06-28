'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import TagFilterBar from '@/components/ui/TagFilterBar'
import VirtualCardGrid from '@/components/ui/VirtualCardGrid'
import { useCenterList } from '@/lib/useCenterList'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import type { CenterListItem } from '@/lib/centerListSelect'

export default function TikitaListPage() {
  const router = useRouter()
  const {
    items, loading, error,
    view, setView, sort, setSort, query, setQuery,
    selectedTags, toggleTag, clearTags, genderFilter, setGenderFilter,
    searchOpen, toggleSearch,
    counts, tagGroups, tCounts, genderBuckets, visibleChars,
    isFav, toggleFav, scrollRef, refresh,
  } = useCenterList({ indexQuery: 'isTikita=true', storagePrefix: 'tikita' })

  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { setEditMode(localStorage.getItem('tikita_edit') === '1') }, [])

  const handleImport = async () => {
    const urls = importUrl.split(String.fromCharCode(10)).map(u => u.trim()).filter(Boolean)
    if (urls.length === 0 || importing) return
    setImporting(true)
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < urls.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${urls.length})`)
      try { await api.post('/api/characters/import', { url: urls[i] }); ok++ }
      catch { failed.push(urls[i]) }
    }
    setImportUrl(failed.join(String.fromCharCode(10)))
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.length}개 실패 — 다시 가져오기로 재시도` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) setMenuOpen(false)
    await refresh()
    setImporting(false)
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('tikita_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const createCharacter = async () => {
    const title = prompt('새 스토리 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://tikita.ai/local/${Date.now()}` })
    setMenuOpen(false); await refresh()
  }

  const deleteChar = async (id: string) => {
    if (!confirm('이 스토리를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await refresh()
  }

  const renderCard = (c: CenterListItem) => {
    const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
    return (
      <div key={c.id} className="tikita-card" style={{ position: 'relative' }}
        onClick={() => !editMode && router.push(`/tikita/characters/${c.id}`)}>
        {c.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--t-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
        {thumb ? <img className="tikita-card-img" loading="lazy" decoding="async" src={thumb} alt="" /> : <div className="tikita-card-img" />}
        <div className="tikita-card-body">
          <div className="tikita-card-title">{c.title}</div>
          {(c.tikitaMeta?.tagline || c.description)?.trim() && (
            <div style={{ fontSize: 11, color: 'var(--t-ink-soft)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
              {replaceDisplayPlaceholders(c.tikitaMeta?.tagline || c.description || '', '나', c.characters?.[0]?.name ?? '')}
            </div>
          )}
          {c.tags?.length > 0 && (
            <div className="tikita-card-tags">
              {c.tags.slice(0, 3).map(t => <span key={t} className="tikita-chip">#{t}</span>)}
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
  }

  return (
    <>
      <div className="tikita-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="tikita-iconbtn" aria-label="홈으로" onClick={() => router.push('/')}>🏠</button>
          <div className="tikita-logo">tikita</div>
        </div>
        <button className="tikita-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="tikita-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea className="field" placeholder="URL을 한 줄에 하나씩 붙여넣기 (여러 개 가능)" value={importUrl} onChange={e => setImportUrl(e.target.value)} rows={3} style={{ fontSize: 12, resize: 'vertical' }} />
              <button className="tikita-menu-item"
                style={{ background: 'var(--t-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="tikita-menu-item" onClick={createCharacter}>+ 새 스토리 만들기</button>
            <button className="tikita-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="tikita-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--t-accent)' : 'var(--t-surface-2)', color: view === 'active' ? '#fff' : 'var(--t-ink-soft)' }} onClick={() => setView('active')}>진행 중 <span style={{ opacity: 0.55 }}>{counts.active}</span></button>
          <button className="tikita-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'waiting' ? 'var(--t-accent)' : 'var(--t-surface-2)', color: view === 'waiting' ? '#fff' : 'var(--t-ink-soft)' }} onClick={() => setView('waiting')}>대기 <span style={{ opacity: 0.55 }}>{counts.waiting}</span></button>
          <button className="tikita-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--t-accent)' : 'var(--t-surface-2)', color: view === 'completed' ? '#fff' : 'var(--t-ink-soft)' }} onClick={() => setView('completed')}>완결 <span style={{ opacity: 0.55 }}>{counts.completed}</span></button>
          <button className="tikita-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'favorites' ? 'var(--t-accent)' : 'var(--t-surface-2)', color: view === 'favorites' ? '#fff' : 'var(--t-ink-soft)' }} onClick={() => setView('favorites')}>★ 즐겨찾기</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="tikita-chip" style={{ cursor: 'pointer', border: 'none', background: searchOpen ? 'var(--t-accent)' : 'var(--t-surface-2)', color: searchOpen ? '#fff' : 'var(--t-ink-soft)' }} onClick={toggleSearch}>🔍 검색</button>
          <select
            className="field"
            style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
            value={sort}
            onChange={e => setSort(e.target.value as typeof sort)}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
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
          {genderBuckets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>성별</span>
              <button className="tikita-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === 'all' ? 'var(--t-accent)' : 'var(--t-surface-2)', color: genderFilter === 'all' ? '#fff' : 'var(--t-ink-soft)' }} onClick={() => setGenderFilter('all')}>전체</button>
              {genderBuckets.map(g => (
                <button key={g.key} className="tikita-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === g.key ? 'var(--t-accent)' : 'var(--t-surface-2)', color: genderFilter === g.key ? '#fff' : 'var(--t-ink-soft)' }} onClick={() => setGenderFilter(g.key)}>{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={clearTags} chipClass="tikita-chip" accentVar="--t-accent" counts={tCounts} storageKey="tikita_tagcollapse" />
        </>
      )}

      <div className="tikita-scroll" ref={scrollRef}>
        {loading ? (
          <div className="tikita-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="tikita-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 0 }} />
                <div className="tikita-card-body">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <div className="tikita-empty">{error}<br /><button className="tikita-chip" style={{ cursor:'pointer', border:'none', background:'var(--t-accent)', color:'#fff', marginTop:8 }} onClick={() => refresh()}>다시 시도</button></div>
        ) : visibleChars.length === 0 ? (
          selectedTags.length > 0 || query.trim()
            ? <div className="tikita-empty">검색 결과가 없습니다.</div>
          : view === 'favorites'
            ? <div className="tikita-empty">즐겨찾기한 스토리가 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
          : view === 'completed'
            ? <div className="tikita-empty">완결한 스토리가 없습니다.</div>
            : view === 'waiting'
              ? <div className="tikita-empty">대기 중인 스토리가 없습니다.</div>
              : items.length === 0
                ? <div className="tikita-empty">가져온 스토리가 없습니다<br />⋮ 메뉴에서 tikita.ai 스토리 URL로 가져오세요.</div>
                : <div className="tikita-empty">진행 중인 스토리가 없습니다.</div>
        ) : (
          <VirtualCardGrid
            items={visibleChars}
            renderItem={renderCard}
            scrollRef={scrollRef}
            imageHeightRatio={4 / 3}
            bodyHeight={104}
            columns={2}
            gap={12}
            padX={16}
          />
        )}
      </div>
    </>
  )
}
