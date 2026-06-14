'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PixelAvatar from '@/components/ui/PixelAvatar'
import { replaceDisplayPlaceholders } from '@/lib/josa'

export interface CharacterCardData {
  id: string
  name: string
  gender?: string
  avatarUrl?: string
  kind?: string
  tags: string[]
  additionalInfo: string
  exampleDialogues: string
  openingMessage?: string
  isPreset: boolean
}

interface CharacterCardModalProps {
  character: CharacterCardData
  onClose: () => void
  personaName?: string
}

export default function CharacterCardModal({ character, onClose, personaName }: CharacterCardModalProps) {
  const router = useRouter()
  const [showDialogues, setShowDialogues] = useState(false)
  const display = (text: string) => replaceDisplayPlaceholders(text, personaName ?? '나', character.name)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--chrome-face)', border: '1px solid #7c3aed',
        borderRadius: 10, padding: 24, width: '100%', maxWidth: 440,
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div className="spread" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
          <div className="hstack" style={{ gap: 12, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              {character.avatarUrl
                ? <img src={character.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : <PixelAvatar kind={character.kind as any} size={48} />}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{character.name}</div>
              {character.gender && <div className="tiny muted">{character.gender}</div>}
            </div>
          </div>
          <button className="btn ghost" style={{ fontSize: 12, padding: '2px 8px', flexShrink: 0 }} onClick={onClose}>✕</button>
        </div>

        {character.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {character.tags.map(t => (
              <span key={t} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 20, background: 'var(--lavender)', border: '1px solid var(--chrome-border)' }}>
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="vstack" style={{ gap: 4, marginBottom: 12 }}>
          <div className="label">세부 설정</div>
          <div className="tiny" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {character.additionalInfo ? display(character.additionalInfo) : <span className="muted">설정 없음</span>}
          </div>
        </div>

        {character.openingMessage && (
          <div className="vstack" style={{ gap: 4, marginBottom: 12 }}>
            <div className="label">시작 메시지</div>
            <div className="tiny" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{display(character.openingMessage)}</div>
          </div>
        )}

        {character.exampleDialogues && (
          <div className="vstack" style={{ gap: 4, marginBottom: 12 }}>
            <div className="spread" style={{ alignItems: 'center' }}>
              <div className="label" style={{ marginBottom: 0 }}>예시 대화</div>
              <button type="button" className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowDialogues(s => !s)}>
                {showDialogues ? '접기' : '펼치기'}
              </button>
            </div>
            {showDialogues && (
              <div className="tiny" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{display(character.exampleDialogues)}</div>
            )}
          </div>
        )}

        <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn ghost" onClick={onClose}>닫기</button>
          {!character.isPreset && (
            <button
              className="btn primary"
              style={{ background: '#7c3aed', borderColor: '#6d28d9' }}
              onClick={() => router.push(`/characters/${character.id}/edit`)}
            >✏ 수정</button>
          )}
        </div>
      </div>
    </div>
  )
}
