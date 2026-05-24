'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { RANDOM_NAMES } from '@/lib/constants'
import AvatarPicker from '@/components/ui/AvatarPicker'
import Toast from '@/components/ui/Toast'

type AiStyle = 'eastern' | 'western'

export interface CharFormData {
  name: string
  gender: string
  avatarUrl: string
  tags: string[]
  additionalInfo: string
  exampleDialogues: string
}

interface CharacterFormProps {
  form: CharFormData
  onChange: <K extends keyof CharFormData>(key: K, val: CharFormData[K]) => void
  toast?: string
  onToastDone?: () => void
}

type NameEntry = { name: string; category: string; gender: string }
interface TagEntry { id: string; name: string; category: string; gender: string }

let _cachedNamePool: NameEntry[] | null = null
let _cachedCharTags: TagEntry[] | null = null

const CATEGORIES = ['관계', '성격', '외모', '역할'] as const
type Category = typeof CATEGORIES[number]

function visibleTags(tags: TagEntry[], category: Category, gender: string): TagEntry[] {
  return tags.filter(t => {
    if (t.category !== category) return false
    if (!gender || gender === '기타') return true
    return t.gender === '공통' || t.gender === (gender === '남성' ? '남' : '여')
  })
}

export default function CharacterForm({ form, onChange, toast, onToastDone }: CharacterFormProps) {
  const [namePool, setNamePool] = useState<NameEntry[]>([])
  const [nameCat, setNameCat] = useState<'all' | 'korean' | 'western'>('all')
  const [charTags, setCharTags] = useState<TagEntry[]>([])
  const [customInputs, setCustomInputs] = useState<Record<Category, string>>({ 관계: '', 성격: '', 외모: '', 역할: '' })
  const [showDialogues, setShowDialogues] = useState(!!form.exampleDialogues)
  const [aiStyle, setAiStyle] = useState<AiStyle>('eastern')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    if (_cachedNamePool !== null) {
      setNamePool(_cachedNamePool)
    } else {
      fetch('/api/names').then(r => r.json()).then((data: NameEntry[]) => { _cachedNamePool = data; setNamePool(data) }).catch(() => {})
    }
    if (_cachedCharTags !== null) {
      setCharTags(_cachedCharTags)
    } else {
      api.get('/api/character-tags').then((data: TagEntry[]) => { _cachedCharTags = data; setCharTags(data) }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (form.exampleDialogues) setShowDialogues(true)
  }, [form.exampleDialogues])

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

  const toggleTag = (name: string) => {
    const next = form.tags.includes(name)
      ? form.tags.filter(t => t !== name)
      : [...form.tags, name]
    onChange('tags', next)
  }

  const addCustomTag = (cat: Category) => {
    const val = customInputs[cat].trim()
    if (!val || form.tags.includes(val)) return
    onChange('tags', [...form.tags, val])
    setCustomInputs(c => ({ ...c, [cat]: '' }))
  }

  const handleAiFill = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const result = await api.post('/api/characters/generate', {
        style: aiStyle,
        gender: form.gender,
        tags: form.tags,
        name: form.name,
        additionalInfo: form.additionalInfo,
        exampleDialogues: form.exampleDialogues,
      })
      if (result.name) onChange('name', result.name)
      if (result.additionalInfo) onChange('additionalInfo', result.additionalInfo)
      if (result.exampleDialogues) { onChange('exampleDialogues', result.exampleDialogues); setShowDialogues(true) }
    } catch (e: any) {
      setAiError(e.message ?? '생성 실패')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <>
      {toast && <Toast message={toast} onDone={onToastDone ?? (() => {})} />}
      <div className="vstack" style={{ gap: 14 }}>

        {/* 기본 정보 */}
        <div className="form-section">
          <div className="form-section-title">기본 정보</div>
          <div className="form-grid">
            <div>
              <label className="label">이름 *</label>
              <div className="hstack" style={{ gap: 5 }}>
                <input
                  className="field" style={{ flex: 1 }}
                  placeholder="캐릭터 이름"
                  value={form.name}
                  onChange={e => onChange('name', e.target.value)}
                />
                {(['all', 'korean', 'western'] as const).map(c => (
                  <button key={c} type="button"
                    className={`btn ${nameCat === c ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 9, padding: '3px 5px', flexShrink: 0 }}
                    onClick={() => setNameCat(c)}
                  >{c === 'all' ? '전체' : c === 'korean' ? '한국' : '서양'}</button>
                ))}
                <button type="button" className="btn ghost" style={{ fontSize: 10, padding: '4px 8px', flexShrink: 0 }} onClick={rollName}>🎲</button>
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
          </div>
          <div>
            <label className="label">아바타 이미지</label>
            <AvatarPicker value={form.avatarUrl} onChange={url => onChange('avatarUrl', url)} />
          </div>
        </div>

        {/* 태그 */}
        <div className="form-section">
          <div className="form-section-title">태그</div>
          {CATEGORIES.map(cat => {
            const available = visibleTags(charTags, cat, form.gender)
            return (
              <div key={cat}>
                <label className="label">{cat}</label>
                <div style={{ overflowX: 'auto', paddingBottom: 4, marginBottom: 5 }}>
                  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 5, width: 'max-content' }}>
                    {available.map(t => {
                      const selected = form.tags.includes(t.name)
                      return (
                        <button key={t.id} type="button" onClick={() => toggleTag(t.name)}
                          style={{
                            padding: '3px 9px', fontSize: 11, borderRadius: 20,
                            border: `1.5px solid ${selected ? 'var(--hot-pink)' : 'var(--chrome-border)'}`,
                            background: selected ? 'var(--hot-pink)' : 'var(--chrome-face)',
                            color: selected ? '#fff' : 'var(--ink)',
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >{t.name}</button>
                      )
                    })}
                    {available.length === 0 && <div className="tiny muted">등록된 태그 없음 (어드민에서 추가)</div>}
                  </div>
                </div>
                <div className="hstack" style={{ gap: 4 }}>
                  <input
                    className="field" style={{ flex: 1, fontSize: 11 }}
                    placeholder={`${cat} 직접 입력 후 Enter`}
                    value={customInputs[cat]}
                    onChange={e => setCustomInputs(c => ({ ...c, [cat]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(cat) } }}
                  />
                  <button className="btn ghost" style={{ fontSize: 10, padding: '2px 7px' }} onClick={() => addCustomTag(cat)}>추가</button>
                </div>
              </div>
            )
          })}

          {form.tags.length > 0 && (
            <div>
              <label className="label">선택된 태그</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {form.tags.map(t => (
                  <span key={t} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 20, background: 'var(--lavender)', border: '1px solid var(--chrome-border)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {t}
                    <button type="button" onClick={() => onChange('tags', form.tags.filter(x => x !== t))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI 채우기 */}
        <div className="form-section">
          <div className="spread" style={{ alignItems: 'center', marginBottom: 6 }}>
            <div className="form-section-title" style={{ marginBottom: 0 }}>✦ AI로 빈 항목 채우기</div>
            <div className="hstack" style={{ gap: 4 }}>
              {(['eastern', 'western'] as const).map(s => (
                <button key={s} type="button"
                  className={`btn ${aiStyle === s ? 'primary' : 'ghost'}`}
                  style={{ fontSize: 10, padding: '2px 8px' }}
                  onClick={() => setAiStyle(s)}
                >{s === 'eastern' ? '동양풍' : '서양풍'}</button>
              ))}
            </div>
          </div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            이름·추가정보·예시대화 중 비어있는 항목만 채웁니다. 성별·태그를 먼저 선택하면 더 정확합니다.
          </div>
          <button type="button" className="btn primary" style={{ fontSize: 11, alignSelf: 'flex-start' }}
            disabled={aiLoading} onClick={handleAiFill}>
            {aiLoading ? '생성 중...' : '✦ 채우기'}
          </button>
          {aiError && <div className="tiny" style={{ color: '#ff6b8a', marginTop: 4 }}>⚠ {aiError}</div>}
        </div>

        {/* 추가 정보 */}
        <div className="form-section">
          <div className="form-section-title">추가 정보</div>
          <textarea
            className="field" rows={3}
            placeholder={"태그 외 세부 설정을 자유롭게 적어주세요\n예: 왼손잡이다. 절대 반말을 쓰지 않는다. 고어체를 사용한다."}
            value={form.additionalInfo}
            onChange={e => onChange('additionalInfo', e.target.value)}
          />
        </div>

        {/* 예시 대화 (퓨샷) */}
        <div className="form-section">
          <div className="spread" style={{ alignItems: 'center' }}>
            <div className="form-section-title" style={{ marginBottom: 0 }}>예시 대화 <span className="tiny muted">(말투 고정용, 선택)</span></div>
            <button type="button" className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowDialogues(s => !s)}>
              {showDialogues ? '접기' : '펼치기'}
            </button>
          </div>
          {showDialogues && (
            <textarea
              className="field" rows={5}
              placeholder={"유저: 안녕?\n[이름]: *수줍게 웃으며* \"오랜만이야.\"\n\n유저: 요즘 어때?\n[이름]: \"...딱히 특별한 일은 없어.\""}
              value={form.exampleDialogues}
              onChange={e => onChange('exampleDialogues', e.target.value)}
              style={{ marginTop: 6 }}
            />
          )}
        </div>

      </div>
    </>
  )
}
