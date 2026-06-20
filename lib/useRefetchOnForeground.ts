import { useEffect, useRef } from 'react'

// 앱이 백그라운드로 갔다가 포그라운드(visible)로 돌아올 때 콜백을 실행한다.
// 모바일 WebView에서 백그라운드 중 in-flight fetch가 끊겨도, 서버는 AI 작업을
// 끝내고 저장하므로 — 복귀 시 재조회해 저장된 결과를 화면에 반영/스피너 정리하는 용도.
export function useRefetchOnForeground(cb: () => void) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') ref.current()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [])
}
