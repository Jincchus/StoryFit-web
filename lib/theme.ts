export const THEMES = [
  { id: 'instagram',   label: 'Instagram',      desc: 'IG 스타일 (기본)',          palette: ['#ffffff', '#fafafa', '#0095f6', '#000000'] },
  { id: 'retro',       label: 'Retro Pixel',    desc: '레트로 픽셀 감성',          palette: ['#f6d4ec', '#c9b6ff', '#e9d8f7', '#2b1f55'] },
  { id: 'modern',      label: 'Modern',         desc: '모던 소프트 UI',            palette: ['#ffffff', '#fce8f5', '#f1e3fa', '#ff6fb5'] },
  { id: 'win95',       label: 'Windows 95',     desc: '클래식 Win95 컨셉',         palette: ['#008080', '#c0c0c0', '#000080', '#ffffff'] },
  { id: 'pink',        label: 'Cyworld Pink',   desc: '싸이월드 미니홈피 감성',    palette: ['#fff5f0', '#ffffff', '#ff6fa3', '#4a2e3a'] },
  { id: 'macos',       label: 'macOS',          desc: 'macOS 스타일 UI',           palette: ['#f5f5f7', '#ffffff', '#007aff', '#1d1d1f'] },
  { id: 'modernwhite', label: 'Modern White',   desc: 'iOS 스타일 클린 UI',        palette: ['#f5f5f7', '#ffffff', '#007aff', '#1c1c1e'] },
  { id: 'maple',       label: 'MapleStory',     desc: '메이플스토리 감성',          palette: ['#A5D1FF', '#FFF8E7', '#FF9900', '#333333'] },
  { id: 'qplay',       label: 'QPlay / Y2K',    desc: '싸이월드·Y2K 네온 팝',      palette: ['#1a1a2e', '#25084a', '#ff007f', '#00f0ff'] },
  { id: 'crazyarcade', label: 'Crazy Arcade',   desc: '크레이지 아케이드 물풍선',   palette: ['#1a1a2e', '#0066ff', '#ffcc00', '#2ae0ff'] },
  { id: 'block',       label: 'Block',          desc: '장난감·블록·원색 게임 UI',   palette: ['#FFEBCD', '#FFFFFF', '#FF3B30', '#FFCC00'] },
  { id: 'cyworld',     label: 'Cyworld',        desc: '싸이월드 미니홈피 (구)',      palette: ['#e3f2fd', '#f6f6f6', '#ff6600', '#a6a6a6'] },
] as const

export type ThemeId = typeof THEMES[number]['id']

const EXTERNAL_THEMES = new Set(['retro', 'modern', 'win95', 'pink', 'macos', 'modernwhite', 'maple', 'qplay', 'crazyarcade', 'block', 'cyworld'])

export function applyTheme(theme: string): void {
  if (typeof document === 'undefined') return
  document.body.setAttribute('data-art', theme)

  const existing = document.getElementById('theme-extra-css') as HTMLLinkElement | null
  if (EXTERNAL_THEMES.has(theme)) {
    if (!existing) {
      const link = document.createElement('link')
      link.id = 'theme-extra-css'
      link.rel = 'stylesheet'
      link.href = `/themes/${theme}.css`
      document.head.appendChild(link)
    } else {
      existing.href = `/themes/${theme}.css`
    }
  } else {
    existing?.remove()
  }

  try { localStorage.setItem('sf-theme', theme) } catch {}
}

export function getSavedTheme(): string {
  try { return localStorage.getItem('sf-theme') ?? 'instagram' } catch { return 'instagram' }
}
