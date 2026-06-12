'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

const MULTISTORY_BASE_READONLY = `[buildMultiStorySystemPrompt() — 코드 고정]
You are an interactive story writer with multiple characters.
All characters interact naturally in each scene — decide who speaks, acts, or reacts based on the situation.

[Output Format]
- Scene narration/action/setting: plain text without a speaker name.
- Dialogue: always use the format Name : "content" / Inner thoughts: Name : 'content'
- ANY of the listed characters may speak or act in each response.
- At the end, always place a "---" divider, then list 4 numbered choices for {personaName}.
- FORBIDDEN: Writing {personaName}'s words or actions in the body.
- FORBIDDEN: Writing dialogue without a speaker name.

[Character Voice — STRICT] Each character must maintain their unique speech style at all times.
[No Excessive Ellipsis] FORBIDDEN: "..." more than once per response.
※ 코드 고정 (apps/web/lib/systemPrompt.ts — buildMultiStorySystemPrompt())`

const STORY_BASE_READONLY = `[buildStoryBaseRules(charName, personaName) — {charName}/{personaName}은 실행 시 실제 이름으로 치환됨]
You are an interactive story writer. Follow the format below strictly in every response.

[Output Format]
- Scene narration/setting/action: plain text without a speaker name.
- Dialogue: always use the format Name : "content" (e.g.: {charName} : "Hello.")
- Inner thoughts: always use the format Name : 'content'
- Before the choices, {charName} must take direct action and at least one line of dialogue or inner monologue.
- At the end, always place a "---" divider, then list 4 numbered choices for {personaName}.
- Choices 1–3: {personaName}'s next action or dialogue candidates.
- Choice 4: a natural next-step action that advances the scene one stage forward — not dialogue.
- FORBIDDEN: Writing {personaName}'s new words, actions, emotions, or decisions in the body.
- FORBIDDEN: Writing dialogue without a speaker name. FORBIDDEN: Meta choices like "Free input".
※ 코드 고정 (apps/web/lib/systemPrompt.ts — buildStoryBaseRules())`

const MULTISTORY_CLOSING_KO = `[최우선 준수]
- 반드시 한국어로만 응답
- 분석·계획·메타 주석을 절대 미출력
- 장면·대사·행동으로 바로 시작
- 본문에 유저(페르소나)의 말·행동·감정을 대신 확정 금지
- 등장 캐릭터들은 각자의 말투를 유지하며 자신의 말과 행동만 수행
- 응답 마지막에 "---" 구분선 후 유저 선택지 4개를 번호로 제시
- *필수* 직전 대화에 이미 있는 대사·행동·묘사를 반복 출력하지 말것`

const STORY_CLOSING_KO = `[최우선 준수]
- 반드시 한국어로만 응답
- 분석·계획·메타 주석을 절대 미출력
- 장면·대사·행동으로 바로 시작
- 본문에 반드시 AI 캐릭터의 행동과 대사를 포함할 것
- 본문에서 유저의 말·행동·감정을 대신 확정 금지
- 응답 마지막에 "---" 구분선 후 유저 선택지 4개를 번호로 제시
- 선택지 1~3번: 유저의 다음 행동·대사 후보만 포함, AI 캐릭터 이름·대사·행동 금지
- 선택지 4번: 현재 장면에서 한 단계 앞으로 나아가는 행동 (대화·감정 표현 제외)
- *필수* 직전 대화에 이미 있는 대사·행동·묘사를 반복 출력하지 말것`

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginLeft: 4 }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--chrome-border)',
        fontSize: 9, color: 'var(--ink-soft)', cursor: 'help',
      }}>?</span>
      {visible && (
        <div style={{
          position: 'fixed', zIndex: 9999,
          background: 'var(--chrome-bg)', border: '1px solid var(--chrome-border)',
          padding: '8px 10px', fontSize: 10, color: 'var(--ink)', whiteSpace: 'pre-wrap',
          lineHeight: 1.7, width: 260, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          right: 16, bottom: 80,
        }}>{text}</div>
      )}
    </span>
  )
}

function ReadonlyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="label">{label} <span className="tiny muted">(코드 고정)</span></div>
      <div style={{
        padding: '8px 10px', background: 'rgba(0,0,0,0.05)', border: '1px solid var(--chrome-border)',
        fontSize: 10, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', lineHeight: 1.7,
        fontFamily: 'var(--font-mono)',
      }}>{text}</div>
    </div>
  )
}

