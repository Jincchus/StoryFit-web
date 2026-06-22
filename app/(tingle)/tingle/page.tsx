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

interface TingleField {
  key: string; label: string; value: string; order: number; removed?: boolean
}
interface TingleOpening {
  id: string; title: string; content: string; removed?: boolean
}
interface TingleLinkedItem {
  type: 'character' | 'universe' | 'scene'
  url: string; name: string; coverImageUrl: string; selected: boolean
}

interface TinglePreview {
  type: 'character' | 'universe' | 'scene'
  url: string; name: string; gender: string; coverImageUrl: string
  tags: string[]; safetyLevel: 'standard' | 'relaxed'
  fields: TingleField[]; openings: TingleOpening[]
  linkedItems?: TingleLinkedItem[]
}

type TingleType = 'character' | 'universe' | 'scene'

function detectTingleType(sourceUrl: string): { type: TingleType; label: string; color: string } {
  if (sourceUrl.includes('/universes/')) return { type: 'universe', label: '서사', color: '#a78bfa' }
  if (sourceUrl.includes('/scenes/')) return { type: 'scene', label: '테마', color: '#06bfd6' }
  return { type: 'character', label: '캐릭터', color: '#ff5776' }
}

function detailPath(col: TingleCol) {
  if (col.sourceUrl.includes('/universes/')) return `/tingle/universes/${col.id}`
  if (col.sourceUrl.includes('/scenes/')) return `/tingle/scenes/${col.id}`
  return `/tingle/characters/${col.id}`
}

type ViewTab = 'active' | 'waiting' | 'completed' | 'favorites'
type TypeTab = 'all' | TingleType

function typeLabel(type: TinglePreview['type']) {
  if (type === 'universe') return '서사'
  if (type === 'scene') return '테마'
  return '캐릭터'
}
function typeColor(type: TinglePreview['type']) {
  if (type === 'universe') return '#a78bfa'
  if (type === 'scene') return '#06bfd6'
  return '#ff5776'
}

