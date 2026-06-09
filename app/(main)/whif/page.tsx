'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PersonaSelectModal from '@/components/ui/PersonaSelectModal'

interface Opening { id: string; title: string; content: string }

interface Universe {
  id: string; title: string; sourceUrl: string; createdAt: string
}

interface Character {
  id: string; name: string; gender: string; avatarUrl: string | null
  tags: string[]; additionalInfo: string
  openingMessage?: string; openingMessages?: Opening[]
  collection?: { id: string; title: string } | null
}

interface ChatRoom {
  id: string; title: string; updatedAt: string
  characters: { character: { name: string; avatarUrl?: string | null } }[]
  messages: { content: string }[]
}

interface Lorebook { id: string; keyword: string[]; content: string; priority: number }

// Pending context for persona modal
interface PendingChat {
  primaryChar: Character | null   // null = 세계관 전체 대화
  universeId: string | null
  openingIdx: number
}

export default function WhifCenterPage() {
  const router = useRouter()

  // Data
  const [universes, setUniverses] = useState<Universe[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [chats, setChats] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)

  // View state: 'home' → grid of universes; 'universe' → detail view
  const [view, setView] = useState<'home' | 'universe'>('home')
  const [selectedUniId, setSelectedUniId] = useState<string | null>(null)
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [loreLoading, setLoreLoading] = useState(false)

  // Import bar
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Opening selection state
  const [pendingChat, setPendingChat] = useState<PendingChat | null>(null)
  const [openingStep, setOpeningStep] = useState(false)  // true = showing opening picker
  const [selectedOpeningIdx, setSelectedOpeningIdx] = useState(0)

  // Persona modal
  const [personaModalOpen, setPersonaModalOpen] = useState(false)
  const [personaCreating, setPersonaCreating] = useState(false)

  // Modals
  const [showCreateUni, setShowCreateUni] = useState(false)
  const [newUniTitle, setNewUniTitle] = useState('')
  const [confirmDeleteUniId, setConfirmDeleteUniId] = useState<string | null>(null)
  const [confirmDeleteCharId, setConfirmDeleteCharId] = useState<string | null>(null)

  // Lorebook inline form
  const [showAddLore, setShowAddLore] = useState(false)
  const [loreKeyword, setLoreKeyword] = useState('')
  const [loreContent, setLoreContent] = useState('')
  const [lorePriority, setLorePriority] = useState(0)
  const [editingLoreId, setEditingLoreId] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [unisData, charsData, chatsData] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
        api.get('/api/conversations?isWhif=true'),
      ])
      setUniverses(unisData)
      setCharacters(charsData)
      setChats(chatsData)
    } catch (e: any) {
      setError('데이터를 불러오지 못했습니다: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Import ───────────────────────────────────────────────────
  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true); setError(''); setSuccess('')
    try {
      const result = await api.post('/api/characters/import', { url: importUrl.trim() })
      setSuccess('성공적으로 가져왔습니다!')
      setImportUrl('')
      await fetchData()
      if (result.collectionId) openUniverse(result.collectionId)
    } catch (e: any) {
      setError(e.message ?? '가져오기 실패')
    } finally {
      setImporting(false)
    }
  }

  // ── Navigation ───────────────────────────────────────────────
  const openUniverse = async (id: string) => {
    setSelectedUniId(id)
    setView('universe')
    setShowAddLore(false)
    setEditingLoreId(null)
    setLoreLoading(true)
    try {
      const lbData = await api.get(`/api/lorebooks?collectionId=${id}`)
      setLorebooks(lbData)
    } catch { setError('설정 카드를 불러오지 못했습니다.') }
    finally { setLoreLoading(false) }
  }

  const goHome = () => { setView('home'); setSelectedUniId(null); setLorebooks([]) }

  // ── Universe CRUD ────────────────────────────────────────────
  const handleCreateUniverse = async () => {
    if (!newUniTitle.trim()) return
    setError('')
    try {
      const created = await api.post('/api/collections', {
        title: newUniTitle.trim(), sourceUrl: `https://whif.io/local/${Date.now()}`
      })
      setUniverses(prev => [created, ...prev])
      setShowCreateUni(false); setNewUniTitle('')
      setSuccess('세계관이 생성되었습니다.')
      openUniverse(created.id)
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteUniverse = async (id: string) => {
    try {
      await api.delete(`/api/collections/${id}`)
      setConfirmDeleteUniId(null)
      setSuccess('세계관과 소속 캐릭터가 삭제되었습니다.')
      goHome()
      await fetchData()
    } catch (e: any) { setError('세계관 삭제 실패: ' + e.message); setConfirmDeleteUniId(null) }
  }

  const handleDeleteCharacter = async (charId: string) => {
    try {
      await api.delete(`/api/characters/${charId}`)
      setConfirmDeleteCharId(null)
      setSuccess('캐릭터가 삭제되었습니다.')
      const [unisData, charsData, chatsData] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
        api.get('/api/conversations?isWhif=true'),
      ])
      setUniverses(unisData); setCharacters(charsData); setChats(chatsData)
      if (selectedUniId && !unisData.some((u: any) => u.id === selectedUniId)) goHome()
    } catch (e: any) { setError('캐릭터 삭제 실패: ' + e.message); setConfirmDeleteCharId(null) }
  }

  // ── Lorebook CRUD ────────────────────────────────────────────
  const handleSaveLore = async () => {
    if (!loreKeyword.trim() || !loreContent.trim() || !selectedUniId) return
    const keywords = loreKeyword.split(',').map(k => k.trim()).filter(Boolean)
    try {
      if (editingLoreId) {
        const updated = await api.patch(`/api/lorebooks/${editingLoreId}`, { keyword: keywords, content: loreContent, priority: Number(lorePriority) })
        setLorebooks(prev => prev.map(lb => lb.id === editingLoreId ? updated : lb))
        setSuccess('설정 카드가 수정되었습니다.')
      } else {
        const created = await api.post('/api/lorebooks', { scope: 'collection', scopeId: selectedUniId, keyword: keywords, content: loreContent, priority: Number(lorePriority) })
        setLorebooks(prev => [created, ...prev])
        setSuccess('설정 카드가 추가되었습니다.')
      }
      setLoreKeyword(''); setLoreContent(''); setLorePriority(0); setShowAddLore(false); setEditingLoreId(null)
    } catch (e: any) { setError('설정 카드 저장 실패: ' + e.message) }
  }

  const handleDeleteLore = async (id: string) => {
    try { await api.delete(`/api/lorebooks/${id}`); setLorebooks(prev => prev.filter(lb => lb.id !== id)); setSuccess('설정 카드가 삭제되었습니다.') }
    catch (e: any) { setError('설정 카드 삭제 실패: ' + e.message) }
  }

  // ── StartChat flow ───────────────────────────────────────────
  const startChatFlow = (char: Character | null, universeId: string | null) => {
    const openings = char?.openingMessages
    if (openings && openings.length > 1) {
      setPendingChat({ primaryChar: char, universeId, openingIdx: 0 })
      setSelectedOpeningIdx(0)
      setOpeningStep(true)
    } else {
      setPendingChat({ primaryChar: char, universeId, openingIdx: 0 })
      setOpeningStep(false)
      setPersonaModalOpen(true)
    }
  }

  const confirmOpening = () => {
    if (!pendingChat) return
    setPendingChat(prev => prev ? { ...prev, openingIdx: selectedOpeningIdx } : prev)
    setOpeningStep(false)
    setPersonaModalOpen(true)
  }

  const handlePersonaSelect = async (personaCharId: string | null, newPersonaName?: string) => {
    if (!pendingChat) return
    setPersonaCreating(true)
    setError('')
    try {
      let resolvedPersonaId = personaCharId
      if (!resolvedPersonaId && newPersonaName?.trim()) {
        const persona = await api.post('/api/characters', { name: newPersonaName.trim() })
        resolvedPersonaId = persona.id
      }

      let aiCharIds: string[]
      if (!pendingChat.primaryChar && pendingChat.universeId) {
        const uniChars = characters.filter(c => c.collection?.id === pendingChat.universeId)
        aiCharIds = uniChars.filter(c => c.id !== resolvedPersonaId).map(c => c.id)
      } else if (pendingChat.primaryChar) {
        aiCharIds = [pendingChat.primaryChar.id]
      } else { return }

      if (aiCharIds.length === 0) {
        setError('대화할 AI 캐릭터가 없습니다.')
        setPersonaCreating(false); return
      }

      const openings = pendingChat.primaryChar?.openingMessages
      const chosenOpening = openings?.[pendingChat.openingIdx]?.content

      const title = pendingChat.primaryChar
        ? pendingChat.primaryChar.name
        : universes.find(u => u.id === pendingChat.universeId)?.title || '세계관 대화'

      const resp = await api.post('/api/conversations', {
        title,
        characterIds: aiCharIds,
        mode: aiCharIds.length > 1 ? 'tikiTaka' : 'roleplay',
        personaCharacterId: resolvedPersonaId,
        ...(chosenOpening !== undefined ? { openingMessage: chosenOpening } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message)
      setPersonaCreating(false)
    }
  }

  // ── Derived ──────────────────────────────────────────────────
  const selectedUniverse = universes.find(u => u.id === selectedUniId)
  const selectedUniChars = characters.filter(c => c.collection?.id === selectedUniId)
  const personaCandidates = pendingChat
    ? characters.filter(c => {
        const uniId = pendingChat.universeId ?? pendingChat.primaryChar?.collection?.id
        return c.collection?.id === uniId && c.id !== pendingChat.primaryChar?.id
      })
    : []

  // ── Lorebook section ─────────────────────────────────────────
  const renderLorebooks = () => (
    <div className="vstack" style={{ gap: 8 }}>
      <div className="spread" style={{ alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📖 백과사전 (설정 카드) <span className="tiny muted">({lorebooks.length})</span></div>
        <button
          className="btn" style={{ fontSize: 11, padding: '3px 10px', borderColor: '#8b5cf6', color: '#c084fc' }}
          onClick={() => { setShowAddLore(!showAddLore); setEditingLoreId(null); setLoreKeyword(''); setLoreContent(''); setLorePriority(0) }}
        >{showAddLore ? '닫기' : '+ 추가'}</button>
      </div>

      {showAddLore && (
        <div className="vstack" style={{ gap: 8, background: 'rgba(139,92,246,0.06)', border: '1px solid #7c3aed', padding: 12, borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#c084fc' }}>{editingLoreId ? '설정 카드 수정' : '새 설정 카드'}</div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>인식 키워드 (쉼표 구분)</label>
            <input className="field" placeholder="예: 마왕성, 검은장미" value={loreKeyword} onChange={e => setLoreKeyword(e.target.value)} style={{ fontSize: 11 }} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>설정 내용</label>
            <textarea className="field" rows={3} placeholder="키워드 감지 시 AI가 참고할 설정 내용" value={loreContent} onChange={e => setLoreContent(e.target.value)} style={{ fontSize: 11 }} />
          </div>
          <div className="hstack" style={{ gap: 8, alignItems: 'center' }}>
            <label className="label" style={{ fontSize: 11, flexShrink: 0, marginBottom: 0 }}>우선순위</label>
            <input className="field" type="number" value={lorePriority} onChange={e => setLorePriority(Number(e.target.value))} style={{ fontSize: 11, width: 70 }} />
            <div style={{ flex: 1 }} />
            <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => setShowAddLore(false)}>취소</button>
            <button className="btn primary" style={{ fontSize: 11, background: '#7c3aed', borderColor: '#6d28d9' }} onClick={handleSaveLore}>저장</button>
          </div>
        </div>
      )}

      {loreLoading ? (
        <div className="tiny muted" style={{ padding: '12px 0' }}>불러오는 중...</div>
      ) : lorebooks.length === 0 ? (
        <div className="tiny muted" style={{ padding: '12px 0' }}>등록된 설정 카드가 없습니다.</div>
      ) : (
        <div className="vstack" style={{ gap: 6 }}>
          {lorebooks.map(lb => (
            <div key={lb.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--chrome-border)', padding: '10px 12px', borderRadius: 6 }}>
              <div className="spread" style={{ marginBottom: 6 }}>
                <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                  {lb.keyword.map(kw => (
                    <span key={kw} style={{ background: '#7c3aed', color: '#fff', fontSize: 10, padding: '1px 7px', borderRadius: 10 }}>{kw}</span>
                  ))}
                  <span className="tiny muted" style={{ fontSize: 9 }}>우선순위 {lb.priority}</span>
                </div>
                <div className="hstack" style={{ gap: 4 }}>
                  <button className="btn ghost" style={{ fontSize: 10, padding: '1px 6px', border: 'none', color: '#a78bfa' }}
                    onClick={() => { setEditingLoreId(lb.id); setLoreKeyword(lb.keyword.join(', ')); setLoreContent(lb.content); setLorePriority(lb.priority); setShowAddLore(true) }}>수정</button>
                  <button className="btn danger" style={{ fontSize: 10, padding: '1px 6px', border: 'none' }} onClick={() => handleDeleteLore(lb.id)}>삭제</button>
                </div>
              </div>
              <p className="tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)', lineHeight: 1.5 }}>{lb.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── Home view ────────────────────────────────────────────────
  const renderHome = () => (
    <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="vstack" style={{ gap: 20, paddingBottom: 20 }}>

        {/* Universe grid */}
        <div className="vstack" style={{ gap: 10 }}>
          <div className="spread" style={{ alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🪐 세계관 (Universe)</div>
            <button className="btn ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setShowCreateUni(true)}>+ 새 세계관</button>
          </div>

          {loading ? (
            <div className="tiny muted">로딩 중...</div>
          ) : universes.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🪐</div>
              <div className="tiny muted">아직 등록된 세계관이 없습니다.</div>
              <div className="tiny muted">WHIF URL로 가져오거나 새로 만들어보세요.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {universes.map(uni => {
                const uniChars = characters.filter(c => c.collection?.id === uni.id)
                const thumb = uniChars[0]?.avatarUrl
                return (
                  <div
                    key={uni.id}
                    onClick={() => openUniverse(uni.id)}
                    style={{
                      background: 'rgba(139,92,246,0.07)',
                      border: '1px solid rgba(139,92,246,0.3)',
                      borderRadius: 10, padding: 12, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 8,
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#8b5cf6')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)')}
                  >
                    {/* Thumbnail: first character avatar or initials */}
                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {thumb
                        ? <img src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <span style={{ fontSize: 28 }}>🪐</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uni.title}</div>
                      <div className="tiny muted" style={{ marginTop: 2 }}>{uniChars.length}명 소속</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent chats */}
        {chats.length > 0 && (
          <div className="vstack" style={{ gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>💬 최근 WHIF 대화</div>
            <div className="vstack" style={{ gap: 6 }}>
              {chats.slice(0, 5).map(chat => {
                const c = chat.characters[0]?.character
                const lastMsg = (chat.messages[0]?.content ?? '').replace(/\*[^*]+\*/g, '').replace(/\n/g, ' ').trim()
                return (
                  <div
                    key={chat.id}
                    onClick={() => router.push(`/conversations/${chat.id}`)}
                    style={{
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--chrome-border)',
                      borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', gap: 10, alignItems: 'center',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--chrome-border)')}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                      {c?.avatarUrl ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <PixelAvatar kind="custom" size={36} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</div>
                      {lastMsg && <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{lastMsg}</div>}
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 16, color: '#7c3aed', flexShrink: 0 }}>→</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ── Universe detail view ─────────────────────────────────────
  const renderUniverseDetail = () => {
    if (!selectedUniverse) return null
    return (
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div className="vstack" style={{ gap: 20, paddingBottom: 20 }}>

          {/* Header */}
          <div style={{ borderBottom: '1px solid var(--chrome-border)', paddingBottom: 14 }}>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 18, color: '#c084fc' }}>🪐 {selectedUniverse.title}</h2>
                {selectedUniverse.sourceUrl && !selectedUniverse.sourceUrl.includes('/local/') && (
                  <a href={selectedUniverse.sourceUrl} target="_blank" rel="noreferrer" className="tiny" style={{ color: '#a78bfa', textDecoration: 'underline' }}>원본 출처 열기 ↗</a>
                )}
              </div>
              <div className="hstack" style={{ gap: 6, flexShrink: 0 }}>
                <button
                  className="btn primary"
                  style={{ fontSize: 11, padding: '4px 12px', background: '#8b5cf6', borderColor: '#7c3aed' }}
                  onClick={() => startChatFlow(null, selectedUniverse.id)}
                  title="소속 전체 캐릭터와 그룹 대화"
                >💬 세계관 전체 대화</button>
                <button className="btn danger" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setConfirmDeleteUniId(selectedUniverse.id)}>✕ 삭제</button>
              </div>
            </div>
          </div>

          {/* Character grid */}
          <div className="vstack" style={{ gap: 10 }}>
            <div className="spread" style={{ alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>🎭 소속 캐릭터 <span className="tiny muted">({selectedUniChars.length}명)</span></div>
              <button className="btn ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => router.push(`/characters/new?isWhif=true&collectionId=${selectedUniverse.id}`)}>+ 직접 등록</button>
            </div>

            {selectedUniChars.length === 0 ? (
              <div className="tiny muted" style={{ padding: '16px 0' }}>소속 캐릭터가 없습니다.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
                {selectedUniChars.map(char => (
                  <div
                    key={char.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--chrome-border)',
                      borderRadius: 10, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{ width: '100%', aspectRatio: '4/3', background: 'rgba(139,92,246,0.1)', overflow: 'hidden', position: 'relative' }}>
                      {char.avatarUrl
                        ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PixelAvatar kind="custom" size={56} /></div>}
                    </div>

                    {/* Info */}
                    <div style={{ padding: '10px 10px 6px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{char.name}</div>
                      {char.gender && <div className="tiny muted">{char.gender}</div>}

                      {/* Opening badges */}
                      {char.openingMessages && char.openingMessages.length > 1 && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {char.openingMessages.map(op => (
                            <span key={op.id} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#c084fc', fontSize: 9, padding: '1px 5px', borderRadius: 8 }}>
                              📖 {op.title}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Intro preview */}
                      {char.additionalInfo?.trim() && (
                        <p className="tiny" style={{
                          margin: '6px 0 0', color: 'var(--ink-soft)',
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          lineHeight: 1.5,
                        }}>{char.additionalInfo}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ padding: '6px 10px 10px', marginTop: 'auto' }}>
                      <button
                        className="btn primary"
                        style={{ width: '100%', fontSize: 11, padding: '5px 0', background: '#8b5cf6', borderColor: '#7c3aed', marginBottom: 6 }}
                        onClick={() => startChatFlow(char, selectedUniverse.id)}
                      >💬 1:1 대화 시작</button>
                      <div className="hstack" style={{ gap: 4 }}>
                        <button className="btn ghost" style={{ flex: 1, fontSize: 10, padding: '3px 0' }} onClick={() => router.push(`/characters/${char.id}/edit?isWhif=true`)}>✏ 수정</button>
                        <button className="btn danger" style={{ flex: 1, fontSize: 10, padding: '3px 0' }} onClick={() => setConfirmDeleteCharId(char.id)}>✕ 삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lorebook */}
          <div style={{ borderTop: '1px solid var(--chrome-border)', paddingTop: 16 }}>
            {renderLorebooks()}
          </div>
        </div>
      </div>
    )
  }

  // ── Opening picker modal ─────────────────────────────────────
  const renderOpeningPicker = () => {
    if (!openingStep || !pendingChat?.primaryChar) return null
    const openings = pendingChat.primaryChar.openingMessages!
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={e => { if (e.target === e.currentTarget) { setOpeningStep(false); setPendingChat(null) } }}
      >
        <div style={{ background: 'var(--chrome-face)', border: '1px solid #7c3aed', borderRadius: 10, padding: 24, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}>
          <div className="spread" style={{ marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#c084fc' }}>📖 도입부 선택</div>
              <div className="tiny muted">{pendingChat.primaryChar.name} · {openings.length}개 도입부</div>
            </div>
            <button className="btn ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => { setOpeningStep(false); setPendingChat(null) }}>✕</button>
          </div>

          <div className="vstack" style={{ gap: 8 }}>
            {openings.map((op, idx) => (
              <div
                key={op.id}
                onClick={() => setSelectedOpeningIdx(idx)}
                style={{
                  padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${selectedOpeningIdx === idx ? '#8b5cf6' : 'var(--chrome-border)'}`,
                  background: selectedOpeningIdx === idx ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: selectedOpeningIdx === idx ? '#c084fc' : 'var(--ink)', marginBottom: 4 }}>{op.title}</div>
                <p className="tiny" style={{ margin: 0, color: 'var(--ink-soft)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{op.content}</p>
              </div>
            ))}
          </div>

          <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn ghost" onClick={() => { setOpeningStep(false); setPendingChat(null) }}>취소</button>
            <button className="btn primary" style={{ background: '#7c3aed', borderColor: '#6d28d9' }} onClick={confirmOpening}>다음 →</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* Opening picker modal */}
      {renderOpeningPicker()}

      {/* Persona select modal */}
      {personaModalOpen && (
        <PersonaSelectModal
          candidates={personaCandidates}
          loading={personaCreating}
          onCancel={() => { setPersonaModalOpen(false); setPendingChat(null); setPersonaCreating(false) }}
          onSelect={(charId, newName) => handlePersonaSelect(charId, newName)}
        />
      )}

      {/* Confirm dialogs */}
      {confirmDeleteUniId && (
        <ConfirmDialog
          message="이 세계관을 삭제할까요? 세계관과 소속 캐릭터, 설정 카드가 전부 삭제되며 복구할 수 없습니다."
          onConfirm={() => handleDeleteUniverse(confirmDeleteUniId)}
          onCancel={() => setConfirmDeleteUniId(null)}
        />
      )}
      {confirmDeleteCharId && (
        <ConfirmDialog
          message="이 캐릭터를 삭제할까요? 관련 대화방 기록도 함께 정리됩니다."
          onConfirm={() => handleDeleteCharacter(confirmDeleteCharId)}
          onCancel={() => setConfirmDeleteCharId(null)}
        />
      )}
      {showCreateUni && (
        <ConfirmDialog
          message={
            <div className="vstack" style={{ gap: 10 }}>
              <div style={{ fontWeight: 700 }}>🪐 새 세계관(Universe) 만들기</div>
              <input className="field" placeholder="세계관 이름을 입력하세요" value={newUniTitle} onChange={e => setNewUniTitle(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCreateUniverse() }} />
            </div>
          }
          confirmLabel="생성"
          confirmVariant="primary"
          onConfirm={handleCreateUniverse}
          onCancel={() => { setShowCreateUni(false); setNewUniTitle('') }}
        />
      )}

      <Win title="🪐 WHIF 통합 센터" icon={PixelIcons.bot}>
        <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0 }}>

          {/* Import bar */}
          <div className="form-section" style={{ background: 'rgba(139,92,246,0.05)', borderColor: '#8b5cf6', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>🪐 WHIF 설정 가져오기</div>
            <div className="hstack" style={{ gap: 6 }}>
              <input
                className="field" style={{ flex: 1, borderColor: '#7c3aed' }}
                placeholder="https://whif.io/characters/972fb410-..."
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
              />
              <button
                className="btn primary" style={{ background: '#7c3aed', borderColor: '#6d28d9', flexShrink: 0 }}
                disabled={importing || !importUrl.trim()}
                onClick={handleImport}
              >{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            {error && <div className="tiny" style={{ color: '#ff6b8a', marginTop: 4 }}>⚠ {error}</div>}
            {success && <div className="tiny" style={{ color: '#4ade80', marginTop: 4 }}>✓ {success}</div>}
          </div>

          {/* Back nav (universe detail only) */}
          {view === 'universe' && (
            <div style={{ flexShrink: 0 }}>
              <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={goHome}>← 세계관 목록으로</button>
            </div>
          )}

          {/* Main content */}
          {view === 'home' ? renderHome() : renderUniverseDetail()}
        </div>
      </Win>
    </>
  )
}
