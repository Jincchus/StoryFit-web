'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { useDisplayName } from '@/lib/useDisplayName'
import { useRefetchOnForeground } from '@/lib/useRefetchOnForeground'

interface Universe { id: string; title: string; coverImageUrl: string; description: string; tags: string[]; characters: { id: string; name: string; avatarUrl: string | null }[] }
interface Character { id: string; name: string; avatarUrl: string | null; tags: string[]; collection?: { id: string } | null }
interface Lorebook { id: string; keyword: string[]; content: string; priority: number }

export default function UniverseDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [uni, setUni] = useState<Universe | null>(null)
  const [chars, setChars] = useState<Character[]>([])
  const [lore, setLore] = useState<Lorebook[]>([])
  const [expanded, setExpanded] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const userName = useDisplayName()

  // Lorebook form state
  const [showLoreForm, setShowLoreForm] = useState(false)
  const [editingLoreId, setEditingLoreId] = useState<string | null>(null)
  const [loreKeyword, setLoreKeyword] = useState('')
  const [loreContent, setLoreContent] = useState('')
  const [lorePriority, setLorePriority] = useState(0)

  useEffect(() => {
    setEditMode(localStorage.getItem('whif_edit') === '1')
    fetchAll()
  }, [id])

  const fetchAll = async () => {
    const [unis, allChars, lb] = await Promise.all([
      api.get('/api/collections?isWhif=true'),
      api.get('/api/characters?isWhif=true'),
      api.get(`/api/lorebooks?collectionId=${id}`),
    ])
    setUni(unis.find((u: Universe) => u.id === id) ?? null)
    setChars(allChars.filter((c: Character) => c.collection?.id === id))
    setLore(lb)
  }

  useRefetchOnForeground(fetchAll)

  const saveLore = async () => {
    if (!loreKeyword.trim() || !loreContent.trim()) return
    const keywords = loreKeyword.split(',').map((k: string) => k.trim()).filter(Boolean)
    if (editingLoreId) {
      const updated = await api.patch(`/api/lorebooks/${editingLoreId}`, { keyword: keywords, content: loreContent, priority: Number(lorePriority) })
      setLore(prev => prev.map(lb => lb.id === editingLoreId ? updated : lb))
    } else {
      const created = await api.post('/api/lorebooks', { collectionId: id, keyword: keywords, content: loreContent, priority: Number(lorePriority) })
      setLore(prev => [created, ...prev])
    }
    setLoreKeyword(''); setLoreContent(''); setLorePriority(0); setShowLoreForm(false); setEditingLoreId(null)
  }

  const deleteLore = async (loreId: string) => {
    await api.delete(`/api/lorebooks/${loreId}`)
    setLore(prev => prev.filter(lb => lb.id !== loreId))
  }

  const deleteUniverse = async () => {
    if (!confirm('이 작품을 삭제할까요? 소속 캐릭터도 함께 삭제됩니다.')) return
    await api.delete(`/api/collections/${id}`)
    router.push('/whif')
  }

  if (!uni) return <div className="whif-empty">불러오는 중...</div>
  const cover = uni.coverImageUrl || uni.characters[0]?.avatarUrl || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {showEdit && (
        <CollectionEditModal
          collection={{ id: uni.id, title: uni.title, tags: uni.tags ?? [], description: uni.description ?? '', coverImageUrl: uni.coverImageUrl ?? '' }}
          label="세계관"
          onClose={() => setShowEdit(false)}
          onSaved={u => setUni(prev => prev ? { ...prev, ...u } : prev)}
        />
      )}
      <div className="whif-scroll">
        {/* Cover */}
        <div style={{ position: 'relative' }}>
          {cover ? <img className="whif-cover" src={cover} alt="" /> : <div className="whif-cover" />}
          <button className="whif-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          {editMode && (
            <div style={{ position: 'absolute', top: 12, right: 8, display: 'flex', gap: 8 }}>
              <button className="whif-iconbtn" style={{ color: 'var(--w-accent)' }} onClick={() => setShowEdit(true)}>✏ 정보 수정</button>
              <button className="whif-iconbtn" style={{ color: '#ff6b8a' }} onClick={deleteUniverse}>삭제</button>
            </div>
          )}
        </div>

        {/* Title + Tags */}
        <div className="whif-section">
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px', color: 'var(--w-ink)' }}>{uni.title}</h1>
          {uni.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {uni.tags.map(t => <span key={t} className="whif-chip">#{t}</span>)}
            </div>
          )}
          {uni.description && (
            <div>
              <p style={{ color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0,
                ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties) }}>
                {replaceDisplayPlaceholders(uni.description, userName, uni.characters?.[0]?.name ?? '')}
              </p>
              <button className="whif-iconbtn" style={{ fontSize: 12, color: 'var(--w-accent)', padding: '6px 0' }}
                onClick={() => setExpanded(e => !e)}>{expanded ? '접기 ↑' : '더보기 ↓'}</button>
            </div>
          )}
        </div>

        {/* Characters */}
        <div className="whif-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 className="whif-section-title" style={{ margin: 0 }}>캐릭터 ({chars.length})</h2>
            {editMode && (
              <button className="whif-iconbtn" style={{ fontSize: 13, color: 'var(--w-accent)' }}
                onClick={() => router.push(`/characters/new?isWhif=true&collectionId=${id}`)}>+ 직접 등록</button>
            )}
          </div>
          <div className="whif-grid" style={{ padding: 0 }}>
            {chars.map(c => (
              <div key={c.id} className="whif-card" onClick={() => router.push(`/whif/characters/${c.id}`)}>
                {c.avatarUrl ? <img className="whif-card-img" src={c.avatarUrl} alt="" /> : <div className="whif-card-img" />}
                <div className="whif-card-body"><div className="whif-card-title">{c.name}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* Lorebook */}
        <div className="whif-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 className="whif-section-title" style={{ margin: 0 }}>백과사전 ({lore.length})</h2>
            {editMode && (
              <button className="whif-iconbtn" style={{ fontSize: 13, color: 'var(--w-accent)' }}
                onClick={() => { setShowLoreForm(true); setEditingLoreId(null); setLoreKeyword(''); setLoreContent(''); setLorePriority(0) }}>+ 추가</button>
            )}
          </div>

          {editMode && showLoreForm && (
            <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="field" placeholder="키워드 (쉼표 구분)" value={loreKeyword} onChange={e => setLoreKeyword(e.target.value)} style={{ fontSize: 12 }} />
              <textarea className="field" rows={3} placeholder="설정 내용" value={loreContent} onChange={e => setLoreContent(e.target.value)} style={{ fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--w-ink-soft)' }}>우선순위</span>
                <input className="field" type="number" value={lorePriority} onChange={e => setLorePriority(Number(e.target.value))} style={{ fontSize: 12, width: 60 }} />
                <div style={{ flex: 1 }} />
                <button className="whif-iconbtn" style={{ fontSize: 12 }} onClick={() => setShowLoreForm(false)}>취소</button>
                <button className="whif-iconbtn" style={{ fontSize: 12, color: 'var(--w-accent)' }} onClick={saveLore}>저장</button>
              </div>
            </div>
          )}

          {lore.length === 0 ? (
            <div style={{ color: 'var(--w-ink-soft)', fontSize: 12 }}>등록된 설정 카드가 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lore.map(lb => (
                <div key={lb.id} style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {lb.keyword.map(k => <span key={k} className="whif-chip sel" style={{ fontSize: 10 }}>{k}</span>)}
                    </div>
                    {editMode && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="whif-iconbtn" style={{ fontSize: 11, color: 'var(--w-accent)' }}
                          onClick={() => { setEditingLoreId(lb.id); setLoreKeyword(lb.keyword.join(', ')); setLoreContent(lb.content); setLorePriority(lb.priority); setShowLoreForm(true) }}>수정</button>
                        <button className="whif-iconbtn" style={{ fontSize: 11, color: '#ff6b8a' }} onClick={() => deleteLore(lb.id)}>삭제</button>
                      </div>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--w-ink-soft)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{lb.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
