'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { RANDOM_NAMES } from '@/lib/constants'
import AvatarPicker from '@/components/ui/AvatarPicker'
import Toast from '@/components/ui/Toast'

export interface CharFormData {
  name: string
  title: string
  gender: string
  description: string
  systemPrompt: string
  exampleDialogues: string
  avatarUrl: string
}

interface CharacterFormProps {
  form: CharFormData
  onChange: <K extends keyof CharFormData>(key: K, val: CharFormData[K]) => void
  onDraftPrompt: () => Promise<void>
  drafting: boolean
  toast: string
  onToastDone: () => void
}

type NameEntry = { name: string; category: string; gender: string }

export default function CharacterForm({ form, onChange, onDraftPrompt, drafting, toast, onToastDone }: CharacterFormProps) {
  const [namePool, setNamePool] = useState<NameEntry[]>([])
  const [nameCat, setNameCat] = useState<'all' | 'korean' | 'western'>('all')

  useEffect(() => {
    fetch('/api/names').then(r => r.json()).then(setNamePool).catch(() => {})
  }, [])

  const rollName = () => {
    const pool = nameCat === 'all' ? namePool : namePool.filter(n => n.category === nameCat)
    if (pool.length > 0) {
      const picked = pool[Math.floor(Math.random() * pool.length)]
      onChange('name', picked.name)
      if (picked.gender) onChange('gender', picked.gender)
    } else {
      onChange('name', RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)])
    }
  }

  return (
    <>
      {toast && <Toast message={toast} onDone={onToastDone} />}
      <div className="vstack" style={{ gap: 12 }}>
        <div className="form-section">
          <div className="form-section-title">기본 정보</div>
          <div className="form-grid">
            <div>
              <label className="label">이름 *</label>
              <div className="hstack" style={{ gap: 5 }}>
                <input
                  className="field"
                  style={{ flex: 1 }}
                  placeholder="캐릭터 이름"
                  value={form.name}
                  onChange={e => onChange('name', e.target.value)}
                />
                {(['all', 'korean', 'western'] as const).map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`btn ${nameCat === c ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 9, padding: '3px 5px', flexShrink: 0 }}
                    onClick={() => setNameCat(c)}
                  >
                    {c === 'all' ? '전체' : c === 'korean' ? '한국' : '서양'}
                  </button>
                ))}
                <button type="button" className="btn ghost" style={{ fontSize: 10, padding: '4px 8px', flexShrink: 0 }} onClick={rollName}>
                  🎲
                </button>
              </div>
            </div>
            <div>
              <label className="label">한 줄 설명 (직함)</label>
              <input className="field" placeholder="예: 별빛 마법사, 저택의 메이드" value={form.title} onChange={e => onChange('title', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">성별</label>
            <div className="hstack" style={{ gap: 10 }}>
              {['', '남성', '여성', '기타'].map(g => (
                <label key={g} className="hstack" style={{ gap: 4, cursor: 'pointer', fontSize: 11 }}>
                  <input type="radio" name="char-gender" value={g} checked={form.gender === g} onChange={() => onChange('gender', g)} />
                  {g || '미설정'}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">캐릭터 설명</label>
            <textarea className="field" rows={2} placeholder="외모, 성격, 배경을 간략하게 적어주세요" value={form.description} onChange={e => onChange('description', e.target.value)} />
          </div>
          <div>
            <label className="label">아바타 이미지</label>
            <AvatarPicker value={form.avatarUrl} onChange={url => onChange('avatarUrl', url)} />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">AI 지시 설정</div>
          <div>
            <div className="spread" style={{ alignItems: 'center', marginBottom: 4 }}>
              <label className="label" style={{ margin: 0 }}>
                시스템 프롬프트 * <span className="tiny muted">(AI에게 전달되는 캐릭터 지시문)</span>
              </label>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}
                disabled={!form.name.trim() || drafting}
                onClick={onDraftPrompt}
              >
                {drafting ? '생성 중...' : '✨ 자동 초안'}
              </button>
            </div>
            <textarea
              className="field"
              rows={4}
              placeholder={drafting ? '✨ 초안 생성 중...' : '당신은 [이름]입니다. [성격, 말투, 행동 규칙 등을 구체적으로 서술하세요]'}
              value={form.systemPrompt}
              onChange={e => onChange('systemPrompt', e.target.value)}
              disabled={drafting}
              style={drafting ? { opacity: 0.5, cursor: 'wait' } : undefined}
            />
          </div>
          <div>
            <label className="label">예시 대화 <span className="tiny muted">(2~3개 few-shot, 말투 고정용)</span></label>
            <textarea
              className="field"
              rows={4}
              placeholder={"유저: 안녕?\n[이름]: *수줍게 웃으며* \"오랜만이야.\""}
              value={form.exampleDialogues}
              onChange={e => onChange('exampleDialogues', e.target.value)}
            />
          </div>
        </div>
      </div>
    </>
  )
}
