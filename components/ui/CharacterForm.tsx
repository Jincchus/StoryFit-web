'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { RANDOM_NAMES } from '@/lib/constants'
import AvatarPicker from '@/components/ui/AvatarPicker'
import Toast from '@/components/ui/Toast'

type AiStyle = 'eastern' | 'western'

export interface OpeningItem { id: string; title: string; content: string }

export interface CharFormData {
  name: string
  gender: string
  avatarUrl: string
  tags: string[]
  additionalInfo: string
  exampleDialogues: string
  openingMessage: string
  openingMessages?: OpeningItem[]  // 다중 도입부(대화 시작 시 선택). 첫 항목이 기본.
  collectionId?: string | null
}

interface CharacterFormProps {
  form: CharFormData
  onChange: <K extends keyof CharFormData>(key: K, val: CharFormData[K]) => void
  collections?: { id: string; title: string; completed?: boolean }[]
  collectionLabel?: string
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

export default function CharacterForm({ form, onChange, collections, collectionLabel = '컬렉션', toast, onToastDone }: CharacterFormProps) {
  const [namePool, setNamePool] = useState<NameEntry[]>([])
  const [nameCat, setNameCat] = useState<'all' | 'korean' | 'western'>('all')
  const [charTags, setCharTags] = useState<TagEntry[]>([])
  const [customInputs, setCustomInputs] = useState<Record<Category, string>>({ 관계: '', 성격: '', 외모: '', 역할: '' })
  const [showDialogues, setShowDialogues] = useState(!!form.exampleDialogues)
  const [aiStyle, setAiStyle] = useState<AiStyle>('eastern')
  const [aiHint, setAiHint] = useState('')
  const [colQuery, setColQuery] = useState('')
  const [colOpen, setColOpen] = useState(false)
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

  // 다중 도입부(openingMessages) CRUD — 첫 항목이 기본 도입부.
  const openings = form.openingMessages ?? []
  const setOpenings = (next: OpeningItem[]) => onChange('openingMessages', next)
  const updateOpening = (i: number, patch: Partial<OpeningItem>) =>
    setOpenings(openings.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  const addOpening = () =>
    setOpenings([...openings, { id: `op-${Date.now()}`, title: `도입부 ${openings.length + 1}`, content: '' }])
  const removeOpening = (i: number) => setOpenings(openings.filter((_, idx) => idx !== i))
  const moveOpening = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= openings.length) return
    const arr = [...openings]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setOpenings(arr)
  }

  const toggleTag = (name: string) => {
    const next = form.tags.includes(name)
      ? form.tags.filter(t => t !== name)
      : [...form.tags, name]
    onChange('tags', next)
  }

