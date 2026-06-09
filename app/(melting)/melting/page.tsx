'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface MChar {
  id: string; title: string; coverImageUrl: string; tags: string[]
  characters: { id: string; name: string; avatarUrl: string | null }[]
}

export default function MeltingListPage() {
  const router = useRouter()
  const [chars, setChars] = useState<MChar[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('melting_edit') === '1')
    fetchData()
  }, [])

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

  const deleteChar = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  return (
    <>
      <div className="melting-header" style={{ position: 'relative' }}>
        <div className="melting-logo">melting</div>
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
            <button className="melting-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div className="melting-scroll">
        {loading ? (
          <div className="melting-empty">불러오는 중...</div>
        ) : chars.length === 0 ? (
          <div className="melting-empty">가져온 캐릭터가 없습니다<br />⋮ 메뉴에서 melting.chat 캐릭터 URL로 가져오세요.</div>
        ) : (
          <div className="melting-grid">
            {chars.map(c => {
              const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
              return (
                <div key={c.id} className="melting-card"
                  onClick={() => !editMode && router.push(`/melting/characters/${c.id}`)}>
                  {thumb ? <img className="melting-card-img" src={thumb} alt="" /> : <div className="melting-card-img" />}
                  <div className="melting-card-body">
                    <div className="melting-card-title">{c.title}</div>
                    {c.tags?.length > 0 && (
                      <div className="melting-card-tags">
                        {c.tags.slice(0, 3).map(t => <span key={t} className="melting-chip">#{t}</span>)}
                      </div>
                    )}
                  </div>
                  {editMode && (
                    <button onClick={e => { e.stopPropagation(); deleteChar(c.id) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                        border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
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
