'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { sortByOption, type SortOption } from '@/lib/listSort'
import { useFavorites } from '@/lib/useFavorites'
import { useInfiniteScroll } from '@/lib/useInfiniteScroll'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { useDisplayName } from '@/lib/useDisplayName'

interface Col {
  id: string
  title: string
  coverImageUrl: string
  description?: string
  tags: string[]
  sourceUrl: string
  completed?: boolean
  started?: boolean
  createdAt?: string
  lastActivityAt?: string
  characters: { id: string; name: string; avatarUrl: string | null }[]
}

type ViewTab = 'active' | 'waiting' | 'completed' | 'favorites'

const CENTERS: { key: string; label: string; match: (url: string) => boolean; color: string; detail: (id: string) => string }[] = [
  { key: 'whif',       label: 'WHIF',       match: u => u.includes('whif.'),        color: '#8b5cf6', detail: id => `/whif/characters/${id}` },
  { key: 'zeta',       label: 'ZETA',       match: u => u.includes('zeta-ai.io'),   color: '#7c5cff', detail: id => `/zeta/plots/${id}` },
  { key: 'melting',    label: 'melting',    match: u => u.includes('melting.chat'), color: '#ff2e93', detail: id => `/melting/characters/${id}` },
  { key: 'tikita',     label: 'tikita',     match: u => u.includes('tikita.ai'),    color: '#16b8a6', detail: id => `/tikita/story/${id}` },
  { key: 'chub',       label: 'chub',       match: u => u.includes('chub.ai'),      color: '#ff6a3d', detail: id => `/chub/characters/${id}` },
  { key: 'rofan',      label: 'rofanai',    match: u => u.includes('rofan.ai'),     color: '#e0529c', detail: id => `/rofan/characters/${id}` },
  { key: 'loveydovey', label: 'loveydovey', match: u => u.includes('loveydovey.ai'),color: '#ff5a5f', detail: id => `/loveydovey/characters/${id}` },
  { key: 'babechat',   label: 'babechat',   match: u => u.includes('babechat.'),    color: '#5b8cff', detail: id => `/babechat/characters/${id}` },
  { key: 'tingle',     label: 'tingle',     match: u => u.includes('tingle.chat'),  color: '#ff5776', detail: id => `/tingle/characters/${id}` },
]

function detectCenter(sourceUrl: string) {
  return CENTERS.find(c => c.match(sourceUrl)) ?? { key: 'other', label: '기타', color: '#888', detail: (id: string) => `/characters/${id}` }
}

function getTingleDetailPath(colId: string, sourceUrl: string) {
  if (sourceUrl.includes('/universes/')) return `/tingle/universes/${colId}`
  if (sourceUrl.includes('/scenes/')) return `/tingle/scenes/${colId}`
  return `/tingle/characters/${colId}`
}
// (colId는 항상 DB UUID — tingle 원본 숫자 ID와 혼동 금지)

function isWorldType(col: Col): boolean {
  const url = col.sourceUrl
  if (url.includes('whif.') || url.includes('tikita.ai')) return true
  return col.characters.length > 1
}

