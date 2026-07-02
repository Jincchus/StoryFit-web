import type { Captured, AssembledCharacter, PersonaPreset } from './types'
import type { StatEntry } from '@/types'
import { generateText } from '@/lib/ai/gemini'
import { parseRangeStates } from '@/lib/statRanges'

// transition이 비었거나 문장 종결로 안 끝나면(잘림/불완전) 도출 대상으로 본다.
function isWeakTransition(t: string): boolean {
  const s = (t || '').trim()
  if (s.length < 6) return true
  return !/[다함음죠네요.!?]$/.test(s)
}

// 에피소드 본문(body_md)에서 진행 판정용 events(항상)·transition(필요 시)을 도출한다.
// 실패하면 빈 결과를 반환해 원본을 그대로 유지한다. 플레이스홀더({{user}}/{{char1}})는 보존.
async function deriveEpisodeStructure(
  title: string, body: string, existingTransition: string, needTransition: boolean,
): Promise<{ events: string[]; transition?: string }> {
  const sys = '당신은 인터랙티브 스토리 에피소드 분석가입니다. JSON만 반환합니다.'
  const user = `아래 에피소드 본문에서 진행 판정용 정보를 뽑아라.
- events: 이 에피소드에서 실제로 일어나는 구체적 핵심 사건 2~3개 (본문에 명시된 것만)
${needTransition ? '- transition: 다음 에피소드로 넘어가는 "겉으로 확인 가능한 완료 조건" 1문장 (감정·심리 상태 금지, 사건·행동·상태 변화로)' : ''}

⚠️ {{user}}, {{char1}}, {{char2}} 같은 플레이스홀더는 절대 이름으로 바꾸지 말고 그대로 유지하라.

제목: ${title}
본문: ${body}
${existingTransition ? `기존 전환조건(잘렸을 수 있음, 참고만): ${existingTransition}` : ''}

반환(JSON만): {"events": ["..",".."]${needTransition ? ', "transition": ".."' : ''}}`
  try {
    const raw = await generateText(sys, user, 1024, 'relaxed')
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    const events = Array.isArray(parsed.events)
      ? parsed.events.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 3)
      : []
    const transition = needTransition && typeof parsed.transition === 'string' ? parsed.transition.trim() : undefined
    return { events, transition }
  } catch {
    return { events: [] }
  }
}

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

// story.template_personas → 제작자 페르소나 프리셋.
function buildTikitaPersonaPresets(arr: any): PersonaPreset[] {
  if (!Array.isArray(arr)) return []
  const out: PersonaPreset[] = []
  for (const p of arr) {
    const name = String(p?.name ?? p?.title ?? '').trim()
    const info = String(p?.description ?? p?.content ?? p?.intro ?? p?.persona_intro ?? p?.detail ?? '').trim()
    if (!name || !info) continue
    const img = storageUrl(p?.avatar_url ?? p?.image_url ?? p?.thumbnail_url)
    out.push({ name: name.slice(0, 60), additionalInfo: info, avatarUrl: img || undefined })
  }
  return out
}

function mapGender(g?: string): string {
  if (g === 'male') return '남성'
  if (g === 'female') return '여성'
  return ''
}

function stripHtml(html?: string | null): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// intro_html을 <!-- SECTION NAME --> 주석 기준으로 섹션별로 파싱한다.
// 텍스트가 없는 구조용 주석(이미지 레이어 설명 등)은 값이 빈 문자열이 돼 자동 제외된다.
function parseIntroSections(html: string | null | undefined): Record<string, string> {
  if (!html?.trim()) return {}
  const sections: Record<string, string> = {}
  // split with capture group → [before, name1, after1, name2, after2, ...]
  const parts = html.split(/<!--([\s\S]*?)-->/)
  let prevName: string | null = null
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // content chunk
      if (prevName !== null) {
        const text = stripHtml(parts[i]).trim()
        if (text) sections[prevName] = (sections[prevName] ? sections[prevName] + '\n' + text : text)
      }
    } else {
      // comment text → new section name
      prevName = parts[i].trim()
    }
  }
  return sections
}

