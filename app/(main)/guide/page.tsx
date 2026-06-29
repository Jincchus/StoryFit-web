'use client'
import { useState } from 'react'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'

type FeatureItem = { emoji: string; label: string; desc: string }
type FeatureSection = { title: string; items: FeatureItem[] }

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: '🎮 대화 모드',
    items: [
      { emoji: '📖', label: '스토리', desc: 'AI가 장면을 서술하고 선택지를 제시하는 인터랙티브 소설 모드입니다.' },
      { emoji: '👥', label: '멀티스토리', desc: '여러 캐릭터가 함께 이야기 속에서 상호작용합니다.' },
    ],
  },
  {
    title: '🎭 페르소나 (내 역할)',
    items: [
      { emoji: '🎭', label: '내 역할 설정', desc: '대화 설정에서 내가 연기할 캐릭터를 지정하면, 내 메시지가 해당 캐릭터로 표시되고 AI도 이를 인지하며 대화합니다.' },
      { emoji: '🧩', label: '센터 캐릭터 등록·페르소나 선택', desc: '모든 센터 카드에서 + 캐릭터 등록으로 캐릭터를 추가해 멀티로 만들 수 있고, 채팅 시작 시 기존 캐릭터(같은 카드의 동료·내 카드)를 페르소나로 고르거나 새로 입력할 수 있습니다. 기존 캐릭터를 페르소나로 쓸 때, 그 설정의 {{char}}/{{user}} 치환 방향을 모달의 토글로 정합니다(켜면 {{char}}→페르소나·{{user}}→캐릭터).' },
    ],
  },
  {
    title: '⚙️ 대화 설정',
    items: [
      { emoji: '📂', label: '설정창 4탭 구성', desc: '대화 설정창(⚙)은 기본·AI응답·기억·세계관 4개 탭으로 나뉘고, 맨 위에서 이 대화의 AI 모델(Gemini 2.5/3.1 Pro)을 바로 바꿀 수 있습니다.' },
      { emoji: '🎨', label: '스타일 설정', desc: '시점·시제·분위기·문체·전개 속도를 선택하고, 응답 길이를 최소·최대 글자 수로 지정해 대화 톤을 세밀하게 조정합니다(비워두면 길이 제한 없음). (AI응답 탭)' },
      { emoji: '❤️', label: '관계·능력치 스탯', desc: '호감도 등 수치를 AI가 대화 흐름에 따라 자동으로 조정합니다. `!스탯`으로 조회할 수 있습니다.' },
      { emoji: '🎒', label: '인벤토리', desc: 'AI가 아이템 획득·소모를 자동으로 판단해 관리합니다. `!인벤토리`로 조회할 수 있습니다.' },
      { emoji: '🔖', label: 'AI 자동 챕터 구분', desc: '장면이 크게 전환되면(시간/장소 변화) 자동으로 챕터(N장)를 나눠 표시합니다.' },
      { emoji: '✍️', label: '입력 다듬어 확장', desc: 'ON이면 내가 입력한 서술을 AI가 소설체로 다듬어 확장하고, 그 흐름으로 자연스럽게 이어갑니다. 대화 설정에서 켜고 끌 수 있습니다.' },
      { emoji: '⏩', label: '빠른 전개', desc: 'ON이면 시간·장소를 과감히 건너뛰고 한 응답에서 사건을 여러 단계 진행시켜 이야기를 빠르게 전개합니다(기본 꺼짐, AI응답 탭).' },
      { emoji: '🛡', label: '안전 수준', desc: '폭력·성인 표현 허용 정도를 엄격/표준/완화 중에서 선택합니다.' },
      { emoji: '🔞', label: '성인 합의 게이팅', desc: 'ON이면 성애 장면 진입에 합의·맥락 전제를 둡니다. OFF면 진입 게이팅을 풀어 더 자유롭게 전개합니다(미성년 등 모델 자체 안전선은 항상 유지). 채팅 사이드패널 AI응답 탭에서 켜고 끕니다.' },
    ],
  },
  {
    title: '🎛 고급 AI 파라미터',
    items: [
      { emoji: '🎚', label: '대화별 파라미터 (AI응답 탭)', desc: '채팅방 ⚙ 설정 → AI응답 탭에서 이 대화만의 창의성·반복 억제·응답 길이·사고 예산·안전 수준을 직접 조절할 수 있습니다. 변경은 즉시 그 방에만 저장되며, 새 대화에는 설정(/settings)의 전역 기본값이 자동으로 적용됩니다(방마다 독립).' },
      { emoji: '🎲', label: '창의성 (temperature)', desc: '낮을수록 일관적이고 예측 가능한 답변, 높을수록 창의적이고 다양한 답변이 나옵니다.' },
      { emoji: '🔁', label: '반복 억제 (frequency penalty)', desc: '같은 단어·표현이 반복되는 것을 줄여줍니다.' },
      { emoji: '📏', label: '응답 최대 길이', desc: 'AI 응답의 최대 토큰 수를 조절합니다. 길수록 더 깊이 있는 응답이 가능하지만 생성 시간이 늘어납니다.' },
      { emoji: '🧠', label: '사고 예산 (thinking budget)', desc: '응답 전 AI가 장면을 설계하는 내부 추론 깊이입니다. 높을수록 일관성이 좋아지지만 응답이 느려질 수 있습니다.' },
    ],
  },
  {
    title: '💬 슬래시 커맨드',
    items: [
      { emoji: '📊', label: '!상태창 (!정보)', desc: '스탯·인벤토리·현재 상황을 한번에 표시합니다.' },
      { emoji: '❤️', label: '!스탯 (!호감도, !관계)', desc: '관계·능력치 스탯만 표시합니다.' },
      { emoji: '🎒', label: '!인벤토리 (!소지품)', desc: '소지하고 있는 아이템 목록을 표시합니다.' },
      { emoji: '🗺', label: '!상황 (!타임라인, !씬)', desc: '현재 장면의 시간·장소·상황을 요약해 보여줍니다.' },
      { emoji: '❓', label: '!도움말 (!명령어)', desc: '사용 가능한 명령어 목록을 표시합니다.' },
      { emoji: '💡', label: '사용 팁', desc: '채팅창에 입력하면 AI 비용 없이 즉시 결과를 볼 수 있습니다.' },
    ],
  },
  {
    title: '🛠 내 커맨드 & AI 폴백',
    items: [
      { emoji: '⚡', label: '커스텀 AI 커맨드 (내 커맨드)', desc: '대화 설정에서 "내 커맨드"를 눌러 `!에타` 같은 나만의 슬래시 커맨드를 만들 수 있습니다. 생성한 커맨드는 모든 대화에서 재사용 가능하며, AI 응답은 마크다운으로 렌더링됩니다.' },
      { emoji: '🤖', label: 'AI 자동 상태 생성 (폴백)', desc: '`!상태창`·`!스탯`·`!인벤토리` 등 기본 커맨드에서 값이 없으면 AI가 현재 상황에 맞는 상태를 자동으로 생성해 표시합니다.' },
    ],
  },
  {
    title: '✨ 몰입 기능',
    items: [
      { emoji: '🖥', label: '몰입형 채팅 화면', desc: '채팅방에서는 상단바·하단 네비가 사라지고 화면 전체를 대화에 씁니다. 헤더 왼쪽 ← 로 목록으로 나가고, ▴/▾ 로 헤더를 접거나 펼칠 수 있습니다.' },
      { emoji: '☰', label: '도구 메뉴 (보기)', desc: '헤더 ☰ 메뉴에 스탯·인벤토리·지금까지의 줄거리·글자 크기·실시간 음성 통화를 모았습니다. ＋ 메뉴는 음성 입력·스탯 판정 등 "내가 하는" 입력 도구만 둡니다.' },
      { emoji: '🎲', label: '스탯 판정 (주사위)', desc: '행동을 입력하고 ＋ 메뉴에서 스탯 판정을 누르면 d100 주사위로 성공/실패가 결정되고 AI가 결과를 서사에 반영합니다. 결과는 재생성해도 번복되지 않습니다.' },
      { emoji: '⏩', label: '관전 모드', desc: '마지막 AI 메시지의 ↺ 재생성 옆 ≫ 버튼을 누르면 1~10턴을 선택해 입력 없이 이야기가 자동으로 진행됩니다. 언제든 ■ 버튼으로 중단할 수 있습니다.' },
      { emoji: '📜', label: '줄거리 요약', desc: '오래 쉬었다 돌아왔을 때 헤더 ☰ 메뉴의 "지금까지의 줄거리"로 한눈에 확인합니다.' },
      { emoji: '🗺', label: '스토리 설계도', desc: '새 대화 또는 사이드패널에서 챕터별 목표·사건이 담긴 설계도를 생성하면 AI가 완결을 향해 이야기를 끌고 갑니다. 스포일러는 기본 숨김입니다.' },
      { emoji: '💭', label: '재회 인사', desc: '24시간 이상 지나 돌아오면 캐릭터가 먼저 말을 걸어옵니다.' },
      { emoji: '📖', label: '챕터(에피소드)별로 보기', desc: '대화가 챕터로 나뉘면 메시지 사이에 구분선이 생기고, 상단 네비(◀ ▶ · 회차 선택)로 원하는 화로 바로 이동할 수 있어요. 입력은 항상 최신 화에 이어집니다.' },
    ],
  },
  {
    title: '📥 외부 센터 가져오기',
    items: [
      { emoji: '🔗', label: 'URL 붙여넣기 가져오기', desc: 'WHIF·ZETA·melting·Tikita·Chub·rofanai·loveydovey·babechat·tingle 센터의 캐릭터/스토리 URL을 각 센터 ⋮ 메뉴에 붙여넣으면 캐릭터·첫 장면·설정을 자동으로 가져옵니다.' },
      { emoji: '🧩', label: 'Chub 외국 센터', desc: 'chub.ai의 외국 캐릭터 카드를 원문(영어) 그대로 즉시 가져옵니다. 상세 화면의 "🌐 한국어로 번역" 버튼을 누르면 AI(Gemini)가 설명·도입부·예시대화를 번역하며, "🔤 원문" 버튼으로 다시 되돌릴 수 있습니다(태그는 가져올 때 한글로 정규화, 이름은 원문 유지).' },
      { emoji: '💗', label: 'rofanai 국내 센터', desc: 'rofan.ai의 로맨스 판타지 캐릭터를 가져옵니다. 캐릭터 페이지 URL(/character/...)을 붙여넣으면 설정·세계관·첫 장면·태그를 자동으로 가져옵니다(한국어라 번역 없음). 비설(숨김 설정)은 관리자 설정에 rofan 세션 쿠키가 등록돼 있을 때만 함께 가져와 [비밀설정]으로 저장됩니다.' },
      { emoji: '🔒', label: '비밀설정 (숨김 설정)', desc: '화면에는 접힌 상태로 표시되지만 AI 프롬프트에는 항상 포함되는 숨김 캐릭터 설정입니다. 센터 카드와 채팅 설정창 양쪽에서 펼쳐 보고 ✏ 수정으로 바로 편집할 수 있으며, 한쪽에서 고치면 같은 캐릭터를 보는 다른 쪽에도 반영됩니다.' },
      { emoji: '💞', label: 'loveydovey (메타데이터)', desc: 'loveydovey.ai 캐릭터 URL을 붙여넣으면 이름·한줄소개·장르·이미지 등 메타데이터를 가져옵니다. (상세 설정·첫 장면은 비공개라 직접 입력해야 합니다.)' },
      { emoji: '🩵', label: 'babechat 국내 센터', desc: 'babechat.ai 캐릭터 URL을 붙여넣으면 설정·도입부·태그를 가져옵니다. 로그인이 필요한 센터라 관리자 설정에서 인증 토큰을 먼저 등록해야 합니다(만료 시 자동 갱신).' },
      { emoji: '💫', label: 'tingle 국내 센터', desc: 'tingle.chat의 캐릭터·서사·테마 URL을 붙여넣으면 설정·도입부·첫 장면·태그를 가져옵니다. URL 형식: /chat/characters/{id}(캐릭터), /chat/universes/{id}(서사), /chat/scenes/{id}(테마). 로그인이 필요해 관리자 설정에서 Firebase JWT 인증 토큰을 먼저 등록해야 합니다(1시간 만료 시 재등록).' },
    ],
  },
  {
    title: '🔍 검색 & 기록',
    items: [
      { emoji: '🔍', label: '본문 검색', desc: '채팅 목록 검색창에 2글자 이상 입력하면 모든 대화의 메시지 본문에서 검색하고, 결과를 누르면 해당 위치로 바로 이동합니다.' },
      { emoji: '🏷', label: '센터 태그·제목 검색', desc: 'WHIF·ZETA·melting·Tikita·Chub·rofanai·loveydovey·babechat·tingle 센터에서 태그 칩을 눌러 작품/캐릭터를 좁히고, 검색창에 제목·이름을 입력해 빠르게 찾을 수 있습니다.' },
      { emoji: '🗂', label: '내 캐릭터 필터·정렬·검색', desc: '캐릭터 페이지에서 센터별·성별로 필터링하고 최신순·오래된순·가나다순으로 정렬할 수 있습니다. 🔍 검색을 눌러 캐릭터명·카드(세계관)명으로 찾거나, 태그 탭에서 등록된 태그 목록을 골라 좁힐 수 있습니다.' },
      { emoji: '⚧', label: '센터 성별 필터', desc: '각 센터의 캐릭터 카드를 🔍 검색 패널에서 남성·여성·멀티·미분류로 필터링할 수 있습니다(해당 성별이 있을 때만 노출).' },
      { emoji: '🌐', label: '전체 센터 통합 필터', desc: '탐색 > 전체 센터에서 모든 센터의 작품을 한 화면에 모아 봅니다. 🔍 검색 패널에서 센터 칩·성별·카테고리별 태그(카운트 포함)로 좁히고, 검색창은 제목·태그뿐 아니라 설명·캐릭터명까지 함께 검색합니다.' },
      { emoji: '🔖', label: '메시지 북마크', desc: '명장면 메시지를 탭하고 🔖을 눌러 저장하세요. 사이드패널에서 모아보고 바로 점프할 수 있습니다.' },
      { emoji: '⬇', label: '소설 내보내기', desc: '서재의 완결작을 선택지 없이 정제된 소설 텍스트(.txt)로 다운로드합니다.' },
      { emoji: '🔠', label: '글자 크기', desc: '채팅방 헤더 ☰ 메뉴에서 본문 글자 크기를 조절할 수 있습니다.' },
    ],
  },
  {
    title: '🧠 메모리 & 로어북',
    items: [
      { emoji: '📌', label: '핵심 메모리', desc: 'AI가 절대 잊으면 안 되는 설정·사실을 등록합니다. 설정 탭에서 직접 편집할 수 있습니다.' },
      { emoji: '🗺', label: '타임라인 상태', desc: '현재 장면의 시간·장소·상황 요약입니다. 직접 편집할 수 있습니다.' },
      { emoji: '🧾', label: '장기 메모리', desc: '대화가 길어지면 자동으로 요약되며, 선택해서 핵심 메모리로 승격할 수 있습니다. 승격한 항목은 "↩ 해제"로 다시 내려 재선택·재승격할 수 있습니다.' },
      { emoji: '📖', label: '로어북', desc: '키워드가 대화에 등장하면 관련 설정을 AI에게 자동으로 주입합니다. 설정 탭에서 추가·수정·삭제할 수 있습니다.' },
    ],
  },
  {
    title: '🌿 분기 & 메시지 조작',
    items: [
      { emoji: '🌿', label: '분기 (Branch)', desc: '메시지의 ⑂ 분기 버튼으로 그 지점에서 새 타임라인을 만듭니다. 분기 시점의 핵심 메모리·타임라인·장기 메모리가 그대로 복제됩니다. 헤더의 ⑂ 분기 ▾ 드롭다운에서 분기 간 전환·삭제(✕)가 가능합니다.' },
      { emoji: '🔀', label: '형제 메시지', desc: '같은 지점에서 재생성된 다른 응답들 사이를 전환해 볼 수 있습니다.' },
      { emoji: '✏', label: '메시지 수정', desc: '내 메시지를 수정하면 이후 대화가 재생성되고, AI 메시지 수정은 내용만 바뀝니다.' },
      { emoji: '🔄', label: '재생성 (Regenerate)', desc: '마지막 AI 응답을 다시 생성합니다. 이때 스탯·인벤토리 변화는 자동으로 롤백됩니다.' },
    ],
  },
  {
    title: '📚 정리 기능',
    items: [
      { emoji: '📚', label: '서재', desc: '완결된 대화를 보관합니다. /library에서 모아보고, "꺼내기"로 채팅 목록에 복귀시킬 수 있습니다.' },
      { emoji: '📌', label: '핀 고정', desc: '자주 쓰는 대화를 채팅 목록 상단에 고정합니다.' },
      { emoji: '★', label: '센터 즐겨찾기', desc: 'WHIF·ZETA·melting·Tikita·Chub·rofanai·loveydovey·babechat·tingle 센터에서 카드의 ★를 눌러 즐겨찾기하고, 즐겨찾기 탭에서 모아볼 수 있습니다. 기기 간 동기화됩니다.' },
      { emoji: '🔖', label: '챕터 뱃지', desc: '자동 챕터 구분이 켜진 대화에서 진행 중인 장(N장)을 표시합니다.' },
    ],
  },
]

