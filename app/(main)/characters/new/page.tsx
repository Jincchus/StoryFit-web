'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { DEFAULT_TAGS, RANDOM_NAMES } from '@/lib/constants'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AvatarPicker from '@/components/ui/AvatarPicker'
interface CharForm {
  name: string; title: string; gender: string; description: string
  systemPrompt: string; exampleDialogues: string
  avatarUrl: string; tags: string[]
}

export default function CharacterNewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [namePool, setNamePool] = useState<{ name: string; category: string; gender: string }[]>([])
  const [nameCat, setNameCat] = useState<'all' | 'korean' | 'western'>('all')
  const [tagPool, setTagPool] = useState<string[]>([])
  const [form, setForm] = useState<CharForm>({
    name: '', title: '', gender: '', description: '',
    systemPrompt: '', exampleDialogues: '',
    avatarUrl: '', tags: [],
  })
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    fetch('/api/names').then(r => r.json()).then(setNamePool).catch(() => {})
    fetch('/api/tags').then(r => r.json()).then(setTagPool).catch(() => {})
  }, [])

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

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      await api.post('/api/characters', form)
      router.push('/characters')
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
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
            {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
            <button
              className="btn primary"
              disabled={loading || !form.name.trim() || !form.systemPrompt.trim()}
              onClick={handleSubmit}
            >{loading ? '저장 중...' : '✦ 캐릭터 저장'}</button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, paddingRight: 4 }}>
          <div className="vstack" style={{ gap: 12 }}>
            <div className="form-section">
              <div className="form-section-title">기본 정보</div>
              <div className="form-grid">
                <div>
                  <label className="label">이름 *</label>
                  <div className="hstack" style={{ gap: 5 }}>
                    <input className="field" style={{ flex: 1 }} placeholder="캐릭터 이름" value={form.name} onChange={e => set('name', e.target.value)} />
                    {(['all', 'korean', 'western'] as const).map(c => (
                      <button key={c} type="button"
                        className={`btn ${nameCat === c ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 9, padding: '3px 5px', flexShrink: 0 }}
                        onClick={() => setNameCat(c)}
                      >{c === 'all' ? '전체' : c === 'korean' ? '한국' : '서양'}</button>
                    ))}
                    <button type="button" className="btn ghost" style={{ fontSize: 10, padding: '4px 8px', flexShrink: 0 }} onClick={() => {
                      const pool = nameCat === 'all' ? namePool : namePool.filter(n => n.category === nameCat)
                      if (pool.length > 0) {
                        const picked = pool[Math.floor(Math.random() * pool.length)]
                        set('name', picked.name)
                        if (picked.gender) set('gender', picked.gender)
                      } else {
                        set('name', RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)])
                      }
                    }}>🎲</button>
                  </div>
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
                <label className="label">예시 대화 <span className="tiny muted">(2~3개 few-shot, 말투 고정용)</span></label>
                <textarea className="field" rows={4} placeholder={"유저: 안녕?\n[이름]: *수줍게 웃으며* \"오랜만이야.\""} value={form.exampleDialogues} onChange={e => set('exampleDialogues', e.target.value)} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">태그</div>
              <div className="tag-row" style={{ flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {(tagPool.length > 0 ? tagPool : DEFAULT_TAGS).map(tag => (
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

          </div>
        </div>
      </div>
    </Win>
  )
}
