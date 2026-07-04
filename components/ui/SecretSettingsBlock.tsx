'use client'
// 비밀설정(secretSettings) 표시·인라인 편집 공용 컴포넌트.
// 센터 상세 카드와 채팅 설정창 양쪽에서 같은 Character 행을 읽으므로, 한쪽에서 저장하면
// 서버의 같은 행이 갱신돼 다른 쪽에도 반영된다. 기본 접힘 상태로 표시한다.
// 표시 텍스트엔 반드시 replaceDisplayPlaceholders를 적용한다(프로젝트 규칙).
import { useState } from 'react'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { extractRofanSecret } from '@/lib/rofanSecretPaste'
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
  enablePaste?: boolean // rofan 전용: 브라우저에서 캡처한 JSON을 붙여넣어 char_secrets 추출
}

const PASTE_REASON: Record<string, string> = {
  empty: '붙여넣은 내용이 비어 있습니다.',
  bad_json: 'JSON 형식이 올바르지 않습니다. 복사한 내용이 잘리지 않았는지 확인해주세요.',
  no_secret: '이 데이터엔 비밀설정(char_secrets)이 없습니다. 카드 리스트에서 열어 캡처한 "풀 버전"인지 확인해주세요.',
  empty_after_clean: '추출된 비밀설정이 비어 있습니다.',
}

export default function SecretSettingsBlock({
  characterId, value, userName, charNames, editable = true, onSaved, className, label = '비밀설정', enablePaste = false,
}: Props) {
  const [current, setCurrent] = useState(value)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState('')

  // 내용도 없고 편집도 불가면 아무것도 렌더하지 않는다.
  if (!current.trim() && !editable) return null

  const startEdit = () => { setDraft(current); setError(''); setEditing(true); setOpen(true) }
  const cancel = () => { setEditing(false); setError(''); setDraft(current); setPasteOpen(false); setPasteText(''); setPasteError('') }

  const applyPaste = () => {
    const r = extractRofanSecret(pasteText)
    if (!r.ok) { setPasteError(PASTE_REASON[r.reason] ?? '추출에 실패했습니다.'); return }
    setDraft(r.value)
    setPasteOpen(false)
    setPasteText('')
    setPasteError('')
  }

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
              {enablePaste && (
                <div style={{ marginBottom: 8 }}>
                  {!pasteOpen ? (
                    <button type="button" onClick={() => { setPasteOpen(true); setPasteError('') }}
                      style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(107,92,255,.5)', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: 'rgba(107,92,255,.08)', color: 'inherit' }}>
                      📋 rofan 데이터 붙여넣기로 채우기
                    </button>
                  ) : (
                    <div style={{ border: '1px solid rgba(107,92,255,.4)', borderRadius: 8, padding: 10, background: 'rgba(107,92,255,.04)' }}>
                      <p style={{ margin: '0 0 6px', fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
                        rofan에서 <b>카드 리스트를 클릭해 열었을 때</b> 잡히는 데이터를 붙여넣으세요.
                        CreateChat 요청 페이로드 전체({'{'}botDetail…{'}'})도, 비밀설정 원문도 됩니다. char_secrets만 추려 넣어드려요.
                      </p>
                      <textarea
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        rows={5}
                        placeholder='여기에 JSON 또는 비밀설정 텍스트를 붙여넣기'
                        style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid rgba(128,128,128,.4)', background: 'rgba(128,128,128,.06)', color: 'inherit', font: 'inherit', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
                      />
                      {pasteError && <p style={{ color: '#e5484d', fontSize: 12, margin: '6px 0 0' }}>{pasteError}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" onClick={applyPaste} disabled={!pasteText.trim()}
                          style={{ padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: '#6b5cff', color: '#fff', opacity: pasteText.trim() ? 1 : 0.5 }}>
                          비밀설정 추출
                        </button>
                        <button type="button" onClick={() => { setPasteOpen(false); setPasteText(''); setPasteError('') }}
                          style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(128,128,128,.4)', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: 'none', color: 'inherit' }}>
                          닫기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