  const addCustomTag = (cat: Category) => {
    const val = customInputs[cat].trim()
    if (!val) return
    const exactMatch = charTags.find(t => t.category === cat && t.name === val)
    if (exactMatch) {
      if (!form.tags.includes(exactMatch.name)) onChange('tags', [...form.tags, exactMatch.name])
      setCustomInputs(c => ({ ...c, [cat]: '' }))
      return
    }
    if (form.tags.includes(val)) return
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
        hint: aiHint.trim() || undefined,
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
            const q = customInputs[cat].trim()
            const displayed = q ? available.filter(t => t.name.includes(q)) : available
            return (
              <div key={cat}>
                <label className="label">{cat}</label>
                <div style={{ overflowX: 'auto', paddingBottom: 4, marginBottom: 5 }}>
                  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 5, width: 'max-content' }}>
                    {displayed.map(t => {
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
                    {available.length > 0 && displayed.length === 0 && <div className="tiny muted">일치하는 태그 없음</div>}
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
            이름·세부설정·예시대화 중 비어있는 항목만 채웁니다. 성별·태그를 먼저 선택하면 더 정확합니다.
          </div>
          <textarea
            className="field"
            rows={2}
            placeholder={'AI에게 전달할 추가 지시사항 (선택)\n예: 츤데레 말투, 어미는 ~다냥으로 끝내기, 냉정하지만 속은 따뜻한 캐릭터'}
            value={aiHint}
            onChange={e => setAiHint(e.target.value)}
            style={{ marginBottom: 6, fontSize: 11 }}
          />
          <button type="button" className="btn primary" style={{ fontSize: 11, alignSelf: 'flex-start' }}
            disabled={aiLoading} onClick={handleAiFill}>
            {aiLoading ? '생성 중...' : '✦ 채우기'}
          </button>
          {aiError && <div className="tiny" style={{ color: '#ff6b8a', marginTop: 4 }}>⚠ {aiError}</div>}
        </div>

        {/* 세부 설정 */}
        <div className="form-section">
          <div className="form-section-title">세부 설정</div>
          <textarea
            className="field" rows={3}
            placeholder={"태그 외 세부 설정을 자유롭게 적어주세요\n예: 왼손잡이다. 절대 반말을 쓰지 않는다. 고어체를 사용한다."}
            value={form.additionalInfo}
            onChange={e => onChange('additionalInfo', e.target.value)}
          />
        </div>

        {/* 시작 메시지 (도입부 — 여러 개 가능) */}
        <div className="form-section">
          <div className="spread" style={{ alignItems: 'center' }}>
            <div className="form-section-title" style={{ marginBottom: 0 }}>시작 메시지 <span className="tiny muted">(도입부, 여러 개 가능)</span></div>
            <button type="button" className="btn ghost" style={{ fontSize: 10 }} onClick={addOpening}>+ 도입부 추가</button>
          </div>
          <div className="tiny muted" style={{ margin: '6px 0' }}>
            대화 시작 시 유저가 도입부를 고릅니다. 맨 위(첫 번째)가 기본값입니다. 비워두면 유저가 먼저 말을 겁니다.
          </div>
          {openings.length === 0 && (
            <div className="tiny muted" style={{ padding: '4px 0' }}>도입부가 없습니다. "+ 도입부 추가"로 만들 수 있어요.</div>
          )}
          <div className="vstack" style={{ gap: 8 }}>
            {openings.map((op, i) => (
              <div key={op.id} style={{ border: '1px solid var(--chrome-border)', borderRadius: 8, padding: 8 }}>
                <div className="hstack" style={{ gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <input
                    className="field" style={{ flex: 1, fontSize: 11 }}
                    placeholder={`도입부 ${i + 1} 제목`}
                    value={op.title}
                    onChange={e => updateOpening(i, { title: e.target.value })}
                  />
                  {i === 0 && <span className="tiny" style={{ color: 'var(--hot-pink)', flexShrink: 0 }}>기본</span>}
                  <button type="button" className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} disabled={i === 0} onClick={() => moveOpening(i, -1)}>↑</button>
                  <button type="button" className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} disabled={i === openings.length - 1} onClick={() => moveOpening(i, 1)}>↓</button>
                  <button type="button" className="btn ghost" style={{ fontSize: 10, padding: '2px 6px', color: '#ff6b8a' }} onClick={() => removeOpening(i)}>삭제</button>
                </div>
                <textarea
                  className="field" rows={4}
                  placeholder={`예: *카페 창가 자리에 앉아 당신을 발견하고 눈이 마주친다.*\n"...오셨군요. 앉으세요."`}
                  value={op.content}
                  onChange={e => updateOpening(i, { content: e.target.value })}
                />
              </div>
            ))}
          </div>
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

        {/* 컬렉션(카드) — 검색 가능, 완결 카드는 제외(단 현재 지정된 카드는 항상 표시) */}
        {collections !== undefined && (() => {
          const selected = collections.find(c => c.id === form.collectionId) ?? null
          const q = colQuery.trim().toLowerCase()
          const options = collections.filter(c => {
            if (c.id === form.collectionId) return false // 선택된 건 아래 별도 표시
            if (c.completed) return false // 완결 카드 제외
            return !q || c.title.toLowerCase().includes(q)
          })
          return (
            <div className="form-section">
              <div className="form-section-title">{collectionLabel} <span className="tiny muted">(선택)</span></div>
              <div className="tiny muted" style={{ marginBottom: 6 }}>같은 작품·시리즈 캐릭터끼리 묶어서 관리할 수 있습니다. 완결된 카드는 목록에서 제외됩니다.</div>
              {/* 현재 지정 상태 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="tiny muted">현재:</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{selected ? selected.title : '미분류'}</span>
                {selected && (
                  <button type="button" className="tiny" style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--hot-pink)', cursor: 'pointer' }}
                    onClick={() => { onChange('collectionId', null); setColQuery('') }}>매핑 해제</button>
                )}
              </div>
              <input
                className="field"
                type="text"
                value={colQuery}
                placeholder={`${collectionLabel} 검색해서 매핑…`}
                onChange={e => { setColQuery(e.target.value); setColOpen(true) }}
                onFocus={() => setColOpen(true)}
                onBlur={() => setTimeout(() => setColOpen(false), 150)}
              />
              {colOpen && (
                <div style={{ border: '1px solid var(--chrome-border)', borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: 'auto', background: 'var(--chrome-face)' }}>
                  {options.length === 0 ? (
                    <div className="tiny muted" style={{ padding: '10px 12px' }}>{q ? '검색 결과가 없습니다.' : '매핑할 수 있는 카드가 없습니다.'}</div>
                  ) : options.slice(0, 50).map(col => (
                    <div key={col.id}
                      onMouseDown={() => { onChange('collectionId', col.id); setColQuery(''); setColOpen(false) }}
                      style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--chrome-border)' }}>
                      {col.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </>
  )
}
