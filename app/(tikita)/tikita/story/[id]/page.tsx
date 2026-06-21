'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { useDisplayName } from '@/lib/useDisplayName'

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; tags: string[]; relatedImages?: string[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; tikitaMeta?: any
}

export default function TikitaStoryDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [existingConvs, setExistingConvs] = useState<any[]>([])
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const userName = useDisplayName()

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  useEffect(() => {
    const charId = col?.characters?.[0]?.id
    if (charId) {
      api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
    }
  }, [col])

  const handleCtaClick = () => {
    if (existingConvs.length > 0) setShowNewChatConfirm(true)
    else setPersonaOpen(true)
  }

  if (!col) return <div className="tikita-empty">불러오는 중...</div>

  const meta = col.tikitaMeta ?? {}
  const mainChar = col.characters[0]
  const tagline = meta.tagline ?? col.description ?? ''
  const opening = mainChar?.openingMessage ?? ''
  const illustrations: string[] = Array.isArray(mainChar?.relatedImages) ? mainChar.relatedImages : []
  // 잠금 이미지는 우리 쪽에서 원본을 볼 수 없어 블러만 노출돼 무의미하므로 화면에서 숨긴다.
  const gallery: { url: string; description?: string }[] =
    (Array.isArray(meta.gallery) ? meta.gallery : []).filter((g: any) => !g.locked)
  const creditLine = [meta.creatorNickname && `제작 ${meta.creatorNickname}`, meta.originalWorkTitle && `원작 《${meta.originalWorkTitle}》`]
    .filter(Boolean).join(' · ')

  // ── 검토용: 원본 전체 필드 노출 (1 title·2 tagline·5 first_message 제외). 배치 확정 후 제거 예정. ──
  const audit = meta.audit ?? {}
  const auditRows: { f: string; label: string; desc: string; value: any }[] = [
    { f: 'intro_html', label: '소개글', desc: '프로필 소개·배경(일러 포함)', value: audit.introHtmlText || col.description },
    { f: 'detail_md', label: '상태창 안내', desc: '명령어/상태창 출력 형식', value: audit.detailMd },
    { f: 'chat_starters', label: '추천 첫 대사', desc: '유저 시작 대사 후보', value: (meta.chatStarters || []).join('\n') },
    { f: 'categories', label: '분류', desc: '대분류', value: (meta.categories || []).join(', ') },
    { f: 'tags', label: '태그', desc: '세부 태그', value: (col.tags || []).join(', ') },
    { f: 'is_adult', label: '성인 여부', desc: '19금', value: meta.isAdult ? '성인' : '일반' },
    { f: 'creator_notes', label: '제작자 메모', desc: '크리에이터 노트', value: meta.creatorNotes },
    { f: 'creator_nickname', label: '제작자명', desc: '닉네임(제거 예정)', value: meta.creatorNickname },
    { f: 'original_work_title', label: '원작 제목', desc: '', value: meta.originalWorkTitle },
    { f: 'chat_image_mode', label: '배경 이미지 모드', desc: 'background 등', value: meta.chatImageMode },
    { f: 'is_cinema', label: '시네마 모드', desc: '', value: meta.isCinema ? '예' : '아니오' },
    { f: 'like_count', label: '좋아요 수', desc: '인기지표', value: audit.likeCount },
    { f: 'chat_count', label: '대화 수', desc: '인기지표', value: audit.chatCount },
    { f: 'monetization_mode', label: '수익화 모드', desc: '', value: audit.monetizationMode },
    { f: 'world', label: '세계관(world)', desc: '별도 세계관 필드', value: audit.world },
  ].filter(r => r.value != null && String(r.value).trim() !== '')
  const episodeTitles: string[] = (Array.isArray(meta.episodes) ? meta.episodes : [])
    .map((e: any, i: number) => `${i + 1}. ${e.title || ''}`)
  const charsMeta: any[] = Array.isArray(audit.charactersMeta) ? audit.charactersMeta : []

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newPersona) {
        const p = await api.post('/api/characters', {
          name: newPersona.name, gender: newPersona.gender, additionalInfo: newPersona.additionalInfo,
          collectionId: col.id,
        })
        personaId = p.id
      }
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'story',
        personaCharacterId: personaId,
        suggestRepliesEnabled: true,
        ...(col.description ? { scenarioDescription: col.description } : {}),
        ...(opening.trim() ? { openingMessage: opening } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
      {showEdit && (
        <CollectionEditModal
          collection={{ id: col.id, title: col.title, tags: col.tags ?? [], description: col.description ?? '', coverImageUrl: col.coverImageUrl ?? '' }}
          label="스토리"
          onClose={() => setShowEdit(false)}
          onSaved={u => setCol(prev => prev ? { ...prev, ...u } : prev)}
        />
      )}

      {showNewChatConfirm && (
        <ConfirmDialog
          message="이미 진행 중인 대화방이 있습니다. 새로운 대화방을 만드시겠습니까? (기존 대화방은 하단의 진행 중인 대화 목록에서 이어갈 수 있습니다.)"
          confirmLabel="새 대화 시작"
          confirmVariant="primary"
          onConfirm={() => { setShowNewChatConfirm(false); setPersonaOpen(true) }}
          onCancel={() => setShowNewChatConfirm(false)}
        />
      )}

      {personaOpen && (
        <WhifPersonaModal
          candidates={[]}
          loading={creating}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="tikita-scroll">
          <div className="tikita-cover-wrap">
            {col.coverImageUrl ? <img className="tikita-cover" src={col.coverImageUrl} alt="" /> : <div className="tikita-cover" />}
            <button className="tikita-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="tikita-section">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <img className="tikita-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="tikita-avatar" style={{ background: 'var(--t-line)' }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--t-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</h1>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="tikita-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--t-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setShowEdit(true)}>✏ 정보</button>
                    {mainChar && (
                      <button className="tikita-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--t-surface-2)', padding: '4px 8px', fontSize: 11 }}
                        onClick={() => router.push(`/characters/${mainChar.id}/edit?isTikita=true`)}>✏ 캐릭터</button>
                    )}
                  </div>
                </div>
                {meta.isAdult && <span className="tikita-chip" style={{ background: 'var(--t-accent)', color: '#fff' }}>성인</span>}
              </div>
            </div>
            {tagline && <p className="tikita-desc" style={{ marginBottom: 10 }}>{tagline}</p>}
            {creditLine && <p className="tikita-desc" style={{ marginBottom: 10, fontSize: 11, color: 'var(--t-ink-soft)' }}>{creditLine}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tikita-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {/* ── 검토용: 원본 전체 필드 (배치 확정 후 제거) ── */}
          <div className="tikita-section" style={{ paddingTop: 0 }}>
            <h2 className="tikita-section-title">📋 원본 필드 (검토용 · 배치 결정)</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditRows.map(r => (
                <div key={r.f} style={{ border: '1px solid var(--t-line)', borderRadius: 8, padding: '8px 10px', background: 'var(--t-surface)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)' }}>
                    {r.label} <span style={{ fontWeight: 400, color: 'var(--t-ink-soft)', fontSize: 10 }}>· {r.f}{r.desc ? ` · ${r.desc}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-ink)', marginTop: 3, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{String(r.value)}</div>
                </div>
              ))}
              {episodeTitles.length > 0 && (
                <div style={{ border: '1px solid var(--t-line)', borderRadius: 8, padding: '8px 10px', background: 'var(--t-surface)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)' }}>
                    에피소드 제목 <span style={{ fontWeight: 400, color: 'var(--t-ink-soft)', fontSize: 10 }}>· episodes · 챕터로 사용중(데이터 유지)</span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 3, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{episodeTitles.join('\n')}</div>
                </div>
              )}
              {charsMeta.length > 0 && (
                <div style={{ border: '1px solid var(--t-line)', borderRadius: 8, padding: '8px 10px', background: 'var(--t-surface)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)' }}>
                    캐릭터 메타 <span style={{ fontWeight: 400, color: 'var(--t-ink-soft)', fontSize: 10 }}>· characters · 나이/보이스/크롭</span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 3, whiteSpace: 'pre-wrap' }}>
                    {charsMeta.map((c: any) => `${c.name}(${c.gender || '-'}) · 나이 ${c.age ?? '-'} · 보이스 ${c.voiceUrl ? '있음' : '없음'} · 아바타크롭 ${c.avatarCrop ? '있음' : '없음'}`).join('\n')}
                  </div>
                </div>
              )}
            </div>
          </div>

          {illustrations.length > 0 && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">일러스트</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {illustrations.map((src, i) => (
                  <img key={i} src={src} alt="" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                ))}
              </div>
            </div>
          )}

          {gallery.length > 0 && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">이미지 갤러리 ({gallery.length})</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {gallery.map((g, i) => (
                  <div key={i} style={{ position: 'relative', aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', background: 'var(--t-surface-2)' }}>
                    <img src={g.url} alt={g.description ?? ''} loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {g.description && (
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '3px 5px', fontSize: 9, lineHeight: 1.3,
                        color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mainChar?.additionalInfo?.trim() && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">상세 설정</h2>
              <div className="tikita-intro-box">
                <NovelText text={replaceDisplayPlaceholders(mainChar.additionalInfo, userName, mainChar.name)} />
              </div>
            </div>
          )}

          {opening.trim() && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">첫 장면</h2>
              <div className="tikita-intro-box">
                <NovelText text={replaceDisplayPlaceholders(opening, userName, mainChar?.name ?? '')} />
              </div>
            </div>
          )}

          {existingConvs.length > 0 && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="tikita-card" style={{ cursor: 'pointer', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--t-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--t-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="tikita-cta">
          <button className="tikita-cta-btn" onClick={handleCtaClick} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
