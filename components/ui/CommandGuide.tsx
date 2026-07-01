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

          <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>양식 고정 (말풍선·카드)</div>
          <div>매번 모양이 달라지지 않게 하려면, 아래 <b>고정 클래스</b>만 쓰라고 지시하세요(inline style 쓰지 말라고 명시):</div>
          <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
            <li><b>메신저</b>: <code>sf-bubble</code> + <code>sf-bubble-right</code>(나)/<code>sf-bubble-left</code>(상대), <code>sf-name</code>, <code>sf-time</code></li>
            <li><b>상태창/카드</b>: <code>sf-card</code> + <code>sf-card-title</code>, <code>sf-row</code>, <code>sf-muted</code></li>
            <li><b>게시판/댓글</b>: <code>sf-post</code> + <code>sf-post-title</code>/<code>sf-post-meta</code>/<code>sf-post-body</code>, <code>sf-comment</code> + <code>sf-comment-author</code></li>
            <li><b>기타</b>: <code>sf-notice</code>(알림), <code>sf-tag</code>(태그), <code>sf-divider</code>(구분선), <code>sf-bar</code>+<code>sf-bar-fill</code>(스탯바)</li>
          </ul>
          <div className="sf-muted" style={{ fontSize: 11, opacity: 0.7 }}>· 줄바꿈은 엔터 1번이면 그대로 반영됩니다.</div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
            예) <b>!카톡</b> → "현재 상황을 카톡 대화처럼 출력하라. inline style 없이 다음 HTML 클래스만 써라: 내가 보낸 말은 <code>&lt;div class="sf-bubble sf-bubble-right"&gt;내용&lt;div class="sf-time"&gt;시간&lt;/div&gt;&lt;/div&gt;</code>, 상대는 <code>sf-bubble-left</code>. 색·여백은 지정하지 마라."
          </div>
        </div>
      )}
    </span>
  )
}
