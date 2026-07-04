'use client'
// 클릭하면 전체화면 라이트박스로 크게 보이는 이미지. 표준 <img> 대체용(같은 props 전달).
// 커버·아바타 등 단일 이미지에 사용. 갤러리는 ImageCarousel이 자체 라이트박스를 가짐.
import { useState } from 'react'

type Props = React.ImgHTMLAttributes<HTMLImageElement>

export default function ZoomableImage({ onClick, style, src, alt, ...rest }: Props) {
  const [zoom, setZoom] = useState(false)
  return (
    <>
      <img
        src={src}
        alt={alt}
        {...rest}
        onClick={e => { onClick?.(e); if (src) setZoom(true) }}
        style={{ cursor: src ? 'zoom-in' : undefined, ...style }}
      />
      {zoom && src && (
        <div
          onClick={() => setZoom(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <button aria-label="닫기" onClick={() => setZoom(false)}
            style={{ position: 'absolute', top: 12, right: 14, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 22, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
          <img src={src} alt={alt ?? ''} onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </>
  )
}
