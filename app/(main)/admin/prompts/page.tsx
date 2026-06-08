'use client'
import { useState } from 'react'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

export default function AdminPromptsPage() {
  const [activeTab, setActiveTab] = useState<'roleplay' | 'novel' | 'story'>('roleplay')

  // Hardcoded prompt strings to show in the UI for inspection
  const BASE_RULES = `당신은 소설형 롤플레이 AI입니다. 반드시 아래 출력 형식을 지켜주세요.

[출력 형식]
- 행동·상황·묘사: 따옴표 없이 일반 텍스트 (예: 창문 밖을 바라보았다.)
- 캐릭터가 입으로 말하는 대사: 반드시 큰따옴표("") 안에 작성 (예: "저는 의사입니다. 잘 부탁드립니다.")
- 캐릭터의 내면 생각·독백: 반드시 작은따옴표('') 안에 작성 (예: '이 분은 어떤 사람일까.')

큰따옴표 없이 대사를 작성하지 마세요. 캐릭터가 말하는 모든 문장은 예외 없이 큰따옴표로 감싸야 합니다.
1인칭 캐릭터 시점을 유지하며 캐릭터의 성격·말투·세계관을 일관되게 유지합니다.

[말투 및 중복 표현 절대 금지]
- 직전 답변에서 사용한 어휘, 문장 구조, 행동 묘사를 바로 다음 응답에서 연속해서 반복하지 마세요.
- 매 응답 끝마다 질문을 던지거나 교훈적인 설교조, 진행자 같은 말투로 대화를 마무리하는 것을 강력히 금지합니다.
- 자연스러운 이야기 흐름을 위해 매번 다양한 어휘와 새로운 행동 묘사를 사용하세요.

[정보 왜곡 금지 (Anti-hallucination)]
- 캐릭터 설정 및 이전 대화에서 확정되지 않은 사실을 마음대로 날조하거나 꾸며내어 말하지 마세요.
- 이전 대화에서 성립된 팩트나 상태와 모순되는 내용을 출력하지 마세요.

⚠️ 절대 금지: 유저에게 선택지를 제시하거나 "어떻게 하시겠습니까?", "선택해주세요" 등의 형식으로 묻는 행위. 캐릭터가 스스로 판단하고 행동하며 장면을 주도합니다.
⚠️ 응답 분량: 묘사·행동·대사를 포함해 매 응답을 충분히 풍부하게 작성합니다. 이전 응답보다 현저히 짧아지지 않도록 유지하세요.
⚠️ 유저 행동 보호: 유저의 행동·대사·감정·결정은 유저가 직접 입력한 내용만 확정된 것으로 취급합니다. 캐릭터는 자신의 감정과 행동으로 장면을 이끌되, 유저의 다음 반응은 유저에게 맡기세요.`;

  const NOVEL_BASE_RULES = `당신은 소설 작가입니다. 반드시 다음 출력 형식을 지켜주세요:
- 상황 묘사·행동·배경: 이름 없이 일반 텍스트 (예: 빗소리가 창문을 두드렸다.)
- 대사: 반드시 "이름 : \\"내용\\"" 형식 (예: 캐릭터명 : "안녕하세요.")
- 내면 생각: 반드시 "이름 : '내용'" 형식 (예: 페르소나명 : '왜 이렇게 떨리지...')
- 주요 인물 외 제3의 인물도 동일한 이름 : "대사" 형식으로 표현하세요
- 유저의 장면 지시를 바탕으로 인물들이 자연스럽게 상호작용하는 장면을 만들어주세요

[중복 표현 절대 금지]
- 직전 대화나 답변에서 사용한 특정 어휘, 문법 구조, 묘사 방식을 반복하여 쓰지 마세요. 문장을 다채롭고 문학적으로 구성하세요.

[정보 왜곡 금지 (Anti-hallucination)]
- 인물 설정 및 세계관 설정에 부합하지 않는 임의의 사실을 꾸며내지 마세요.

⚠️ 절대 금지: 이름 없이 "대사만 쓰는 것" (예: "안녕하세요." 단독 사용). 모든 대사는 반드시 이름 : "내용" 형식이어야 합니다.`;

  const STORY_BASE_RULES_TEMPLATE = `당신은 인터랙티브 스토리 작가입니다. 매 응답마다 반드시 아래 형식을 지켜주세요.

[출력 형식]
- 장면 묘사·배경·행동: 이름 없이 일반 텍스트로 작성합니다.
- 대사: 반드시 "이름 : \\"내용\\"" 형식으로 작성합니다. (예: \${charName} : "안녕하세요.")
- 내면 생각: 반드시 "이름 : '내용'" 형식으로 작성합니다. (예: \${charName} : '왜 이렇게 떨리지...')
- \${charName} 외 제3의 인물이 등장하더라도 동일한 이름 : "대사" 형식으로 표현하세요.
- 선택지 앞의 본문에서 \${charName}은 반드시 직접 행동하고 최소 1회 이상 대사나 내면 독백을 출력해야 합니다.
- \${charName}이 할 말과 행동을 선택지로 넘기지 마세요. \${charName}의 반응은 본문에서 이미 진행된 상태여야 합니다.
- 마지막에 반드시 "---" 구분선을 넣고, 그 아래에 유저(\${personaName})가 선택할 수 있는 선택지 2~3개를 번호로 나열합니다.
- 선택지 안의 유저 대사 후보는 반드시 "\${personaName} : \\"내용\\"" 형식으로 작성하세요. (예: 1. \${personaName} : "오히려 경치가 좋았어요.")
- 선택지 안에 \${charName}의 이름, 대사, 행동, 감정, 결정을 넣지 마세요. \${charName}이 할 말과 행동은 선택지로 넘기지 말고 본문에서 직접 진행하세요.
- "직접 입력" 같은 메타 선택지는 절대 포함하지 마세요.
⚠️ 절대 금지: 선택지 앞의 본문에서 유저(\${personaName})의 새로운 말, 행동, 감정, 결정을 당신이 임의로 작성하여 확정하지 마세요. 본문은 캐릭터(\${charName})와 제3의 인물의 대사/행동으로만 채워야 합니다.
⚠️ 절대 금지: 이름 없이 "대사만 단독으로 쓰는 것". 장면 안에서 누가 말하든 반드시 이름 : "내용" 형식으로 작성하세요.

[출력 예시]
어두운 천문대 안, 별빛만이 그녀의 얼굴을 비추고 있었다.

\${charName} : "오래 기다렸나요?"
\${charName} : '이 분은 어떤 사람일까.'

---
1. \${personaName} : "오히려 경치가 좋았어요."
2. \${personaName} : "솔직히 말하면… 조금 걱정했어요."
3. 말없이 그녀 옆자리에 앉는다.`;

  const RESPONSE_CONTROL_RULES = `응답 통제 규칙:
- 유저에게 선택지를 제시하지 마세요. 번호 선택지, "어떻게 하시겠습니까?", "선택해주세요", "무엇을 하시겠습니까?" 같은 진행자식 질문으로 끝내지 마세요.
- 유저의 말, 행동, 감정, 결정을 대신 작성하지 마세요. 유저가 직접 입력한 행동과 대사만 확정된 것으로 취급하세요.
- AI 캐릭터는 자기 말과 행동만 직접 수행하고, 장면을 다음 사건으로 자연스럽게 이어가세요.
- 응답은 장면 묘사, 캐릭터 행동, 대사를 포함해 충분히 풍부하게 작성하세요. 짧은 단답이나 급한 마무리는 피하세요.
- 이전 대화를 반복하거나 처음부터 다시 쓰지 말고, 가장 최근 장면 바로 다음부터 이어가세요.`;

  const NOVEL_RESPONSE_CONTROL_RULES = `소설 모드 응답 통제 규칙:
- 유저에게 선택지를 제시하지 마세요. 번호 선택지, 진행자식 질문으로 끝내지 마세요.
- 페르소나의 대사·행동은 유저가 입력했거나 직전 장면에서 자연스럽게 이어지는 경우에만 작성하세요. 페르소나의 중대한 선택(방향 전환, 고백, 결별 등)은 유저 입력 없이 임의로 확정하지 마세요.
- AI 캐릭터는 자기 말과 행동만 직접 수행하고, 장면을 다음 사건으로 자연스럽게 이어가세요.
- 응답은 장면 묘사, 캐릭터 행동, 대사를 포함해 충분히 풍부하게 작성하세요. 짧은 단답이나 급한 마무리는 피하세요.
- 이전 대화를 반복하거나 처음부터 다시 쓰지 말고, 가장 최근 장면 바로 다음부터 이어가세요.`;

  const STORY_RESPONSE_CONTROL_RULES = `스토리 모드 응답 통제 규칙:
- 응답 마지막에 "---" 구분선을 넣고, 유저가 선택할 수 있는 선택지 2~3개를 번호로 제시하세요.
- 선택지는 유저의 다음 행동이나 유저의 다음 대사 후보만 포함하세요.
- 선택지 안에 AI 캐릭터의 이름, 대사, 행동, 감정, 결정을 넣지 마세요. AI 캐릭터가 할 말과 행동은 본문에서 직접 수행하세요.
- 선택지 앞의 본문에는 반드시 AI 캐릭터의 행동과 대사를 포함하세요. 선택지는 AI 캐릭터가 본문에서 충분히 반응한 뒤에만 제시하세요.
- 선택지 앞의 본문에서는 유저의 말, 행동, 감정, 결정을 대신 확정하지 마세요.
- AI 캐릭터는 자기 말과 행동만 직접 수행하고, 장면을 다음 사건으로 자연스럽게 이어가세요.
- 응답은 장면 묘사, 캐릭터 행동, 대사를 포함해 충분히 풍부하게 작성하세요. 짧은 단답이나 급한 마무리는 피하세요.
- 이전 대화를 반복하거나 처음부터 다시 쓰지 말고, 가장 최근 장면 바로 다음부터 이어가세요.`;

  const FINAL_OUTPUT_RULES = `[출력 규칙 — 절대 준수]
반드시 한국어로만 응답하세요. Never respond in English or any other language.
분석·계획·메타 주석(예: "I am crafting...", "Scene Planning:", "User Input Breakdown:", "Analysis of the Choice:" 등)을 절대 출력하지 마세요.
응답은 항상 장면·대사·행동으로 바로 시작합니다. 어떤 도입 설명도 없이 바로 본문을 작성하세요.
유저에게 선택지를 제시하지 말고, 캐릭터가 직접 행동하고 장면을 이끌어가세요. (스토리 모드는 제외)
응답 분량을 풍부하게 유지하세요. 지나치게 짧은 응답은 금지합니다.
⚠️ 절대 금지: 이전 대화 내역(History)에 이미 존재하고 진행된 대사, 행동, 상황 묘사를 다시 처음부터 작성하거나 똑같이 반복해서 출력하지 마세요. 오직 가장 최근 메시지(이전 대화의 마지막 시점)에 자연스럽게 이어지는 새로운 내용만을 작성해야 합니다. 이미 지나간 장면이나 대화를 복사하듯 재출력하는 것을 강력히 금지합니다.`;

  return (
    <Win title="관리자 — 프롬프트 조립 흐름" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/prompts" />
        
        {/* Mode Selector Tabs */}
        <div className="hstack" style={{ gap: 4, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 6 }}>
          {[
            { id: 'roleplay', label: '롤플레이 모드 (Roleplay)' },
            { id: 'novel', label: '소설 모드 (Novel)' },
            { id: 'story', label: '스토리 모드 (Story)' }
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
                desc="플랫폼 전역 공통 규칙 및 유저가 회원정보에서 개인설정한 프롬프트 지침입니다."
                source="globalRules: DB GlobalConfig ('rules_roleplay') | personalRules: 폐지된 모드 — 더 이상 적용되지 않음"
              />
              <PromptStep 
                step="1" 
                title="롤플레이 기본 규칙 (BASE_RULES)" 
                vars="BASE_RULES" 
                desc="화자 따옴표 구분규칙 및 행동, 생각 묘사 표기 규칙, 말투 반복/날조 방지 규칙입니다."
                source="hardcoded: apps/web/lib/systemPrompt.ts"
                code={BASE_RULES}
              />
              <PromptStep 
                step="2" 
                title="롤플레이 추가 규칙" 
                vars="modeRules" 
                desc="롤플레이 전용 추가적인 제어 가이드라인입니다."
                source="modeRules: DB GlobalConfig ('rules_roleplay_mode')"
              />
              <PromptStep 
                step="3" 
                title="유저 페르소나 설정" 
                vars="personaCharacter" 
                desc="사용자가 대화방에서 선택한 자신의 캐릭터(페르소나)의 프로필 정보입니다."
                source="personaCharacter: DB Character (이름, 태그, 추가정보)"
                code={`[유저 페르소나]\n이름: \${personaCharacter.name}\n태그: \${personaCharacter.tags.join(', ')}\n\${personaCharacter.additionalInfo}`}
              />
              <PromptStep 
                step="4" 
                title="핵심 기억 (Core Memory)" 
                vars="coreMemory" 
                desc="관계 설정이나 절대 잊어서는 안 되는 주요 장기 설정을 유저가 수동 기입한 란입니다."
                source="coreMemory: DB Conversation.coreMemory"
              />
              <PromptStep 
                step="5" 
                title="현재 상태 (Status Timeline)" 
                vars="statusTimeline" 
                desc="현재 에피소드 위치, 장소, 시점 등의 타임라인 상태 기록입니다."
                source="statusTimeline: DB Conversation.statusTimeline"
              />
              <PromptStep 
                step="6" 
                title="캐릭터 설정 및 시나리오 배경" 
                vars="character + scenarioDescription" 
                desc="AI 캐릭터 카드 정보(이름, 성별, 태그, 상세 설명)와 해당 룸의 시나리오 배경 정보입니다."
                source="character: DB Character | scenarioDescription: DB Conversation.scenarioDescription"
              />
              <PromptStep 
                step="7" 
                title="대화 예시 (Few-shot)" 
                vars="character.exampleDialogues" 
                desc="AI 모델이 캐릭터의 성격과 말투를 묘사할 수 있게 돕는 대화 로그 예제입니다."
                source="exampleDialogues: DB Character.exampleDialogues"
              />
              <PromptStep 
                step="8" 
                title="월드 북 (Lorebook)" 
                vars="lorebook" 
                desc="대화 내역에서 특정 단어가 스캔되면 동적 활성화되어 프롬프트에 끼워지는 세계관 설정 목록입니다. (최대 1,000토큰 우선순위 컷)"
                source="lorebooks: DB Lorebook (matchLorebook로 단어 추출)"
              />
              <PromptStep 
                step="9" 
                title="장기 메모리 요약 (RAG & Recent)" 
                vars="longTermMemory" 
                desc="15턴을 벗어난 이전 대화들의 3~5줄 요약 아카이브입니다. 유사도 검색을 거친 내용과 가장 최신의 2개 요약이 시간순으로 합쳐집니다."
                source="longTermMemory: DB Memory (retrieveRelevantMemories 로 로딩)"
              />
              <PromptStep 
                step="10" 
                title="최종 제어 규칙 (RESPONSE_CONTROL_RULES)" 
                vars="RESPONSE_CONTROL_RULES" 
                desc="대행 작성 금지, 선택지 금지 등 응답 형식을 철저히 옭아매는 최종 필터 룰입니다."
                source="hardcoded: apps/web/lib/responseControl.ts"
                code={RESPONSE_CONTROL_RULES}
              />
              <PromptStep 
                step="11" 
                title="최종 출력 강제 규칙" 
                vars="hardcoded_rules" 
                desc="한국어 고정 지시문, 생각 주석 및 메타 텍스트 출력 금지, 이전 대화 내용 중복 도배 방지 규칙입니다."
                source="hardcoded: apps/web/lib/systemPrompt.ts"
                code={FINAL_OUTPUT_RULES}
              />
            </>
          )}

          {activeTab === 'novel' && (
            <>
              <PromptStep 
                step="0" 
                title="공통 및 개인 지침" 
                vars="globalRules + personalRules" 
                desc="플랫폼 전역 소설 공통 규칙 및 유저 설정 지침입니다."
                source="globalRules: DB GlobalConfig ('rules_novel') | personalRules: 폐지된 모드 — 더 이상 적용되지 않음"
              />
              <PromptStep 
                step="1" 
                title="소설 기본 규칙 (NOVEL_BASE_RULES)" 
                vars="NOVEL_BASE_RULES" 
                desc='소설 전개에 맞춘 이름: "대사" 문법 가이드 및 3인칭 소설 작가 지침입니다.'
                source="hardcoded: apps/web/lib/systemPrompt.ts"
                code={NOVEL_BASE_RULES}
              />
              <PromptStep 
                step="2" 
                title="소설 모드 추가 규칙" 
                vars="modeRules" 
                desc="소설 전용 제어 가이드라인입니다."
                source="modeRules: DB GlobalConfig ('rules_novel_mode')"
              />
              <PromptStep 
                step="3" 
                title="유저 페르소나 및 핵심 메모리 설정" 
                vars="personaCharacter + coreMemory" 
                desc="유저 주인공 프로필 설정과 장기 기입 설정입니다."
                source="DB Character & Conversation"
              />
              <PromptStep 
                step="4" 
                title="현재 에피소드 및 캐릭터 설정" 
                vars="statusTimeline + character + scenarioDescription" 
                desc="현재 상황 로그 및 상대 캐릭터 프로필, 배경 정보입니다."
                source="DB Conversation & Character"
              />
              <PromptStep 
                step="5" 
                title="월드 북 & 이전 대화 요약 (Lorebook & RAG)" 
                vars="lorebook + longTermMemory" 
                desc="소설 세계관 로어북 정보 및 장기 기억 요약들입니다."
                source="DB Lorebook & Memory"
              />
              <PromptStep 
                step="6" 
                title="최종 소설 제어 규칙 (NOVEL_RESPONSE_CONTROL_RULES)" 
                vars="NOVEL_RESPONSE_CONTROL_RULES" 
                desc="소설 모드 맞춤 대행 통제 규칙 및 메타 주석 제한 규칙입니다."
                source="hardcoded: apps/web/lib/responseControl.ts"
                code={NOVEL_RESPONSE_CONTROL_RULES}
              />
              <PromptStep 
                step="7" 
                title="최종 출력 강제 규칙" 
                vars="hardcoded_rules" 
                desc="소설 형태 강제 고정 및 대화 내용 도배 재반복 금지 가이드입니다."
                source="hardcoded: apps/web/lib/systemPrompt.ts"
                code={FINAL_OUTPUT_RULES}
              />
            </>
          )}

          {activeTab === 'story' && (
            <>
              <PromptStep 
                step="0" 
                title="공통 및 개인 지침" 
                vars="globalRules + personalRules" 
                desc="플랫폼 전역 스토리 공통 규칙 및 유저 설정 지침입니다."
                source="globalRules: DB GlobalConfig ('rules_story') | personalRules: DB PromptPreset (mode='story', enabled 항목을 순서대로 합산)"
              />
              <PromptStep 
                step="1" 
                title="스토리 모드 기본 규칙 (STORY_BASE_RULES)" 
                vars="buildStoryBaseRules(charName, personaName)" 
                desc="선택지(1, 2, 3) 생성 문법과 본문과 구분선 '---' 룰을 조립하는 빌더입니다."
                source="hardcoded function: apps/web/lib/systemPrompt.ts"
                code={STORY_BASE_RULES_TEMPLATE}
              />
              <PromptStep 
                step="2" 
                title="스토리 모드 추가 규칙" 
                vars="modeRules" 
                desc="스토리 모드 전용 추가 제어 가이드라인입니다."
                source="modeRules: DB GlobalConfig ('rules_story_mode')"
              />
              <PromptStep 
                step="3" 
                title="유저 역할 및 핵심 설정" 
                vars="personaCharacter + coreMemory + statusTimeline" 
                desc="유저 역할 이름 정보와 대화방의 핵심 메모리, 에피소드 상황 정보입니다."
                source="DB Character & Conversation"
              />
              <PromptStep 
                step="4" 
                title="캐릭터 프로필 및 시나리오 배경" 
                vars="character + scenarioDescription" 
                desc="스토리 상대 캐릭터 및 최초 시나리오 설정 정보입니다."
                source="DB Character & Conversation"
              />
              <PromptStep 
                step="5" 
                title="월드 북 & 이전 대화 요약 (Lorebook & RAG)" 
                vars="lorebook + longTermMemory" 
                desc="세계관 키워드 내용 및 장기 기억 요약들입니다."
                source="DB Lorebook & Memory"
              />
              <PromptStep 
                step="6" 
                title="최종 스토리 제어 규칙 (STORY_RESPONSE_CONTROL_RULES)" 
                vars="STORY_RESPONSE_CONTROL_RULES" 
                desc="선택지 개수 제한, 유저 행동 본문 대행 작성 금지, 선택지 앞 본문 캐릭터 반응 보장 조건 규칙입니다."
                source="hardcoded: apps/web/lib/responseControl.ts"
                code={STORY_RESPONSE_CONTROL_RULES}
              />
              <PromptStep 
                step="7" 
                title="최종 출력 강제 규칙" 
                vars="hardcoded_rules" 
                desc="스토리 선택지 및 이야기 포맷 최종 유지 지침입니다."
                source="hardcoded: apps/web/lib/systemPrompt.ts"
                code={FINAL_OUTPUT_RULES}
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
