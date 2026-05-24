'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

const BASE_RULES_TEXT = `당신은 소설형 롤플레이 AI입니다. 다음 규칙을 반드시 따르세요:
- 1인칭 캐릭터 시점으로 대화합니다
- 상황 묘사·행동·설명은 따옴표 없이 일반 텍스트로 씁니다 (예: 창문 밖을 바라보았다.)
- 대사(말하는 내용)는 반드시 큰따옴표로 감쌉니다 (예: "안녕하세요.")
- 내면의 생각은 반드시 작은따옴표로 감쌉니다 (예: '이 사람은 좋은 사람 같아.')
- 유저의 입력에 자연스럽게 반응하며 대화를 이어갑니다
- 캐릭터의 성격, 말투, 세계관을 일관되게 유지합니다`

const NOVEL_BASE_TEXT = `당신은 소설 작가입니다. 반드시 다음 출력 형식을 지켜주세요:
- 상황 묘사·행동·배경: 이름 없이 일반 텍스트 (예: 빗소리가 창문을 두드렸다.)
- 대사: [이름] : "내용" (예: 캐릭터명 : "안녕하세요.")
- 내면 생각: [이름] : '내용' (예: 페르소나명 : '왜 이렇게 떨리지...')
- 사용 가능한 이름은 지정된 두 인물뿐입니다
- 유저의 장면 지시를 바탕으로 두 인물이 자연스럽게 상호작용하는 장면을 만들어주세요`

const STORY_BASE_TEXT = `당신은 인터랙티브 스토리 작가입니다. 매 응답마다 반드시 아래 형식을 지켜주세요.
- 장면 묘사·배경·행동: 이름 없이 일반 텍스트로 작성합니다.
- 대사: 반드시 "이름 : \\"내용\\"" 형식으로 작성합니다. (예: 캐릭터명 : "안녕하세요.")
- 내면 생각: 반드시 "이름 : '내용'" 형식으로 작성합니다. (예: 캐릭터명 : '왜 이렇게 떨리지...')
- 마지막에 반드시 "---" 구분선을 넣고, 그 아래에 유저가 선택할 수 있는 선택지 2~3개를 번호로 나열합니다.
- 선택지는 반드시 유저의 행동이나 대사여야 합니다. "직접 입력" 같은 메타 선택지는 절대 포함하지 마세요.`

function ReadonlyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="label">{label} <span className="tiny muted">(수정 불가 — 코드에 고정됨)</span></div>
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
  const [novelRules, setNovelRules] = useState('')
  const [storyRules, setStoryRules] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/admin/config').then((data: Record<string, string>) => {
      setGlobalRules(data.global_rules ?? '')
      setRoleplayRules(data.roleplay_rules ?? '')
      setNovelRules(data.novel_rules ?? '')
      setStoryRules(data.story_rules ?? '')
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await api.patch('/api/admin/config', {
        global_rules: globalRules,
        roleplay_rules: roleplayRules,
        novel_rules: novelRules,
        story_rules: storyRules,
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
                플랫폼 공통 규칙 → 기본 규칙(고정) → 모드별 추가 규칙 → 유저 페르소나 → 핵심 메모리 → 타임라인 → 캐릭터 설정 → 예시 대화 → 로어북 → 장기 메모리
              </div>
            </div>

            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>공통</div>
              <div>
                <label className="label">플랫폼 공통 규칙 <span className="tiny muted">(모든 모드 맨 앞에 삽입)</span></label>
                <textarea className="field" rows={4}
                  placeholder={"예: 이 플랫폼은 순수한 픽션 기반 서비스입니다.\n실제 인물, 정치적 발언은 다루지 않습니다."}
                  value={globalRules} onChange={e => setGlobalRules(e.target.value)} />
              </div>
            </div>

            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>⚔ 롤플레이 모드</div>
              <ReadonlyBlock label="기본 규칙 (고정)" text={BASE_RULES_TEXT} />
              <div>
                <label className="label">추가 규칙 <span className="tiny muted">(기본 규칙 바로 뒤에 삽입)</span></label>
                <textarea className="field" rows={4}
                  placeholder={"예: 캐릭터는 절대 자신이 AI임을 밝히지 않습니다."}
                  value={roleplayRules} onChange={e => setRoleplayRules(e.target.value)} />
              </div>
            </div>

            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>✍ 소설 모드</div>
              <ReadonlyBlock label="기본 규칙 (고정)" text={NOVEL_BASE_TEXT} />
              <div>
                <label className="label">추가 규칙 <span className="tiny muted">(기본 규칙 바로 뒤에 삽입)</span></label>
                <textarea className="field" rows={4}
                  placeholder={"예: 장면은 500자 이내로 간결하게 작성합니다."}
                  value={novelRules} onChange={e => setNovelRules(e.target.value)} />
              </div>
            </div>

            <div className="vstack" style={{ gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>📖 스토리 모드</div>
              <ReadonlyBlock label="기본 규칙 (고정)" text={STORY_BASE_TEXT} />
              <div>
                <label className="label">추가 규칙 <span className="tiny muted">(기본 규칙 바로 뒤에 삽입)</span></label>
                <textarea className="field" rows={4}
                  placeholder={"예: 선택지는 항상 3개로 유지합니다.\n장면은 300자 이내로 간결하게 작성합니다."}
                  value={storyRules} onChange={e => setStoryRules(e.target.value)} />
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
