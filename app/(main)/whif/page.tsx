'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface Opening {
  id: string
  title: string
  content: string
}

interface Universe {
  id: string
  title: string
  sourceUrl: string
  createdAt: string
}

interface Character {
  id: string
  name: string
  gender: string
  avatarUrl: string | null
  tags: string[]
  additionalInfo: string
  openingMessage?: string
  openingMessages?: Opening[]
  collection?: { id: string; title: string } | null
}

interface ChatRoom {
  id: string
  title: string
  updatedAt: string
  characters: { character: { name: string; avatarUrl?: string | null } }[]
  messages: { content: string }[]
}

interface Lorebook {
  id: string
  keyword: string[]
  content: string
  priority: number
}

interface StartChatState {
  step: 'opening' | 'persona'
  // null = universe group chat, non-null = 1:1 with this char
  primaryChar: Character | null
  universeId: string | null
  openingIdx: number
  personaCharId: string | null
  newPersonaName: string
  creating: boolean
}

export default function WhifCenterPage() {
  const router = useRouter()

  // Import bar
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Lists
  const [universes, setUniverses] = useState<Universe[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [chats, setChats] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)

  // Universe selection & lorebooks
  const [selectedUniId, setSelectedUniId] = useState<string | null>(null)
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [loreLoading, setLoreLoading] = useState(false)

  // Tabs & character selection
  const [activeTab, setActiveTab] = useState<'universes' | 'characters' | 'chats'>('universes')
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)

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

  // StartChat modal
  const [startChat, setStartChat] = useState<StartChatState | null>(null)

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

  // ── Import ──────────────────────────────────────────────────
  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setError('')
    setSuccess('')
    try {
      const result = await api.post('/api/characters/import', { url: importUrl.trim() })
      setSuccess('성공적으로 가져왔습니다!')
      setImportUrl('')
      await fetchData()
      if (result.collectionId) {
        setActiveTab('universes')
        handleSelectUniverse(result.collectionId)
      }
    } catch (e: any) {
      setError(e.message ?? '가져오기 실패')
    } finally {
      setImporting(false)
    }
  }

  // ── Universe CRUD ────────────────────────────────────────────
  const handleCreateUniverse = async () => {
    if (!newUniTitle.trim()) return
    setError('')
    try {
      const virtualUrl = `https://whif.io/local/${Date.now()}`
      const created = await api.post('/api/collections', { title: newUniTitle.trim(), sourceUrl: virtualUrl })
      setUniverses(prev => [created, ...prev])
      setSelectedUniId(created.id)
      setShowCreateUni(false)
      setNewUniTitle('')
      setSuccess('세계관이 생성되었습니다.')
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleDeleteUniverse = async (id: string) => {
    try {
      await api.delete(`/api/collections/${id}`)
      setUniverses(prev => prev.filter(u => u.id !== id))
      if (selectedUniId === id) { setSelectedUniId(null); setLorebooks([]) }
      setConfirmDeleteUniId(null)
      setSuccess('세계관과 소속 캐릭터가 삭제되었습니다.')
      await fetchData()
    } catch (e: any) {
      setError('세계관 삭제 실패: ' + e.message)
      setConfirmDeleteUniId(null)
    }
  }

  const handleDeleteCharacter = async (charId: string) => {
    try {
      await api.delete(`/api/characters/${charId}`)
      setConfirmDeleteCharId(null)
      if (selectedCharId === charId) setSelectedCharId(null)
      setSuccess('캐릭터가 삭제되었습니다.')
      const [unisData, charsData, chatsData] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
        api.get('/api/conversations?isWhif=true'),
      ])
      setUniverses(unisData)
      setCharacters(charsData)
      setChats(chatsData)
      if (selectedUniId && !unisData.some((u: any) => u.id === selectedUniId)) {
        setSelectedUniId(null)
        setLorebooks([])
      }
    } catch (e: any) {
      setError('캐릭터 삭제 실패: ' + e.message)
      setConfirmDeleteCharId(null)
    }
  }

  const handleSelectUniverse = async (id: string) => {
    setSelectedUniId(id)
    setSelectedCharId(null)
    setLoreLoading(true)
    setShowAddLore(false)
    setEditingLoreId(null)
    try {
      const lbData = await api.get(`/api/lorebooks?collectionId=${id}`)
      setLorebooks(lbData)
    } catch {
      setError('설정 카드를 불러오지 못했습니다.')
    } finally {
      setLoreLoading(false)
    }
  }

  const handleSelectCharacter = async (char: Character) => {
    setSelectedCharId(char.id)
    const uniId = char.collection?.id ?? null
    setSelectedUniId(uniId)
    if (uniId) {
      setLoreLoading(true)
      try {
        const lbData = await api.get(`/api/lorebooks?collectionId=${uniId}`)
        setLorebooks(lbData)
      } catch {
        setError('설정 카드를 불러오지 못했습니다.')
      } finally {
        setLoreLoading(false)
      }
    } else {
      setLorebooks([])
    }
  }

  // ── Lorebook CRUD ────────────────────────────────────────────
  const handleSaveLore = async () => {
    if (!loreKeyword.trim() || !loreContent.trim() || !selectedUniId) return
    setError('')
    const keywords = loreKeyword.split(',').map(k => k.trim()).filter(Boolean)
    try {
      if (editingLoreId) {
        const updated = await api.patch(`/api/lorebooks/${editingLoreId}`, {
          keyword: keywords, content: loreContent, priority: Number(lorePriority),
        })
        setLorebooks(prev => prev.map(lb => lb.id === editingLoreId ? updated : lb))
        setSuccess('설정 카드가 수정되었습니다.')
      } else {
        const created = await api.post('/api/lorebooks', {
          scope: 'collection', scopeId: selectedUniId,
          keyword: keywords, content: loreContent, priority: Number(lorePriority),
        })
        setLorebooks(prev => [created, ...prev])
        setSuccess('설정 카드가 추가되었습니다.')
      }
      setLoreKeyword(''); setLoreContent(''); setLorePriority(0)
      setShowAddLore(false); setEditingLoreId(null)
    } catch (e: any) {
      setError('설정 카드 저장 실패: ' + e.message)
    }
  }

  const handleEditLoreClick = (lb: Lorebook) => {
    setEditingLoreId(lb.id)
    setLoreKeyword(lb.keyword.join(', '))
    setLoreContent(lb.content)
    setLorePriority(lb.priority)
    setShowAddLore(true)
  }

  const handleDeleteLore = async (lbId: string) => {
    try {
      await api.delete(`/api/lorebooks/${lbId}`)
      setLorebooks(prev => prev.filter(lb => lb.id !== lbId))
      setSuccess('설정 카드가 삭제되었습니다.')
    } catch (e: any) {
      setError('설정 카드 삭제 실패: ' + e.message)
    }
  }

  // ── StartChat flow ───────────────────────────────────────────
  const openStartChat = (char: Character | null, universeId: string | null) => {
    const hasMultipleOpenings = (char?.openingMessages?.length ?? 0) > 1
    setStartChat({
      step: hasMultipleOpenings ? 'opening' : 'persona',
      primaryChar: char,
      universeId,
      openingIdx: 0,
      personaCharId: null,
      newPersonaName: '',
      creating: false,
    })
  }

  const handleStartChatConfirm = async () => {
    if (!startChat || startChat.creating) return
    setStartChat(s => s ? { ...s, creating: true } : s)
    setError('')
    try {
      let personaCharacterId: string | null = startChat.personaCharId

      // 새 페르소나 이름이 입력된 경우 즉석 생성
      if (!personaCharacterId && startChat.newPersonaName.trim()) {
        const persona = await api.post('/api/characters', { name: startChat.newPersonaName.trim() })
        personaCharacterId = persona.id
      }

      // AI 캐릭터 ID 목록 결정 (페르소나로 선택된 캐릭터는 제외)
      let aiCharIds: string[]
      if (!startChat.primaryChar && startChat.universeId) {
        // 세계관 전체 대화: 소속 전체에서 페르소나 캐릭터 제외
        const uniChars = characters.filter(c => c.collection?.id === startChat.universeId)
        aiCharIds = uniChars.filter(c => c.id !== personaCharacterId).map(c => c.id)
      } else if (startChat.primaryChar) {
        aiCharIds = [startChat.primaryChar.id]
      } else {
        return
      }

      if (aiCharIds.length === 0) {
        setError('대화할 AI 캐릭터가 없습니다. 페르소나 선택을 바꿔보세요.')
        setStartChat(s => s ? { ...s, creating: false } : s)
        return
      }

      // 선택된 도입부 내용 (단일 도입부면 API가 기본값 사용)
      const openings = startChat.primaryChar?.openingMessages
      const chosenOpening = openings?.[startChat.openingIdx]?.content

      const title = startChat.primaryChar
        ? startChat.primaryChar.name
        : universes.find(u => u.id === startChat.universeId)?.title || '세계관 대화'

      const response = await api.post('/api/conversations', {
        title,
        characterIds: aiCharIds,
        mode: aiCharIds.length > 1 ? 'tikiTaka' : 'roleplay',
        personaCharacterId,
        ...(chosenOpening !== undefined ? { openingMessage: chosenOpening } : {}),
      })

      router.push(`/conversations/${response.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message)
      setStartChat(s => s ? { ...s, creating: false } : s)
    }
  }

  // ── Derived values ───────────────────────────────────────────
  const selectedUniverse = universes.find(u => u.id === selectedUniId)
  const selectedUniCharacters = characters.filter(c => c.collection?.id === selectedUniId)
  const selectedChar = characters.find(c => c.id === selectedCharId) ?? null
  const personaCandidates = startChat
    ? characters.filter(c => {
        const uniId = startChat.universeId ?? startChat.primaryChar?.collection?.id
        return c.collection?.id === uniId && c.id !== startChat.primaryChar?.id
      })
    : []

  // ── Lorebook section renderer ────────────────────────────────
  const renderLorebookSection = () => (
    <div className="vstack" style={{ gap: 8 }}>
      <div className="spread" style={{ alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>📖 세계관 설정 카드 / 백과사전 ({lorebooks.length})</div>
        <button
          className="btn"
          style={{ fontSize: 10, padding: '2px 8px', borderColor: '#8b5cf6', color: '#c084fc' }}
          onClick={() => {
            setShowAddLore(!showAddLore)
            setEditingLoreId(null)
            setLoreKeyword(''); setLoreContent(''); setLorePriority(0)
          }}
        >{showAddLore ? '닫기' : '+ 설정 카드 추가'}</button>
      </div>

      {showAddLore && (
        <div className="vstack" style={{ gap: 8, background: 'rgba(139, 92, 246, 0.05)', border: '1px solid #7c3aed', padding: 10, borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc' }}>
            {editingLoreId ? '설정 카드 수정' : '새 설정 카드 추가'}
          </div>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 2 }}>인식 키워드 (쉼표로 구분)</label>
            <input className="field" placeholder="예: 마왕성, 검은장미" value={loreKeyword} onChange={e => setLoreKeyword(e.target.value)} style={{ fontSize: 11 }} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 2 }}>설정 내용</label>
            <textarea className="field" rows={3} placeholder="AI가 해당 키워드 감지 시 참고할 설정 내용" value={loreContent} onChange={e => setLoreContent(e.target.value)} style={{ fontSize: 11 }} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 2 }}>우선순위</label>
            <input className="field" type="number" placeholder="0" value={lorePriority} onChange={e => setLorePriority(Number(e.target.value))} style={{ fontSize: 11 }} />
          </div>
          <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setShowAddLore(false)}>취소</button>
            <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px', background: '#7c3aed', borderColor: '#6d28d9' }} onClick={handleSaveLore}>저장</button>
          </div>
        </div>
      )}

      {loreLoading ? (
        <div className="tiny muted text-center" style={{ padding: 20 }}>불러오는 중...</div>
      ) : lorebooks.length === 0 ? (
        <div className="tiny muted text-center" style={{ padding: 20 }}>등록된 설정 카드가 없습니다.</div>
      ) : (
        <div className="vstack" style={{ gap: 6 }}>
          {lorebooks.map(lb => (
            <div key={lb.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--chrome-border)', padding: 8, borderRadius: 4 }}>
              <div className="spread" style={{ alignItems: 'flex-start', marginBottom: 4 }}>
                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {lb.keyword.map(kw => (
                    <span key={kw} style={{ background: '#7c3aed', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10 }}>{kw}</span>
                  ))}
                  <span className="tiny muted" style={{ fontSize: 9 }}>우선순위: {lb.priority}</span>
                </div>
                <div className="hstack" style={{ gap: 4 }}>
                  <button className="btn ghost" style={{ fontSize: 9, padding: '1px 4px', border: 'none', color: '#a78bfa' }} onClick={() => handleEditLoreClick(lb)}>수정</button>
                  <button className="btn danger" style={{ fontSize: 9, padding: '1px 4px', border: 'none' }} onClick={() => handleDeleteLore(lb.id)}>삭제</button>
                </div>
              </div>
              <p className="tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)' }}>{lb.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── StartChat modal ──────────────────────────────────────────
  const renderStartChatModal = () => {
    if (!startChat) return null
    const char = startChat.primaryChar
    const openings = char?.openingMessages

    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
        onClick={e => { if (e.target === e.currentTarget) setStartChat(null) }}
      >
        <div style={{
          background: 'var(--chrome-face)', border: '1px solid #7c3aed',
          borderRadius: 8, padding: 20, width: '100%', maxWidth: 480,
          maxHeight: '80vh', overflowY: 'auto',
        }}>
          {/* Modal header */}
          <div className="spread" style={{ marginBottom: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#c084fc' }}>
                {startChat.step === 'opening' ? '📖 도입부 선택' : '🎭 페르소나 선택'}
              </div>
              <div className="tiny muted">
                {char ? char.name : universes.find(u => u.id === startChat.universeId)?.title}
                {openings && openings.length > 1 && (
                  <span style={{ marginLeft: 6, color: '#8b5cf6' }}>
                    {startChat.step === 'opening' ? `(${openings.length}개 도입부)` : `(도입부 ${startChat.openingIdx + 1} 선택됨)`}
                  </span>
                )}
              </div>
            </div>
            <button className="btn ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setStartChat(null)}>✕</button>
          </div>

          {/* Step 1: Opening selection */}
          {startChat.step === 'opening' && openings && openings.length > 1 && (
            <div className="vstack" style={{ gap: 10 }}>
              <div className="vstack" style={{ gap: 8 }}>
                {openings.map((op, idx) => (
                  <div
                    key={op.id}
                    onClick={() => setStartChat(s => s ? { ...s, openingIdx: idx } : s)}
                    style={{
                      padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                      border: `1.5px solid ${startChat.openingIdx === idx ? '#8b5cf6' : 'var(--chrome-border)'}`,
                      background: startChat.openingIdx === idx ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: startChat.openingIdx === idx ? '#c084fc' : 'var(--ink)', marginBottom: 4 }}>
                      {op.title}
                    </div>
                    <p className="tiny" style={{
                      margin: 0, color: 'var(--ink-soft)',
                      display: '-webkit-box', WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {op.content}
                    </p>
                  </div>
                ))}
              </div>
              <div className="hstack" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button className="btn ghost" onClick={() => setStartChat(null)}>취소</button>
                <button
                  className="btn primary"
                  style={{ background: '#7c3aed', borderColor: '#6d28d9' }}
                  onClick={() => setStartChat(s => s ? { ...s, step: 'persona' } : s)}
                >다음 →</button>
              </div>
            </div>
          )}

          {/* Step 2: Persona selection */}
          {startChat.step === 'persona' && (
            <div className="vstack" style={{ gap: 10 }}>
              {/* No persona option */}
              <div
                onClick={() => setStartChat(s => s ? { ...s, personaCharId: null, newPersonaName: '' } : s)}
                style={{
                  padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                  border: `1.5px solid ${!startChat.personaCharId && !startChat.newPersonaName.trim() ? '#8b5cf6' : 'var(--chrome-border)'}`,
                  background: !startChat.personaCharId && !startChat.newPersonaName.trim() ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                  display: 'flex', gap: 10, alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>👤</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>페르소나 없이 시작</div>
                  <div className="tiny muted">유저 자신으로 대화에 참여합니다</div>
                </div>
              </div>

              {/* Universe character candidates */}
              {personaCandidates.length > 0 && (
                <div className="vstack" style={{ gap: 6 }}>
                  <div className="tiny" style={{ fontWeight: 700, color: '#a78bfa' }}>이 세계관의 캐릭터로 참여:</div>
                  {personaCandidates.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setStartChat(s => s ? { ...s, personaCharId: c.id, newPersonaName: '' } : s)}
                      style={{
                        padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                        border: `1.5px solid ${startChat.personaCharId === c.id ? '#8b5cf6' : 'var(--chrome-border)'}`,
                        background: startChat.personaCharId === c.id ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                        display: 'flex', gap: 10, alignItems: 'center',
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                        {c.avatarUrl
                          ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <PixelAvatar kind="custom" size={28} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                        {c.gender && <div className="tiny muted">{c.gender}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create new persona */}
              <div>
                <div className="tiny" style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>또는 새 페르소나 만들기:</div>
                <input
                  className="field"
                  placeholder="페르소나 이름 입력"
                  value={startChat.newPersonaName}
                  onChange={e => setStartChat(s => s ? { ...s, newPersonaName: e.target.value, personaCharId: null } : s)}
                  style={{ fontSize: 12 }}
                />
              </div>

              {/* Action buttons */}
              <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                {openings && openings.length > 1 && (
                  <button className="btn ghost" onClick={() => setStartChat(s => s ? { ...s, step: 'opening' } : s)}>← 이전</button>
                )}
                <button className="btn ghost" onClick={() => setStartChat(null)}>취소</button>
                <button
                  className="btn primary"
                  style={{ background: '#7c3aed', borderColor: '#6d28d9' }}
                  disabled={startChat.creating}
                  onClick={handleStartChatConfirm}
                >{startChat.creating ? '생성 중...' : '💬 대화 시작'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {renderStartChatModal()}

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
              <input className="field" placeholder="세계관 이름을 입력하세요" value={newUniTitle} onChange={e => setNewUniTitle(e.target.value)} autoFocus />
            </div>
          }
          confirmLabel="생성"
          confirmVariant="primary"
          onConfirm={handleCreateUniverse}
          onCancel={() => { setShowCreateUni(false); setNewUniTitle('') }}
        />
      )}

      <Win title="🪐 WHIF 통합 센터 (WHIF Integration Center)" icon={PixelIcons.bot}>
        <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0 }}>

          {/* Import bar */}
          <div className="form-section" style={{ background: 'rgba(139,92,246,0.05)', borderColor: '#8b5cf6' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>🪐 WHIF 설정 가져오기 (Import WHIF Settings)</div>
            <div className="hstack" style={{ gap: 6 }}>
              <input
                className="field"
                style={{ flex: 1, borderColor: '#7c3aed' }}
                placeholder="https://whif.io/characters/972fb410-..."
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
              />
              <button
                className="btn primary"
                style={{ background: '#7c3aed', borderColor: '#6d28d9', flexShrink: 0 }}
                disabled={importing || !importUrl.trim()}
                onClick={handleImport}
              >{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            {error && <div className="tiny" style={{ color: '#ff6b8a', marginTop: 4 }}>⚠ {error}</div>}
            {success && <div className="tiny" style={{ color: '#4ade80', marginTop: 4 }}>✓ {success}</div>}
          </div>

          <div className="hstack" style={{ flex: 1, minHeight: 0, gap: 10 }}>

            {/* Left panel */}
            <div className="vstack" style={{ width: 220, gap: 8, flexShrink: 0 }}>
              <div className="hstack" style={{ gap: 4 }}>
                {(['universes', 'characters', 'chats'] as const).map(tab => (
                  <button
                    key={tab}
                    className={`btn ${activeTab === tab ? 'primary' : 'ghost'}`}
                    style={{ flex: 1, fontSize: 11, padding: '4px 0' }}
                    onClick={() => { setActiveTab(tab); if (tab !== 'characters') setSelectedCharId(null) }}
                  >
                    {tab === 'universes' ? '🪐 세계관' : tab === 'characters' ? '🎭 캐릭터' : '💬 채팅방'}
                  </button>
                ))}
              </div>

              {activeTab === 'universes' && (
                <div className="vstack" style={{ flex: 1, minHeight: 0, gap: 6 }}>
                  <button className="btn" style={{ fontSize: 11, padding: '4px 0', borderStyle: 'dashed' }} onClick={() => setShowCreateUni(true)}>+ 새 세계관 만들기</button>
                  <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
                    {loading ? (
                      <div className="tiny muted text-center" style={{ padding: 20 }}>로딩 중...</div>
                    ) : universes.length === 0 ? (
                      <div className="tiny muted text-center" style={{ padding: 20 }}>세계관이 없습니다.</div>
                    ) : universes.map(uni => (
                      <div
                        key={uni.id}
                        className={`row ${selectedUniId === uni.id ? 'selected' : ''}`}
                        style={{ cursor: 'pointer', padding: '6px 8px', marginBottom: 4, borderRadius: 3 }}
                        onClick={() => handleSelectUniverse(uni.id)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uni.title}</div>
                          <div className="tiny muted" style={{ fontSize: 9 }}>
                            {characters.filter(c => c.collection?.id === uni.id).length}명 소속
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'characters' && (
                <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
                  {loading ? (
                    <div className="tiny muted text-center" style={{ padding: 20 }}>로딩 중...</div>
                  ) : characters.length === 0 ? (
                    <div className="tiny muted text-center" style={{ padding: 20 }}>캐릭터가 없습니다.</div>
                  ) : characters.map(char => (
                    <div
                      key={char.id}
                      className={`row ${selectedCharId === char.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer', padding: '6px 8px', marginBottom: 4, borderRadius: 3 }}
                      onClick={() => handleSelectCharacter(char)}
                    >
                      <div className="thumb" style={{ width: 24, height: 24, flexShrink: 0 }}>
                        {char.avatarUrl ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <PixelAvatar kind="custom" size={24} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.name}</div>
                        <div className="tiny muted" style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {char.collection?.title ?? '단독 캐릭터'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'chats' && (
                <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
                  {loading ? (
                    <div className="tiny muted text-center" style={{ padding: 20 }}>로딩 중...</div>
                  ) : chats.length === 0 ? (
                    <div className="tiny muted text-center" style={{ padding: 20 }}>생성된 대화방이 없습니다.</div>
                  ) : chats.map(chat => {
                    const c = chat.characters[0]?.character
                    return (
                      <div
                        key={chat.id}
                        className="row"
                        style={{ cursor: 'pointer', padding: '6px 8px', marginBottom: 4, borderRadius: 3 }}
                        onClick={() => router.push(`/conversations/${chat.id}`)}
                      >
                        <div className="thumb" style={{ width: 24, height: 24, flexShrink: 0 }}>
                          {c?.avatarUrl ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <PixelAvatar kind="custom" size={24} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</div>
                          <div className="tiny muted" style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(chat.messages[0]?.content ?? '').replace(/\*[^*]+\*/g, '').replace(/\n/g, ' ')}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="scroll" style={{ flex: 1, minHeight: 0, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>

              {/* Characters tab: character detail */}
              {activeTab === 'characters' ? (
                selectedChar ? (
                  <div className="vstack" style={{ gap: 14 }}>
                    <div className="spread" style={{ borderBottom: '1px solid var(--chrome-border)', paddingBottom: 10, alignItems: 'flex-start' }}>
                      <div className="hstack" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                          {selectedChar.avatarUrl ? <img src={selectedChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <PixelAvatar kind="custom" size={40} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ margin: 0, fontSize: 15, color: '#c084fc' }}>{selectedChar.name}</h3>
                          <div className="tiny muted">{selectedChar.gender || '성별 미지정'} · {selectedChar.collection?.title ?? '단독 캐릭터'}</div>
                        </div>
                      </div>
                      <div className="hstack" style={{ gap: 4, flexShrink: 0 }}>
                        <button className="btn primary" style={{ fontSize: 10, padding: '3px 10px', background: '#8b5cf6', borderColor: '#7c3aed' }} onClick={() => openStartChat(selectedChar, null)}>💬 대화 시작</button>
                        <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${selectedChar.id}/edit?isWhif=true`)}>✏ 수정</button>
                        <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteCharId(selectedChar.id)}>✕</button>
                      </div>
                    </div>

                    {/* Multiple openings badge */}
                    {selectedChar.openingMessages && selectedChar.openingMessages.length > 1 && (
                      <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {selectedChar.openingMessages.map((op, idx) => (
                          <span key={op.id} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid #7c3aed', color: '#c084fc', fontSize: 10, padding: '2px 8px', borderRadius: 10 }}>
                            📖 {op.title}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedChar.tags?.length > 0 && (
                      <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {selectedChar.tags.map(t => <span key={t} style={{ background: 'var(--chrome-face)', border: '1px solid var(--chrome-border)', fontSize: 10, padding: '1px 8px', borderRadius: 10 }}>{t}</span>)}
                      </div>
                    )}

                    {selectedChar.additionalInfo?.trim() ? (
                      <div className="vstack" style={{ gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>📝 캐릭터 소개</div>
                        <p className="tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)', lineHeight: 1.6 }}>{selectedChar.additionalInfo}</p>
                      </div>
                    ) : <div className="tiny muted">등록된 소개 정보가 없습니다.</div>}

                    {selectedChar.collection ? (
                      <>
                        <div className="spread" style={{ alignItems: 'center', borderTop: '1px solid var(--chrome-border)', paddingTop: 10 }}>
                          <div className="tiny muted">소속 세계관: <b style={{ color: '#c084fc' }}>🪐 {selectedChar.collection.title}</b></div>
                          <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px', color: '#a78bfa' }} onClick={() => { setActiveTab('universes'); handleSelectUniverse(selectedChar.collection!.id) }}>세계관 열기 →</button>
                        </div>
                        {renderLorebookSection()}
                      </>
                    ) : (
                      <div className="tiny muted" style={{ borderTop: '1px solid var(--chrome-border)', paddingTop: 10 }}>
                        단독 캐릭터입니다. 수정 페이지에서 세계관을 지정하면 백과사전을 공유할 수 있습니다.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="vstack" style={{ height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)' }}>
                    <div style={{ fontSize: 40 }}>🎭</div>
                    <h3 style={{ marginTop: 12, marginBottom: 6, color: '#c084fc' }}>캐릭터를 선택하세요</h3>
                    <p className="tiny" style={{ maxWidth: 300, lineHeight: 1.4 }}>왼쪽 목록에서 캐릭터를 선택하면 소개·도입부·소속 세계관을 볼 수 있습니다.</p>
                  </div>
                )

              /* Universes / Chats tab: universe detail */
              ) : selectedUniverse ? (
                <div className="vstack" style={{ gap: 14 }}>
                  {/* Universe header */}
                  <div className="spread" style={{ borderBottom: '1px solid var(--chrome-border)', paddingBottom: 10 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, color: '#c084fc' }}>🪐 {selectedUniverse.title}</h3>
                      {selectedUniverse.sourceUrl && !selectedUniverse.sourceUrl.includes('/local/') && (
                        <a href={selectedUniverse.sourceUrl} target="_blank" rel="noreferrer" className="tiny" style={{ color: '#a78bfa', textDecoration: 'underline' }}>원본 출처 열기 ↗</a>
                      )}
                    </div>
                    <div className="hstack" style={{ gap: 4 }}>
                      <button
                        className="btn primary"
                        style={{ fontSize: 10, padding: '3px 10px', background: '#8b5cf6', borderColor: '#7c3aed' }}
                        onClick={() => openStartChat(null, selectedUniverse.id)}
                        title="소속 전체 캐릭터와 그룹 대화 (tikiTaka)"
                      >💬 세계관 전체 대화</button>
                      <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteUniId(selectedUniverse.id)}>✕ 삭제</button>
                    </div>
                  </div>

                  {/* Character cards */}
                  <div className="vstack" style={{ gap: 8 }}>
                    <div className="spread" style={{ alignItems: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>🎭 소속 캐릭터 ({selectedUniCharacters.length})</div>
                      <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => router.push(`/characters/new?isWhif=true&collectionId=${selectedUniverse.id}`)}>
                        + 직접 등록
                      </button>
                    </div>

                    {selectedUniCharacters.length === 0 ? (
                      <div className="tiny muted" style={{ padding: 10 }}>소속된 캐릭터가 없습니다. 직접 캐릭터를 추가해보세요.</div>
                    ) : (
                      <div className="vstack" style={{ gap: 8 }}>
                        {selectedUniCharacters.map(char => (
                          <div
                            key={char.id}
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid var(--chrome-border)',
                              borderRadius: 6, padding: '10px 12px',
                            }}
                          >
                            <div className="spread" style={{ alignItems: 'center' }}>
                              <div className="hstack" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                                  {char.avatarUrl ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <PixelAvatar kind="custom" size={36} />}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{char.name}</div>
                                  <div className="tiny muted">{char.gender || '성별 미지정'}</div>
                                </div>
                              </div>
                              <div className="hstack" style={{ gap: 4, flexShrink: 0 }}>
                                <button
                                  className="btn primary"
                                  style={{ fontSize: 10, padding: '3px 10px', background: '#8b5cf6', borderColor: '#7c3aed' }}
                                  onClick={() => openStartChat(char, selectedUniverse.id)}
                                >💬 1:1 대화</button>
                                <button className="btn ghost" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => router.push(`/characters/${char.id}/edit?isWhif=true`)} title="수정">✏</button>
                                <button className="btn danger" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => setConfirmDeleteCharId(char.id)} title="삭제">✕</button>
                              </div>
                            </div>

                            {/* Opening badges */}
                            {char.openingMessages && char.openingMessages.length > 1 && (
                              <div className="hstack" style={{ gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                                {char.openingMessages.map(op => (
                                  <span key={op.id} style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.4)', color: '#c084fc', fontSize: 9, padding: '1px 6px', borderRadius: 10 }}>
                                    📖 {op.title}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Short intro */}
                            {char.additionalInfo?.trim() && (
                              <p className="tiny" style={{
                                margin: '8px 0 0', color: 'var(--ink-soft)',
                                display: '-webkit-box', WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              }}>{char.additionalInfo}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lorebook */}
                  <div style={{ borderTop: '1px solid var(--chrome-border)', paddingTop: 10 }}>
                    {renderLorebookSection()}
                  </div>
                </div>
              ) : (
                <div className="vstack" style={{ height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)' }}>
                  <div style={{ fontSize: 40 }}>🪐</div>
                  <h3 style={{ marginTop: 12, marginBottom: 6, color: '#c084fc' }}>WHIF 통합 센터</h3>
                  <p className="tiny" style={{ maxWidth: 300, lineHeight: 1.4 }}>
                    세계관(Universe)과 캐릭터를 관리하고, 페르소나와 도입부를 선택해 바로 대화를 시작할 수 있습니다.
                  </p>
                  <p className="tiny muted" style={{ maxWidth: 300, marginTop: 8 }}>
                    왼쪽에서 세계관을 선택하거나, WHIF 캐릭터 URL로 가져오기를 시작하세요.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Win>
    </>
  )
}
