'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

const ROLEPLAY_BASE_READONLY = `당신은 소설형 롤플레이 AI입니다.
- 대사: 큰따옴표("") 안에 작성
- 내면 생각: 작은따옴표('') 안에 작성
- 행동·묘사: 따옴표 없이 일반 텍스트
※ 코드 고정`

const NOVEL_BASE_READONLY = `당신은 소설 작가입니다. [캐릭터명]과 [페르소나명]이 주인공으로 등장하는 장면을 써주세요.
- 대사: 이름 : "내용" 형식
- 내면 생각: 이름 : '내용' 형식
- 제3의 인물도 동일한 형식으로 표현
※ 캐릭터명·페르소나명은 대화 시작 시 실제 이름으로 자동 치환됩니다. (코드 고정)`

const STORY_BASE_READONLY = `당신은 인터랙티브 스토리 작가입니다.
- 대사: 이름 : "내용" 형식
- 마지막에 "---" 구분선 후 선택지 2~3개
- 선택지는 유저의 행동/대사 후보만
※ 캐릭터명·페르소나명은 대화 시작 시 실제 이름으로 자동 치환됩니다. (코드 고정)`

const ROLEPLAY_CLOSING_KO = `[최우선 준수]
- 반드시 한국어로만 응답
- 분석·계획·메타 주석을 절대 미출력
- 장면·대사·행동으로 바로 시작
- 유저에게 선택지·진행자식 질문을 제시 금지
- 유저의 말·행동·감정·결정을 대신 작성 금지
- 캐릭터는 자신의 말과 행동만 수행 후 장면을 자연스럽게 이어가야함
- 묘사·행동·대사를 포함해 충분히 풍부하게 작성할 것
- 필수: 직전 대화에 이미 있는 대사·행동·묘사를 반복 출력하지 말것`

const NOVEL_CLOSING_KO = `[최우선 준수]
- 반드시 한국어로만 응답
- 분석·계획·메타 주석을 절대 미출력
- 장면·대사·행동으로 바로 시작
- 유저에게 선택지·진행자식 질문을 제시 금지
- 페르소나의 중대한 선택(방향 전환, 고백, 결별 등)을 유저 입력 없이 임의 확정 금지
- 캐릭터는 자신의 말과 행동만 수행 후 장면을 자연스럽게 이어가야함
- 묘사·행동·대사를 포함해 충분히 풍부하게 작성할 것
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
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
          background: 'var(--chrome-bg)', border: '1px solid var(--chrome-border)',
          padding: '8px 10px', fontSize: 10, color: 'var(--ink)', whiteSpace: 'pre',
          lineHeight: 1.7, zIndex: 999, minWidth: 260, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>{text}</div>
      )}
    </span>
  )
}

function ReadonlyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="label">{label} <span className="tiny muted">(코드 고정 — 이름 치환 포함)</span></div>
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
  const [roleplayRules, setRoleplayRules] = useState('')
  const [roleplayClosing, setRoleplayClosing] = useState('')
  const [novelRules, setNovelRules] = useState('')
  const [novelClosing, setNovelClosing] = useState('')
  const [storyRules, setStoryRules] = useState('')
  const [storyClosing, setStoryClosing] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/admin/config').then((data: Record<string, string>) => {
      setGlobalRules(data.global_rules ?? '')
      setRoleplayRules(data.roleplay_rules ?? '')
      setRoleplayClosing(data.roleplay_closing ?? '')
      setNovelRules(data.novel_rules ?? '')
      setNovelClosing(data.novel_closing ?? '')
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
        roleplay_rules: roleplayRules,
        roleplay_closing: roleplayClosing,
        novel_rules: novelRules,
        novel_closing: novelClosing,
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
                공통 규칙 → 유저 개인 설정 → 기본 규칙(코드 고정) → 추가 규칙 → 유저 페르소나 → 현재 에피소드 상태 → 캐릭터 설정 → 시나리오 배경 → 예시 대화 → 로어북 → 장기 메모리 → 핵심 메모리 → 최종 강조 규칙(DB)
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

            {/* 롤플레이 */}
            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>⚔ 롤플레이 모드</div>
              <ReadonlyBlock label="기본 규칙" text={ROLEPLAY_BASE_READONLY} />
              <div>
                <label className="label">추가 규칙 <span className="tiny muted">(기본 규칙 바로 뒤 삽입 — 비워두면 생략)</span></label>
                <textarea className="field" rows={3}
                  placeholder="예: 캐릭터는 절대 자신이 AI임을 밝히지 않습니다."
                  value={roleplayRules} onChange={e => setRoleplayRules(e.target.value)} />
              </div>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>최종 강조 규칙 (roleplay_closing) <span className="tiny muted">— 핵심 메모리 바로 뒤, 맨 마지막 삽입</span><Tooltip text={ROLEPLAY_CLOSING_KO} /></label>
                <textarea className="field" rows={8}
                  placeholder="응답 통제 규칙, 출력 규칙 등 마지막에 강조할 지침을 입력하세요."
                  value={roleplayClosing} onChange={e => setRoleplayClosing(e.target.value)} />
              </div>
            </div>

            {/* 소설 */}
            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>✍ 소설 모드</div>
              <ReadonlyBlock label="기본 규칙" text={NOVEL_BASE_READONLY} />
              <div>
                <label className="label">추가 규칙 <span className="tiny muted">(기본 규칙 바로 뒤 삽입 — 비워두면 생략)</span></label>
                <textarea className="field" rows={3}
                  placeholder="예: 장면은 500자 이내로 간결하게 작성합니다."
                  value={novelRules} onChange={e => setNovelRules(e.target.value)} />
              </div>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>최종 강조 규칙 (novel_closing) <span className="tiny muted">— 핵심 메모리 바로 뒤, 맨 마지막 삽입</span><Tooltip text={NOVEL_CLOSING_KO} /></label>
                <textarea className="field" rows={8}
                  placeholder="소설 모드 응답 통제 및 출력 규칙을 입력하세요."
                  value={novelClosing} onChange={e => setNovelClosing(e.target.value)} />
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
