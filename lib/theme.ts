export const THEMES = [
  { id: 'instagram',   label: 'Instagram',      desc: 'IG 스타일 (기본)',          palette: ['#ffffff', '#fafafa', '#0095f6', '#000000'] },
  { id: 'retro',       label: 'Retro Pixel',    desc: '레트로 픽셀 감성',          palette: ['#f6d4ec', '#c9b6ff', '#e9d8f7', '#2b1f55'] },
  { id: 'modern',      label: 'Modern',         desc: '모던 소프트 UI',            palette: ['#ffffff', '#fce8f5', '#f1e3fa', '#ff6fb5'] },
  { id: 'win95',       label: 'Windows 95',     desc: '클래식 Win95 컨셉',         palette: ['#008080', '#c0c0c0', '#000080', '#ffffff'] },
  { id: 'pink',        label: 'Pink',           desc: '핑크 소프트 컨셉',          palette: ['#fff5f0', '#ffffff', '#ff6fa3', '#4a2e3a'] },
  { id: 'macos',       label: 'macOS',          desc: 'macOS 스타일 UI',           palette: ['#f5f5f7', '#ffffff', '#007aff', '#1d1d1f'] },
  { id: 'modernwhite', label: 'Modern White',   desc: 'iOS 스타일 클린 UI',        palette: ['#f5f5f7', '#ffffff', '#007aff', '#1c1c1e'] },
  { id: 'maple',       label: 'Sky Amber',      desc: '하늘빛 & 앰버 골드',        palette: ['#A5D1FF', '#FFF8E7', '#FF9900', '#333333'] },
  { id: 'qplay',       label: 'Cyber Neon',     desc: '다크 퍼플 & 네온 팝',       palette: ['#1a1a2e', '#25084a', '#ff007f', '#00f0ff'] },
  { id: 'crazyarcade', label: 'Neon Blue',      desc: '다크 네이비 & 네온 블루',   palette: ['#1a1a2e', '#0066ff', '#ffcc00', '#2ae0ff'] },
  { id: 'block',       label: 'Block',          desc: '장난감·블록·원색 게임 UI',   palette: ['#FFEBCD', '#FFFFFF', '#FF3B30', '#FFCC00'] },
  { id: 'cyworld',     label: 'Aqua Orange',    desc: '라이트 아쿠아 & 오렌지',    palette: ['#e3f2fd', '#f6f6f6', '#ff6600', '#a6a6a6'] },
  { id: 'kakao',       label: 'KakaoTalk',      desc: '카카오톡 옐로우 & 화이트',   palette: ['#ffffff', '#abc1d1', '#fee500', '#191919'] },
  { id: 'x',           label: 'X (Twitter)',    desc: '다크 잉크 & 블루 DM',       palette: ['#ffffff', '#f7f9f9', '#1d9bf0', '#0f1419'] },
  { id: 'excel',       label: '엑셀',           desc: 'Microsoft Excel 클린 그린',  palette: ['#185c37', '#217346', '#e9f5ee', '#1a1a1a'] },
  { id: 'retroexcel',  label: '레트로 엑셀',    desc: 'Excel 97 레트로 Win95',      palette: ['#c0c0c0', '#000080', '#ffffff', '#000000'] },
] as const

export type ThemeId = typeof THEMES[number]['id']

const EXTERNAL_THEMES = new Set(['modern', 'win95', 'pink', 'macos', 'modernwhite', 'maple', 'qplay', 'crazyarcade', 'block', 'cyworld', 'kakao', 'x', 'excel', 'retroexcel'])

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
  try { return localStorage.getItem('sf-theme') ?? 'retro' } catch { return 'retro' }
}