export default function GuidePage() {
  const [openTitles, setOpenTitles] = useState<string[]>([FEATURE_SECTIONS[0].title])

  const toggleSection = (title: string) => {
    setOpenTitles(prev => prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title])
  }

  return (
    <Win title="기능 가이드" icon={PixelIcons.settings}>
      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 12 }}>
        <div className="vstack" style={{ gap: 10 }}>
          <div className="tiny muted" style={{ lineHeight: 1.6 }}>
            StoryFit에서 AI와의 대화를 더 풍부하게 만들어주는 기능들을 모아뒀습니다. 섹션을 눌러 펼쳐보세요.
          </div>
          {FEATURE_SECTIONS.map(section => {
            const open = openTitles.includes(section.title)
            return (
              <div key={section.title} className="side-section">
                <button className="acc-toggle" onClick={() => toggleSection(section.title)}>
                  <span>{section.title}</span>
                  <span className={`acc-arrow ${open ? 'open' : ''}`}>▼</span>
                </button>
                {open && (
                  <div className="vstack" style={{ gap: 8, marginTop: 6 }}>
                    {section.items.map(item => (
                      <div
                        key={item.label}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 'var(--radius)',
                          border: '1px solid var(--chrome-border)',
                          background: 'var(--pane)',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                        }}
                      >
                        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{item.emoji}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>{item.label}</div>
                          <div className="tiny muted" style={{ lineHeight: 1.5, marginTop: 2 }}>{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Win>
  )
}
