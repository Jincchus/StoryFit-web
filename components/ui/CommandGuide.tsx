'use client'
import { useState } from 'react'

// 지시문 작성 도움말. 제목 옆 ? 버튼 → 접이식 안내.
export default function CommandGuide() {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="작성 가이드"
        style={{ marginLeft: 6, width: 16, height: 16, borderRadius: 999, border: '1px solid var(--muted)', background: 'transparent', color: 'var(--muted)', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}>?</button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: '120%', left: 0, width: 280, background: 'rgba(20,14,26,0.97)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.55, color: '#ddd', boxShadow: '0 6px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>지시문 작성 팁</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li><b>무엇을·어떤 형식으로</b>: "현재 상황을 확인해 ○○을 ××형식으로 작성하라"</li>
            <li><b>모양 지정</b>: 게시판/채팅 로그/표 등 원하는 형태를 직접 묘사</li>
            <li><b>마크다운</b>: "마크다운으로 작성"이라 쓰면 제목·목록·구분선으로 예쁘게 렌더됩니다</li>
            <li><b>맥락은 자동</b>: 현재 대화·상황을 AI가 알아서 참고. <code>!이름 뒤 텍스트</code>로 추가 지시 가능</li>
          </ul>
          <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
            예) <b>!에타</b> → "지금까지의 상황을 에브리타임 자유게시판 글처럼 제목 + 본문 + 익명 댓글 몇 개를 마크다운으로 작성하라."
          </div>
        </div>
      )}
    </span>
  )
}
