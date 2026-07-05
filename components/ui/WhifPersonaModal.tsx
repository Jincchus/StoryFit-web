'use client'
import { useState } from 'react'

const GENDER_LABEL: Record<string, string> = {
  GENDER_MALE: '남성',
  GENDER_FEMALE: '여성',
  GENDER_UNKNOWN: '기타',
  남성: '남성', 여성: '여성', 기타: '기타',
}

const RANDOM_SETTINGS = [
  '호기심이 많고 솔직한 성격. 새로운 것에 쉽게 흥미를 느낀다.',
  '차분하고 관찰력이 뛰어남. 말이 적지만 마음을 열면 깊이 있다.',
  '밝고 에너지 넘치는 성격. 분위기 메이커지만 속으로는 섬세하다.',
  '독립적이고 자기 주관이 뚜렷함. 남에게 의존하는 걸 싫어한다.',
  '감수성이 풍부하고 공감 능력이 높다. 타인의 감정에 민감하게 반응한다.',
  '겉은 냉정해 보이지만 속은 따뜻하다. 좋아하는 사람에게 서툴게 다가간다.',
]

const RELATIONSHIP_TAGS = ['신뢰', '통제', '미련', '복종', '애정', '집착']
const MAX_RELATIONSHIP_TAGS = 2
const GENDERS = ['여성', '남성', '기타']

export interface NewPersonaData {
  name: string
  gender: string
  additionalInfo: string
}

interface Candidate {
  id: string
  name: string
  gender: string
  avatarUrl: string | null
  additionalInfo?: string
}

interface Props {
  candidates: Candidate[]
  loading?: boolean
  defaultName?: string
  defaultSettings?: string
  defaultFlip?: boolean
  onCancel: () => void
  onSelect: (personaCharId: string | null, newPersona: NewPersonaData | undefined, flipPlaceholders: boolean) => void
}

export default function WhifPersonaModal({ candidates, loading, defaultName, defaultSettings, defaultFlip, onCancel, onSelect }: Props) {
  const [tab, setTab] = useState<'new' | 'existing'>(candidates.length > 0 ? 'existing' : 'new')
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null)
  const [name, setName] = useState(defaultName ?? '')
  const [gender, setGender] = useState('여성')
  const [settings, setSettings] = useState(defaultSettings ?? '')
  const [relationships, setRelationships] = useState<string[]>([])
  const [flip, setFlip] = useState(defaultFlip ?? false)

  const toggleRelationship = (r: string) => {
    setRelationships(prev =>
      prev.includes(r) ? prev.filter(x => x !== r)
        : prev.length < MAX_RELATIONSHIP_TAGS ? [...prev, r] : prev
    )
  }

  const handleStart = () => {
    if (tab === 'existing' && selectedId) {
      onSelect(selectedId, undefined, flip)
    } else {
      const additionalInfo = [
        settings.trim() && `성격/설정: ${settings.trim()}`,
        relationships.length > 0 && `관계: ${relationships.join(', ')}`,
      ].filter(Boolean).join('\n')
      onSelect(null, { name: name.trim() || '유저', gender, additionalInfo }, flip)
    }
  }

  const chip = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? 'var(--w-accent)' : 'var(--w-surface-2)',
    color: active ? '#fff' : 'var(--w-ink-soft)',
    transition: 'background 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{
        background: 'var(--w-surface)', borderTop: '1px solid var(--w-line)',
        borderRadius: '16px 16px 0 0', padding: '20px 20px 32px',
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--w-ink)' }}>채팅 시작</span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--w-ink-soft)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {candidates.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <button style={chip(tab === 'existing')} onClick={() => setTab('existing')}>기존 캐릭터</button>
            <button style={chip(tab === 'new')} onClick={() => setTab('new')}>새 페르소나</button>
          </div>
        )}

        {tab === 'existing' && candidates.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {candidates.map(c => (
              <div key={c.id} onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'flex', gap: 12, alignItems: 'center',
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  border: `1.5px solid ${selectedId === c.id ? 'var(--w-accent)' : 'var(--w-line)'}`,
                  background: selectedId === c.id ? 'rgba(139,92,246,0.15)' : 'var(--w-surface-2)',
                }}>
                {c.avatarUrl
                  ? <img src={c.avatarUrl} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="" />
                  : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--w-line)', flexShrink: 0 }} />}
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--w-ink)', fontSize: 14 }}>{c.name}</div>
                  <div style={{ color: 'var(--w-ink-soft)', fontSize: 12 }}>{GENDER_LABEL[c.gender] ?? c.gender}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--w-ink-soft)', marginBottom: 6 }}>이름</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="페르소나 이름"
                style={{
                  width: '100%', background: 'var(--w-surface-2)', border: '1px solid var(--w-line)',
                  borderRadius: 8, padding: '10px 12px', color: 'var(--w-ink)', fontSize: 14, boxSizing: 'border-box',
                }} />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--w-ink-soft)', marginBottom: 6 }}>성별</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {GENDERS.map(g => (
                  <button key={g} style={chip(gender === g)} onClick={() => setGender(g)}>{g}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--w-ink-soft)' }}>성격·설정</span>
                <button onClick={() => setSettings(RANDOM_SETTINGS[Math.floor(Math.random() * RANDOM_SETTINGS.length)])}
                  style={{ background: 'var(--w-surface-2)', border: '1px solid var(--w-line)', borderRadius: 6,
                    padding: '3px 10px', color: 'var(--w-ink-soft)', fontSize: 11, cursor: 'pointer' }}>
                  🎲 랜덤
                </button>
              </div>
              <textarea value={settings} onChange={e => setSettings(e.target.value)}
                placeholder="페르소나의 성격이나 설정을 입력하세요 (선택)"
                rows={3}
                style={{
                  width: '100%', background: 'var(--w-surface-2)', border: '1px solid var(--w-line)',
                  borderRadius: 8, padding: '10px 12px', color: 'var(--w-ink)', fontSize: 13,
                  resize: 'none', boxSizing: 'border-box', lineHeight: 1.5,
                }} />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--w-ink-soft)', marginBottom: 6 }}>관계 (최대 {MAX_RELATIONSHIP_TAGS}개)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RELATIONSHIP_TAGS.map(r => (
                  <button key={r} style={chip(relationships.includes(r))} onClick={() => toggleRelationship(r)}>{r}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--w-ink-soft)', cursor: 'pointer', marginTop: 10 }}>
          <input type="checkbox" checked={flip} onChange={e => setFlip(e.target.checked)} />
          페르소나 카드의 설정을 페르소나 기준으로 치환 ({'{{char}}'}→페르소나, {'{{user}}'}→캐릭터)
        </label>

        <button onClick={handleStart} disabled={loading}
          style={{
            marginTop: 20, width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            background: 'var(--w-accent)', color: '#fff', fontSize: 15, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>
          {loading ? '생성 중...' : '채팅 시작'}
        </button>
      </div>
    </div>
  )
}
