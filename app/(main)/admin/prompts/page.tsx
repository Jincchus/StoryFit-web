'use client'
import { useState } from 'react'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

export default function AdminPromptsPage() {
  const [activeTab, setActiveTab] = useState<'roleplay' | 'novel' | 'story' | 'multiStory'>('roleplay')

  // Current prompt texts from systemPrompt.ts (English)
  const BASE_RULES = `You are a novel-style roleplay AI. Always follow the output format below.

[Output Format]
- Actions/narration/description: plain text without quotes (e.g.: She gazed out the window.)
- Spoken dialogue: always wrap in double quotes ("") (e.g.: "I'm a doctor. Nice to meet you.")
- Inner thoughts/monologue: always wrap in single quotes ('') (e.g.: 'I wonder what kind of person this is.')

Never write spoken dialogue without double quotes. Every spoken line must be wrapped in double quotes without exception.
Maintain the character's perspective consistently and portray their personality, speech style, and worldview coherently.

[Character Voice — STRICT]
- The character's speech style, tone, and verbal habits defined in the character profile are PERMANENT. They must never drift, soften, or change regardless of conversation length.
- FORBIDDEN: Replacing the character's defined speech pattern with a generic or neutral tone as the conversation progresses.
- If the character uses a specific sentence-ending (e.g., ~다냥, ~이에요, ~ㄴ데?), it must appear in every single line of dialogue without exception.

[No Excessive Ellipsis]
- FORBIDDEN: Using "..." more than once per response.
- FORBIDDEN: Starting or ending dialogue with "...".
- Silence, hesitation, or pause must be expressed through action descriptions (e.g.: She averted her eyes.) not "...".

[No Repetition]
- Do not reuse vocabulary, sentence structures, or action descriptions from the previous response.
- Never end responses with questions, preachy remarks, or host-like prompts.
- Use varied vocabulary and fresh action descriptions each turn for natural story flow.

[Scene Continuity]
- Always reflect the current physical state of the scene: time of day, clothing, location, and any changes that occurred in previous turns.
- FORBIDDEN: Reverting to initial setup details (outfit, time, place) that have already changed in the story.

[Anti-Hallucination]
- Do not fabricate facts not established in the character profile or prior conversation.
- Do not output content that contradicts established facts or states from previous exchanges.

- FORBIDDEN: Offering choices or asking "What would you like to do?" style questions. The character judges and acts on their own, driving the scene.
- Response length: Write each response richly with narration, action, and dialogue.
- User agency: Only treat explicitly input user actions/dialogue/emotions/decisions as confirmed.`

  // buildNovelSystemPrompt()에서 앞에 동적 헤더("당신은 소설 작가입니다. {personaName}과 {characterName}이...")가 삽입된 후 아래 NOVEL_BASE_RULES가 이어집니다
  const NOVEL_BASE_RULES = `You are a novelist. Always follow the output format below:
- Narration/action/setting: plain text without a speaker name (e.g.: Rain tapped against the window.)
- Dialogue: always use the format Name : "content" (e.g.: CharacterName : "Hello.")
- Inner thoughts: always use the format Name : 'content' (e.g.: PersonaName : 'Why am I so nervous...')
- Secondary characters also follow the same Name : "dialogue" format.
- Write scenes where characters interact naturally based on the user's scene direction.

[Character Voice — STRICT]
- Each character's speech style and verbal habits defined in their profile are PERMANENT throughout all scenes.
- FORBIDDEN: Replacing a character's defined speech pattern with a generic tone as the story progresses.

[No Excessive Ellipsis]
- FORBIDDEN: Using "..." more than once per response.
- Hesitation or pause must be expressed through action descriptions, not "...".

[No Repetition]
- Do not reuse specific vocabulary, grammatical structures, or descriptive patterns from the previous response.

[Scene Continuity]
- Always reflect current physical states: time of day, clothing, location, and prior scene changes.
- FORBIDDEN: Reverting to initial setup details that have already changed in the narrative.

[Anti-Hallucination]
- Do not fabricate facts that contradict the character profiles or world settings.

- FORBIDDEN: Writing dialogue without a speaker name (e.g.: "Hello." alone). Every line of dialogue must follow the Name : "content" format without exception.`

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
            { id: 'roleplay', label: '롤플레이 모드' },
            { id: 'novel', label: '소설 모드' },
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

          {activeTab === 'roleplay' && (
            <>
              <PromptStep
                step="0"
                title="공통 및 개인 지침"
                vars="globalRules + personalRules"
                desc="플랫폼 전역 공통 규칙(global_rules)과 유저의 개인 프롬프트 프리셋입니다. roleplay/novel 모드에서는 personalRules가 항상 빈 값입니다 (PromptPreset은 story/multiStory 모드에서만 활성화)."
                source="globalRules: DB GlobalConfig ('global_rules') | personalRules: 항상 '' (roleplay 모드는 PromptPreset 미사용)"
              />
              <PromptStep
                step="1"
                title="롤플레이 기본 규칙 (BASE_RULES)"
                vars="BASE_RULES"
                desc="따옴표 출력 형식, 말투 고정, 말줄임표 금지, 반복 금지, 장면 연속성, 날조 방지 규칙입니다. 영어로 작성된 코드 고정 블록입니다."
                source="hardcoded: apps/web/lib/systemPrompt.ts — BASE_RULES"
                code={BASE_RULES}
              />
              <PromptStep
                step="2"
                title="스타일 지시 (선택)"
                vars="styleConfig"
                desc="대화방에서 유저가 설정한 시점(1인칭/3인칭), 시제, 분위기, 문체, 응답 길이, 전개 속도 설정입니다. 설정하지 않으면 이 블록은 생략됩니다."
                source="styleConfig: DB Conversation.styleConfig (buildStyleSection()으로 조립)"
                code={`[스타일 지시]\n- 시점: 1인칭 / 3인칭\n- 시제: 현재형 / 과거형\n- 분위기: 밝음 / 어두움 / 중립\n- 문체: 문학적 / 일상적 / 극적\n- 응답 길이: 짧게 / 보통 / 길게\n- 전개 속도: 빠름 / 보통 / 느림`}
              />
              <PromptStep
                step="3"
                title="롤플레이 추가 규칙"
                vars="modeRules"
                desc="관리자가 전역 설정에서 입력하는 롤플레이 전용 추가 지침입니다. 비워두면 생략됩니다."
                source="modeRules: DB GlobalConfig ('roleplay_rules')"
              />
              <PromptStep
                step="4"
                title="유저 페르소나 설정"
                vars="personaCharacter"
                desc="유저가 대화방에서 선택한 자신의 캐릭터(페르소나) 프로필입니다. 설정하지 않으면 생략됩니다."
                source="personaCharacter: DB Character (이름, 태그, additionalInfo)"
                code={`[유저 페르소나]\n이름: \${personaCharacter.name}\n태그: \${personaCharacter.tags.join(', ')}\n\${personaCharacter.additionalInfo}`}
              />
              <PromptStep
                step="5"
                title="현재 상태 (Status Timeline)"
                vars="statusTimeline"
                desc="현재 에피소드 위치, 장소, 시점 등 타임라인 상태 기록입니다. 비워두면 생략됩니다."
                source="statusTimeline: DB Conversation.statusTimeline"
              />
              <PromptStep
                step="6"
                title="캐릭터 설정 및 시나리오 배경"
                vars="character + scenarioDescription"
                desc="AI 캐릭터 카드(이름, 성별, 태그, 상세 설명)와 해당 룸의 시나리오 배경입니다."
                source="character: DB Character | scenarioDescription: DB Conversation.scenarioDescription"
              />
              <PromptStep
                step="7"
                title="대화 예시 (Few-shot)"
                vars="character.exampleDialogues"
                desc="AI 모델이 캐릭터의 성격과 말투를 파악할 수 있도록 돕는 예시 대화 로그입니다. 비워두면 생략됩니다."
                source="exampleDialogues: DB Character.exampleDialogues"
              />
              <PromptStep
                step="8"
                title="로어북 (Lorebook)"
                vars="lorebook"
                desc="최근 메시지에서 키워드가 스캔되면 동적 활성화되는 세계관 설정 항목입니다. 우선순위 내림차순 정렬 후 1,000토큰 초과 시 이후 항목 제외."
                source="lorebooks: DB Lorebook (matchLorebook()으로 키워드 스캔)"
              />
              <PromptStep
                step="9"
                title="장기 메모리 요약"
                vars="longTermMemory"
                desc="15턴 이전 대화들의 3~5줄 요약 아카이브입니다. 유사도 검색 결과 + 최신 2개 요약이 시간순으로 합쳐집니다."
                source="longTermMemory: DB Memory (retrieveRelevantMemories()로 로딩)"
              />
              <PromptStep
                step="10"
                title="핵심 메모리 (Core Memory)"
                vars="coreMemory"
                desc="절대 잊으면 안 되는 관계 설정이나 장기 설정을 유저가 직접 기입하는 란입니다. longTermMemory 바로 뒤, closingRules 직전에 삽입됩니다."
                source="coreMemory: DB Conversation.coreMemory"
              />
              <PromptStep
                step="11"
                title="최종 강조 규칙 (closingRules)"
                vars="closingRules"
                desc="시스템 프롬프트 맨 마지막에 삽입되는 DB 편집 가능 규칙입니다. 응답 통제, 출력 형식 강제 등을 기입합니다. 관리자 전역 설정에서 편집 가능. 비워두면 생략."
                source="closingRules: DB GlobalConfig ('roleplay_closing')"
              />
            </>
          )}

          {activeTab === 'novel' && (
            <>
              <PromptStep
                step="0"
                title="공통 및 개인 지침"
                vars="globalRules + personalRules"
                desc="플랫폼 전역 공통 규칙과 유저의 개인 프롬프트 프리셋입니다. roleplay/novel 모드에서는 personalRules가 항상 빈 값입니다."
                source="globalRules: DB GlobalConfig ('global_rules') | personalRules: 항상 '' (novel 모드는 PromptPreset 미사용)"
              />
              <PromptStep
                step="1"
                title="소설 기본 규칙 (buildNovelSystemPrompt)"
                vars="novelBase + NOVEL_BASE_RULES"
                desc='buildNovelSystemPrompt()에서 "당신은 소설 작가입니다. {personaName}과 {characterName}이 주인공으로 등장하는 장면을 써주세요." 동적 헤더를 앞에 붙인 후 NOVEL_BASE_RULES가 이어집니다. 이름 : "대사" 포맷 규칙과 말투/반복/장면 연속성 규칙이 포함됩니다.'
                source="hardcoded: apps/web/lib/systemPrompt.ts — NOVEL_BASE_RULES + buildNovelSystemPrompt()"
                code={NOVEL_BASE_RULES}
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
                title="소설 모드 추가 규칙"
                vars="modeRules"
                desc="관리자가 전역 설정에서 입력하는 소설 전용 추가 지침입니다. 비워두면 생략됩니다."
                source="modeRules: DB GlobalConfig ('novel_rules')"
              />
              <PromptStep
                step="4"
                title="유저 페르소나 설정"
                vars="personaCharacter"
                desc="유저가 대화방에서 선택한 자신의 캐릭터 프로필입니다. 소설 모드에서는 '[{personaName} 설정]' 헤더로 삽입됩니다."
                source="personaCharacter: DB Character (이름, 태그, additionalInfo)"
              />
              <PromptStep
                step="5"
                title="현재 에피소드 상태"
                vars="statusTimeline"
                desc="현재 에피소드 위치, 장소, 시점 등 타임라인 상태 기록입니다."
                source="statusTimeline: DB Conversation.statusTimeline"
              />
              <PromptStep
                step="6"
                title="캐릭터 설정 및 시나리오 배경"
                vars="character + scenarioDescription"
                desc="AI 캐릭터 프로필('[{charName} 설정]' 헤더)과 시나리오 배경입니다."
                source="character: DB Character | scenarioDescription: DB Conversation.scenarioDescription"
              />
              <PromptStep
                step="7"
                title="대화 예시 (Few-shot)"
                vars="character.exampleDialogues"
                desc="캐릭터 말투 파악을 위한 예시 대화 로그입니다. '[예시 대화 (참고용)]' 헤더로 삽입됩니다."
                source="exampleDialogues: DB Character.exampleDialogues"
              />
              <PromptStep
                step="8"
                title="로어북 & 장기 메모리 요약"
                vars="lorebook + longTermMemory"
                desc="키워드 스캔 기반 세계관 정보(최대 1,000토큰)와 장기 대화 요약 아카이브입니다."
                source="lorebooks: DB Lorebook | longTermMemory: DB Memory"
              />
              <PromptStep
                step="9"
                title="핵심 메모리 (Core Memory)"
                vars="coreMemory"
                desc="절대 잊으면 안 되는 설정을 유저가 직접 기입하는 란입니다. longTermMemory 바로 뒤에 삽입됩니다."
                source="coreMemory: DB Conversation.coreMemory"
              />
              <PromptStep
                step="10"
                title="최종 강조 규칙 (closingRules)"
                vars="closingRules"
                desc="시스템 프롬프트 맨 마지막에 삽입되는 DB 편집 가능 규칙입니다. 관리자 전역 설정에서 편집 가능."
                source="closingRules: DB GlobalConfig ('novel_closing')"
              />
            </>
          )}

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
                title="현재 상태 (statusTimeline + 스탯·인벤토리)"
                vars="statusTimeline + statsConfig + inventory"
                desc="에피소드 상태 기록이며, 스탯(있을 경우)과 인벤토리(있을 경우)도 이 단계에서 삽입됩니다."
                source="statusTimeline/statsConfig/inventory: DB Conversation"
              />
              <PromptStep
                step="6"
                title="캐릭터 설정 및 시나리오 배경"
                vars="character + scenarioDescription"
                desc="AI 캐릭터 카드와 시나리오 배경입니다."
                source="character: DB Character | scenarioDescription: DB Conversation.scenarioDescription"
              />
              <PromptStep
                step="7"
                title="대화 예시 (Few-shot)"
                vars="character.exampleDialogues"
                desc="캐릭터 말투 파악을 위한 예시 대화 로그입니다."
                source="exampleDialogues: DB Character.exampleDialogues"
              />
              <PromptStep
                step="8"
                title="로어북 & 장기 메모리 요약"
                vars="lorebook + longTermMemory"
                desc="키워드 스캔 기반 세계관 정보(최대 1,000토큰)와 장기 대화 요약 아카이브입니다."
                source="lorebooks: DB Lorebook | longTermMemory: DB Memory"
              />
              <PromptStep
                step="9"
                title="핵심 메모리 (Core Memory)"
                vars="coreMemory"
                desc="절대 잊으면 안 되는 설정을 유저가 직접 기입하는 란입니다. longTermMemory 바로 뒤에 삽입됩니다."
                source="coreMemory: DB Conversation.coreMemory"
              />
              <PromptStep
                step="10"
                title="최종 강조 규칙 (closingRules)"
                vars="closingRules"
                desc="시스템 프롬프트 맨 마지막에 삽입되는 DB 편집 가능 규칙입니다. 관리자 전역 설정에서 편집 가능."
                source="closingRules: DB GlobalConfig ('story_closing')"
              />
            </>
          )}

          {activeTab === 'multiStory' && (
            <>
              <PromptStep
                step="0"
                title="공통 및 개인 지침"
                vars="globalRules + personalRules"
                desc="플랫폼 전역 공통 규칙과 유저의 개인 프롬프트 프리셋입니다. multiStory 모드에서는 활성화된 PromptPreset(mode='multiStory')이 personalRules로 삽입됩니다. tikiTaka도 multiStory로 취급됩니다."
                source="globalRules: DB GlobalConfig ('global_rules') | personalRules: DB PromptPreset (mode='multiStory', enabled 항목을 순서대로 합산)"
              />
              <PromptStep
                step="1"
                title="멀티스토리 기본 규칙 (buildMultiStorySystemPrompt)"
                vars="baseRules (tikiTaka 또는 multiStory 변형)"
                desc="mode='tikiTaka': 선택지 없는 자유형 다중 캐릭터 대화 (FORBIDDEN: --- 구분선 및 선택지). mode='multiStory': 선택지 4개가 있는 다중 캐릭터 인터랙티브 스토리. 두 변형 모두 Name : 대사 형식, 말투 고정 규칙을 포함합니다."
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
                desc="관리자가 전역 설정에서 입력하는 멀티스토리 전용 추가 지침입니다. multiStory/tikiTaka 모두 'roleplay_rules' 키를 공유합니다."
                source="modeRules: DB GlobalConfig ('roleplay_rules') — multiStory/tikiTaka 모드 공유"
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
                title="현재 에피소드 상태 + 스탯·인벤토리"
                vars="statusTimeline + statsConfig + inventory"
                desc="에피소드 타임라인 상태 및 스탯·인벤토리(있을 경우)입니다."
                source="statusTimeline/statsConfig/inventory: DB Conversation"
              />
              <PromptStep
                step="6"
                title="각 캐릭터 설정 + 예시 대화"
                vars="characters[] + exampleDialogues[]"
                desc="등록된 캐릭터 수만큼 반복 삽입됩니다. 각 캐릭터의 '[{charName} 설정]'과 '[{charName} 예시 대화]'가 쌍으로 들어갑니다."
                source="characters: DB Character[] (대화방 연결 캐릭터 전체)"
              />
              <PromptStep
                step="7"
                title="시나리오 배경"
                vars="scenarioDescription"
                desc="해당 대화방의 시나리오 배경입니다."
                source="scenarioDescription: DB Conversation.scenarioDescription"
              />
              <PromptStep
                step="8"
                title="로어북 & 장기 메모리 요약"
                vars="lorebook + longTermMemory"
                desc="키워드 스캔 기반 세계관 정보(최대 1,000토큰)와 장기 대화 요약 아카이브입니다."
                source="lorebooks: DB Lorebook | longTermMemory: DB Memory"
              />
              <PromptStep
                step="9"
                title="핵심 메모리 (Core Memory)"
                vars="coreMemory"
                desc="절대 잊으면 안 되는 설정을 유저가 직접 기입하는 란입니다. longTermMemory 바로 뒤에 삽입됩니다."
                source="coreMemory: DB Conversation.coreMemory"
              />
              <PromptStep
                step="10"
                title="최종 강조 규칙 (closingRules)"
                vars="closingRules"
                desc="시스템 프롬프트 맨 마지막에 삽입되는 DB 편집 가능 규칙입니다. multiStory/tikiTaka 모드는 roleplay_closing 키를 공유합니다."
                source="closingRules: DB GlobalConfig ('roleplay_closing') — multiStory/tikiTaka 모드 공유"
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
