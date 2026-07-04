'use client'
// 센터 상세 상단에 "이 카드에 매핑된 캐릭터들"을 카드 목록으로 표시하는 공용 컴포넌트.
// 카드 클릭 시 CharacterCardModal(카드 상세보기)을 연다. zeta에서만 있던 표시를 전 센터 공통화.
// 테마는 prefix로 CSS 변수(var(--{prefix}-...))를 참조한다. 캐릭터는 /api/collections/[id]가
// 전체 필드로 내려주므로 추가 조회 없이 모달에 바로 넘긴다.
import { useState } from 'react'
import CharacterCardModal, { type CharacterCardData } from '@/components/ui/CharacterCardModal'

type Char = {
  id: string
  name: string
  gender?: string
  avatarUrl?: string | null
  tags?: string[]
  additionalInfo?: string
  secretSettings?: string
  exampleDialogues?: string
  openingMessage?: string
  isPreset?: boolean
}

export default function MappedCharacters({
  characters, prefix, personaName, title = '등록된 캐릭터',
}: {
  characters: Char[]
  prefix: string // 예: 'r' | 'z' | 'm' | 'tg' | 'b' | 'l' | 't' | 'w' | 'c'
  personaName?: string
  title?: string
}) {
  const [openChar, setOpenChar] = useState<CharacterCardData | null>(null)
  if (!characters || characters.length === 0) return null
  const v = (name: string) => `var(--${prefix}-${name})`

  const toCardData = (c: Char): CharacterCardData => ({
    id: c.id,
    name: c.name,
    gender: c.gender,
    avatarUrl: c.avatarUrl ?? undefined,
    tags: c.tags ?? [],
    additionalInfo: c.additionalInfo ?? '',
    secretSettings: c.secretSettings,
    exampleDialogues: c.exampleDialogues ?? '',
    openingMessage: c.openingMessage,
    isPreset: !!c.isPreset,
  })

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: v('ink'), margin: '0 0 10px' }}>{title} ({characters.length})</h2>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {characters.map(c => (
          <button key={c.id} type="button" onClick={() => setOpenChar(toCardData(c))}
            style={{
              flexShrink: 0, width: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>
            {c.avatarUrl
              ? <img src={c.avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', border: `1px solid ${v('line')}` }} />
              : <div style={{ width: 72, height: 72, borderRadius: 14, background: v('surface-2'), display: 'grid', placeItems: 'center', fontSize: 26 }}>🎭</div>}
            <span style={{ fontSize: 12, fontWeight: 700, color: v('ink'), maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
          </button>
        ))}
      </div>
      {openChar && (
        <CharacterCardModal character={openChar} personaName={personaName} onClose={() => setOpenChar(null)} />
      )}
    </div>
  )
}
