export const THEMES = [
  { id: 'whif',         label: 'WHIF',         desc: '딥 블랙 & 바이올렛 미니멀',        palette: ['#0d0d0d', '#17171c', '#8b5cf6', '#f5f5f7'] },
  { id: 'claude-dark',  label: 'Claude Dark',  desc: '다크 차콜 & 앰버 오렌지',          palette: ['#1c1c1c', '#222222', '#d4692a', '#ececec'] },
  { id: 'gpt-dark',     label: 'GPT Dark',     desc: 'ChatGPT 다크 & GPT 그린',         palette: ['#212121', '#2f2f2f', '#10a37f', '#ececec'] },
  { id: 'gemini-dark',  label: 'Gemini Dark',  desc: 'Google Gemini 다크 & 멀티 그라디언트', palette: ['#131314', '#1e1f20', '#a8c7fa', '#9b72cb'] },
] as const

export type ThemeId = typeof THEMES[number]['id']

const EXTERNAL_THEMES = new Set(['whif', 'claude-dark', 'gpt-dark', 'gemini-dark'])

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
  try { return localStorage.getItem('sf-theme') ?? 'whif' } catch { return 'whif' }
}
