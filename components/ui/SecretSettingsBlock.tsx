'use client'
// 비밀설정(secretSettings) 표시·인라인 편집 공용 컴포넌트.
// 센터 상세 카드와 채팅 설정창 양쪽에서 같은 Character 행을 읽으므로, 한쪽에서 저장하면
// 서버의 같은 행이 갱신돼 다른 쪽에도 반영된다. 기본 접힘 상태로 표시한다.
// 표시 텍스트엔 반드시 replaceDisplayPlaceholders를 적용한다(프로젝트 규칙).
import { useState } from 'react'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import NovelText from '@/components/ui/NovelText'

interface Props {
  characterId: string
  value: string
  userName: string
  charNames: string | string[]
  editable?: boolean // 기본 true (저장 권한은 서버 PATCH가 최종 판정)
  onSaved?: (next: string) => void
  className?: string // 래퍼 클래스(테마별 섹션 스타일)
  label?: string // 헤더 텍스트(기본 "비밀설정"). 다중 캐릭터 구분용.
}

export default function SecretSettingsBlock({
  characterId, value, userName, charNames, editable = true, onSaved, className, label = '비밀설정',
}: Props) {
  const [current, setCurrent] = useState(value)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 내용도 없고 편집도 불가면 아무것도 렌더하지 않는다.
  if (!current.trim() && !editable) return null

  const startEdit = () => { setDraft(current); setError(''); setEditing(true); setOpen(true) }
  const cancel = () => { setEditing(false); setError(''); setDraft(current) }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const res = await api.patch(`/api/characters/${characterId}`, { secretSettings: draft })
      const next = typeof res?.secretSettings === 'string' ? res.secretSettings : draft
      setCurrent(next)
      setEditing(false)
      onSaved?.(next)
    } catch {
      setError('저장에 실패했습니다. 수정 권한이 없을 수 있어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={className} style={{ paddingTop: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
          background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer',
          font: 'inherit', color: 'inherit', fontWeight: 700, fontSize: 14,
        }}
      >
        <span style={{ opacity: 0.7, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
        🔒 {label}
        {!current.trim() && <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.55 }}>(비어 있음)</span>}
      </button>

      {open && (
        <div style={{ paddingBottom: 8 }}>
          {editing ? (
            <div>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={10}
                placeholder="AI에게만 전달되는 숨김 설정(비설). 화면에는 접힌 상태로 표시됩니다."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8,
                  border: '1px solid rgba(128,128,128,.4)', background: 'rgba(128,128,128,.06)',
                  color: 'inherit', font: 'inherit', fontSize: 13, lineHeight: 1.6, resize: 'vertical',
                }}
              />
              {error && <p style={{ color: '#e5484d', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={save} disabled={saving}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#6b5cff', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                  {saving ? '저장 중…' : '저장'}
                </button>
                <button type="button" onClick={cancel} disabled={saving}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(128,128,128,.4)', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: 'none', color: 'inherit' }}>
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div>
              {current.trim()
                ? <NovelText text={replaceDisplayPlaceholders(current, userName, charNames)} />
                : <p style={{ opacity: 0.55, fontSize: 13, margin: 0 }}>등록된 비밀설정이 없습니다.</p>}
              {editable && (
                <button type="button" onClick={startEdit}
                  style={{ marginTop: 8, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,.4)', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: 'none', color: 'inherit' }}>
                  ✏ 수정
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
