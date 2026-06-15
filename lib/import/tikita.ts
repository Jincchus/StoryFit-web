import type { Captured, AssembledCharacter } from './types'

// tikita.ai는 Supabase 백엔드(custom domain)를 쓰며, 공개 스토리는 anon 키로 REST 조회 가능하다.
// anon 키는 클라이언트 번들에 박힌 공개값 — 교체 가능성에 대비해 환경변수로 덮어쓸 수 있게 한다.
const TIKITA_BASE = process.env.TIKITA_API_BASE ?? 'https://auth.tikita.ai'
const TIKITA_ANON = process.env.TIKITA_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ2Fyd3psYmtvdml4dW5mcHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4ODE5NTcsImV4cCI6MjA3MTQ1Nzk1N30.pUYuSpHFRK3fLSii0IBFLVrAoj_wL2PVs8Gt7QLTIts'

function storageUrl(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${TIKITA_BASE}/storage/v1/object/public/${path.replace(/^\/+/, '')}`
}

function mapGender(g?: string): string {
  if (g === 'male') return '남성'
  if (g === 'female') return '여성'
  return ''
}

export async function captureTikita(url: string): Promise<Captured> {
  const shortId = url.match(/\/story\/([A-Za-z0-9_-]+)/)?.[1]
  if (!shortId) throw new Error('Tikita 스토리 URL이 아닙니다 (/story/{id} 형식 필요)')

  const headers = {
    apikey: TIKITA_ANON,
    Authorization: `Bearer ${TIKITA_ANON}`,
    Accept: 'application/json',
  }

  const swRes = await fetch(`${TIKITA_BASE}/rest/v1/story_with_metrics?short_id=eq.${encodeURIComponent(shortId)}&select=*`, { headers })
  if (!swRes.ok) throw new Error(`Tikita API 오류 (HTTP ${swRes.status})`)
  const rows = await swRes.json()
  const story = Array.isArray(rows) ? rows[0] : null
  if (!story?.id) throw new Error('Tikita 스토리를 찾을 수 없습니다')

  let detailChars: any[] = []
  try {
    const dRes = await fetch(`${TIKITA_BASE}/rest/v1/rpc/get_story_detail`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_story_id: story.id }),
    })
    if (dRes.ok) {
      const detail = await dRes.json()
      const d = Array.isArray(detail) ? detail[0] : detail
      detailChars = Array.isArray(d?.characters) ? d.characters : []
    }
  } catch { /* 상세 실패 시 스토리 단일 캐릭터로 폴백 */ }

  // 에피소드(챕터형 진행) — 크리에이터가 직접 설계한 순차 에피소드를 PlotChapter 형태로 변환
  let episodes: { index: number; title: string; goal: string; events: string[]; transition: string }[] = []
  try {
    const epRes = await fetch(
      `${TIKITA_BASE}/rest/v1/story_episodes?story_id=eq.${encodeURIComponent(story.id)}&select=*&order=display_order`,
      { headers }
    )
    if (epRes.ok) {
      const epRows = await epRes.json()
      if (Array.isArray(epRows)) {
        episodes = epRows.map((e: any, i: number) => ({
          index: i + 1,
          title: String(e.title || `${i + 1}화`).trim(),
          goal: String(e.body_md || '').trim(),
          events: [],
          transition: String(e.transition_condition || '').trim(),
        }))
      }
    }
  } catch { /* 에피소드 조회 실패 시 무시 — 단일 시작점으로 동작 */ }

  const tags: string[] = Array.from(new Set(
    [...(story.tags ?? []), ...(story.categories ?? [])].map((t: any) => String(t).trim()).filter(Boolean)
  ))
  const scenario = String(story.world || story.tagline || '').trim()
  const cover = storageUrl(story.thumbnail_url || story.story_thumbnail_url)
  const title = String(story.title || '').trim()

  const sorted = [...detailChars].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const characters: AssembledCharacter[] = sorted.map((c, i) => ({
    name: String(c.name || title || '캐릭터').slice(0, 100),
    gender: mapGender(c.gender),
    tags,
    additionalInfo: [c.character_intro, story.detail_md].map((s: any) => String(s || '').trim()).filter(Boolean).join('\n\n'),
    openingMessage: i === 0 ? String(story.first_message || '') : '',
    exampleDialogues: '',
    avatarUrl: storageUrl(c.avatar_url) || (i === 0 ? cover : ''),
  }))

  if (characters.length === 0) {
    characters.push({
      name: title || '캐릭터',
      gender: '',
      tags,
      additionalInfo: String(story.detail_md || '').trim(),
      openingMessage: String(story.first_message || ''),
      exampleDialogues: '',
      avatarUrl: cover,
    })
  }

  const canonical = `https://tikita.ai/ko/story/${shortId}`

  return {
    sections: [],
    title: '',
    imageUrl: cover,
    universeUrl: canonical,
    assembledResult: {
      characters,
      scenarioDescription: scenario,
      tags,
      title,
      safetyLevel: story.is_adult ? 'relaxed' : 'standard',
      coverImageUrl: cover,
    },
    tikitaMeta: {
      shortId,
      tagline: story.tagline ?? '',
      categories: story.categories ?? [],
      chatStarters: story.chat_starters ?? [],
      isAdult: !!story.is_adult,
      creatorNotes: story.creator_notes ?? '',
      introHtml: story.intro_html ?? null,
      introMode: story.intro_mode ?? null,
      episodes,
    },
  }
}
