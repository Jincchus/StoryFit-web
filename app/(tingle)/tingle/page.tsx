'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { useDisplayName } from '@/lib/useDisplayName'
import TagFilterBar from '@/components/ui/TagFilterBar'
import VirtualCardGrid from '@/components/ui/VirtualCardGrid'
import { useCenterListPaged } from '@/lib/useCenterListPaged'
import type { CenterListItem } from '@/lib/centerListSelect'
import LikedImportSheet from '@/components/ui/LikedImportSheet'

interface TingleField { key: string; label: string; value: string; order: number; removed?: boolean }
interface TingleOpening { id: string; title: string; content: string; removed?: boolean }
interface TinglePreview {
  type: 'character' | 'universe' | 'scene'
  url: string; name: string; gender: string; coverImageUrl: string
  tags: string[]; safetyLevel: 'standard' | 'relaxed'
  fields: TingleField[]; openings: TingleOpening[]
  isLinked?: boolean
}

type TingleType = 'character' | 'universe' | 'scene'

function detectTingleType(sourceUrl: string): { type: TingleType; label: string; color: string } {
  if (sourceUrl.includes('/universes/')) return { type: 'universe', label: '서사', color: '#a78bfa' }
  if (sourceUrl.includes('/scenes/')) return { type: 'scene', label: '테마', color: '#06bfd6' }
  return { type: 'character', label: '캐릭터', color: '#ff5776' }
}

function detailPath(sourceUrl: string, id: string) {
  if (sourceUrl.includes('/universes/')) return `/tingle/universes/${id}`
  if (sourceUrl.includes('/scenes/')) return `/tingle/scenes/${id}`
  return `/tingle/characters/${id}`
}

type TypeTab = 'character' | 'universe' | 'scene'

interface LikedPersona {
  id: string; name: string; coverImageUrl: string | null
  tags: string[]; isAdult: boolean; sourceUrl: string
}