function ImportPreviewModal({
  previews, onConfirm, onClose, confirming,
}: {
  previews: TinglePreview[]
  onConfirm: (previews: TinglePreview[]) => void
  onClose: () => void
  confirming: boolean
}) {
  const [items, setItems] = useState<TinglePreview[]>(
    previews.map(p => ({
      ...p,
      linkedItems: p.linkedItems?.map(li => ({ ...li, selected: true })) ?? [],
    }))
  )

  const toggleLinked = (pi: number, url: string) => {
    setItems(prev => prev.map((p, i) => i !== pi ? p : {
      ...p,
      linkedItems: p.linkedItems?.map(li => li.url === url ? { ...li, selected: !li.selected } : li) ?? [],
    }))
  }

  const removeField = (pi: number, key: string) => {
    setItems(prev => prev.map((p, i) => i !== pi ? p : {
      ...p,
      fields: p.fields.map(f => f.key === key ? { ...f, removed: true } : f),
    }))
  }
  const restoreField = (pi: number, key: string) => {
    setItems(prev => prev.map((p, i) => i !== pi ? p : {
      ...p,
      fields: p.fields.map(f => f.key === key ? { ...f, removed: false } : f),
    }))
  }
  const setOrder = (pi: number, key: string, val: string) => {
    const n = parseInt(val)
    if (isNaN(n)) return
    setItems(prev => prev.map((p, i) => i !== pi ? p : {
      ...p,
      fields: p.fields.map(f => f.key === key ? { ...f, order: n } : f),
    }))
  }
  const removeOpening = (pi: number, oid: string) => {
    setItems(prev => prev.map((p, i) => i !== pi ? p : {
      ...p,
      openings: p.openings.map(o => o.id === oid ? { ...o, removed: true } : o),
    }))
  }
  const restoreOpening = (pi: number, oid: string) => {
    setItems(prev => prev.map((p, i) => i !== pi ? p : {
      ...p,
      openings: p.openings.map(o => o.id === oid ? { ...o, removed: false } : o),
    }))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--tg-bg)', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tg-ink)' }}>가져오기 미리보기</div>
          <button onClick={onClose} style={{ appearance: 'none', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--tg-ink-soft)' }}>✕</button>
        </div>

        {items.map((preview, pi) => {
          const color = typeColor(preview.type)
          const sorted = [...preview.fields].sort((a, b) => a.order - b.order)
          return (
            <div key={preview.url} style={{ marginBottom: items.length > 1 ? 24 : 0 }}>
              {items.length > 1 && (
                <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8 }}>
                  [{pi + 1}] {typeLabel(preview.type)} — {preview.name}
                </div>
              )}
              {items.length === 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {preview.coverImageUrl && (
                    <img src={preview.coverImageUrl} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="" />
                  )}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tg-ink)' }}>{preview.name}</div>
                    <div style={{ fontSize: 11, color, fontWeight: 700 }}>{typeLabel(preview.type)}</div>
                  </div>
                </div>
              )}

              {/* 필드 목록 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sorted.map(field => (
                  <div key={field.key} style={{
                    borderRadius: 8, padding: '8px 10px',
                    background: field.removed ? 'var(--tg-surface)' : 'var(--tg-surface-2)',
                    opacity: field.removed ? 0.45 : 1,
                    border: `1px solid ${field.removed ? 'var(--tg-line)' : color + '55'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: field.removed ? 0 : 4 }}>
                      <input
                        type="number"
                        min={1}
                        value={field.order}
                        disabled={field.removed}
                        onChange={e => setOrder(pi, field.key, e.target.value)}
                        style={{
                          width: 36, height: 24, borderRadius: 4, border: '1px solid var(--tg-line)',
                          background: 'var(--tg-bg)', color: 'var(--tg-ink)', fontSize: 11,
                          textAlign: 'center', padding: 0, flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: field.removed ? 'var(--tg-ink-soft)' : color, flex: 1 }}>{field.label}</span>
                      <button
                        onClick={() => field.removed ? restoreField(pi, field.key) : removeField(pi, field.key)}
                        style={{ appearance: 'none', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: field.removed ? '#4ade80' : '#ff6b8a', padding: '0 2px', flexShrink: 0 }}
                      >{field.removed ? '↩' : '✕'}</button>
                    </div>
                    {!field.removed && (
                      <div style={{ fontSize: 11, color: 'var(--tg-ink-soft)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden', lineHeight: 1.5, WebkitLineClamp: 4, display: '-webkit-box', WebkitBoxOrient: 'vertical' }}>
                        {field.value}
                      </div>
                    )}
                  </div>
                ))}

                {/* 도입부 (character만) */}
                {preview.openings.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tg-ink-soft)', marginBottom: 6 }}>도입부</div>
                    {preview.openings.map(op => (
                      <div key={op.id} style={{
                        borderRadius: 8, padding: '8px 10px', marginBottom: 6,
                        background: op.removed ? 'var(--tg-surface)' : 'var(--tg-surface-2)',
                        opacity: op.removed ? 0.45 : 1,
                        border: `1px solid ${op.removed ? 'var(--tg-line)' : color + '55'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: op.removed ? 0 : 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: op.removed ? 'var(--tg-ink-soft)' : color, flex: 1 }}>{op.title}</span>
                          <button
                            onClick={() => op.removed ? restoreOpening(pi, op.id) : removeOpening(pi, op.id)}
                            style={{ appearance: 'none', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: op.removed ? '#4ade80' : '#ff6b8a', padding: '0 2px', flexShrink: 0 }}
                          >{op.removed ? '↩' : '✕'}</button>
                        </div>
                        {!op.removed && (
                          <div style={{ fontSize: 11, color: 'var(--tg-ink-soft)', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden', WebkitLineClamp: 3, display: '-webkit-box', WebkitBoxOrient: 'vertical', lineHeight: 1.5 }}>
                            {op.content}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* 연결 항목 선택 */}
        {items.some(p => (p.linkedItems?.length ?? 0) > 0) && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--tg-line)', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tg-ink-soft)', marginBottom: 10 }}>함께 등록할 연결 항목</div>
            {items.map((preview, pi) => {
              const linked = preview.linkedItems ?? []
              if (linked.length === 0) return null
              const groups: Record<string, TingleLinkedItem[]> = {}
              for (const li of linked) {
                const g = li.type === 'universe' ? '서사' : li.type === 'scene' ? '테마' : '캐릭터'
                ;(groups[g] ??= []).push(li)
              }
              return (
                <div key={preview.url}>
                  {Object.entries(groups).map(([label, gItems]) => {
                    const gc = label === '서사' ? '#a78bfa' : label === '테마' ? '#06bfd6' : '#ff5776'
                    return (
                      <div key={label} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: gc, marginBottom: 6 }}>{label} ({gItems.length})</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {gItems.map(li => (
                            <button key={li.url} onClick={() => toggleLinked(pi, li.url)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                borderRadius: 8, cursor: 'pointer', textAlign: 'left', appearance: 'none',
                                border: `1.5px solid ${li.selected ? gc : 'var(--tg-line)'}`,
                                background: li.selected ? `${gc}18` : 'var(--tg-surface)',
                              }}>
                              {li.coverImageUrl && <img src={li.coverImageUrl} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" />}
                              <span style={{ fontSize: 12, fontWeight: 600, color: li.selected ? gc : 'var(--tg-ink-soft)', flex: 1 }}>{li.name}</span>
                              <span style={{ fontSize: 11, color: li.selected ? gc : 'var(--tg-ink-soft)', flexShrink: 0 }}>{li.selected ? '✓' : '○'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, appearance: 'none', border: '1px solid var(--tg-line)', background: 'var(--tg-surface)', color: 'var(--tg-ink)', borderRadius: 10, padding: '11px 0', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >취소</button>
          <button
            onClick={() => onConfirm(items)}
            disabled={confirming}
            style={{ flex: 2, appearance: 'none', border: 'none', background: 'var(--tg-accent)', color: '#fff', borderRadius: 10, padding: '11px 0', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}
          >{confirming ? '저장 중...' : '📥 가져오기'}</button>
        </div>
      </div>
    </div>
  )
}

export default function TingleListPage() {
  const router = useRouter()
  const [cols, setCols] = useState<TingleCol[]>([])
  const [view, setView] = useState<ViewTab>('active')
  const [typeTab, setTypeTab] = useState<TypeTab>('all')
  const { isFav, toggleFav } = useFavorites()
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [previews, setPreviews] = useState<TinglePreview[] | null>(null)
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
    setView((sessionStorage.getItem('tg_view') as ViewTab) || 'active')
    setTypeTab((sessionStorage.getItem('tg_type') as TypeTab) || 'all')
    fetchData()
  }, [])

  const handleSort = (v: SortOption) => {
    setSort(v); localStorage.setItem('tg_sort', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }
  const handleView = (v: ViewTab) => { setView(v); sessionStorage.setItem('tg_view', v) }
  const handleTypeTab = (v: TypeTab) => { setTypeTab(v); sessionStorage.setItem('tg_type', v) }

  const scrollRef = useScrollRestore(`tg_scroll_${view}_${typeTab}`, !loading)
  const { count, sentinelRef } = useInfiniteScroll([view, sort, query, randomSeed, typeTab], scrollRef)

  const fetchData = async () => {
    setLoading(true)
    try { setCols(await api.get('/api/collections?isTingle=true')) }
    finally { setLoading(false) }
  }

  // URL 입력 → preview API 호출 → 미리보기 모달 열기
  const handlePreview = async () => {
    const urls = importUrl.split('\n').map(u => u.trim()).filter(Boolean)
    if (urls.length === 0 || importing) return
    setImporting(true); setMsg('')
    const results: TinglePreview[] = []
    const failed: string[] = []
    for (let i = 0; i < urls.length; i++) {
      setMsg(`미리보기 로드 중... (${i + 1}/${urls.length})`)
      try {
        const p = await api.post('/api/characters/import/preview', { url: urls[i] })
        results.push(p)
      } catch (e: any) {
        failed.push(urls[i])
        setMsg(`⚠ ${urls[i]} — ${e.message}`)
      }
    }
    setImporting(false)
    if (results.length > 0) {
      setPreviews(results)
      setMsg('')
    } else {
      setMsg(failed.length ? `⚠ 모두 실패` : '')
    }
  }

  // 미리보기 확인 → 실제 저장
  const handleConfirm = async (edited: TinglePreview[]) => {
    setConfirming(true)
    let ok = 0
    const failed: string[] = []
    for (const preview of edited) {
      try {
        await api.post('/api/characters/import', { url: preview.url, previewData: preview })
        ok++
      } catch {
        failed.push(preview.name)
      }
    }
    setConfirming(false)
    setPreviews(null)
    if (ok > 0) setImportUrl(failed.length ? importUrl : '')
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.join(', ')} 실패` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) setMenuOpen(false)
    await fetchData()
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

  const typeCounts = {
    all: cols.length,
    character: cols.filter(c => detectTingleType(c.sourceUrl).type === 'character').length,
    universe: cols.filter(c => detectTingleType(c.sourceUrl).type === 'universe').length,
    scene: cols.filter(c => detectTingleType(c.sourceUrl).type === 'scene').length,
  }

  const visible = sortByOption(
    cols.filter(c => {
      const viewMatch = view === 'favorites' ? isFav('collection', c.id)
        : view === 'completed' ? c.completed
        : view === 'waiting' ? !c.started
        : !c.completed && !!c.started
      const typeMatch = typeTab === 'all' || detectTingleType(c.sourceUrl).type === typeTab
      return viewMatch && typeMatch && matchesQuery(c)
    }),
    sort, c => c.title, c => c.createdAt ?? '', c => c.lastActivityAt ?? c.createdAt ?? '', randomSeed
  )

  return (
    <>
      {previews && (
        <ImportPreviewModal
          previews={previews}
          onConfirm={handleConfirm}
          onClose={() => setPreviews(null)}
          confirming={confirming}
        />
      )}

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
                onClick={handlePreview}
              >{importing ? '불러오는 중...' : '🔍 미리보기'}</button>
            </div>
            <button className="tingle-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      {/* 상태 탭 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {(['active', 'waiting', 'completed', 'favorites'] as const).map(v => (
            <button key={v} className="tingle-chip"
              style={{ cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', background: view === v ? 'var(--tg-accent)' : 'var(--tg-surface-2)', color: view === v ? '#fff' : 'var(--tg-ink-soft)' }}
              onClick={() => handleView(v)}>
              {v === 'active' ? `진행 중 ${counts.active}` : v === 'waiting' ? `대기 ${counts.waiting}` : v === 'completed' ? `완결 ${counts.completed}` : '★ 즐겨찾기'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
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

      {/* 타입 탭 */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 16px 8px' }}>
        {([
          { key: 'all', label: `전체 ${typeCounts.all}`, color: 'var(--tg-accent)' },
          { key: 'character', label: `캐릭터 ${typeCounts.character}`, color: '#ff5776' },
          { key: 'universe', label: `서사 ${typeCounts.universe}`, color: '#a78bfa' },
          { key: 'scene', label: `테마 ${typeCounts.scene}`, color: '#06bfd6' },
        ] as const).map(t => (
          <button key={t.key} className="tingle-chip"
            style={{ cursor: 'pointer', border: 'none', fontSize: 11,
              background: typeTab === t.key ? t.color : 'var(--tg-surface-2)',
              color: typeTab === t.key ? '#fff' : 'var(--tg-ink-soft)' }}
            onClick={() => handleTypeTab(t.key as TypeTab)}>
            {t.label}
          </button>
        ))}
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
                ? '가져온 항목이 없습니다.\n⋮ 메뉴에서 팅글 URL을 붙여넣고 🔍 미리보기를 누르세요.\n(관리자 설정에서 인증 토큰 설정 필요)'
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
            })}
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </>
  )
}
