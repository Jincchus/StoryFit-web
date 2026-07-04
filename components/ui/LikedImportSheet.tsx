'use client'
import type { LikedItem } from '@/lib/likedScan'

// 센터 공통 "좋아요 목록 가져오기" 바텀시트. melting/zeta/tingle의 중복 패널을 추출.
// 테마는 prefix로 CSS 변수(var(--{prefix}-accent) 등)를 참조. dedup/가져오기 동작은 props로 주입.
export default function LikedImportSheet({
  open, onClose, title, prefix,
  items, scanning, scanMsg, onRescan,
  alreadyImported,
  selected, onChangeSelected,
  importing, importProgress, onImport,
}: {
  open: boolean
  onClose: () => void
  title: string
  prefix: string // 예: 'm' | 'z' | 'tg' | 'l' | 'b' | 't' | 'r' | 'c' | 'w'
  items: LikedItem[]
  scanning: boolean
  scanMsg: string
  onRescan: () => void
  alreadyImported: (item: LikedItem) => boolean
  selected: Set<string>
  onChangeSelected: (next: Set<string>) => void
  importing: boolean
  importProgress: string
  onImport: () => void
}) {
  if (!open) return null
  const v = (name: string) => `var(--${prefix}-${name})`

  const importable = items.filter(x => !alreadyImported(x))
  const doneItems = items.filter(x => alreadyImported(x))
  const doneCount = doneItems.length
  const allSelected = importable.length > 0 && importable.every(x => selected.has(x.id))
  const allDoneSelected = doneItems.length > 0 && doneItems.every(x => selected.has(x.id))
  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    onChangeSelected(next)
  }
  // 부분집합(미가져옴/완료)만 선택 상태를 뒤집는다 — 서로의 선택을 건드리지 않아 두 버튼을 함께 써서
  // "전체 선택" + "완료 전체 업데이트"로 전체를 한 번에 선택할 수 있다.
  const toggleSubset = (subset: LikedItem[], subsetAllSelected: boolean) => {
    const next = new Set(selected)
    for (const x of subset) subsetAllSelected ? next.delete(x.id) : next.add(x.id)
    onChangeSelected(next)
  }
  const toggleAll = () => toggleSubset(importable, allSelected)
  const toggleAllDone = () => toggleSubset(doneItems, allDoneSelected)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: v('bg'), borderRadius: '16px 16px 0 0' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: v('ink') }}>{title}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onRescan}
              style={{ appearance: 'none', border: `1px solid ${v('line')}`, background: v('surface'), color: v('ink-soft'), borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
              새로고침
            </button>
            <button onClick={onClose}
              style={{ appearance: 'none', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: v('ink-soft') }}>✕</button>
          </div>
        </div>
        {scanMsg && (
          <div style={{ padding: '0 16px 6px', fontSize: 11, color: scanMsg.startsWith('⚠') ? '#ff6b8a' : v('ink-soft'), flexShrink: 0 }}>{scanMsg}</div>
        )}
        {!scanning && (importable.length > 0 || doneCount > 0) && (
          <div style={{ padding: '0 16px 6px', flexShrink: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {importable.length > 0 && (
              <button onClick={toggleAll}
                style={{ appearance: 'none', border: `1px solid ${v('line')}`, background: v('surface'), color: v('ink-soft'), borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                {allSelected ? '전체 해제' : `전체 선택 (${importable.length}개)`}
              </button>
            )}
            {doneCount > 0 && (
              <button onClick={toggleAllDone}
                style={{ appearance: 'none', border: `1px solid ${v('line')}`, background: v('surface'), color: v('ink-soft'), borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                {allDoneSelected ? '완료 전체 해제' : `완료 전체 업데이트 (${doneCount}개)`}
              </button>
            )}
          </div>
        )}
        {!scanning && doneCount > 0 && (
          <div style={{ padding: '0 16px 8px', fontSize: 11, color: v('ink-soft'), flexShrink: 0, lineHeight: 1.4 }}>
            이미 가져온 항목(✓ 완료)을 탭하면 비어 있는 칸만 원본으로 채워 업데이트합니다.
          </div>
        )}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {scanning ? (
            <div style={{ textAlign: 'center', padding: 32, color: v('ink-soft'), fontSize: 13 }}>스캔 중...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: v('ink-soft'), fontSize: 13 }}>좋아요한 항목이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map(item => {
                const done = alreadyImported(item)
                const checked = selected.has(item.id)
                return (
                  <div key={item.id}
                    onClick={() => toggle(item.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: `1px solid ${v('line')}`, cursor: 'pointer', opacity: done && !checked ? 0.6 : 1 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? v('accent') : v('line')}`, background: checked ? v('accent') : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {checked && <span style={{ fontSize: 12, color: '#fff', lineHeight: 1 }}>✓</span>}
                    </div>
                    {item.coverImageUrl
                      ? <img src={item.coverImageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 8, background: v('surface-2'), display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>🎭</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: v('ink'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                        {item.isAdult && <span style={{ fontSize: 9, fontWeight: 700, background: '#ff5776', color: '#fff', padding: '1px 4px', borderRadius: 3 }}>성인</span>}
                        {item.tags.slice(0, 2).map(t => (
                          <span key={t} style={{ fontSize: 9, color: v('ink-soft'), background: v('surface-2'), padding: '1px 5px', borderRadius: 10 }}>#{t}</span>
                        ))}
                      </div>
                    </div>
                    {done && (
                      <span style={{ fontSize: 11, color: checked ? v('accent') : '#4ade80', flexShrink: 0 }}>
                        {checked ? '↻ 업데이트' : '✓ 완료'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {!scanning && selected.size > 0 && (
          <div style={{ padding: '10px 16px 20px', flexShrink: 0, borderTop: `1px solid ${v('line')}` }}>
            <button disabled={importing} onClick={onImport}
              style={{ width: '100%', appearance: 'none', border: 'none', background: v('accent'), color: '#fff', borderRadius: 10, padding: '13px 0', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>
              {importing ? (importProgress || '가져오는 중...') : `📥 선택한 ${selected.size}개 가져오기`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
