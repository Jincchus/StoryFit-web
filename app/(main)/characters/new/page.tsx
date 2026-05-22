'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import CharacterForm, { type CharFormData } from '@/components/ui/CharacterForm'

export default function CharacterNewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<CharFormData>({
    name: '', gender: '', avatarUrl: '',
    tags: [], additionalInfo: '', exampleDialogues: '',
  })
  const [aiStyle, setAiStyle] = useState<'eastern' | 'western'>('eastern')
  const [aiTheme, setAiTheme] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const onChange = <K extends keyof CharFormData>(key: K, val: CharFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const handleGenerate = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const result = await api.post('/api/characters/generate', { style: aiStyle, theme: aiTheme })
      setForm(f => ({ ...f, ...result, avatarUrl: f.avatarUrl }))
    } catch (e: any) {
      setAiError(e.message ?? '생성 실패')
    } finally {
      setAiLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || loading) return
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
              disabled={loading || !form.name.trim()}
              onClick={handleSubmit}
            >{loading ? '저장 중...' : '✦ 캐릭터 저장'}</button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, paddingRight: 4 }}>
          {/* AI 자동생성 */}
          <div className="form-section" style={{ marginBottom: 14 }}>
            <div className="form-section-title">✦ AI 자동생성</div>
            <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(['eastern', 'western'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  className={`btn ${aiStyle === s ? 'primary' : 'ghost'}`}
                  style={{ fontSize: 11 }}
                  onClick={() => setAiStyle(s)}
                >
                  {s === 'eastern' ? '동양풍' : '서양풍'}
                </button>
              ))}
              <input
                className="field"
                style={{ flex: 1, minWidth: 100, fontSize: 11 }}
                placeholder="테마 (선택) — 예: 냉정한 검사, 밝은 마법사"
                value={aiTheme}
                onChange={e => setAiTheme(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate() } }}
              />
              <button
                type="button"
                className="btn primary"
                style={{ fontSize: 11, flexShrink: 0 }}
                disabled={aiLoading}
                onClick={handleGenerate}
              >
                {aiLoading ? '생성 중...' : '✦ 생성'}
              </button>
            </div>
            {aiError && <div className="tiny" style={{ color: '#ff6b8a', marginTop: 4 }}>⚠ {aiError}</div>}
          </div>

          <CharacterForm form={form} onChange={onChange} />
        </div>
      </div>
    </Win>
  )
}
