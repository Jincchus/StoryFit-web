'use client'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface CenterTag { id: string; name: string; category: string | null; searchable: boolean }

const UNSET = '미설정'

export default function AdminCenterTagsPage() {
  const [tags, setTags] = useState<CenterTag[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/center-tags')
      .then(d => { setTags(d.tags); setCategories(d.categories) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const patchTag = async (id: string, data: Partial<Pick<CenterTag, 'category' | 'searchable'>>) => {
    setTags(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
    try {
      await api.patch(`/api/admin/center-tags/${id}`, data)
    } catch (e: any) {
      setError(e.message)
      api.get('/api/admin/center-tags').then(d => setTags(d.tags)).catch(() => {})
    }
  }

  const addCategory = async () => {
    const name = newCategory.trim()
    if (!name || categories.includes(name)) { setNewCategory(''); return }
    try {
      const { categories: next } = await api.post('/api/admin/center-tags', { category: name })
      setCategories(next)
      setNewCategory('')
    } catch (e: any) { setError(e.message) }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? tags.filter(t => t.name.toLowerCase().includes(q)) : tags
  }, [tags, query])

  const groups = useMemo(() => {
    const order = [UNSET, ...categories]
    const byCat = new Map<string, CenterTag[]>()
    for (const t of filtered) {
      const key = t.category ?? UNSET
      const arr = byCat.get(key) ?? []
      arr.push(t)
      byCat.set(key, arr)
    }
    return order
      .filter(cat => byCat.has(cat))
      .map(cat => ({ cat, items: byCat.get(cat)! }))
  }, [filtered, categories])

  const unsetCount = tags.filter(t => !t.category).length

  return (
    <Win title="관리자 — 센터 태그" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 0, flex: 1, minHeight: 0 }}>
        <div style={{ padding: 4, paddingBottom: 0 }}>
          <AdminNav current="/admin/center-tags" />
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 4 }}>
          <div className="vstack" style={{ gap: 12 }}>
            <div className="tiny muted">
              각 센터(WHIF·ZETA·melting)에서 URL로 가져온 태그를 모읍니다. 카테고리를 지정하고 노출 여부를 끄면 센터 검색창에서 숨겨집니다.
              {unsetCount > 0 && <> · <b style={{ color: 'var(--hot-pink)' }}>미설정 {unsetCount}개</b></>}
            </div>

            <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
              <input
                className="field" style={{ flex: 1, minWidth: 120 }}
                placeholder="태그 검색"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            <div className="hstack" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="tiny muted">카테고리 추가</span>
              <input
                className="field" style={{ width: 140 }}
                placeholder="예: 세계관"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
              />
              <button className="btn primary" style={{ fontSize: 11 }} onClick={addCategory}>+ 추가</button>
            </div>

            {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
            {loading && <div className="tiny muted">불러오는 중...</div>}
            {!loading && tags.length === 0 && <div className="tiny muted">아직 가져온 태그가 없습니다.</div>}

            {groups.map(({ cat, items }) => (
              <div key={cat} className="vstack" style={{ gap: 4 }}>
                <div className="tiny muted" style={{ fontWeight: 700, color: cat === UNSET ? 'var(--hot-pink)' : 'var(--ink)' }}>
                  {cat} ({items.length})
                </div>
                <div className="vstack" style={{ gap: 4 }}>
                  {items.map(t => (
                    <div key={t.id} className="hstack" style={{ gap: 6, alignItems: 'center', padding: '4px 8px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
                      <span style={{ flex: 1, fontSize: 12, opacity: t.searchable ? 1 : 0.45 }}>#{t.name}</span>
                      <select
                        className="field" style={{ width: 110, fontSize: 11, padding: '2px 6px' }}
                        value={t.category ?? UNSET}
                        onChange={e => patchTag(t.id, { category: e.target.value === UNSET ? null : e.target.value })}
                      >
                        <option value={UNSET}>{UNSET}</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button
                        className={`btn ${t.searchable ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 10, padding: '2px 8px', minWidth: 64 }}
                        onClick={() => patchTag(t.id, { searchable: !t.searchable })}
                      >{t.searchable ? '노출 Y' : '노출 N'}</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Win>
  )
}
