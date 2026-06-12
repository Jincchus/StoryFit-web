'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'

interface Opening { id: string; title: string; content: string }
interface Plot {
  id: string; title: string; coverImageUrl: string; tags: string[]
  characters: { id: string; name: string; avatarUrl: string | null; openingMessage: string; openingMessages?: Opening[] }[]
  lorebookTitles?: string[]
  zetaMeta?: any
  completed?: boolean
  started?: boolean
}

export default function ZetaListPage() {
  const router = useRouter()
  const [plots, setPlots] = useState<Plot[]>([])
  const [view, setView] = useState<'active' | 'waiting' | 'completed'>('active')
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('zeta_edit') === '1')
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try { setPlots(await api.get('/api/collections?isZeta=true')) }
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
    localStorage.setItem('zeta_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const createPlot = async () => {
    const title = prompt('새 플롯 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://zeta-ai.io/local/${Date.now()}` })
    setMenuOpen(false); await fetchData()
  }

  const deletePlot = async (id: string) => {
    if (!confirm('이 플롯과 소속 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  return (
    <>
      <div className="zeta-header" style={{ position: 'relative' }}>
        <div className="zeta-logo">ZETA</div>
        <button className="zeta-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="zeta-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input className="field" placeholder="https://zeta-ai.io/ko/plots/..." value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
                style={{ fontSize: 12 }} />
              <button className="zeta-menu-item"
                style={{ background: 'var(--z-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="zeta-menu-item" onClick={createPlot}>+ 새 플롯 만들기</button>
            <button className="zeta-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div className="zeta-tabs" style={{ display: 'flex', gap: 6, padding: '8px 16px' }}>
        <button className="zeta-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--z-accent)' : 'var(--z-surface-2)', color: view === 'active' ? '#fff' : 'var(--z-ink-soft)' }} onClick={() => setView('active')}>진행 중</button>
        <button className="zeta-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'waiting' ? 'var(--z-accent)' : 'var(--z-surface-2)', color: view === 'waiting' ? '#fff' : 'var(--z-ink-soft)' }} onClick={() => setView('waiting')}>대기</button>
        <button className="zeta-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--z-accent)' : 'var(--z-surface-2)', color: view === 'completed' ? '#fff' : 'var(--z-ink-soft)' }} onClick={() => setView('completed')}>완결</button>
      </div>

      <div className="zeta-scroll">
        {(() => {
          const visiblePlots = plots.filter(p =>
            view === 'completed' ? p.completed
            : view === 'waiting' ? !p.started
            : !p.completed && !!p.started
          )
          return loading ? (
          <div className="zeta-empty">불러오는 중...</div>
        ) : visiblePlots.length === 0 ? (
          view === 'completed'
            ? <div className="zeta-empty">완결한 작품이 없습니다.</div>
            : view === 'waiting'
              ? <div className="zeta-empty">대기 중인 작품이 없습니다.</div>
              : plots.length === 0
                ? <div className="zeta-empty">가져온 플롯이 없습니다<br />⋮ 메뉴에서 zeta-ai.io 플롯 URL로 가져오세요.</div>
                : <div className="zeta-empty">진행 중인 작품이 없습니다.</div>
        ) : (
          <div className="zeta-grid">
            {visiblePlots.map(p => {
              const mainChar = p.characters.find(c => c.name === p.title) ?? p.characters[0]
              const thumb = p.coverImageUrl || mainChar?.avatarUrl || ''
              const intro = mainChar?.openingMessages?.[0]?.content || mainChar?.openingMessage || ''
              return (
                <div key={p.id} className="zeta-card"
                  onClick={() => !editMode && router.push(`/zeta/plots/${p.id}`)}>
                  {p.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                  {thumb ? <img className="zeta-card-img" src={thumb} alt="" /> : <div className="zeta-card-img" />}
                  <div className="zeta-card-body">
                    <div className="zeta-card-title">{p.title}</div>
                    {p.tags?.length > 0 && (
                      <div className="zeta-card-tags">
                        {p.tags.slice(0, 3).map(t => <span key={t} className="zeta-chip">#{t}</span>)}
                      </div>
                    )}
                    {p.lorebookTitles && p.lorebookTitles.length > 0 && (
                      <div className="zeta-card-tags">
                        {p.lorebookTitles.slice(0, 3).map(t => <span key={t} className="zeta-chip">📒 {t}</span>)}
                      </div>
                    )}
                    {intro && (
                      <div style={{ fontSize: 11, color: 'var(--z-ink-soft)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {replaceDisplayPlaceholders(intro, '나', mainChar?.name ?? '')}
                      </div>
                    )}
                  </div>
                  {editMode && (
                    <button onClick={e => { e.stopPropagation(); deletePlot(p.id) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                        border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  )}
                </div>
              )
            })}
          </div>
          )
        })()}
      </div>
    </>
  )
}
