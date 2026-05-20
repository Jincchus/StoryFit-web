'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { DEFAULT_TAGS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AvatarPicker from '@/components/ui/AvatarPicker'
import ParamTooltip from '@/components/ui/ParamTooltip'
import type { SafetyLevel, AIProvider } from '@/types'

interface CharForm {
  name: string; title: string; gender: string; description: string
  systemPrompt: string; scenarioDescription: string
  firstMessage: string; exampleDialogues: string
  avatarUrl: string; tags: string[]
  safetyLevel: SafetyLevel; defaultAI: AIProvider
  temperature: number; frequencyPenalty: number; presencePenalty: number
}

export default function CharacterEditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState<CharForm | null>(null)
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    api.get(`/api/characters/${id}`)
      .then((c: any) => setForm({
        name: c.name ?? '',
        title: c.title ?? '',
        gender: c.gender ?? '',
        description: c.description ?? '',
        systemPrompt: c.systemPrompt ?? '',
        scenarioDescription: c.scenarioDescription ?? '',
        firstMessage: c.firstMessage ?? '',
        exampleDialogues: c.exampleDialogues ?? '',
        avatarUrl: c.avatarUrl ?? '',
        tags: c.tags ?? [],
        safetyLevel: c.safetyLevel ?? 'standard',
        defaultAI: c.defaultAI ?? 'gemini',
        temperature: c.temperature ?? 0.9,
        frequencyPenalty: c.frequencyPenalty ?? 0.3,
        presencePenalty: c.presencePenalty ?? 0.3,
      }))
      .catch((e: any) => setFetchError(e.message))
  }, [id])

  if (fetchError) return (
    <Win title="캐릭터 수정" icon={PixelIcons.user}>
      <div className="tiny" style={{ color: '#ff6b8a', padding: 20 }}>⚠ {fetchError}</div>
    </Win>
  )

  if (!form) return (
    <Win title="캐릭터 수정" icon={PixelIcons.user}>
      <div className="tiny muted" style={{ padding: 20 }}>불러오는 중...</div>
    </Win>
  )

  const set = <K extends keyof CharForm>(key: K, val: CharForm[K]) => setForm(f => f ? { ...f, [key]: val } : f)

  const toggleTag = (tag: string) => setForm(f => {
    if (!f) return f
    return { ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag] }
  })

  const addCustomTag = () => {
    const t = tagInput.trim()
    if (!t || form.tags.includes(t)) return
    setForm(f => f ? { ...f, tags: [...f.tags, t] } : f)
    setTagInput('')
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      await api.patch(`/api/characters/${id}`, form)
      router.push('/characters')
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <Win title="캐릭터 수정 (Edit Character)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>캐릭터 수정</div>
            <div className="tiny muted">{form.name}</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 6, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => router.back()}>← 취소</button>
            {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
            <button
              className="btn primary"
              disabled={loading || !form.name.trim() || !form.systemPrompt.trim()}
              onClick={handleSubmit}
            >{loading ? '저장 중...' : '✦ 저장'}</button>
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
                <label className="label">성별</label>
                <div className="hstack" style={{ gap: 10 }}>
                  {['', '남성', '여성', '기타'].map(g => (
                    <label key={g} className="hstack" style={{ gap: 4, cursor: 'pointer', fontSize: 11 }}>
                      <input type="radio" name="char-gender" value={g} checked={form.gender === g} onChange={() => set('gender', g)} />
                      {g || '미설정'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">캐릭터 설명</label>
                <textarea className="field" rows={2} placeholder="외모, 성격, 배경을 간략하게 적어주세요" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div>
                <label className="label">아바타 이미지</label>
                <AvatarPicker value={form.avatarUrl} onChange={url => set('avatarUrl', url)} />
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
                  <label className="label">
                    안전 수준
                    <ParamTooltip text={"AI가 민감한 내용을 얼마나 차단할지 결정합니다.\n\n엄격: 폭력·성인 표현 거의 차단\n표준: 일반적인 수준으로 차단 (기본값)\n완화: 성숙한 표현 일부 허용"} />
                  </label>
                  <select className="field" value={form.safetyLevel} onChange={e => set('safetyLevel', e.target.value as SafetyLevel)}>
                    <option value="strict">엄격 (Strict)</option>
                    <option value="standard">표준 (Standard)</option>
                    <option value="relaxed">완화 (Relaxed)</option>
                  </select>
                </div>
                <div>
                  <label className="label">기본 AI</label>
                  <select className="field" value={form.defaultAI} onChange={e => set('defaultAI', e.target.value as AIProvider)}>
                    <option value="gemini">Gemini 2.5 Flash</option>
                    <option value="claude" disabled>Claude (준비 중)</option>
                    <option value="chatgpt" disabled>GPT-4o (준비 중)</option>
                  </select>
                </div>
              </div>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <div>
                  <label className="label">
                    창의성: {form.temperature.toFixed(1)}
                    <ParamTooltip text={"AI 답변의 창의성·무작위성을 조절합니다.\n\n낮을수록 (0~0.5): 일관되고 예측 가능한 답변\n보통 (0.7~1.0): 자연스럽고 다양한 표현 (추천)\n높을수록 (1.5~2.0): 창의적이지만 가끔 엉뚱한 답변"} />
                  </label>
                  <input type="range" className="param-slider" min={0} max={2} step={0.1} value={form.temperature} onChange={e => set('temperature', parseFloat(e.target.value))} />
                </div>
                <div>
                  <label className="label">
                    반복 억제: {form.frequencyPenalty.toFixed(2)}
                    <ParamTooltip text={"같은 단어나 표현이 반복되는 것을 억제합니다.\n\n낮을수록 (0~0.2): 반복 허용, 일관된 말투 유지\n보통 (0.3~0.5): 적당한 억제 (추천)\n높을수록 (0.8~): 다양한 어휘 사용, 말투 변할 수 있음"} />
                  </label>
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
