'use client'
import { useState } from 'react'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

export default function AdminPromptsPage() {
  const [activeTab, setActiveTab] = useState<'story' | 'multiStory'>('story')

  // buildStoryBaseRules(charName, personaName) — ${charName}/${personaName}은 실행 시 실제 이름으로 치환됨
  const STORY_BASE_RULES_TEMPLATE = `You are an interactive story writer. Follow the format below strictly in every response.

[Output Format]
- Scene narration/setting/action: plain text without a speaker name.
- Dialogue: always use the format Name : "content" (e.g.: \${charName} : "Hello.")
- Inner thoughts: always use the format Name : 'content' (e.g.: \${charName} : 'I wonder what kind of person this is...')
- Secondary characters also follow the same Name : "dialogue" format.
- Before the choices, \${charName} must take direct action and deliver at least one line of dialogue or inner monologue.
- Do not push \${charName}'s words or actions into the choices. \${charName}'s reaction must already be shown in the body.
- At the end, always place a "---" divider, then list 4 numbered choices for \${personaName}.
- Choices 1–3: \${personaName}'s next action or dialogue candidates. (e.g.: 1. \${personaName} : "The view was actually nice.")
- Choice 4: a natural next-step action that advances the scene one stage forward — not dialogue or emotional expression.
- Do not include \${charName}'s name, dialogue, actions, emotions, or decisions in the choices.
- FORBIDDEN: Writing \${personaName}'s new words, actions, emotions, or decisions in the body.
- FORBIDDEN: Writing dialogue without a speaker name. Never include meta choices like "Free input".

[Output Example]
Inside the dark observatory, only starlight illuminated her face.

\${charName} : "Did you wait long?"
\${charName} : 'I wonder what kind of person this is.'

---
1. \${personaName} : "The view was actually nice."
2. \${personaName} : "Honestly… I was a little worried."
3. Silently take a seat next to her.
4. Gently place your hand over hers.`

  return (
    <Win title="관리자 — 프롬프트 조립 흐름" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/prompts" />
        
        {/* Mode Selector Tabs */}
        <div className="hstack" style={{ gap: 4, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'story', label: '스토리 모드' },
            { id: 'multiStory', label: '멀티스토리 모드' },
          ].map(t => (
            <button
              key={t.id}
              className={`btn ${activeTab === t.id ? 'primary' : 'ghost'}`}
              style={{ padding: '4px 12px', fontSize: 11 }}
              onClick={() => setActiveTab(t.id as any)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Dynamic Prompt Pipeline Display */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          <div className="tiny muted" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 8 }}>
            이 탭은 Next.js 서버에서 AI API를 호출하기 전에 개별 변수 및 규칙들을 조합하는 <strong>프롬프트 파이프라인</strong>의 최종 흐름을 표시합니다.
            <br />
            정의 위치: <code style={{ color: 'var(--primary)' }}>apps/web/lib/systemPrompt.ts</code> 내의 각 조립 함수
          </div>

          {activeTab === 'story' && (
            <>
              <PromptStep
                step="0"
                title="공통 및 개인 지침"
                vars="globalRules + personalRules"
                desc="플랫폼 전역 공통 규칙과 유저의 개인 프롬프트 프리셋입니다. story 모드에서는 활성화된 PromptPreset(mode='story')이 personalRules로 삽입됩니다."
                source="globalRules: DB GlobalConfig ('global_rules') | personalRules: DB PromptPreset (mode='story', enabled 항목을 순서대로 합산)"
              />
              <PromptStep
                step="1"
                title="스토리 기본 규칙 (buildStoryBaseRules)"
                vars="buildStoryBaseRules(charName, personaName)"
                desc="선택지 4개 포맷, '---' 구분선, 본문에서 캐릭터 반응 의무 등의 영어 규칙을 캐릭터명·페르소나명으로 치환하며 빌드하는 함수입니다."
                source="hardcoded function: apps/web/lib/systemPrompt.ts — buildStoryBaseRules()"
                code={STORY_BASE_RULES_TEMPLATE}
              />
              <PromptStep
                step="2"
                title="스타일 지시 (선택)"
                vars="styleConfig"
                desc="대화방에서 유저가 설정한 시점, 시제, 분위기, 문체, 응답 길이, 전개 속도입니다. 설정하지 않으면 생략됩니다."
                source="styleConfig: DB Conversation.styleConfig (buildStyleSection()으로 조립)"
              />
              <PromptStep
                step="3"
                title="스토리 모드 추가 규칙"
                vars="modeRules"
                desc="관리자가 전역 설정에서 입력하는 스토리 전용 추가 지침입니다. 비워두면 생략됩니다."
                source="modeRules: DB GlobalConfig ('story_rules')"
              />
              <PromptStep
                step="4"
                title="유저 역할 설정"
                vars="personaCharacter"
                desc="유저가 대화방에서 선택한 자신의 캐릭터 프로필입니다. 스토리 모드에서는 '[유저 역할]' 헤더로 삽입됩니다."
                source="personaCharacter: DB Character (이름, 태그, additionalInfo)"
              />
              <PromptStep
                step="5"
                title="캐릭터 설정 및 시나리오 배경"
                vars="character + scenarioDescription"
                desc="AI 캐릭터 카드와 시나리오 배경입니다."
                source="character: DB Character | scenarioDescription: DB Conversation.scenarioDescription"
              />
              <PromptStep
                step="6"
                title="대화 예시 (Few-shot)"
                vars="character.exampleDialogues"
                desc="캐릭터 말투 파악을 위한 예시 대화 로그입니다."
                source="exampleDialogues: DB Character.exampleDialogues"
              />
              <PromptStep
                step="7"
                title="최종 강조 규칙 (closingRules)"
                vars="closingRules"
                desc="시스템 프롬프트 맨 마지막에 삽입되는 DB 편집 가능 규칙입니다. 관리자 전역 설정에서 편집 가능."
                source="closingRules: DB GlobalConfig ('story_closing')"
              />
              <PromptStep
                step="※"
                title="가변 상태 주입 (buildVolatileStateBlock — 마지막 user 턴)"
                vars="statusTimeline + statsConfig + inventory + lorebook + longTermMemory + coreMemory"
                desc="매 턴 바뀌는 상태·기억 블록입니다. 시스템 프롬프트가 아니라 마지막 user 턴 맨 앞에 주입됩니다 — 시스템 프롬프트와 앞선 히스토리를 바이트 고정으로 유지해 Gemini implicit cache에 적중시키기 위함입니다."
                source="statusTimeline/statsConfig/inventory/coreMemory: DB Conversation | lorebooks: DB Lorebook | longTermMemory: DB Memory (RAG 상위 6건)"
              />
            </>
          )}

          {activeTab === 'multiStory' && (
            <>
              <PromptStep
                step="0"
                title="공통 및 개인 지침"
                vars="globalRules + personalRules"
                desc="플랫폼 전역 공통 규칙과 유저의 개인 프롬프트 프리셋입니다. multiStory 모드에서는 활성화된 PromptPreset(mode='multiStory')이 personalRules로 삽입됩니다."
                source="globalRules: DB GlobalConfig ('global_rules') | personalRules: DB PromptPreset (mode='multiStory', enabled 항목을 순서대로 합산)"
              />
              <PromptStep
                step="1"
                title="멀티스토리 기본 규칙 (buildMultiStorySystemPrompt)"
                vars="baseRules"
                desc="선택지 4개가 있는 다중 캐릭터 인터랙티브 스토리 규칙입니다. Name : 대사 형식, 말투 고정 규칙을 포함합니다."
                source="hardcoded function: apps/web/lib/systemPrompt.ts — buildMultiStorySystemPrompt()"
              />
              <PromptStep
                step="2"
                title="스타일 지시 (선택)"
                vars="styleConfig"
                desc="대화방에서 유저가 설정한 시점, 시제, 분위기, 문체, 응답 길이, 전개 속도입니다. 설정하지 않으면 생략됩니다."
                source="styleConfig: DB Conversation.styleConfig (buildStyleSection()으로 조립)"
              />
              <PromptStep
                step="3"
                title="멀티스토리 추가 규칙"
                vars="modeRules"
                desc="관리자가 전역 설정에서 입력하는 멀티스토리 전용 추가 지침입니다. 비워두면 생략됩니다."
                source="modeRules: DB GlobalConfig ('multiStory_rules')"
              />
              <PromptStep
                step="4"
                title="유저 페르소나 설정"
                vars="personaCharacter"
                desc="유저가 대화방에서 선택한 자신의 캐릭터 프로필입니다. '[{personaName} 설정]' 헤더로 삽입됩니다."
                source="personaCharacter: DB Character (이름, 태그, additionalInfo)"
              />
              <PromptStep
                step="5"
                title="각 캐릭터 설정 + 예시 대화"
                vars="characters[] + exampleDialogues[]"
                desc="등록된 캐릭터 수만큼 반복 삽입됩니다. 각 캐릭터의 '[{charName} 설정]'과 '[{charName} 예시 대화]'가 쌍으로 들어갑니다."
                source="characters: DB Character[] (대화방 연결 캐릭터 전체)"
              />
              <PromptStep
                step="6"
                title="시나리오 배경"
                vars="scenarioDescription"
                desc="해당 대화방의 시나리오 배경입니다."
                source="scenarioDescription: DB Conversation.scenarioDescription"
              />
              <PromptStep
                step="7"
                title="최종 강조 규칙 (closingRules)"
                vars="closingRules"
                desc="시스템 프롬프트 맨 마지막에 삽입되는 DB 편집 가능 규칙입니다. 관리자 전역 설정에서 편집 가능."
                source="closingRules: DB GlobalConfig ('multiStory_closing')"
              />
              <PromptStep
                step="※"
                title="가변 상태 주입 (buildVolatileStateBlock — 마지막 user 턴)"
                vars="statusTimeline + statsConfig + inventory + lorebook + longTermMemory + coreMemory"
                desc="매 턴 바뀌는 상태·기억 블록입니다. 시스템 프롬프트가 아니라 마지막 user 턴 맨 앞에 주입됩니다 — 시스템 프롬프트와 앞선 히스토리를 바이트 고정으로 유지해 Gemini implicit cache에 적중시키기 위함입니다."
                source="statusTimeline/statsConfig/inventory/coreMemory: DB Conversation | lorebooks: DB Lorebook | longTermMemory: DB Memory (RAG 상위 6건)"
              />
            </>
          )}

        </div>
      </div>
    </Win>
  )
}

interface PromptStepProps {
  step: string
  title: string
  vars: string
  desc: string
  source: string
  code?: string
}

function PromptStep({ step, title, vars, desc, source, code }: PromptStepProps) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ border: '1px solid var(--chrome-border)', background: 'var(--pane)', display: 'flex', flexDirection: 'column' }}>
      <div 
        style={{ padding: '8px 12px', background: 'var(--title-bg)', color: 'var(--title-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(!open)}
      >
        <div className="hstack" style={{ gap: 8 }}>
          <span style={{ fontWeight: 700, opacity: 0.8 }}>[{step}]</span>
          <span style={{ fontWeight: 700 }}>{title}</span>
          <span style={{ fontSize: 9, opacity: 0.75, fontFamily: 'monospace' }}>({vars})</span>
        </div>
        <div style={{ fontSize: 10 }}>{open ? '▲ 닫기' : '▼ 펼치기'}</div>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="tiny" style={{ lineHeight: 1.4 }}>{desc}</div>
        <div className="tiny muted" style={{ fontSize: 9, fontFamily: 'monospace' }}>출처: {source}</div>
        {open && code && (
          <pre style={{ margin: '6px 0 0 0', padding: 8, background: '#1e1e1e', color: '#d4d4d4', overflowX: 'auto', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', border: '1px solid #333' }}>
            {code}
          </pre>
        )}
      </div>
    </div>
  )
}
