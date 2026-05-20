'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { DEFAULT_TAGS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import type { SafetyLevel, AIProvider, AvatarKind } from '@/types'

interface CharForm {
  name: string; title: string; description: string
  systemPrompt: string; scenarioDescription: string
  firstMessage: string; exampleDialogues: string
  avatarUrl: string; tags: string[]
  safetyLevel: SafetyLevel; defaultAI: AIProvider
  temperature: number; frequencyPenalty: number; presencePenalty: number
}

export default function CharacterNewPage() {
  const router = useRouter()
  const { dispatch } = useApp()
  const [form, setForm] = useState<CharForm>({
    name: '', title: '', description: '',
    systemPrompt: '', scenarioDescription: '',
    firstMessage: '', exampleDialogues: '',
    avatarUrl: '', tags: [],
    safetyLevel: 'standard', defaultAI: 'gemini',
    temperature: 0.9, frequencyPenalty: 0.3, presencePenalty: 0.3,
  })
  const [tagInput, setTagInput] = useState('')

  const set = <K extends keyof CharForm>(key: K, val: CharForm[K]) => setForm(f => ({ ...f, [key]: val }))

  const toggleTag = (tag: string) => setForm(f => ({
    ...f,
    tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
  }))

  const addCustomTag = () => {
    const t = tagInput.trim()
    if (!t || form.tags.includes(t)) return
    setForm(f => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
  }

  const handleSubmit = () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return
    dispatch({
      type: 'addCharacter',
      character: {
        ...form, id: 'custom-' + Date.now(),
        kind: 'custom' as AvatarKind,
        alternateGreetings: [], isPreset: false,
      },
    })
    router.push('/characters')
  }

  return (
    <Win title="캐릭터 만들기 (Create Character)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>커스텀 캐릭터</div>
            <div className="tiny muted">나만의 AI 캐릭터를 만들어보세요</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 6, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => router.back()}>← 취소</button>
            <button
              className="btn primary"
              disabled={!form.name.trim() || !form.systemPrompt.trim()}
              onClick={handleSubmit}
            >✦ 캐릭터 저장</button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, paddingRight: 4 }}>
          <div className="vstack" style={{ gap: 12 }}>
            <div className="form-section">
              <div className="form-section-title">기본 정보</div>
              <div className="form-grid">
                <div>
                  <label className="label">이름 *</label>
                  <input className="field" placeholder="캐릭터 이름" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div>
                  <label className="label">한 줄 설명 (직함)</label>
                  <input className="field" placeholder="예: 별빛 마법사, 저택의 메이드" value={form.title} onChange={e => set('title', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">캐릭터 설명</label>
                <textarea className="field" rows={2} placeholder="외모, 성격, 배경을 간략하게 적어주세요" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div>
                <label className="label">아바타 URL <span className="tiny muted">(외부 이미지 주소)</span></label>
                <input className="field" placeholder="https://..." value={form.avatarUrl} onChange={e => set('avatarUrl', e.target.value)} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">AI 지시 설정</div>
              <div>
                <label className="label">시스템 프롬프트 * <span className="tiny muted">(AI에게 전달되는 캐릭터 지시문)</span></label>
                <textarea className="field" rows={4} placeholder="당신은 [이름]입니다. [성격, 말투, 행동 규칙 등을 구체적으로 서술하세요]" value={form.systemPrompt} onChange={e => set('systemPrompt', e.target.value)} />
              </div>
              <div>
                <label className="label">시나리오 배경 <span className="tiny muted">(세계관·배경 묘사)</span></label>
                <textarea className="field" rows={3} placeholder="이 세계는 어떤 곳인가요? 배경 상황, 장소 등을 서술하세요" value={form.scenarioDescription} onChange={e => set('scenarioDescription', e.target.value)} />
              </div>
              <div>
                <label className="label">예시 대화 <span className="tiny muted">(2~3개 few-shot, 말투 고정용)</span></label>
                <textarea className="field" rows={4} placeholder={"유저: 안녕?\n[이름]: *수줍게 웃으며* \"오랜만이야.\""} value={form.exampleDialogues} onChange={e => set('exampleDialogues', e.target.value)} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">대화 시작 메시지</div>
              <div>
                <label className="label">첫 인사말 <span className="tiny muted">(대화 시작 시 자동 표시)</span></label>
                <textarea className="field" rows={2} placeholder={'*캐릭터가 돌아보며* "오랫동안 기다렸어."'} value={form.firstMessage} onChange={e => set('firstMessage', e.target.value)} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">태그</div>
              <div className="tag-row" style={{ flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {DEFAULT_TAGS.map(tag => (
                  <span
                    key={tag}
                    className={`tag ${form.tags.includes(tag) ? 'tag-selected' : ''}`}
                    style={{ cursor: 'pointer', padding: '2px 7px', fontSize: 10 }}
                    onClick={() => toggleTag(tag)}
                  >
                    {form.tags.includes(tag) ? '✓ ' : ''}{tag}
                  </span>
                ))}
              </div>
              <div className="hstack" style={{ gap: 6 }}>
                <input
                  className="field" style={{ flex: 1 }} placeholder="직접 입력..."
                  value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
                />
                <button className="btn" onClick={addCustomTag}>추가</button>
              </div>
              {form.tags.length > 0 && (
                <div className="tag-row" style={{ marginTop: 6, flexWrap: 'wrap', gap: 4 }}>
                  {form.tags.map(t => (
                    <span key={t} className="tag tag-selected" style={{ cursor: 'pointer' }} onClick={() => toggleTag(t)}>
                      {t} ×
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="form-section">
              <div className="form-section-title">AI 파라미터</div>
              <div className="form-grid">
                <div>
                  <label className="label">안전 수준</label>
                  <select className="field" value={form.safetyLevel} onChange={e => set('safetyLevel', e.target.value as SafetyLevel)}>
                    <option value="strict">Strict (엄격)</option>
                    <option value="standard">Standard (표준)</option>
                    <option value="relaxed">Relaxed (완화)</option>
                  </select>
                </div>
                <div>
                  <label className="label">기본 AI</label>
                  <select className="field" value={form.defaultAI} onChange={e => set('defaultAI', e.target.value as AIProvider)}>
                    <option value="gemini">Gemini 2.0 Flash</option>
                    <option value="claude" disabled>Claude (준비 중)</option>
                    <option value="chatgpt" disabled>GPT-4o (준비 중)</option>
                  </select>
                </div>
              </div>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <div>
                  <label className="label">Temperature: {form.temperature.toFixed(1)} <span className="tiny muted">(창의성, 0~2)</span></label>
                  <input type="range" className="param-slider" min={0} max={2} step={0.1} value={form.temperature} onChange={e => set('temperature', parseFloat(e.target.value))} />
                </div>
                <div>
                  <label className="label">frequencyPenalty: {form.frequencyPenalty.toFixed(2)} <span className="tiny muted">(단어 반복 억제)</span></label>
                  <input type="range" className="param-slider" min={0} max={2} step={0.05} value={form.frequencyPenalty} onChange={e => set('frequencyPenalty', parseFloat(e.target.value))} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Win>
  )
}
