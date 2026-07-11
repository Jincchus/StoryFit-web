'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import TagFilterBar from '@/components/ui/TagFilterBar'
import VirtualCardGrid from '@/components/ui/VirtualCardGrid'
import { useCenterList } from '@/lib/useCenterList'
import { useDisplayName } from '@/lib/useDisplayName'
import type { CenterListItem } from '@/lib/centerListSelect'

interface Character {
  id: string; name: string; avatarUrl: string | null; gender?: string | null
  additionalInfo: string; tags: string[]; collection?: { id: string } | null
  hasArchived?: boolean; started?: boolean; createdAt?: string
}
// 캐릭터를 CenterListItem으로 매핑(완결=부모 스토리 완결에서 파생). 원본은 _char에 보존.
type CharItem = CenterListItem & { _char: Character }

export default function CrackExplorePage() {
  const router = useRouter()
  const userName = useDisplayName()
  const [tab, setTab] = useState<'characters' | 'stories'>('stories')

  const storyHook = useCenterList({ indexQuery: 'isCrack=true', storagePrefix: 'crack_story' })

  // 캐릭터 완결 = 부모 컬렉션(스토리) 완결. 스토리 index에서 완결 id 집합을 파생.
  const completedColIds = useMemo(
    () => new Set(storyHook.items.filter(u => u.completed).map(u => u.id)),
    [storyHook.items],
  )
  const mapChar = useCallback(
    (raw: CenterListItem[]): CenterListItem[] => (raw as unknown as Character[]).map(c => ({
      id: c.id,
      title: c.name,
      tags: c.tags ?? [],
      createdAt: c.createdAt,
      completed: !!c.collection && completedColIds.has(c.collection.id),
      started: c.started,
      characters: [{ id: c.id, name: c.name, avatarUrl: c.avatarUrl, gender: c.gender }],
      _char: c,
    } as unknown as CenterListItem)),
    [completedColIds],
  )
  const charHook = useCenterList({
    endpoint: '/api/characters', indexQuery: 'isCrack=true', appendIndexParam: false,
    favType: 'character', storagePrefix: 'crack_char', mapItems: mapChar,
  })

  const A = tab === 'stories' ? storyHook : charHook
  const { isFav, toggleFav } = storyHook

  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('crack_edit') === '1')
    setTab((sessionStorage.getItem('crack_tab') as typeof tab) || 'stories')
  }, [])

  const handleTab = (v: typeof tab) => { setTab(v); sessionStorage.setItem('crack_tab', v) }
  const refreshAll = async () => { await Promise.all([storyHook.refresh(), charHook.refresh()]) }

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
    await refreshAll()
    setImporting(false)
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('crack_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deleteStory = async (id: string) => {
    if (!confirm('이 스토리와 소속 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await refreshAll()
  }

  const deleteCharacter = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/characters/${id}`); await refreshAll()
  }

  const createStory = async () => {
    const title = prompt('새 스토리 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://crack.wrtn.ai/local/${Date.now()}` })
    setMenuOpen(false); await refreshAll()
  }

  const renderStoryCard = (u: CenterListItem) => {
    const thumb = u.coverImageUrl || u.characters[0]?.avatarUrl || ''
    return (
      <div key={u.id} className="crack-card" style={{ position: 'relative' }}
        onClick={() => !editMode && router.push(`/crack/stories/${u.id}`)}>
        {u.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--crack-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
        {thumb ? <img className="crack-card-img" loading="lazy" decoding="async" src={thumb} alt="" /> : <div className="crack-card-img" />}
        <div className="crack-card-body">
          <div className="crack-card-title">{u.title}</div>
          <div className="crack-card-sub">{u.characters.length}명 소속</div>
          {u.tags?.length > 0 && (
            <div className="crack-card-tags">
              {u.tags.slice(0, 3).map(t => <span key={t} className="crack-chip">#{t}</span>)}
            </div>
          )}
        </div>
        {editMode ? (
          <button onClick={e => { e.stopPropagation(); deleteStory(u.id) }}
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
              border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
              cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        ) : (
          <button onClick={e => { e.stopPropagation(); toggleFav('collection', u.id) }}
            aria-label="즐겨찾기"
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)',
              border: 'none', color: isFav('collection', u.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 24, height: 24,
              cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isFav('collection', u.id) ? '★' : '☆'}</button>
        )}
      </div>
    )
  }

  const renderCharacterCard = (item: CenterListItem) => {
    const c = (item as CharItem)._char
    return (
      <div key={c.id} className="crack-card" style={{ position: 'relative' }}
        onClick={() => !editMode && router.push(`/crack/characters/${c.id}`)}>
        {c.hasArchived && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--crack-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
        {c.avatarUrl ? <img className="crack-card-img" loading="lazy" decoding="async" src={c.avatarUrl} alt="" /> : <div className="crack-card-img" />}
        <div className="crack-card-body">
          <div className="crack-card-title">{c.name}</div>
          {c.additionalInfo?.trim() && (
            <div className="crack-card-desc">{replaceDisplayPlaceholders(c.additionalInfo, userName, c.name)}</div>
          )}
          {c.tags?.length > 0 && (
            <div className="crack-card-tags">
              {c.tags.slice(0, 3).map(t => <span key={t} className="crack-chip">#{t}</span>)}
            </div>
          )}
        </div>
        {editMode ? (
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, zIndex: 3 }}>
            <button onClick={e => { e.stopPropagation(); router.push(`/characters/${c.id}/edit?isCrack=true`) }}
              aria-label="수정"
              style={{ background: 'rgba(0,0,0,0.7)', border: 'none', color: '#c4b5fd', borderRadius: 999, width: 24, height: 24, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏</button>
            <button onClick={e => { e.stopPropagation(); deleteCharacter(c.id) }}
              style={{ background: 'rgba(0,0,0,0.7)', border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        ) : (
          <button onClick={e => { e.stopPropagation(); toggleFav('character', c.id) }}
            aria-label="즐겨찾기"
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)',
              border: 'none', color: isFav('character', c.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 24, height: 24,
              cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isFav('character', c.id) ? '★' : '☆'}</button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="crack-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="crack-iconbtn" aria-label="홈으로" onClick={() => router.push('/')}>🏠</button>
          <div className="crack-logo">CRACK</div>
        </div>
        <button className="crack-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="crack-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea className="field" placeholder="URL을 한 줄에 하나씩 붙여넣기 (여러 개 가능)" value={importUrl} onChange={e => setImportUrl(e.target.value)} rows={3} style={{ fontSize: 12, resize: 'vertical' }} />
              <button className="crack-menu-item"
                style={{ background: 'var(--crack-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="crack-menu-item" onClick={createStory}>+ 새 스토리 만들기</button>
            <button className="crack-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div className="crack-tabs">
        <button className={`crack-tab ${tab === 'stories' ? 'active' : ''}`} onClick={() => handleTab('stories')}>스토리</button>
        <button className={`crack-tab ${tab === 'characters' ? 'active' : ''}`} onClick={() => handleTab('characters')}>캐릭터</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="crack-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'active' ? 'var(--crack-accent)' : 'var(--crack-surface-2)', color: A.view === 'active' ? '#fff' : 'var(--crack-ink-soft)' }} onClick={() => A.setView('active')}>진행 중 <span style={{ opacity: 0.55 }}>{A.counts.active}</span></button>
          <button className="crack-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'waiting' ? 'var(--crack-accent)' : 'var(--crack-surface-2)', color: A.view === 'waiting' ? '#fff' : 'var(--crack-ink-soft)' }} onClick={() => A.setView('waiting')}>대기 <span style={{ opacity: 0.55 }}>{A.counts.waiting}</span></button>
          <button className="crack-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'completed' ? 'var(--crack-accent)' : 'var(--crack-surface-2)', color: A.view === 'completed' ? '#fff' : 'var(--crack-ink-soft)' }} onClick={() => A.setView('completed')}>완결 <span style={{ opacity: 0.55 }}>{A.counts.completed}</span></button>
          <button className="crack-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'favorites' ? 'var(--crack-accent)' : 'var(--crack-surface-2)', color: A.view === 'favorites' ? '#fff' : 'var(--crack-ink-soft)' }} onClick={() => A.setView('favorites')}>★ 즐겨찾기</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="crack-chip" style={{ cursor: 'pointer', border: 'none', background: A.searchOpen ? 'var(--crack-accent)' : 'var(--crack-surface-2)', color: A.searchOpen ? '#fff' : 'var(--crack-ink-soft)' }} onClick={A.toggleSearch}>🔍 검색</button>
          <select
            className="field"
            style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
            value={A.sort}
            onChange={e => A.setSort(e.target.value as typeof A.sort)}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
          </select>
        </div>
      </div>

      {A.searchOpen && (
        <>
          <div style={{ padding: '0 16px 8px' }}>
            <input
              className="field"
              style={{ fontSize: 12, width: '100%' }}
              placeholder={tab === 'stories' ? '제목으로 검색' : '이름으로 검색'}
              value={A.query}
              onChange={e => A.setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {tab === 'characters' && A.genderBuckets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>성별</span>
              <button className="crack-chip" style={{ cursor: 'pointer', border: 'none', background: A.genderFilter === 'all' ? 'var(--crack-accent)' : 'var(--crack-surface-2)', color: A.genderFilter === 'all' ? '#fff' : 'var(--crack-ink-soft)' }} onClick={() => A.setGenderFilter('all')}>전체</button>
              {A.genderBuckets.map(g => (
                <button key={g.key} className="crack-chip" style={{ cursor: 'pointer', border: 'none', background: A.genderFilter === g.key ? 'var(--crack-accent)' : 'var(--crack-surface-2)', color: A.genderFilter === g.key ? '#fff' : 'var(--crack-ink-soft)' }} onClick={() => A.setGenderFilter(g.key)}>{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          <TagFilterBar groups={A.tagGroups} selected={A.selectedTags} onToggle={A.toggleTag} onClear={A.clearTags} chipClass="crack-chip" accentVar="--crack-accent" counts={A.tCounts} storageKey="crack_tagcollapse" />
        </>
      )}

      <div className="crack-scroll" ref={A.scrollRef}>
        {A.loading ? (
          <div className="crack-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="crack-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 0 }} />
                <div className="crack-card-body">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : A.error && A.items.length === 0 ? (
          <div className="crack-empty">{A.error}<br /><button className="crack-chip" style={{ cursor:'pointer', border:'none', background:'var(--crack-accent)', color:'#fff', marginTop:8 }} onClick={() => A.refresh()}>다시 시도</button></div>
        ) : A.visibleChars.length === 0 ? (
          A.selectedTags.length > 0 || A.query.trim()
            ? <div className="crack-empty">검색 결과가 없습니다.</div>
          : A.view === 'favorites'
            ? <div className="crack-empty">즐겨찾기한 {tab === 'stories' ? '스토리' : '캐릭터'}이 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
          : A.view === 'completed'
            ? <div className="crack-empty">완결한 {tab === 'stories' ? '스토리' : '캐릭터'}이 없습니다.</div>
            : A.view === 'waiting'
              ? <div className="crack-empty">대기 중인 {tab === 'stories' ? '스토리' : '캐릭터'}이 없습니다.</div>
              : A.items.length === 0
                ? (tab === 'stories'
                    ? <div className="crack-empty">가져온 스토리가 없습니다<br />⋮ 메뉴에서 CRACK URL로 가져오세요.</div>
                    : <div className="crack-empty">가져온 캐릭터가 없습니다.</div>)
                : <div className="crack-empty">진행 중인 {tab === 'stories' ? '스토리' : '캐릭터'}이 없습니다.</div>
        ) : (
          <VirtualCardGrid
            items={A.visibleChars}
            renderItem={tab === 'stories' ? renderStoryCard : renderCharacterCard}
            scrollRef={A.scrollRef}
            imageHeightRatio={4 / 3}
            bodyHeight={100}
            columns={2}
            gap={12}
            padX={16}
          />
        )}
      </div>
    </>
  )
}
