'use client'
// 카드 내 이미지 표시 공용 컴포넌트 — 그리드 갤러리가 아니라 액자(프레임) 형식으로
// 한 장씩 보여주고 ‹ › 버튼·도트·카운터로 넘겨 본다. 센터별 테마색은 accent/line 으로 주입.
import { useState } from 'react'

export type CarouselImage = string | { url: string; description?: string }

interface Props {
  images: CarouselImage[]
  aspectRatio?: string // 기본 '3/4'
  accent?: string      // 활성 도트 색 (CSS 변수 등)
  line?: string        // 비활성 도트 색
}

function toItem(img: CarouselImage): { url: string; description?: string } {
  return typeof img === 'string' ? { url: img } : img
}

export default function ImageCarousel({
  images,
  aspectRatio = '3/4',
  accent = 'var(--accent, #0095f6)',
  line = 'rgba(128,128,128,0.4)',
}: Props) {
  const [idx, setIdx] = useState(0)
  const [zoom, setZoom] = useState(false)
  if (images.length === 0) return null

  const safeIdx = Math.min(idx, images.length - 1)
  const multi = images.length > 1
  const cur = toItem(images[safeIdx])
  const prev = () => setIdx(i => (i - 1 + images.length) % images.length)
  const next = () => setIdx(i => (i + 1) % images.length)
  const navBtn = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', [side]: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%',
    width: 32, height: 32, cursor: 'pointer', fontSize: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  })

  return (
    <div>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, background: 'rgba(128,128,128,0.08)' }}>
        <img
          src={cur.url}
          alt={cur.description ?? ''}
          loading="lazy"
          onClick={() => setZoom(true)}
          style={{ width: '100%', aspectRatio, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
        />
        {multi && (
          <>
            <button aria-label="이전 이미지" onClick={prev} style={navBtn('left')}>‹</button>
            <button aria-label="다음 이미지" onClick={next} style={navBtn('right')}>›</button>
            <div style={{ position: 'absolute', right: 10, top: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
              {safeIdx + 1} / {images.length}
            </div>
          </>
        )}
        {cur.description && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 10px', fontSize: 12, lineHeight: 1.4, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
            {cur.description}
          </div>
        )}
      </div>
      {multi && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {images.map((_, i) => (
            <button
              key={i}
              aria-label={`${i + 1}번째 이미지`}
              onClick={() => setIdx(i)}
              style={{
                width: i === safeIdx ? 18 : 6, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer',
                background: i === safeIdx ? accent : line, padding: 0, transition: 'all 0.2s',
              }}
            />
          ))}
        </div>
      )}

      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <button aria-label="닫기" onClick={() => setZoom(false)}
            style={{ position: 'absolute', top: 12, right: 14, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 22, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
          <img src={cur.url} alt={cur.description ?? ''} onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          {multi && (
            <>
              <button aria-label="이전 이미지" onClick={e => { e.stopPropagation(); prev() }} style={{ ...navBtn('left'), left: 12, width: 40, height: 40, fontSize: 20 }}>‹</button>
              <button aria-label="다음 이미지" onClick={e => { e.stopPropagation(); next() }} style={{ ...navBtn('right'), right: 12, width: 40, height: 40, fontSize: 20 }}>›</button>
              <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13 }}>{safeIdx + 1} / {images.length}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