export default function AdminConfigPage() {
  const [globalRules, setGlobalRules] = useState('')
  const [multiStoryRules, setMultiStoryRules] = useState('')
  const [multiStoryClosing, setMultiStoryClosing] = useState('')
  const [storyRules, setStoryRules] = useState('')
  const [storyClosing, setStoryClosing] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/admin/config').then((data: Record<string, string>) => {
      setGlobalRules(data.global_rules ?? '')
      setMultiStoryRules(data.multiStory_rules ?? '')
      setMultiStoryClosing(data.multiStory_closing ?? '')
      setStoryRules(data.story_rules ?? '')
      setStoryClosing(data.story_closing ?? '')
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await api.patch('/api/admin/config', {
        global_rules: globalRules,
        multiStory_rules: multiStoryRules,
        multiStory_closing: multiStoryClosing,
        story_rules: storyRules,
        story_closing: storyClosing,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setLoading(false) }
  }

  return (
    <Win title="관리자 — 전역 설정" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 0, flex: 1, minHeight: 0 }}>
        <div style={{ padding: 4, paddingBottom: 0 }}>
          <AdminNav current="/admin/config" />
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 4 }}>
          <div className="vstack" style={{ gap: 16 }}>

            <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)' }}>
              <div className="tiny" style={{ color: 'var(--purple)', fontWeight: 700, marginBottom: 4 }}>프롬프트 조립 순서</div>
              <div className="tiny muted" style={{ lineHeight: 1.7 }}>
                공통 규칙 → 유저 개인 설정 → 기본 규칙(코드 고정) → 스타일 지시(선택) → 추가 규칙 → 유저 페르소나 → 캐릭터 설정 → 시나리오 배경 → 예시 대화 → 현재 상태·스탯·인벤토리 → 로어북 → 장기 메모리 → 핵심 메모리 → 최종 강조 규칙(DB) ※ 정적 블록을 앞에 둬 Gemini 캐시 적중 유도
              </div>
            </div>

            {/* 공통 */}
            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>공통</div>
              <div>
                <label className="label">플랫폼 공통 규칙 <span className="tiny muted">(모든 모드 맨 앞 삽입 — 비워두면 생략)</span></label>
                <textarea className="field" rows={3}
                  placeholder="예: 이 플랫폼은 순수한 픽션 기반 서비스입니다."
                  value={globalRules} onChange={e => setGlobalRules(e.target.value)} />
              </div>
            </div>

            {/* 멀티스토리 */}
            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>👥 멀티스토리 모드</div>
              <ReadonlyBlock label="기본 규칙" text={MULTISTORY_BASE_READONLY} />
              <div>
                <label className="label">추가 규칙 <span className="tiny muted">(기본 규칙 바로 뒤 삽입 — 비워두면 생략)</span></label>
                <textarea className="field" rows={3}
                  placeholder="예: 캐릭터는 절대 자신이 AI임을 밝히지 않습니다."
                  value={multiStoryRules} onChange={e => setMultiStoryRules(e.target.value)} />
              </div>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>최종 강조 규칙 (multiStory_closing) <span className="tiny muted">— 핵심 메모리 바로 뒤, 맨 마지막 삽입</span><Tooltip text={MULTISTORY_CLOSING_KO} /></label>
                <textarea className="field" rows={8}
                  placeholder="멀티스토리 모드 응답 통제 및 출력 규칙을 입력하세요."
                  value={multiStoryClosing} onChange={e => setMultiStoryClosing(e.target.value)} />
              </div>
            </div>

            {/* 스토리 */}
            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>📖 스토리 모드</div>
              <ReadonlyBlock label="기본 규칙" text={STORY_BASE_READONLY} />
              <div>
                <label className="label">추가 규칙 <span className="tiny muted">(기본 규칙 바로 뒤 삽입 — 비워두면 생략)</span></label>
                <textarea className="field" rows={3}
                  placeholder="예: 선택지는 항상 3개로 유지합니다."
                  value={storyRules} onChange={e => setStoryRules(e.target.value)} />
              </div>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>최종 강조 규칙 (story_closing) <span className="tiny muted">— 핵심 메모리 바로 뒤, 맨 마지막 삽입</span><Tooltip text={STORY_CLOSING_KO} /></label>
                <textarea className="field" rows={8}
                  placeholder="스토리 모드 응답 통제 및 선택지 규칙을 입력하세요."
                  value={storyClosing} onChange={e => setStoryClosing(e.target.value)} />
              </div>
            </div>

            <div className="hstack" style={{ gap: 6 }}>
              <button className="btn primary" disabled={loading} onClick={handleSave}>
                {loading ? '저장 중...' : '✦ 저장'}
              </button>
              {saved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨</span>}
            </div>
          </div>
        </div>
      </div>
    </Win>
  )
}
