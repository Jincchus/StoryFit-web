type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'

export function haptic(style: HapticStyle = 'light') {
  if (typeof window === 'undefined') return
  const rn = (window as any).ReactNativeWebView
  if (rn?.postMessage) {
    try { rn.postMessage(JSON.stringify({ type: 'haptic', style })) } catch {}
    return
  }
  if (navigator.vibrate) {
    const pattern =
      style === 'error' ? [40, 30, 40]
      : style === 'success' ? [15, 30, 15]
      : style === 'heavy' ? 30
      : style === 'medium' ? 20
      : 12
    navigator.vibrate(pattern)
  }
}
