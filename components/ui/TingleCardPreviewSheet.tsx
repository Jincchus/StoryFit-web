'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { useDisplayName } from '@/lib/useDisplayName'
import NovelText from '@/components/ui/NovelText'
import { getOpenings } from '@/lib/openings'

interface TingleField { key: string; label: string; value: string; order: number }

interface CollectionDetail {
  id: string
  title: string
  coverImageUrl: string
  tags: string[]
  tingleMeta?: { type: string; fields: TingleField[]; openings: any[] }
  characters: {
    id: string; name: string; avatarUrl: string | null
    additionalInfo: string; openingMessage: string; openingMessages?: any[]
    exampleDialogues?: string
  }[]
}

interface Props {
  collectionId: string
  label: string        // "서사" | "테마" | "캐릭터"
  accentColor: string  // "#a78bfa" | "#06bfd6" | "#ff5776"
  onConfirm: () => void
  onClose: () => void
}

export default function TingleCardPreviewSheet({ collectionId, label, accentColor, onConfirm, onClose }: Props) {
  const [col, setCol] = useState<CollectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [openingIdx, setOpeningIdx] = useState(0)
  const userName = useDisplayName()

  useEffect(() => {
    setLoading(true)
    setCol(null)
    setOpeningIdx(0)
    api.get(`/api/collections/${collectionId}`)
      .then(setCol)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [collectionId])

  const mainChar = col?.characters[0] ?? null
  const charNames = col?.characters.map(c => c.name) ?? []
  const openings = getOpenings(mainChar)
  const fields: TingleField[] = col?.tingleMeta?.fields ?? []

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--tg-bg)', borderRadius: '16px 16px 0 0' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', flexShrink: 0, borderBottom: '1px solid var(--tg-line)' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: accentColor }}>{label} 미리보기</span>
          <button onClick={onClose} style={{ appearance: 'none', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--tg-ink-soft)' }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--tg-ink-soft)' }}>불러오는 중...</div>
          )}
          {!loading && col && (
            <>
              {/* 커버 */}
              {col.coverImageUrl && (
                <img src={col.coverImageUrl} alt="" style={{ width: '100%', height: 180, objectFit: 'cover' }} />
              )}

              {/* 제목 + 태그 */}
              <div className="tingle-section">
                <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: 'var(--tg-ink)' }}>{col.title}</h1>
                <div style={{ fontSize: 11, color: accentColor, fontWeight: 700, marginBottom: 8 }}>{label}</div>
                {col.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {col.tags.map(t => <span key={t} className="tingle-chip">#{t}</span>)}
                  </div>
                )}
              </div>

              {/* 필드별 섹션 (tingleMeta) */}
              {fields.length > 0 ? fields.map(f => f.value?.trim() ? (
                <div key={f.key} className="tingle-section" style={{ paddingTop: 0 }}>
                  <h2 className="tingle-section-title">{f.label}</h2>
                  <div className="tingle-intro-box">
                    <div className="tingle-desc" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {replaceDisplayPlaceholders(f.value, userName, charNames)}
                    </div>
                  </div>
                </div>
              ) : null) : mainChar?.additionalInfo?.trim() ? (
                <div className="tingle-section" style={{ paddingTop: 0 }}>
                  <h2 className="tingle-section-title">설정</h2>
                  <div className="tingle-intro-box">
                    <div className="tingle-desc" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {replaceDisplayPlaceholders(mainChar.additionalInfo, userName, charNames)}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 도입부 (캐릭터만) */}
              {openings.length > 0 && (
                <div className="tingle-section" style={{ paddingTop: 0 }}>
                  <h2 className="tingle-section-title">도입부</h2>
                  {openings.length > 1 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                      {openings.map((op, i) => (
                        <button key={op.id}
                          onClick={() => setOpeningIdx(i)}
                          style={{ appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 600,
                            background: i === openingIdx ? 'var(--tg-accent)' : 'var(--tg-surface-2)',
                            color: i === openingIdx ? '#fff' : 'var(--tg-ink-soft)' }}>
                          {op.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="tingle-intro-box">
                    <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', userName, charNames)} />
                  </div>
                </div>
              )}

              <div style={{ height: 80 }} />
            </>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ padding: '12px 16px', flexShrink: 0, borderTop: '1px solid var(--tg-line)', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, appearance: 'none', border: '1.5px solid var(--tg-line)', background: 'var(--tg-surface)', color: 'var(--tg-ink-soft)', borderRadius: 12, padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            취소
          </button>
          <button onClick={() => { onConfirm(); onClose() }} disabled={!col} style={{ flex: 2, appearance: 'none', border: 'none', background: accentColor, color: '#fff', borderRadius: 12, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            이 {label}로 선택
          </button>
        </div>
      </div>
    </div>
  )
}
