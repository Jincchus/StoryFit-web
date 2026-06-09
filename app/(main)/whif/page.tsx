'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

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

export default function WhifCenterPage() {
  const router = useRouter()
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Lists
  const [universes, setUniverses] = useState<Universe[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [chats, setChats] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)

  // Selection
  const [selectedUniId, setSelectedUniId] = useState<string | null>(null)
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [loreLoading, setLoreLoading] = useState(false)

  // Modals & Inline forms
  const [showCreateUni, setShowCreateUni] = useState(false)
  const [newUniTitle, setNewUniTitle] = useState('')
  const [confirmDeleteUniId, setConfirmDeleteUniId] = useState<string | null>(null)
  const [confirmDeleteCharId, setConfirmDeleteCharId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'universes' | 'characters' | 'chats'>('universes')
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)

  // Lorebook Inline Form
  const [showAddLore, setShowAddLore] = useState(false)
  const [loreKeyword, setLoreKeyword] = useState('')
  const [loreContent, setLoreContent] = useState('')
  const [lorePriority, setLorePriority] = useState(0)
  const [editingLoreId, setEditingLoreId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

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
        // 세계관 선택 + 로어북까지 함께 로드 (단순 setSelectedUniId만 하면 로어북이 비어 보임)
        handleSelectUniverse(result.collectionId)
      }
    } catch (e: any) {
      setError(e.message ?? '가져오기 실패')
    } finally {
      setImporting(false)
    }
  }

  const handleCreateUniverse = async () => {
    if (!newUniTitle.trim()) return
    setError('')
    try {
      // Create with a virtual WHIF URL
      const virtualUrl = `https://whif.io/local/${Date.now()}`
      const created = await api.post('/api/collections', { title: newUniTitle.trim(), sourceUrl: virtualUrl })
      setUniverses(prev => [created, ...prev])
      setSelectedUniId(created.id)
      setShowCreateUni(false)
      setNewUniTitle('')
      setSuccess('세계관이 성공적으로 생성되었습니다.')
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleDeleteUniverse = async (id: string) => {
    try {
      await api.delete(`/api/collections/${id}`)
      setUniverses(prev => prev.filter(u => u.id !== id))
      if (selectedUniId === id) {
        setSelectedUniId(null)
        setLorebooks([])
      }
      setConfirmDeleteUniId(null)
      setSuccess('세계관과 소속 캐릭터가 모두 삭제되었습니다.')
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
      setSuccess('캐릭터가 삭제되었습니다.')
      
      const [unisData, charsData, chatsData] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
        api.get('/api/conversations?isWhif=true'),
      ])
      setUniverses(unisData)
      setCharacters(charsData)
      setChats(chatsData)

      if (selectedUniId) {
        const stillExists = unisData.some((u: any) => u.id === selectedUniId)
        if (!stillExists) {
          setSelectedUniId(null)
          setLorebooks([])
          setSuccess('마지막 캐릭터가 삭제되어 세계관도 함께 삭제되었습니다.')
        }
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
    } catch (e: any) {
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
      } catch (e) {
        setError('설정 카드를 불러오지 못했습니다.')
      } finally {
        setLoreLoading(false)
      }
    } else {
      setLorebooks([])
    }
  }

  // Lorebook actions
  const handleSaveLore = async () => {
    if (!loreKeyword.trim() || !loreContent.trim() || !selectedUniId) return
    setError('')
    const keywords = loreKeyword.split(',').map(k => k.trim()).filter(Boolean)
    try {
      if (editingLoreId) {
        // Edit existing lorebook
        const updated = await api.patch(`/api/lorebooks/${editingLoreId}`, {
          keyword: keywords,
          content: loreContent,
          priority: Number(lorePriority),
        })
        setLorebooks(prev => prev.map(lb => lb.id === editingLoreId ? updated : lb))
        setSuccess('설정 카드가 수정되었습니다.')
      } else {
        // Create new lorebook with collection scope
        const created = await api.post('/api/lorebooks', {
          scope: 'collection',
          scopeId: selectedUniId,
          keyword: keywords,
          content: loreContent,
          priority: Number(lorePriority),
        })
        setLorebooks(prev => [created, ...prev])
        setSuccess('설정 카드가 추가되었습니다.')
      }
      // Reset form
      setLoreKeyword('')
      setLoreContent('')
      setLorePriority(0)
      setShowAddLore(false)
      setEditingLoreId(null)
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

  // Start chat room with characters from universe
  const handleStartChatFromUniverse = async (uniId: string) => {
    const uni = universes.find(u => u.id === uniId)
    const uniChars = characters.filter(c => c.collection?.id === uniId)
    if (uniChars.length === 0) {
      setError('세계관 내에 대화할 캐릭터가 없습니다. 캐릭터를 추가해주세요.')
      return
    }
    setLoading(true)
    try {
      const response = await api.post('/api/conversations', {
        title: uni?.title || '세계관 대화',
        characterIds: uniChars.map(c => c.id),
        mode: uniChars.length > 1 ? 'tikiTaka' : 'roleplay', // Multiple characters start in TikiTaka by default
      })
      router.push(`/conversations/${response.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message)
      setLoading(false)
    }
  }

  // 단일 캐릭터로 1:1 대화방 생성
  const handleStartChatWithCharacter = async (char: Character) => {
    setLoading(true)
    setError('')
    try {
      const response = await api.post('/api/conversations', {
        title: char.name,
        characterIds: [char.id],
        mode: 'roleplay',
      })
      router.push(`/conversations/${response.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message)
      setLoading(false)
    }
  }

  const selectedUniverse = universes.find(u => u.id === selectedUniId)
  const selectedUniCharacters = characters.filter(c => c.collection?.id === selectedUniId)
  const selectedChar = characters.find(c => c.id === selectedCharId) ?? null

  // 로어북(설정 카드) 섹션 — 세계관/캐릭터 패널 양쪽에서 동일하게 사용.
  // <Component/> 대신 함수 호출로 인라인하여 매 렌더마다 remount되지 않게 해 입력 포커스를 보존한다.
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
            setLoreKeyword('')
            setLoreContent('')
            setLorePriority(0)
          }}
        >
          {showAddLore ? '닫기' : '+ 설정 카드 추가'}
        </button>
      </div>

      {showAddLore && (
        <div className="vstack" style={{ gap: 8, background: 'rgba(139, 92, 246, 0.05)', border: '1px solid #7c3aed', padding: 10, borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc' }}>
            {editingLoreId ? '설정 카드 수정' : '새 설정 카드 추가'}
          </div>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 2 }}>인식 키워드 (쉼표로 구분)</label>
            <input
              className="field"
              placeholder="예: 마왕성, 검은장미, 아스칼"
              value={loreKeyword}
              onChange={e => setLoreKeyword(e.target.value)}
              style={{ fontSize: 11 }}
            />
          </div>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 2 }}>설정 내용 (AI가 해당 키워드 감지 시 인지)</label>
            <textarea
              className="field"
              rows={3}
              placeholder="설정 카드의 구체적인 묘사나 백과사전적 사실을 적으세요."
              value={loreContent}
              onChange={e => setLoreContent(e.target.value)}
              style={{ fontSize: 11 }}
            />
          </div>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 2 }}>우선순위 (숫자가 높을수록 우선 적용)</label>
            <input
              className="field"
              type="number"
              placeholder="0"
              value={lorePriority}
              onChange={e => setLorePriority(Number(e.target.value))}
              style={{ fontSize: 11 }}
            />
          </div>
          <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setShowAddLore(false)}>취소</button>
            <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px', background: '#7c3aed', borderColor: '#6d28d9' }} onClick={handleSaveLore}>저장</button>
          </div>
        </div>
      )}

      {loreLoading ? (
        <div className="tiny muted text-center" style={{ padding: 20 }}>설정 카드를 불러오는 중...</div>
      ) : lorebooks.length === 0 ? (
        <div className="tiny muted text-center" style={{ padding: 20 }}>등록된 설정 카드가 없습니다.</div>
      ) : (
        <div className="vstack" style={{ gap: 6 }}>
          {lorebooks.map(lb => (
            <div
              key={lb.id}
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--chrome-border)', padding: 8, borderRadius: 4 }}
            >
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
              <p className="tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)' }}>
                {lb.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      {confirmDeleteUniId && (
        <ConfirmDialog
          message="이 세계관을 삭제할까요? 세계관과 소속 캐릭터, 설정 카드가 전부 삭제되며 복구할 수 없습니다."
          onConfirm={() => handleDeleteUniverse(confirmDeleteUniId)}
          onCancel={() => setConfirmDeleteUniId(null)}
        />
      )}

      {confirmDeleteCharId && (
        <ConfirmDialog
          message="이 캐릭터를 삭제할까요? 캐릭터와 관련된 모든 대화방 기록도 함께 정리됩니다."
          onConfirm={() => handleDeleteCharacter(confirmDeleteCharId)}
          onCancel={() => setConfirmDeleteCharId(null)}
        />
      )}

      {showCreateUni && (
        <ConfirmDialog
          message={
            <div className="vstack" style={{ gap: 10 }}>
              <div style={{ fontWeight: 700 }}>🪐 새 세계관(Universe) 만들기</div>
              <input
                className="field"
                placeholder="세계관 이름을 입력하세요"
                value={newUniTitle}
                onChange={e => setNewUniTitle(e.target.value)}
                autoFocus
              />
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
          
          {/* 가져오기 바 */}
          <div className="form-section" style={{ background: 'rgba(139, 92, 246, 0.05)', borderColor: '#8b5cf6' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>🪐 WHIF 설정 가져오기 (Import WHIF Settings)</div>
            <div className="hstack" style={{ gap: 6 }}>
              <input
                className="field"
                style={{ flex: 1, borderColor: '#7c3aed' }}
                placeholder="https://whif.io/characters/972fb410-..."
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
              />
              <button
                className="btn primary"
                style={{ background: '#7c3aed', borderColor: '#6d28d9', flexShrink: 0 }}
                disabled={importing || !importUrl.trim()}
                onClick={handleImport}
              >
                {importing ? '가져오는 중...' : '📥 가져오기'}
              </button>
            </div>
            {error && <div className="tiny" style={{ color: '#ff6b8a', marginTop: 4 }}>⚠ {error}</div>}
            {success && <div className="tiny" style={{ color: '#4ade80', marginTop: 4 }}>✓ {success}</div>}
          </div>

          <div className="hstack" style={{ flex: 1, minHeight: 0, gap: 10 }}>
            {/* 좌측 패널: 세계관 및 채팅 목록 */}
            <div className="vstack" style={{ width: 220, gap: 8, flexShrink: 0 }}>
              <div className="hstack" style={{ gap: 4 }}>
                <button
                  className={`btn ${activeTab === 'universes' ? 'primary' : 'ghost'}`}
                  style={{ flex: 1, fontSize: 11, padding: '4px 0' }}
                  onClick={() => { setActiveTab('universes'); setSelectedCharId(null) }}
                >🪐 세계관</button>
                <button
                  className={`btn ${activeTab === 'characters' ? 'primary' : 'ghost'}`}
                  style={{ flex: 1, fontSize: 11, padding: '4px 0' }}
                  onClick={() => setActiveTab('characters')}
                >🎭 캐릭터</button>
                <button
                  className={`btn ${activeTab === 'chats' ? 'primary' : 'ghost'}`}
                  style={{ flex: 1, fontSize: 11, padding: '4px 0' }}
                  onClick={() => { setActiveTab('chats'); setSelectedCharId(null) }}
                >💬 채팅방</button>
              </div>

              {activeTab === 'universes' && (
                <div className="vstack" style={{ flex: 1, minHeight: 0, gap: 6 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: '4px 0', borderStyle: 'dashed' }}
                    onClick={() => setShowCreateUni(true)}
                  >+ 새 세계관 만들기</button>
                  
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
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        ) : (
                          <PixelAvatar kind="custom" size={24} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.name}</div>
                        <div className="tiny muted" style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {char.collection?.title ?? '미분류 세계관'}
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
                    const char = chat.characters[0]?.character
                    const lastLine = chat.messages[0]?.content ?? '대화 없음'
                    return (
                      <div
                        key={chat.id}
                        className="row"
                        style={{ cursor: 'pointer', padding: '6px 8px', marginBottom: 4, borderRadius: 3 }}
                        onClick={() => router.push(`/conversations/${chat.id}`)}
                      >
                        <div className="thumb" style={{ width: 24, height: 24, flexShrink: 0 }}>
                          {char?.avatarUrl ? (
                            <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          ) : (
                            <PixelAvatar kind="custom" size={24} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</div>
                          <div className="tiny muted" style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lastLine.replace(/\*[^*]+\*/g, '').replace(/\n/g, ' ')}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 우측 패널: 상세 설정 및 캐릭터/설정 카드 관리 */}
            <div className="scroll" style={{ flex: 1, minHeight: 0, background: 'rgba(0, 0, 0, 0.2)', padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
              {activeTab === 'characters' ? (
                /* ── 캐릭터 탭: 선택된 캐릭터 상세 + 소속 세계관 로어북 열람 ── */
                selectedChar ? (
                  <div className="vstack" style={{ gap: 14 }}>
                    {/* 캐릭터 헤더 */}
                    <div className="spread" style={{ borderBottom: '1px solid var(--chrome-border)', paddingBottom: 8, alignItems: 'flex-start' }}>
                      <div className="hstack" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0 }}>
                          {selectedChar.avatarUrl ? (
                            <img src={selectedChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          ) : (
                            <PixelAvatar kind="custom" size={36} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ margin: 0, fontSize: 15, color: '#c084fc' }}>{selectedChar.name}</h3>
                          <div className="tiny muted">
                            {selectedChar.gender || '성별 미지정'} · {selectedChar.collection?.title ?? '단독 캐릭터'}
                          </div>
                        </div>
                      </div>
                      <div className="hstack" style={{ gap: 4, flexShrink: 0 }}>
                        <button className="btn primary" style={{ fontSize: 10, padding: '3px 8px', background: '#8b5cf6', borderColor: '#7c3aed' }} onClick={() => handleStartChatWithCharacter(selectedChar)}>💬 1:1 대화</button>
                        <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${selectedChar.id}/edit?isWhif=true`)}>✏ 수정</button>
                        <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteCharId(selectedChar.id)}>✕ 삭제</button>
                      </div>
                    </div>

                    {/* 태그 */}
                    {selectedChar.tags && selectedChar.tags.length > 0 && (
                      <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {selectedChar.tags.map(t => (
                          <span key={t} style={{ background: 'var(--chrome-face)', border: '1px solid var(--chrome-border)', fontSize: 10, padding: '1px 8px', borderRadius: 10 }}>{t}</span>
                        ))}
                      </div>
                    )}

                    {/* 소개 */}
                    {selectedChar.additionalInfo?.trim() ? (
                      <div className="vstack" style={{ gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>📝 캐릭터 소개</div>
                        <p className="tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)', lineHeight: 1.6 }}>{selectedChar.additionalInfo}</p>
                      </div>
                    ) : (
                      <div className="tiny muted">등록된 소개 정보가 없습니다.</div>
                    )}

                    {/* 소속 세계관 + 그 세계관의 로어북 열람 */}
                    {selectedChar.collection ? (
                      <>
                        <div className="spread" style={{ alignItems: 'center', borderTop: '1px solid var(--chrome-border)', paddingTop: 10 }}>
                          <div className="tiny muted">소속 세계관: <b style={{ color: '#c084fc' }}>🪐 {selectedChar.collection.title}</b></div>
                          <button
                            className="btn ghost"
                            style={{ fontSize: 10, padding: '2px 8px', color: '#a78bfa' }}
                            onClick={() => { const cid = selectedChar.collection!.id; setActiveTab('universes'); handleSelectUniverse(cid) }}
                          >세계관 열기 →</button>
                        </div>
                        {renderLorebookSection()}
                      </>
                    ) : (
                      <div className="tiny muted" style={{ borderTop: '1px solid var(--chrome-border)', paddingTop: 10 }}>
                        단독 캐릭터입니다 (소속 세계관 없음). 수정 페이지에서 세계관을 지정하면 백과사전(로어북)을 공유할 수 있습니다.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="vstack" style={{ height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)' }}>
                    <div style={{ fontSize: 40 }}>🎭</div>
                    <h3 style={{ marginTop: 12, marginBottom: 6, color: '#c084fc' }}>캐릭터를 선택하세요</h3>
                    <p className="tiny" style={{ maxWidth: 300, lineHeight: 1.4 }}>
                      왼쪽 목록에서 캐릭터를 선택하면 소개·태그·소속 세계관과 그 세계관의 백과사전(로어북)을 볼 수 있습니다.
                    </p>
                  </div>
                )
              ) : selectedUniverse ? (
                /* ── 세계관/채팅방 탭: 선택된 세계관 상세 (소속 캐릭터 + 로어북 관리) ── */
                <div className="vstack" style={{ gap: 14 }}>
                  {/* 세계관 상단 타이틀 및 조작 */}
                  <div className="spread" style={{ borderBottom: '1px solid var(--chrome-border)', paddingBottom: 8 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, color: '#c084fc' }}>🪐 {selectedUniverse.title}</h3>
                      {selectedUniverse.sourceUrl && (
                        <a href={selectedUniverse.sourceUrl} target="_blank" rel="noreferrer" className="tiny" style={{ color: '#a78bfa', textDecoration: 'underline' }}>
                          원본 출처 열기 ↗
                        </a>
                      )}
                    </div>
                    <div className="hstack" style={{ gap: 4 }}>
                      <button className="btn primary" style={{ fontSize: 10, padding: '3px 8px', background: '#8b5cf6', borderColor: '#7c3aed' }} onClick={() => handleStartChatFromUniverse(selectedUniverse.id)}>💬 대화 시작</button>
                      <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteUniId(selectedUniverse.id)}>✕ 삭제</button>
                    </div>
                  </div>

                  {/* 소속 캐릭터 목록 */}
                  <div className="vstack" style={{ gap: 6 }}>
                    <div className="spread" style={{ alignItems: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>🎭 소속 캐릭터 ({selectedUniCharacters.length})</div>
                      <button
                        className="btn"
                        style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => router.push(`/characters/new?isWhif=true&collectionId=${selectedUniverse.id}`)}
                      >
                        + 직접 캐릭터 등록
                      </button>
                    </div>

                    <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                      {selectedUniCharacters.length === 0 ? (
                        <div className="tiny muted" style={{ padding: 10 }}>소속된 캐릭터가 없습니다. 직접 캐릭터를 추가해보세요.</div>
                      ) : selectedUniCharacters.map(char => (
                        <div
                          key={char.id}
                          className="hstack"
                          style={{ background: 'var(--chrome-face)', border: '1px solid var(--chrome-border)', padding: '4px 8px', borderRadius: 4, alignItems: 'center', gap: 6 }}
                        >
                          <div style={{ width: 20, height: 20, borderRadius: 3, overflow: 'hidden' }}>
                            {char.avatarUrl ? (
                              <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            ) : (
                              <PixelAvatar kind="custom" size={20} />
                            )}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{char.name}</span>
                          <div className="hstack" style={{ gap: 2 }}>
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: '0 4px', fontSize: 9, minHeight: 'auto', border: 'none', color: '#a78bfa' }}
                              onClick={() => router.push(`/characters/${char.id}/edit?isWhif=true`)}
                              title="수정"
                            >✏</button>
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: '0 4px', fontSize: 9, minHeight: 'auto', border: 'none', color: '#ff6b8a' }}
                              onClick={() => setConfirmDeleteCharId(char.id)}
                              title="삭제"
                            >✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 세계관 백과사전(로어북) 관리 */}
                  <div style={{ borderTop: '1px solid var(--chrome-border)', paddingTop: 10 }}>
                    {renderLorebookSection()}
                  </div>
                </div>
              ) : (
                <div className="vstack" style={{ height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)' }}>
                  <div style={{ fontSize: 40 }}>🪐</div>
                  <h3 style={{ marginTop: 12, marginBottom: 6, color: '#c084fc' }}>WHIF 전용 대화 & 세계관 관리 센터</h3>
                  <p className="tiny" style={{ maxWidth: 300, lineHeight: 1.4 }}>
                    WHIF에서 가져오거나 직접 설계한 세계관(Universe), 캐릭터, 그리고 대화방을 안전하게 격리하여 모아볼 수 있는 전용 컨트롤 센터입니다.
                  </p>
                  <p className="tiny muted" style={{ maxWidth: 300, marginTop: 8 }}>
                    왼쪽 목록에서 세계관을 선택하거나, 가져올 WHIF 캐릭터의 주소를 입력하여 시작해 보세요.
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
