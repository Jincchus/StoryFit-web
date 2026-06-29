import { NextResponse } from 'next/server'

// chub 좋아요 스캔 — 밑작업(미구현 스텁). 세션/쿠키 + 좋아요 API 엔드포인트 확정 후 활성화.
// 활성화 방법:
//   1) lib/likedScan.ts 상단의 어댑터 예시 + 작동 중 라우트(melting/tingle/zeta)를 참고.
//   2) 자격증명 키: chub_session_cookie(미정).
//   3) 아래 스텁을 runLikedScan(req, async () => { ...fetch...map... return { liked } })로 교체.
//   4) 페이지 배선: context/2026-06-29-liked-scan-groundwork.md의 스니펫 참고(♥ 버튼 + LikedImportSheet).
export async function GET() {
  return NextResponse.json(
    { error: 'chub 좋아요 스캔은 준비 중입니다. (관리자 쿠키/세션 + 엔드포인트 설정 필요)' },
    { status: 501 },
  )
}
