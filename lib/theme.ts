export const THEMES = [
  { id: 'instagram', label: 'Instagram',    desc: 'IG 스타일 (기본)',          palette: ['#ffffff', '#fafafa', '#0095f6', '#000000'] },
  { id: 'win95',     label: 'Windows 95',  desc: '클래식 Win95 컨셉',         palette: ['#008080', '#c0c0c0', '#000080', '#ffffff'] },
  { id: 'pink',      label: 'Cyworld Pink', desc: '싸이월드 미니홈피 감성',    palette: ['#fff5f0', '#ffffff', '#ff6fa3', '#4a2e3a'] },
  { id: 'macos',     label: 'macOS',       desc: 'macOS 스타일 UI',           palette: ['#f5f5f7', '#ffffff', '#007aff', '#1d1d1f'] },
] as const

export type ThemeId = typeof THEMES[number]['id']

const EXTERNAL_THEMES = new Set(['win95', 'pink', 'macos'])

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