export default function AllCentersPage() {
  const router = useRouter()
  const [cols, setCols] = useState<Col[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewTab>('active')
  const [sort, setSort] = useState<SortOption>('latest')
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedCenters, setSelectedCenters] = useState<string[]>([])
  const { isFav, toggleFav } = useFavorites()
  const scrollRef = useRef<HTMLDivElement>(null)
  const userName = useDisplayName()
  const { count, sentinelRef } = useInfiniteScroll([view, sort, query, selectedCenters, randomSeed], scrollRef)

  useEffect(() => {
    setView((sessionStorage.getItem('all_view') as ViewTab) || 'active')
    setSort((localStorage.getItem('all_sort') as SortOption) || 'latest')
    api.get('/api/collections?all=true')
      .then(setCols)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleView = (v: ViewTab) => { setView(v); sessionStorage.setItem('all_view', v) }
  const handleSort = (v: SortOption) => {
    setSort(v); localStorage.setItem('all_sort', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }
  const toggleCenter = (key: string) =>
    setSelectedCenters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const toggleSearch = () => setSearchOpen(o => { if (o) { setQuery(''); setSelectedCenters([]) } return !o })

  const matchesCenter = (url: string) => selectedCenters.length === 0 || selectedCenters.some(k => CENTERS.find(c => c.key === k)?.match(url))
  const matchesQuery = (c: Col) => {
    const q = query.trim().toLowerCase()
    return !q || c.title.toLowerCase().includes(q) || c.tags?.some(t => t.toLowerCase().includes(q))
  }

  const filtered = sortByOption(
    cols.filter(c =>
      (view === 'favorites' ? isFav('collection', c.id)
      : view === 'completed' ? c.completed
      : view === 'waiting' ? !c.started
      : !c.completed && !!c.started) &&
      matchesCenter(c.sourceUrl) && matchesQuery(c)
    ),
    sort, c => c.title, c => c.createdAt ?? '', c => c.lastActivityAt ?? c.createdAt ?? '', randomSeed
  )

  const counts = {
    active: cols.filter(c => !c.completed && !!c.started).length,
    waiting: cols.filter(c => !c.started).length,
    completed: cols.filter(c => !!c.completed).length,
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
        <button style={{ appearance: 'none', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, padding: 0 }} onClick={() => router.push('/explore')}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 800 }}>전체 센터</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            style={{ appearance: 'none', border: 'none', background: searchOpen ? 'var(--accent)' : 'var(--pane)', color: searchOpen ? '#fff' : 'var(--ink)', borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
            onClick={toggleSearch}
          >🔍 검색</button>
          <select className="field" style={{ fontSize: 11, padding: '3px 6px', width: 'auto' }} value={sort} onChange={e => handleSort(e.target.value as SortOption)}>
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto' }}>
        {(['active', 'waiting', 'completed', 'favorites'] as ViewTab[]).map(v => (
          <button key={v}
            onClick={() => handleView(v)}
            style={{
              appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999, whiteSpace: 'nowrap',
              padding: '4px 12px', fontSize: 12, fontWeight: 600,
              background: view === v ? 'var(--accent)' : 'var(--pane)',
              color: view === v ? '#fff' : 'var(--ink-soft)',
              outline: view === v ? 'none' : '1px solid var(--hairline)',
            }}
          >
            {v === 'active' ? `진행 중 ${counts.active}` : v === 'waiting' ? `대기 ${counts.waiting}` : v === 'completed' ? `완결 ${counts.completed}` : '★ 즐겨찾기'}
          </button>
        ))}
      </div>

      {searchOpen && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="field"
            style={{ fontSize: 12 }}
            placeholder="이름·태그로 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CENTERS.map(c => (
              <button key={c.key}
                onClick={() => toggleCenter(c.key)}
                style={{
                  appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999,
                  padding: '3px 10px', fontSize: 11, fontWeight: 700,
                  background: selectedCenters.includes(c.key) ? c.color : 'var(--pane)',
                  color: selectedCenters.includes(c.key) ? '#fff' : 'var(--ink-soft)',
                  outline: selectedCenters.includes(c.key) ? 'none' : '1px solid var(--hairline)',
                }}
              >{c.label}</button>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, paddingTop: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
            {query || selectedCenters.length > 0 ? '검색 결과가 없습니다.' : view === 'favorites' ? '즐겨찾기한 항목이 없습니다.' : view === 'completed' ? '완결한 항목이 없습니다.' : view === 'waiting' ? '대기 중인 항목이 없습니다.' : '진행 중인 항목이 없습니다.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, paddingTop: 10 }}>
            {filtered.slice(0, count).map(col => {
              const center = detectCenter(col.sourceUrl)
              const world = isWorldType(col)
              const thumb = col.coverImageUrl || col.characters[0]?.avatarUrl || ''
              const charNames = col.characters.map(c => c.name)
              const desc = col.description?.trim()
                ? replaceDisplayPlaceholders(col.description, userName, charNames)
                : ''
              const detailPath = center.key === 'tingle'
                ? getTingleDetailPath(col.id, col.sourceUrl)
                : center.detail(col.id)
              return (
                <div key={col.id}
                  onClick={() => router.push(detailPath)}
                  style={{
                    position: 'relative', cursor: 'pointer', borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden', background: 'var(--pane)', border: '1px solid var(--hairline)',
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* 썸네일 */}
                  <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', background: 'var(--chrome-face)' }}>
                    {thumb
                      ? <img src={thumb} loading="lazy" decoding="async" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 32 }}>🎭</div>
                    }
                    {/* 완결 뱃지 */}
                    {col.completed && (
                      <div style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 700, background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>완결</div>
                    )}
                    {/* 즐겨찾기 버튼 */}
                    <button
                      onClick={e => { e.stopPropagation(); toggleFav('collection', col.id) }}
                      aria-label="즐겨찾기"
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', color: isFav('collection', col.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 26, height: 26, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >{isFav('collection', col.id) ? '★' : '☆'}</button>
                  </div>
                  {/* 카드 바디 */}
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</div>
                    {desc && (
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>{desc}</div>
                    )}
                    {/* 센터 + 세계관/캐릭터 뱃지 */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: center.color, color: '#fff' }}>{center.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--chrome-face)', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}>{world ? '세계관' : '캐릭터'}</span>
                      {col.tags?.slice(0, 1).map(t => (
                        <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: 'var(--chrome-face)', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}>#{t}</span>
                      ))}
                    </div>
                  </div>
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
