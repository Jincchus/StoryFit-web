'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'

interface Character { id: string; name: string; avatarUrl: string | null; additionalInfo: string; tags: string[]; collection?: { id: string } | null; hasArchived?: boolean }
interface Universe { id: string; title: string; coverImageUrl: string; tags: string[]; characters: { id: string; name: string; avatarUrl: string | null }[]; completed?: boolean }

export default function WhifExplorePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'characters' | 'universes'>('universes')
  const [view, setView] = useState<'active' | 'completed'>('active')
  const [universes, setUniverses] = useState<Universe[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('whif_edit') === '1')
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [u, c] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
      ])
      setUniverses(u); setCharacters(c)
    } finally { setLoading(false) }
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
    localStorage.setItem('whif_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deleteUniverse = async (id: string) => {
    if (!confirm('이 작품과 소속 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  const deleteCharacter = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/characters/${id}`); await fetchData()
  }

  const createUniverse = async () => {
    const title = prompt('새 작품 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://whif.io/local/${Date.now()}` })
    setMenuOpen(false); await fetchData()
  }

  const completedColIds = new Set(universes.filter(u => u.completed).map(u => u.id))
  const isCharCompleted = (c: Character) => !!c.collection && completedColIds.has(c.collection.id)
  const visibleUniverses = universes.filter(u => view === 'completed' ? u.completed : !u.completed)
  const visibleCharacters = characters.filter(c => view === 'completed' ? isCharCompleted(c) : !isCharCompleted(c))

  return (
    <>
      <div className="whif-header" style={{ position: 'relative' }}>
        <div className="whif-logo">WHIF</div>
        <button className="whif-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="whif-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input className="field" placeholder="https://whif.io/..." value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
                style={{ fontSize: 12 }} />
              <button className="whif-menu-item"
                style={{ background: 'var(--w-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="whif-menu-item" onClick={createUniverse}>+ 새 작품 만들기</button>
            <button className="whif-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div className="whif-tabs">
        <button className={`whif-tab ${tab === 'universes' ? 'active' : ''}`} onClick={() => setTab('universes')}>작품</button>
        <button className={`whif-tab ${tab === 'characters' ? 'active' : ''}`} onClick={() => setTab('characters')}>캐릭터</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px' }}>
        <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: view === 'active' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => setView('active')}>진행 중</button>
        <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: view === 'completed' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => setView('completed')}>완결</button>
      </div>

      <div className="whif-scroll">
        {loading ? (
          <div className="whif-empty">불러오는 중...</div>
        ) : tab === 'universes' ? (
          visibleUniverses.length === 0 ? (
            view === 'completed'
              ? <div className="whif-empty">완결한 작품이 없습니다.</div>
              : universes.length === 0
                ? <div className="whif-empty">가져온 작품이 없습니다<br />⋮ 메뉴에서 WHIF URL로 가져오세요.</div>
                : <div className="whif-empty">진행 중인 작품이 없습니다.</div>
          ) : (
            <div className="whif-grid">
              {visibleUniverses.map(u => {
                const thumb = u.coverImageUrl || u.characters[0]?.avatarUrl || ''
                return (
                  <div key={u.id} className="whif-card" style={{ position: 'relative' }}
                    onClick={() => !editMode && router.push(`/whif/universes/${u.id}`)}>
                    {u.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                    {thumb ? <img className="whif-card-img" src={thumb} alt="" />
                      : <div className="whif-card-img" />}
                    <div className="whif-card-body">
                      <div className="whif-card-title">{u.title}</div>
                      <div className="whif-card-sub">{u.characters.length}명 소속</div>
                    </div>
                    {editMode && (
                      <button onClick={e => { e.stopPropagation(); deleteUniverse(u.id) }}
                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                          border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
                          cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        ) : (
          visibleCharacters.length === 0 ? (
            view === 'completed'
              ? <div className="whif-empty">완결한 캐릭터가 없습니다.</div>
              : characters.length === 0
                ? <div className="whif-empty">가져온 캐릭터가 없습니다.</div>
                : <div className="whif-empty">진행 중인 캐릭터가 없습니다.</div>
          ) : (
            <div className="whif-grid">
              {visibleCharacters.map(c => (
                <div key={c.id} className="whif-card" style={{ position: 'relative' }}
                  onClick={() => !editMode && router.push(`/whif/characters/${c.id}`)}>
                  {c.hasArchived && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                  {c.avatarUrl ? <img className="whif-card-img" src={c.avatarUrl} alt="" />
                    : <div className="whif-card-img" />}
                  <div className="whif-card-body">
                    <div className="whif-card-title">{c.name}</div>
                    {c.additionalInfo?.trim() && (
                      <div className="whif-card-desc">{replaceDisplayPlaceholders(c.additionalInfo, '나', c.name)}</div>
                    )}
                  </div>
                  {editMode && (
                    <button onClick={e => { e.stopPropagation(); deleteCharacter(c.id) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                        border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  )
}