// intro_html의 <!-- --> 주석 순서대로 섹션 이름 목록을 반환한다.
// jsonb는 object key를 알파벳 정렬하므로 순서 정보는 별도 배열로 보존해야 한다.
function parseIntroSectionOrder(html: string | null | undefined): string[] {
  if (!html?.trim()) return []
  const order: string[] = []
  const parts = html.split(/<!--([\s\S]*?)-->/)
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim()
    if (name && !order.includes(name)) order.push(name)
  }
  return order
}

// intro_html에 박힌 인라인 일러(<img>)를 추출한다 — stripHtml이 태그째 지우기 전에 따로 건진다.
function extractImgUrls(html?: string | null): string[] {
  const urls: string[] = []
  const re = /<img[^>]+src=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(String(html || '')))) urls.push(m[1])
  return Array.from(new Set(urls))
}

// 섹션별로 포함된 <img> URL을 추출한다 — parseIntroSections와 동일한 분할 로직,
// stripHtml 대신 extractImgUrls를 적용해 각 섹션의 이미지 목록을 반환한다.
function parseIntroSectionImages(html: string | null | undefined): Record<string, string[]> {
  if (!html?.trim()) return {}
  const result: Record<string, string[]> = {}
  const parts = html.split(/<!--([\s\S]*?)-->/)
  let prevName: string | null = null
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (prevName !== null) {
        const imgs = extractImgUrls(parts[i])
        if (imgs.length > 0) result[prevName] = [...(result[prevName] ?? []), ...imgs]
      }
    } else {
      prevName = parts[i].trim()
    }
  }
  return result
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
  let detailImages: any[] = []
  let creatorNickname = ''
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
      detailImages = Array.isArray(d?.images) ? d.images : []
      creatorNickname = String(d?.creator_nickname || '').trim()
    }
  } catch { /* 상세 실패 시 스토리 단일 캐릭터로 폴백 */ }

  // 에피소드(챕터형 진행) — 크리에이터가 직접 설계한 순차 에피소드를 PlotChapter 형태로 변환.
  // ⚠️ story_episodes REST는 RLS(is_story_confirmed_violation_for_non_owner)로 anon 401 →
  //    try/catch에 먹혀 조용히 0개가 됐었다(예시 10개 전부 누락). 실제 원본은 순차 에피소드로 진행.
  // → init_chat_session RPC는 anon으로 episodes[](id·title·body_md·display_order) 반환 → 이걸 소스로.
  let episodes: { index: number; title: string; goal: string; events: string[]; transition: string }[] = []
  // 변수(게이지형 스탯) — 신뢰도/보호욕 등. init_chat_session의 variables[]에서 함께 가져온다.
  let stats: StatEntry[] = []
  try {
    const icsRes = await fetch(`${TIKITA_BASE}/rest/v1/rpc/init_chat_session`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_story_id: story.id }),
    })
    if (icsRes.ok) {
      const ics = await icsRes.json()
      const s = Array.isArray(ics) ? ics[0] : ics

      // 변수 → 우리 statsConfig 게이지. default_value=시작값, description=증감규칙, range_description=구간 상태.
      const varRows = Array.isArray(s?.variables) ? s.variables : []
      stats = [...varRows]
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((v: any) => {
          const min = Number(v.min_value)
          const max = Number(v.max_value)
          const lo = Number.isFinite(min) ? min : 0
          const hi = Number.isFinite(max) ? max : 100
          const def = parseInt(String(v.default_value ?? ''), 10)
          const value = Number.isFinite(def) ? Math.max(lo, Math.min(hi, def)) : Math.round((lo + hi) / 2)
          return {
            name: String(v.name || '').trim().slice(0, 40),
            value, min: lo, max: hi,
            changeRules: String(v.description || '').trim() || undefined,
            rangeStates: parseRangeStates(v.range_description),
          } as StatEntry
        })
        .filter(st => st.name && st.max > st.min)

      const epRows = Array.isArray(s?.episodes) ? s.episodes : []
      episodes = [...epRows]
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((e: any, i: number) => ({
          index: i + 1,
          title: String(e.title || `${i + 1}화`).trim(),
          goal: String(e.body_md || '').trim(),
          events: [],
          transition: '', // init_chat_session엔 transition_condition 없음 → 아래서 body_md로 도출.
        }))

      // 빈 events(항상)·비었거나 잘린 transition을 본문에서 자동 도출 → 진행 판정 안정화.
      // 실패해도 원본 유지(도출은 best-effort). 에피소드별 병렬.
      await Promise.all(episodes.map(async (ep) => {
        const needEvents = ep.events.length === 0 && ep.goal.length > 0
        const needTransition = ep.goal.length > 0 && isWeakTransition(ep.transition)
        if (!needEvents && !needTransition) return
        const d = await deriveEpisodeStructure(ep.title, ep.goal, ep.transition, needTransition)
        if (needEvents && d.events.length) ep.events = d.events
        if (needTransition && d.transition) ep.transition = d.transition
      }))
    }
  } catch { /* 에피소드 조회/도출 실패 시 무시 — 단일 시작점으로 동작 */ }

  const tags: string[] = Array.from(new Set(
    [...(story.tags ?? []), ...(story.categories ?? [])].map((t: any) => String(t).trim()).filter(Boolean)
  ))
  const introText = story.intro_mode === 'html'
    ? stripHtml(story.intro_html)
    : (String(story.intro_md || '').trim() || stripHtml(story.intro_html))
  // detail_md는 스토리 레벨 시스템 설정(서술규칙·다른 등장인물·명령어·세계관)이므로 세계관(scenario)에 둔다.
  // (캐릭터별 additionalInfo에 넣으면 캐릭터 수만큼 프롬프트에 중복됐다 — 4캐릭터면 ×4.)
  const detailMdText = String(story.detail_md || '').trim()
  const scenario = [String(story.world || '').trim(), detailMdText, introText].filter(Boolean).join('\n\n')
    || String(story.tagline || '').trim()
  const cover = storageUrl(story.thumbnail_url || story.story_thumbnail_url)
  const title = String(story.title || '').trim()

  // 인라인 일러(도입부 본문 <img>) — stripHtml로 사라지기 전에 따로 보존.
  const inlineIllustrations = extractImgUrls(story.intro_html).map(u => storageUrl(u)).filter(Boolean)
  // 이미지 갤러리 — 대부분 Tik 결제/턴 잠금이라 image_url이 null. preview/locked 썸네일까지 건진다.
  const gallery = [...detailImages]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((im: any) => ({
      url: storageUrl(im.image_url || im.preview_url || im.locked_image_url),
      description: String(im.description || '').trim(),
      locked: !im.is_unlocked,
      tikCost: im.unlock_tik_cost ?? 0,
      requiredTurns: im.required_turns ?? 0,
      order: im.display_order ?? 0,
    }))
    .filter(g => g.url)

  const sorted = [...detailChars].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const characters: AssembledCharacter[] = sorted.map((c, i) => ({
    name: String(c.name || title || '캐릭터').slice(0, 100),
    gender: mapGender(c.gender),
    tags,
    additionalInfo: String(c.character_intro || '').trim(), // 캐릭터 고유 설정만. detail_md는 세계관(scenario)으로 이동.
    openingMessage: i === 0 ? String(story.first_message || '') : '',
    exampleDialogues: '',
    avatarUrl: storageUrl(c.avatar_url) || (i === 0 ? cover : ''),
    relatedImages: i === 0 && inlineIllustrations.length > 0 ? inlineIllustrations : undefined,
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
  const introSections = parseIntroSections(story.intro_html)
  const introSectionOrder = parseIntroSectionOrder(story.intro_html)
  const introSectionImages = parseIntroSectionImages(story.intro_html)

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
    ...(buildTikitaPersonaPresets(story.template_personas).length ? { personaPresets: buildTikitaPersonaPresets(story.template_personas) } : {}),
    tikitaMeta: {
      shortId,
      tagline: story.tagline ?? '',
      categories: story.categories ?? [],
      chatStarters: story.chat_starters ?? [],
      isAdult: !!story.is_adult,
      creatorNotes: story.creator_notes ?? '',
      introHtml: story.intro_html ?? null,
      introMode: story.intro_mode ?? null,
      introHtmlText: stripHtml(story.intro_html),
      introSections,
      introSectionOrder,
      introSectionImages,
      detailMd: String(story.detail_md || '').trim(),
      episodes,
      stats,
      gallery,
      inlineIllustrations,
      creatorNickname,
      originalWorkTitle: String(story.original_work_title || '').trim(),
      chatImageMode: story.chat_image_mode ?? null,
      isCinema: !!story.is_cinema,
    },
  }
}