export default function TingleListPage() {
  const router = useRouter()
  const userName = useDisplayName()
  const [typeTab, setTypeTab] = useState<TypeTab>('character')

  const {
    items, loading, error,
    view, setView, sort, setSort, query, setQuery,
    selectedTags, toggleTag, clearTags, genderFilter, setGenderFilter,
    searchOpen, toggleSearch,
    counts, tagGroups, tCounts, genderBuckets, visibleChars, facets,
    isFav, toggleFav, scrollRef, refresh,
  } = useCenterListPaged({ indexQuery: 'isTingle=true', storagePrefix: 'tingle', extraParams: { tingleType: typeTab } })

  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [likedPanel, setLikedPanel] = useState(false)
  const [likedList, setLikedList] = useState<LikedPersona[]>([])
  const [likedSelected, setLikedSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('tg_edit') === '1')
    const stored = sessionStorage.getItem('tg_type') as TypeTab
    setTypeTab(stored === 'character' || stored === 'universe' || stored === 'scene' ? stored : 'character')
  }, [])

  const handleTypeTab = (v: TypeTab) => {
    setTypeTab(v); setGenderFilter('all'); sessionStorage.setItem('tg_type', v)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const importTingleUrl = async (url: string) => {
    if (url.includes('tingle.chat')) {
      const previews: TinglePreview[] = await api.post('/api/characters/import/preview', { url })
      const main = previews.find(p => !p.isLinked)
      const linked = previews.filter(p => p.isLinked)
      if (!main) throw new Error('미리보기 데이터 없음')
      const mainResult = await api.post('/api/characters/import', { url: main.url, previewData: main })
      for (const item of linked) {
        const linkedResult = await api.post('/api/characters/import', { url: item.url, previewData: item })
        if (item.type === 'universe' && mainResult.collectionId) {
          localStorage.setItem(`tg_uni_${mainResult.collectionId}`, linkedResult.collectionId)
        }
        if (item.type === 'scene' && mainResult.collectionId) {
          localStorage.setItem(`tg_scene_${mainResult.collectionId}`, linkedResult.collectionId)
        }
      }
    } else {
      await api.post('/api/characters/import', { url })
    }
  }

  const handleDirectImport = async () => {
    const urls = importUrl.split('\n').map(u => u.trim()).filter(Boolean)
    if (urls.length === 0 || importing) return
    setImporting(true); setMsg('')
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < urls.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${urls.length})`)
      try { await importTingleUrl(urls[i]); ok++ }
      catch (e: any) { failed.push(urls[i]); setMsg(`⚠ ${urls[i]} — ${e.message}`) }
    }
    setImporting(false)
    if (ok > 0) setImportUrl(failed.length > 0 ? importUrl : '')
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.join(', ')} 실패` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) setMenuOpen(false)
    await refresh()
  }

  const handleLikedScan = async () => {
    setMenuOpen(false)
    setLikedPanel(true)
    if (likedList.length > 0) return
    setScanning(true); setScanMsg('팅글 전체 스캔 중...')
    try {
      const res = await api.get('/api/tingle/liked-scan')
      const list: LikedPersona[] = res.liked ?? []
      setLikedList(list)
      setScanMsg(`♥ ${list.length}개 발견 (${res.scanned}페이지 스캔)`)
    } catch (e: any) {
      setScanMsg(`⚠ ${e.message ?? '스캔 실패'}`)
    } finally {
      setScanning(false)
    }
  }


  const handleLikedImport = async () => {
    const targets = likedList.filter(x => likedSelected.has(x.id))
    if (targets.length === 0 || importing) return
    setImporting(true); setMsg('')
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < targets.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${targets.length})`)
      try { await importTingleUrl(targets[i].sourceUrl); ok++ }
      catch { failed.push(targets[i].name) }
    }
    setImporting(false)
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.join(', ')} 실패` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) { setLikedPanel(false); setLikedSelected(new Set()) }
    await refresh()
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('tg_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deleteCol = async (id: string) => {
    if (!confirm('이 항목을 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await refresh()
  }

  const typeCounts = {
    character: facets?.typeCounts?.character ?? 0,
    universe: facets?.typeCounts?.universe ?? 0,
    scene: facets?.typeCounts?.scene ?? 0,
  }
  const typeLabel = typeTab === 'character' ? '캐릭터' : typeTab === 'universe' ? '서사' : '테마'

  const renderCard = (c: CenterListItem) => {
    const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
    const type = detectTingleType(c.sourceUrl ?? '')
    const charNames = c.characters.map(ch => ch.name)
    const desc = c.description?.trim() ? replaceDisplayPlaceholders(c.description, userName, charNames) : ''
    return (
      <div key={c.id} className="tingle-card" style={{ position: 'relative' }}
        onClick={() => !editMode && router.push(detailPath(c.sourceUrl ?? '', c.id))}>
        {c.completed && (
          <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--tg-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>
        )}
        {thumb
          ? <img className="tingle-card-img" loading="lazy" decoding="async" src={thumb} alt="" />
          : <div className="tingle-card-img" style={{ display: 'grid', placeItems: 'center', fontSize: 32 }}>🎭</div>
        }
        <div className="tingle-card-body">
          <div className="tingle-card-title">{c.title}</div>
          {desc && (
            <div style={{ fontSize: 11, color: 'var(--tg-ink-soft)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{desc}</div>
          )}
          <div className="tingle-card-tags">
            <span className="tingle-chip" style={{ background: type.color, color: '#fff', fontSize: 10 }}>{type.label}</span>
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
  }

  return (
    <>
      <LikedImportSheet
        open={likedPanel}
        onClose={() => setLikedPanel(false)}
        title="♥ 팅글 좋아요 목록"
        prefix="tg"
        items={likedList}
        scanning={scanning}
        scanMsg={scanMsg}
        onRescan={() => { setLikedList([]); setLikedSelected(new Set()); handleLikedScan() }}
        alreadyImported={x => items.some(c => c.sourceUrl === x.sourceUrl)}
        selected={likedSelected}
        onChangeSelected={setLikedSelected}
        importing={importing}
        importProgress={msg}
        onImport={handleLikedImport}
      />

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
                onClick={handleDirectImport}
              >{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="tingle-menu-item" onClick={handleLikedScan}>
              ♥ 좋아요 목록
            </button>
            <button className="tingle-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      {/* 주탭: 캐릭터 / 서사 / 테마 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--tg-line)', padding: '0 16px' }}>
        {([
          { key: 'character', label: '캐릭터', color: '#ff5776' },
          { key: 'universe', label: '서사', color: '#a78bfa' },
          { key: 'scene', label: '테마', color: '#06bfd6' },
        ] as const).map(t => (
          <button key={t.key}
            style={{
              appearance: 'none', border: 'none', background: 'none', cursor: 'pointer',
              padding: '10px 16px', fontSize: 14, fontWeight: 700,
              color: typeTab === t.key ? t.color : 'var(--tg-ink-soft)',
              borderBottom: typeTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
              marginBottom: -1,
            }}
            onClick={() => handleTypeTab(t.key)}>
            {t.label}
            <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.6 }}>
              {typeCounts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* 상태 필터 + 검색/정렬 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {(['active', 'waiting', 'completed', 'favorites'] as const).map(v => (
            <button key={v} className="tingle-chip"
              style={{ cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
                background: view === v ? 'var(--tg-accent)' : 'var(--tg-surface-2)',
                color: view === v ? '#fff' : 'var(--tg-ink-soft)' }}
              onClick={() => setView(v)}>
              {v === 'active' ? `진행 중 ${counts.active}`
                : v === 'waiting' ? `대기 ${counts.waiting}`
                : v === 'completed' ? `완결 ${counts.completed}`
                : '★ 즐겨찾기'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button className="tingle-chip"
            style={{ cursor: 'pointer', border: 'none',
              background: searchOpen ? 'var(--tg-accent)' : 'var(--tg-surface-2)',
              color: searchOpen ? '#fff' : 'var(--tg-ink-soft)' }}
            onClick={toggleSearch}>🔍</button>
          <select className="field" style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }} value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
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
            <input className="field" style={{ fontSize: 12, width: '100%' }} placeholder="이름·태그로 검색"
              value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          </div>
          {typeTab === 'character' && genderBuckets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>성별</span>
              <button className="tingle-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === 'all' ? 'var(--tg-accent)' : 'var(--tg-surface-2)', color: genderFilter === 'all' ? '#fff' : 'var(--tg-ink-soft)' }} onClick={() => setGenderFilter('all')}>전체</button>
              {genderBuckets.map(g => (
                <button key={g.key} className="tingle-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === g.key ? 'var(--tg-accent)' : 'var(--tg-surface-2)', color: genderFilter === g.key ? '#fff' : 'var(--tg-ink-soft)' }} onClick={() => setGenderFilter(g.key)}>{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={clearTags} chipClass="tingle-chip" accentVar="--tg-accent" counts={tCounts} storageKey="tg_tagcollapse" />
        </>
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
        ) : error && items.length === 0 ? (
          <div className="tingle-empty">{error}<br /><button className="tingle-chip" style={{ cursor:'pointer', border:'none', background:'var(--tg-accent)', color:'#fff', marginTop:8 }} onClick={() => refresh()}>다시 시도</button></div>
        ) : visibleChars.length === 0 ? (
          <div className="tingle-empty">
            {query.trim() || selectedTags.length > 0
              ? '검색 결과가 없습니다.'
              : view === 'favorites' ? '즐겨찾기한 항목이 없습니다.'
              : view === 'completed' ? '완결한 항목이 없습니다.'
              : view === 'waiting' ? '대기 중인 항목이 없습니다.'
              : items.length === 0
                ? `가져온 ${typeLabel}가 없습니다.\n⋮ 메뉴에서 팅글 URL을 붙여넣고 📥 가져오기를 누르세요.\n(관리자 설정에서 인증 토큰 설정 필요)`
                : `진행 중인 ${typeLabel}가 없습니다.`}
          </div>
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
