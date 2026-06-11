'use client'
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { AI_MODELS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import MessageBlocks from '@/components/ui/MessageBlocks'
import NovelScene from '@/components/ui/NovelScene'
import { parseBlocks, parseNovelBlocks } from '@/lib/parseBlocks'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Toast from '@/components/ui/Toast'
import type { AIProvider, Character } from '@/types'
import { getConvStream, clearConvStream, subscribeConvStream, runConvStream, runConvRegenerate } from '@/lib/conversationStream'
import AiPill from '@/components/ui/AiPill'
import { useSpeech } from './_hooks/useSpeech'
import { useLorebook } from './_hooks/useLorebook'
import { useMemoryPanel } from './_hooks/useMemoryPanel'
import { applyTheme, getSavedTheme, THEMES } from '@/lib/theme'

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function isSamePerson(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = a.trim(), nb = b.trim()
  if (na === nb) return true
  if (Math.abs(na.length - nb.length) > 2) return false
  const maxDist = Math.max(1, Math.floor(Math.min(na.length, nb.length) / 3))
  return editDistance(na, nb) <= maxDist
}

function ComposerCharCount({ composerRef }: { composerRef: React.RefObject<HTMLTextAreaElement> }) {
  const [len, setLen] = useState(0)
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    const handler = () => setLen(el.value.length)
    el.addEventListener('input', handler)
    return () => el.removeEventListener('input', handler)
  }, [composerRef])
  if (len < 50) return null
  return <div className="tiny muted" style={{ textAlign: 'right', paddingRight: 2, fontSize: 9, opacity: 0.6 }}>{len}자</div>
}

const STORY_SEP_RE = /^(-{3,}|\*{3,}|={3,})\s*$/

function parseStoryChoices(content: string): { body: string; choices: string[] } {
  const lines = content.split('\n')
  let sepIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (STORY_SEP_RE.test(lines[i].trim())) { sepIdx = i; break }
  }
  if (sepIdx === -1) return { body: content, choices: [] }
  const body = lines.slice(0, sepIdx).join('\n').trim()
  const choices = lines
    .slice(sepIdx + 1)
    .map(l => l.replace(/^[①②③④⑤][\s.]*/,'').replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(Boolean)
  return { body, choices }
}


function ChatNarration({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*|\n)/)
  return (
    <>
      {parts.map((p, i) =>
        p === '\n' ? <br key={i} />
        : p.startsWith('*') && p.endsWith('*')
          ? <em key={i}>{p.slice(1, -1)}</em>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

interface Msg { id: string; role: string; content: string; aiModel?: string; branchCount?: number; branchIndex?: number; siblingIds?: string[]; parentId?: string | null; characterId?: string | null; inputTokens?: number; outputTokens?: number }
interface ConvChar { character: { id: string; name: string; kind: string; avatarUrl?: string; openingMessage?: string } }
interface Conv {
  id: string; title: string; mode: string; currentAI: string; coreMemory: string; statusTimeline: string; scenarioDescription: string; branchDescription: string
  statsEnabled: boolean; statsConfig: { name: string; value: number; min: number; max: number }[] | null
  inventoryEnabled: boolean; inventory: { name: string; qty: number; description?: string }[] | null
  styleConfig?: Record<string, string | null> | null
  sourceLorebookUrls?: { url: string; name: string }[] | null
  suggestRepliesEnabled?: boolean
  chapter?: number
  characters: ConvChar[]
  personaCharacter?: { id: string; name: string; avatarUrl?: string | null; tags: string[]; additionalInfo: string } | null
  messages: Msg[]
}
interface LbEntry { id: string; keyword: string[]; content: string; priority: number; scanDepth: number }
interface BranchInfo { id: string; version: number; branchDescription: string; branchFromMessageId: string | null; rootConversationId: string | null }

const COMMANDS = [
  { name: '!상태창', desc: '📊 전체 상태창 (스탯 + 소지품 + 상황)' },
  { name: '!스탯', desc: '❤️ 스탯 및 캐릭터 호감도 조회' },
  { name: '!인벤토리', desc: '🎒 소지하고 있는 아이템 목록 조회' },
  { name: '!상황', desc: '🎬 현재 씬의 상황(타임라인) 조회' },
  { name: '!도움말', desc: '⚙️ 시스템 명령어 도움말' },
]

export default function ChatPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [conv, setConv] = useState<Conv | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)

  const loadSuggestions = async () => {
    if (suggestLoading) return
    setSuggestLoading(true)
    try {
      const r = await api.post(`/api/conversations/${params.id}/suggestions`, {})
      setSuggestions(Array.isArray(r.suggestions) ? r.suggestions : [])
    } catch { setSuggestions([]) }
    finally { setSuggestLoading(false) }
  }
  const [loadingConv, setLoadingConv] = useState(true)
  const [ttsRate, setTtsRate] = useState(1.0)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTtsRate(parseFloat(localStorage.getItem('sf_tts_rate') ?? '1.0'))
    }
  }, [])
  const [messages, setMessages] = useState<Msg[]>([])
  const [streaming, setStreaming] = useState('')
  const [typing, setTyping] = useState(false)
  const [streamingCharId, setStreamingCharId] = useState<string | null>(null)
  const [sendError, setSendError] = useState('')
  const [model, setModel] = useState<AIProvider>('gemini')
  const [showPanel, setShowPanel] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [panelOpen, setPanelOpen] = useState<Record<string, boolean>>({ memory: true, lorebook: false, branch: false, style: false, persona: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [allChars, setAllChars] = useState<Character[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  // 로어북/메모리/STT-TTS → 커스텀 훅으로 분리 (아래에서 초기화)
  const [hasNew, setHasNew] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const oldestIdRef = useRef<string | null>(null)
  const shouldScrollRef = useRef(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [infoTip, setInfoTip] = useState<string | null>(null)
  const [sendErrorRetryable, setSendErrorRetryable] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [branchTargetMsgId, setBranchTargetMsgId] = useState<string | null>(null)
  const [branchDesc, setBranchDesc] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const scrollSnapRef = useRef<{ top: number; height: number } | null>(null)
  const typingRef = useRef(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const patchDebounceRef = useRef<Partial<Record<string, ReturnType<typeof setTimeout>>>>({})
  const lastSentRef = useRef('')
  const streamUnsubRef = useRef<(() => void) | null>(null)
  const [typingDuration, setTypingDuration] = useState(0)
  const typingStartRef = useRef(0)

  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)

  const filteredCommands = COMMANDS.filter(cmd =>
    cmd.name.toLowerCase().startsWith(commandQuery.toLowerCase())
  )

  // 입력어가 바뀌어 필터링된 목록 길이가 줄어들면 이전 인덱스가 범위를 벗어나
  // filteredCommands[selectedCommandIndex]가 undefined가 되어 Enter 선택 시 TypeError가 난다.
  useEffect(() => { setSelectedCommandIndex(0) }, [commandQuery])

  const selectCommand = (cmdText: string) => {
    if (composerRef.current) {
      composerRef.current.value = cmdText
      composerRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      composerRef.current.focus()
    }
    setShowCommandMenu(false)
  }

  const handleComposerInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    // JS 기반 auto-resize: textarea 요소만 targeted reflow (field-sizing:content는 매 키 입력마다 전체 페이지 reflow 유발)
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    const val = el.value
    if (val.startsWith('!') && !val.includes(' ')) {
      setShowCommandMenu(true)
      setCommandQuery(val)
    } else {
      setShowCommandMenu(false)
    }
  }

  useEffect(() => { typingRef.current = typing }, [typing])

  // 스토리 선택지 1~4 숫자키 단축키
  const convModeRef = useRef('')
  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (convModeRef.current !== 'story' && convModeRef.current !== 'multiStory') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      const n = parseInt(e.key)
      if (n >= 1 && n <= 4 && !typingRef.current) {
        const lastAiMsg = [...messagesRef.current].reverse().find(m => m.role === 'assistant')
        if (!lastAiMsg) return
        const { choices } = parseStoryChoices(lastAiMsg.content)
        if (choices[n - 1]) { e.preventDefault(); send(choices[n - 1]) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!typing || streaming) { setTypingDuration(0); return }
    const id = setInterval(() => setTypingDuration(Math.floor((Date.now() - typingStartRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [typing, streaming])

  const loadConv = useCallback(async () => {
    try {
      const [data, msgRes]: [Conv, { messages: Msg[]; hasMore: boolean; oldestId: string | null }] = await Promise.all([
        api.get(`/api/conversations/${params.id}`),
        api.get(`/api/conversations/${params.id}/messages`),
      ])
      setConv(data)
      if (logRef.current && !shouldScrollRef.current) {
        scrollSnapRef.current = { top: logRef.current.scrollTop, height: logRef.current.scrollHeight }
      }
      setMessages(msgRes.messages)
      setHasMore(msgRes.hasMore)
      oldestIdRef.current = msgRes.oldestId
      convModeRef.current = data.mode
      setModel(data.currentAI as AIProvider)
    } catch (err: any) {
      if (err?.message === 'universe_placeholder') {
        router.replace('/whif')
        return
      }
      // 언마운트 중 호출되거나 네트워크 오류 시 무시
    } finally {
      setLoadingConv(false)
    }
  }, [params.id])

  useEffect(() => { shouldScrollRef.current = true; loadConv() }, [loadConv])

  useEffect(() => {
    const existing = getConvStream(params.id)
    if (!existing) return

    setTyping(true)
    setStreaming(existing.text)

    if (existing.done) {
      setTyping(false)
      clearConvStream(params.id)
      loadConv().then(() => setStreaming('')).catch(() => setStreaming(''))
      return
    }

    const unsub = subscribeConvStream(params.id, () => {
      const cs = getConvStream(params.id)
      if (!cs) return
      setStreaming(cs.text)
      if (cs.error) { setSendError(cs.error); setSendErrorRetryable(cs.retryable) }
      if (cs.done) {
        setTyping(false)
        setStreamingCharId(null)
        clearConvStream(params.id)
        unsub()
        loadConv().then(() => setStreaming('')).catch(() => setStreaming(''))
      }
    })

    return unsub
  }, [params.id])

  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState !== 'visible') return
      // 폴링이 살아있으면 자동으로 재개됨. 스트림 없이 화면 복귀 시에만 loadConv 호출
      if (!getConvStream(params.id)) {
        setMessages(prev => prev.filter(m => !m.id.startsWith('tmp-')))
        loadConv().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [loadConv, params.id])

  const loadBranches = useCallback(() => {
    api.get(`/api/conversations/${params.id}/branches`).then(setBranches).catch(() => {})
  }, [params.id])

  useEffect(() => { loadBranches() }, [loadBranches])

  const handleDeleteBranch = async (b: BranchInfo) => {
    if (!window.confirm(`v${b.version} 분기를 삭제할까요? 이 분기의 모든 메시지가 사라지며 되돌릴 수 없습니다.`)) return
    const isCurrent = b.id === params.id
    const fallback = branches.find(x => x.id !== b.id) // 삭제 후 남을 분기(스위처는 2개+일 때만 보이므로 항상 존재)
    try {
      await api.delete(`/api/conversations/${b.id}`)
      if (isCurrent) {
        if (fallback) router.push(`/conversations/${fallback.id}`)
        else router.push('/chatlist')
      } else {
        loadBranches()
      }
    } catch {
      setToast('분기 삭제에 실패했습니다')
    }
  }

  useEffect(() => {
    api.get('/api/characters').then(setAllChars).catch(() => {})
  }, [])

  const loadMore = async () => {
    if (loadingMore || !hasMore || !oldestIdRef.current) return
    setLoadingMore(true)
    try {
      const el = logRef.current
      const prevHeight = el?.scrollHeight ?? 0
      const res: { messages: Msg[]; hasMore: boolean; oldestId: string | null } =
        await api.get(`/api/conversations/${params.id}/messages?cursor=${oldestIdRef.current}`)
      setMessages(prev => [...res.messages, ...prev])
      setHasMore(res.hasMore)
      oldestIdRef.current = res.oldestId
      // 스크롤 위치 유지
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight
      })
    } catch { setToast('이전 메시지를 불러오지 못했습니다') }
    finally { setLoadingMore(false) }
  }

  const scrollToBottom = () => {
    if (logRef.current) { logRef.current.scrollTop = logRef.current.scrollHeight; setHasNew(false) }
  }

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const onScroll = () => {
      const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (isBottom) setHasNew(false)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const snap = scrollSnapRef.current
    const el = logRef.current
    if (!snap || !el) return
    scrollSnapRef.current = null
    const wasAtBottom = snap.height - snap.top - el.clientHeight < 80
    if (!wasAtBottom) {
      el.scrollTop = snap.top
    }
  }, [messages])

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    if (shouldScrollRef.current) {
      if (messages.length > 0) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight
          setHasNew(false)
        })
        shouldScrollRef.current = false
      }
      return
    }
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (!isBottom) setHasNew(true)
  }, [messages.length])

  const subscribeStream = useCallback((convId: string) => {
    streamUnsubRef.current?.()
    const unsub = subscribeConvStream(convId, () => {
      const cs = getConvStream(convId)
      if (!cs) return
      setStreaming(cs.text)
      if (cs.error) { setSendError(cs.error); setSendErrorRetryable(cs.retryable) }
      if (cs.done) {
        setTyping(false)
        setStreamingCharId(null)
        clearConvStream(convId)
        streamUnsubRef.current = null
        unsub()
        loadConv().then(() => setStreaming('')).catch(() => setStreaming(''))
      }
    })
    streamUnsubRef.current = unsub
    return unsub
  }, [loadConv])

  useEffect(() => {
    return () => {
      streamUnsubRef.current?.()
      streamUnsubRef.current = null
    }
  }, [params.id])

  useEffect(() => {
    if (!conv?.suggestRepliesEnabled) return
    if (typing) return
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') loadSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.suggestRepliesEnabled, typing, messages.length])

  const fillComposer = (content: string) => {
    if (composerRef.current) {
      composerRef.current.value = content
      composerRef.current.focus()
    }
  }

  const send = (content?: string) => {
    const msg = content ?? composerRef.current?.value ?? ''
    if (!msg.trim() || typing) return
    lastSentRef.current = msg
    typingStartRef.current = Date.now()
    setTypingDuration(0)
    if (!content && composerRef.current) {
      composerRef.current.value = ''
      composerRef.current.style.height = '36px'
    }
    shouldScrollRef.current = true
    setMessages(prev => [...prev, { id: 'tmp-' + Date.now(), role: 'user', content: msg }])
    setTyping(true)
    setStreaming('')
    setSendError('')
    setSendErrorRetryable(false)
    runConvStream(params.id, msg).catch(() => {})
    subscribeStream(params.id)
  }

  const stopStream = () => {
    streamUnsubRef.current?.()
    streamUnsubRef.current = null
    clearConvStream(params.id)
    setTyping(false)
    setStreaming('')
    setStreamingCharId(null)
    setMessages(prev => prev.filter(m => !m.id.startsWith('tmp-')))
    loadConv().catch(() => {})
  }

  // ── 커스텀 배경 및 테마 설정 ──────────────────────────────────────────
  const [customBg, setCustomBg] = useState('')
  const [currentTheme, setCurrentTheme] = useState('retro')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentTheme(getSavedTheme())
      if (params.id) {
        setCustomBg(localStorage.getItem('sf_bg_' + params.id) || '')
      }
    }
  }, [params.id])

  // ── 보이스 통화 모드 (Live Call) 설정 ──────────────────────────────────
  const [showVoiceCall, setShowVoiceCall] = useState(false)
  const [voiceCallStatus, setVoiceCallStatus] = useState<'connecting' | 'speaking' | 'listening' | 'thinking'>('connecting')
  const [userCallText, setUserCallText] = useState('')
  const [charCallText, setCharCallText] = useState('')
  const callRecognitionRef = useRef<any>(null)
  const callUtteranceRef = useRef<any>(null)

  const activeCharForCall = conv?.characters[0]?.character

  const startListeningCall = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) {
      setToast('이 브라우저는 음성 인식을 지원하지 않습니다.')
      return
    }

    if (callRecognitionRef.current) {
      try { callRecognitionRef.current.stop() } catch {}
    }

    const recognition = new SR()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => {
      setVoiceCallStatus('listening')
    }
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      if (transcript.trim()) {
        setUserCallText(transcript)
        setVoiceCallStatus('thinking')
        send(transcript)
      } else {
        startListeningCall()
      }
    }
    recognition.onerror = (e: any) => {
      console.error('Call Recognition error:', e)
      setTimeout(() => {
        if (showVoiceCall) startListeningCall()
      }, 1000)
    }
    recognition.onend = () => {
      // auto restart
    }

    callRecognitionRef.current = recognition
    recognition.start()
  }, [showVoiceCall, send])

  const speakVoiceCall = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    if (callRecognitionRef.current) {
      try { callRecognitionRef.current.stop() } catch {}
    }

    const plain = text.replace(/\*([^*]+)\*/g, '$1').replace(/["'"]/g, '')
    const utter = new SpeechSynthesisUtterance(plain)
    utter.lang = 'ko-KR'
    utter.rate = ttsRate

    utter.onstart = () => {
      setVoiceCallStatus('speaking')
      setCharCallText(text)
    }
    utter.onend = () => {
      startListeningCall()
    }
    utter.onerror = (e) => {
      console.error('TTS Call error:', e)
      startListeningCall()
    }

    callUtteranceRef.current = utter

    const doSpeak = () => {
      const voices = window.speechSynthesis.getVoices()
      const koVoice = voices.find(v => v.lang.startsWith('ko'))
      if (koVoice) utter.voice = koVoice
      window.speechSynthesis.speak(utter)
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      doSpeak()
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null
        doSpeak()
      }
    }
  }, [ttsRate, startListeningCall])

  const endVoiceCall = useCallback(() => {
    setShowVoiceCall(false)
    window.speechSynthesis?.cancel()
    if (callRecognitionRef.current) {
      try { callRecognitionRef.current.stop() } catch {}
      callRecognitionRef.current = null
    }
  }, [])

  const extractDialogue = (content: string): string => {
    const matches: string[] = []
    const regex = /"([^"]+)"/g
    let match
    while ((match = regex.exec(content)) !== null) {
      matches.push(match[1])
    }
    if (matches.length > 0) {
      return matches.join(' ')
    }
    return content.replace(/\*[^*]+\*/g, '').replace(/\s+/g, ' ').trim()
  }

  useEffect(() => {
    if (showVoiceCall) {
      const lastAiMsg = [...messagesRef.current].reverse().find(m => m.role === 'assistant')
      const initialText = lastAiMsg ? lastAiMsg.content : (activeCharForCall?.openingMessage || '안녕하세요.')
      speakVoiceCall(extractDialogue(initialText))
    } else {
      window.speechSynthesis?.cancel()
      if (callRecognitionRef.current) {
        try { callRecognitionRef.current.stop() } catch {}
      }
    }
    return () => {
      window.speechSynthesis?.cancel()
      if (callRecognitionRef.current) {
        try { callRecognitionRef.current.stop() } catch {}
      }
    }
  }, [showVoiceCall, activeCharForCall])

  useEffect(() => {
    if (!showVoiceCall) return
    if (!typing && voiceCallStatus === 'thinking') {
      const lastAiMsg = [...messagesRef.current].reverse().find(m => m.role === 'assistant')
      if (lastAiMsg) {
        speakVoiceCall(extractDialogue(lastAiMsg.content))
      } else {
        setVoiceCallStatus('listening')
      }
    }
  }, [typing, showVoiceCall, speakVoiceCall, voiceCallStatus])

  // ── 커스텀 훅 인스턴스화 ──────────────────────────────────────────────
  const { isListening, speakingId, startListening, stopListening, speak, stopSpeaking } = useSpeech(composerRef, ttsRate)
  const {
    lorebooks, lorebookAdd, setLorebookAdd,
    lorebookEditId, setLorebookEditId,
    lbForm, setLbForm,
    lorebookError,
    handleAddLorebook, handlePatchLorebook, handleDeleteLorebook,
    showLorebookImport, setShowLorebookImport,
    lorebookImportText, setLorebookImportText,
    lorebookImporting, handleImportLorebook,
  } = useLorebook(params.id, setToast)
  // useMemoryPanel은 handleCoreMemory 선언 이후에 초기화 (아래 참고)
  // ── /커스텀 훅 ────────────────────────────────────────────────────────

  const handleCreateBranch = async () => {
    if (!branchTargetMsgId || creatingBranch) return
    setCreatingBranch(true)
    try {
      const { id } = await api.post(`/api/conversations/${params.id}/branch`, {
        branchFromMessageId: branchTargetMsgId,
        description: branchDesc.trim(),
      })
      router.push(`/conversations/${id}`)
    } catch {
      setCreatingBranch(false)
      setToast('분기 생성에 실패했습니다')
    }
  }

  const handleDelete = async (msgId: string) => {
    try {
      await api.delete(`/api/conversations/${params.id}/messages`, { messageId: msgId })
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch { setToast('메시지 삭제에 실패했습니다') }
    setConfirmDeleteId(null)
  }

  const saveEditOnly = async (content: string, msgId: string) => {
    if (!content.trim()) return
    await api.patch(`/api/conversations/${params.id}/messages`, { messageId: msgId, content: content.trim() })
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: content.trim() } : m))
    setEditingId(null)
    setToast('저장 완료')
  }


  const handleRegenerate = () => {
    if (typing) return
    typingStartRef.current = Date.now()
    setTypingDuration(0)
    setTyping(true)
    setStreaming('')
    setSendError('')
    setSendErrorRetryable(false)
    runConvRegenerate(params.id).catch(() => {})
    subscribeStream(params.id)
  }

  const handleBranchSwitch = async (targetMessageId: string) => {
    await api.patch(`/api/conversations/${params.id}/messages`, { targetMessageId })
    await loadConv()
  }

  const startEdit = (id: string) => { setEditingId(id) }

  const saveEdit = async (content: string, msgId: string) => {
    if (!content.trim()) return
    const idx = messages.findIndex(m => m.id === msgId)
    const toDelete = messages.slice(idx)
    for (const m of toDelete) {
      await api.delete(`/api/conversations/${params.id}/messages`, { messageId: m.id })
    }
    setMessages(prev => prev.slice(0, idx))
    setEditingId(null)
    await send(content.trim())
  }

  const handleModelChange = async (id: AIProvider) => {
    setModel(id)
    await api.patch(`/api/conversations/${params.id}`, { currentAI: id })
  }

  const handleInventoryDelete = async (index: number) => {
    if (!conv?.inventory) return
    const next = conv.inventory.filter((_, i) => i !== index)
    setConv(c => c ? { ...c, inventory: next } : c)
    await api.patch(`/api/conversations/${params.id}`, { inventory: next }).catch(() => {})
  }

  const handleTitleSave = async () => {
    if (!titleInput.trim() || !conv) return
    try {
      await api.patch(`/api/conversations/${params.id}`, { title: titleInput.trim() })
      setConv(c => c ? { ...c, title: titleInput.trim() } : c)
      setEditingTitle(false)
    } catch { setToast('제목 저장에 실패했습니다') }
  }

  const handlePersonaChange = async (charId: string | null) => {
    try {
      await api.patch(`/api/conversations/${params.id}`, { personaCharacterId: charId })
      const found = allChars.find(c => c.id === charId) ?? null
      setConv(c => c ? { ...c, personaCharacter: found ? { id: found.id, name: found.name, avatarUrl: found.avatarUrl ?? null, tags: found.tags ?? [], additionalInfo: found.additionalInfo ?? '' } : null } : c)
    } catch { setToast('페르소나 변경에 실패했습니다') }
  }

  const pendingPatchRef = useRef<Record<string, string>>({})

  const debouncedPatch = (field: string, value: string) => {
    pendingPatchRef.current[field] = value
    if (patchDebounceRef.current[field]) clearTimeout(patchDebounceRef.current[field]!)
    patchDebounceRef.current[field] = setTimeout(() => {
      delete pendingPatchRef.current[field]
      api.patch(`/api/conversations/${params.id}`, { [field]: value }).catch(() => {})
    }, 600)
  }

  useEffect(() => {
    const onUnload = () => {
      if (Object.keys(pendingPatchRef.current).length === 0) return
      fetch(`/api/conversations/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingPatchRef.current),
        keepalive: true,
        credentials: 'include',
      })
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [params.id])

  const handleCoreMemory = (value: string) => {
    setConv(c => c ? { ...c, coreMemory: value } : c)
    debouncedPatch('coreMemory', value)
  }

  // 승격 API가 이미 서버에 저장한 값 → 로컬 state만 갱신(디바운스 patch 안 함)
  const applyServerCoreMemory = (value: string) => {
    setConv(c => c ? { ...c, coreMemory: value } : c)
  }

  // handleCoreMemory 이후에 메모리 훅 초기화
  const {
    memories, memoryError, promoting,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories,
    toggleMemorySelect, toggleExpandPromoted,
  } = useMemoryPanel(params.id, setToast, applyServerCoreMemory)

  const handleStatusTimeline = (value: string) => {
    setConv(c => c ? { ...c, statusTimeline: value } : c)
    debouncedPatch('statusTimeline', value)
  }

  const handleScenarioDescription = (value: string) => {
    setConv(c => c ? { ...c, scenarioDescription: value } : c)
    debouncedPatch('scenarioDescription', value)
  }

  const handleStyleConfig = (key: string, val: string) => {
    const next = { ...(conv?.styleConfig ?? {}), [key]: conv?.styleConfig?.[key] === val ? null : val }
    setConv(c => c ? { ...c, styleConfig: next } : c)
    api.patch(`/api/conversations/${params.id}`, { styleConfig: next }).catch(() => {})
  }

  const handleBranchDescription = (value: string) => {
    setConv(c => c ? { ...c, branchDescription: value } : c)
    debouncedPatch('branchDescription', value)
  }

  if (loadingConv) return (
    <Win title="채팅" icon={PixelIcons.chat} noTitle>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
        <div className="tiny muted">대화 불러오는 중...</div>
      </div>
    </Win>
  )
  if (!conv) return null
  const char = conv.characters[0]?.character
  if (!char) return null

  const isNovel = conv.mode === 'novel'
  const isTikiTaka = conv.mode === 'tikiTaka' || conv.mode === 'multiStory'
  const isStory = conv.mode === 'story'
  const isStoryOrMulti = conv.mode === 'story' || conv.mode === 'multiStory'
  const lastMsg = messages[messages.length - 1]
  const isLastAssistant = lastMsg?.role === 'assistant'

  const charMap = new Map(conv.characters.map(cc => [cc.character.id, cc.character]))
  const getMsgChar = (m: Msg) => (m.characterId ? charMap.get(m.characterId) ?? char : char)
  const streamingChar = streamingCharId ? charMap.get(streamingCharId) ?? char : char

  return (
    <>
    {toast && <Toast message={toast} onDone={() => setToast('')} />}
    {confirmDeleteId && (
      <ConfirmDialog
        message="이 메시지를 삭제할까요? 복구할 수 없습니다."
        onConfirm={() => handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    )}
    {showBranchModal && (
      <>
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100 }}
          onClick={() => setShowBranchModal(false)}
        />
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 101, background: 'var(--paper, #fff)',
          border: '1.5px solid rgba(0,0,0,.12)', borderRadius: 12,
          padding: 20, width: 'min(320px, 90vw)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>⑂ 이 메시지에서 분기 만들기</div>
          <div className="tiny muted" style={{ lineHeight: 1.5 }}>
            이 메시지까지의 대화를 복사해 새로운 타임라인을 시작합니다.
          </div>
          <input
            className="field"
            placeholder="분기 설명 (예: 루나가 거절하는 방향)"
            value={branchDesc}
            onChange={e => setBranchDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch() }}
            autoFocus
            maxLength={100}
          />
          <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => setShowBranchModal(false)}>취소</button>
            <button className="btn primary" style={{ fontSize: 11 }} disabled={creatingBranch} onClick={handleCreateBranch}>
              {creatingBranch ? '생성 중...' : '분기 만들기'}
            </button>
          </div>
        </div>
      </>
    )}
    <Win title={isTikiTaka ? `채팅 — ${conv.characters.map(cc => cc.character.name).join(', ')}` : `채팅 — ${char.name}`} icon={PixelIcons.chat} noTitle>
      <div className="vstack" style={{ gap: 8, flex: 1, minHeight: 0 }}>
        <div className="chat-header spread">
          <div className="hstack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
            <button className="btn ghost" onClick={() => router.push('/chatlist')} style={{ padding: '2px 6px', flexShrink: 0 }} aria-label="채팅 목록으로">←</button>
            <div className="thumb" style={{ width: 34, height: 34, background: 'var(--lavender)', border: '1.5px solid var(--chrome-border)', display: 'grid', placeItems: 'center', imageRendering: 'pixelated', borderRadius: 'var(--radius)', flexShrink: 0 }}>
              {char.avatarUrl
                ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : <PixelAvatar kind={char.kind as any} size={30} />
              }
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="hstack" style={{ gap: 5, overflow: 'hidden' }}>
                <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isTikiTaka ? conv.characters.map(cc => cc.character.name).join(' · ') : char.name}
                  {conv.personaCharacter
                    ? <button className="btn ghost" style={{ fontSize: 10, padding: '0 5px', fontWeight: 400, color: 'var(--ink-soft)' }} onClick={() => setShowPanel(true)} aria-label="페르소나 변경">· {conv.personaCharacter.name} ▾</button>
                    : <button className="btn ghost" style={{ fontSize: 10, padding: '0 5px', fontWeight: 400, color: 'var(--ink-faint)' }} onClick={() => setShowPanel(true)} aria-label="페르소나 설정">+ 페르소나</button>
                  }
                </span>
                <span className="mode-badge">{isNovel ? '소설' : isTikiTaka ? '👥 멀티' : isStory ? '스토리' : '롤플레이'}</span>
                {conv?.suggestRepliesEnabled && (conv.chapter ?? 1) > 0 && (
                  <span className="melting-chapter-badge" style={{ marginLeft: 6 }}>{conv.chapter ?? 1}장</span>
                )}
              </div>
              <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                턴 {Math.floor(messages.length / 2)}
                {conv.statusTimeline && <span> · {conv.statusTimeline}</span>}
              </div>
            </div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 4 }}>
            {/* <AiPill modelId={model} onChange={handleModelChange} /> */}
            {isStoryOrMulti && conv.inventoryEnabled && (
              <button
                className={`btn ${showInventory ? 'primary' : 'ghost'}`}
                style={{ padding: '3px 7px', fontSize: 10 }}
                aria-label="인벤토리"
                onClick={() => { setShowInventory(p => !p); setShowStats(false) }}
              >🎒</button>
            )}
            {isStoryOrMulti && conv.statsEnabled && conv.statsConfig && conv.statsConfig.length > 0 && (
              <button
                className={`btn ${showStats ? 'primary' : 'ghost'}`}
                style={{ padding: '3px 7px', fontSize: 10 }}
                aria-label="스탯"
                onClick={() => { setShowStats(p => !p); setShowInventory(false) }}
              >STAT</button>
            )}
            <button
              className="btn ghost"
              style={{ padding: '3px 7px', fontSize: 10 }}
              aria-label="음성 통화"
              title="실시간 음성 통화"
              onClick={() => setShowVoiceCall(true)}
            >📞</button>
            <button
              className={`btn ${showPanel ? 'primary' : 'ghost'}`}
              style={{ padding: '3px 7px', fontSize: 10 }}
              aria-label="대화 설정"
              onClick={() => setShowPanel(p => !p)}
            >⚙</button>
          </div>
        </div>

        {branches.length > 1 && (
          <div className="hstack" style={{ gap: 4, paddingBottom: 2, overflowX: 'auto', flexShrink: 0 }}>
            {branches.map(b => {
              const isCurrent = b.id === params.id
              return (
                <div
                  key={b.id}
                  className={`btn ${isCurrent ? 'primary' : 'ghost'}`}
                  style={{ fontSize: 10, padding: '2px 4px 2px 8px', flexShrink: 0, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    cursor: isCurrent ? 'default' : 'pointer' }}
                  title={b.branchDescription || undefined}
                  onClick={() => !isCurrent && router.push(`/conversations/${b.id}`)}
                >
                  <span>v{b.version}{b.branchDescription ? ` · ${b.branchDescription}` : ''}</span>
                  <span
                    role="button"
                    aria-label={`v${b.version} 분기 삭제`}
                    onClick={e => { e.stopPropagation(); handleDeleteBranch(b) }}
                    style={{ opacity: 0.55, padding: '0 2px', cursor: 'pointer' }}
                  >✕</span>
                </div>
              )
            })}
          </div>
        )}

        <div className="chat-layout">
          <div className="chat-main">
            <div
              className="chatlog"
              ref={logRef}
              style={{
                backgroundImage: customBg ? `url(${customBg})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                zIndex: 1
              }}
            >
              {customBg && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  backdropFilter: 'blur(3px)',
                  WebkitBackdropFilter: 'blur(3px)',
                  zIndex: -1
                }} />
              )}
              {messages.length === 0 && !streaming && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.45, padding: '40px 20px' }}>
                  <div style={{ fontSize: 24 }}>{isNovel ? '✍' : isStoryOrMulti ? '📖' : '✦'}</div>
                  <div className="tiny muted" style={{ textAlign: 'center', lineHeight: 1.6 }}>
                    {isNovel
                      ? <>장면을 지시해보세요.<br />예: "{char.name}와 처음 만나는 장면"</>
                      : conv.mode === 'multiStory'
                        ? <>멀티스토리를 시작해보세요.<br />첫 메시지를 보내면 장면과 선택지가 나타납니다.</>
                        : isTikiTaka
                          ? <>{conv.characters.map(cc => cc.character.name).join(', ')}와의 이야기를 시작해보세요.<br />메시지를 보내면 캐릭터들이 자연스럽게 반응합니다.</>
                          : isStory
                            ? <>스토리를 시작해보세요.<br />첫 메시지를 보내면 장면과 선택지가 나타납니다.</>
                            : <>{char.name}와의 대화를 시작해보세요.<br />아래에 메시지를 입력하면 됩니다.</>
                    }
                  </div>
                </div>
              )}
              {hasMore && (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <button
                    className="btn ghost"
                    style={{ fontSize: 10, padding: '3px 12px' }}
                    onClick={loadMore}
                    disabled={loadingMore}
                  >{loadingMore ? '불러오는 중...' : '▲ 이전 메시지 보기'}</button>
                </div>
              )}
              {messages.map(m => {
                const isYou = m.role === 'user'
                const msgChar = getMsgChar(m)
                const ai = AI_MODELS.find(x => x.id === m.aiModel) ?? AI_MODELS[0]
                const isLast = m.id === lastMsg?.id
                const isEditing = editingId === m.id
                const processedContent = !isYou
                  ? replaceDisplayPlaceholders(m.content, conv.personaCharacter?.name ?? '나', msgChar.name)
                  : m.content
                const storyParsed = isStoryOrMulti && !isYou ? parseStoryChoices(processedContent) : null
                const blocks = isYou ? [] : (isNovel || isStory || isTikiTaka ? parseNovelBlocks(storyParsed ? storyParsed.body : processedContent) : parseBlocks(processedContent))
                const branchesFromHere = branches.filter(b => b.branchFromMessageId === m.id && b.id !== params.id)

                return (
                  <div key={m.id}>
                    {branchesFromHere.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, padding: '2px 4px 4px', flexWrap: 'wrap' }}>
                        {branchesFromHere.map(b => (
                          <button
                            key={b.id}
                            className="btn ghost"
                            style={{ fontSize: 9, padding: '1px 7px', color: 'var(--accent, #0095f6)', borderColor: 'var(--accent, #0095f6)', opacity: 0.75 }}
                            onClick={e => { e.stopPropagation(); router.push(`/conversations/${b.id}`) }}
                          >
                            ⑂ v{b.version}{b.branchDescription ? ` · ${b.branchDescription}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  <div
                    className={`msg-seq${activeId === m.id ? ' active' : ''}`}
                    onClick={() => setActiveId(prev => prev === m.id ? null : m.id)}
                  >
                    {isYou ? (
                      /* ── 유저 메시지: 오른쪽 ── */
                      <div className="seq-block seq-right">
                        <div className="seq-speaker" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          {isNovel ? '작가' : (conv.personaCharacter?.name ?? '당신')}
                          {conv.personaCharacter && (
                            <div className="thumb" style={{ width: 18, height: 18, flexShrink: 0 }}>
                              {conv.personaCharacter.avatarUrl
                                ? <img src={conv.personaCharacter.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                                : <PixelAvatar kind="player" size={18} />}
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <MessageEdit
                            initialContent={m.content}
                            isUser
                            onSave={c => saveEdit(c, m.id)}
                            onSaveOnly={c => saveEditOnly(c, m.id)}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <div className={`bubble ${isNovel ? 'bubble-author' : 'bubble-persona'}`} style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                        )}
                      </div>
                    ) : isEditing ? (
                      /* ── AI 편집 중 ── */
                      <div className="seq-block seq-left">
                        <div className="seq-speaker"><span>{msgChar.name}</span></div>
                        <MessageEdit
                          initialContent={m.content}
                          onSave={c => saveEdit(c, m.id)}
                          onSaveOnly={c => saveEditOnly(c, m.id)}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    ) : blocks.length > 0 ? (
                      /* ── AI 메시지: 블록 순서대로 ── */
                      <>
                        {blocks.map((b, i) => {
                          if (b.type === 'image') {
                            return (
                              <div key={i} className="seq-block seq-center" style={{ width: '100%', padding: '4px 0' }}>
                                <img src={b.text} alt="" style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
                              </div>
                            )
                          }
                          if (b.type === 'system') {
                            return (
                              <div key={i} className="seq-block seq-center" style={{ margin: '8px 0', width: '100%' }}>
                                <div className="system-window-box">
                                  <span className="system-tag">[SYSTEM]</span> {b.text}
                                </div>
                              </div>
                            )
                          }
                          if (b.type === 'constellation') {
                            return (
                              <div key={i} className="seq-block seq-center" style={{ margin: '10px 0', width: '100%' }}>
                                <div className="constellation-alert-box">
                                  <span className="constellation-tag">✨ 성좌 알림 ✨</span>
                                  <div className="constellation-text">{b.text}</div>
                                </div>
                              </div>
                            )
                          }
                          if (b.type === 'chat') {
                            const colonIdx = b.text.indexOf(':')
                            let sender = '시청자'
                            let messageBody = b.text
                            if (colonIdx !== -1) {
                              sender = b.text.slice(0, colonIdx).trim()
                              messageBody = b.text.slice(colonIdx + 1).trim()
                            }
                            
                            const hash = sender.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                            const colors = ['#ff6b8a', '#ff9f43', '#10ac84', '#70a1ff', '#00d2d3', '#ff9ff3', '#00dec4', '#e84118', '#2ed573']
                            const nameColor = colors[hash % colors.length]
                            
                            const isDonation = sender.includes('후원') || sender.includes('도네') || sender.includes('Coin') || sender.includes('코인')
                            const chatLineClass = isDonation ? 'livestream-chat-line donation' : 'livestream-chat-line'

                            return (
                              <div key={i} className="seq-block seq-center" style={{ width: '100%' }}>
                                <div className={chatLineClass}>
                                  {isDonation && <span className="donation-badge">🍬 SPONSOR</span>}
                                  <span className="chat-nickname" style={{ color: nameColor }}>{sender}</span>
                                  <span className="chat-separator">: </span>
                                  <span className="chat-text">{messageBody}</span>
                                </div>
                              </div>
                            )
                          }
                          if (b.type === 'narration') {
                            return (
                              <div key={i} className="seq-block seq-center">
                                <p className="seq-narration"><ChatNarration text={b.text} /></p>
                              </div>
                            )
                          }
                          const rawSpeaker = b.speaker || msgChar.name
                          const speaker = rawSpeaker.replace(/^\[|\]$/g, '').trim()
                          const isPersona = !!conv.personaCharacter && isSamePerson(speaker, conv.personaCharacter.name)
                          const isConvChar = conv.characters.some(cc => isSamePerson(speaker, cc.character.name))
                          const thought = b.type === 'thought' ? ' thought-bubble' : ''
                          if (isPersona) {
                            return (
                              <div key={i} className="seq-block seq-right">
                                <div className="seq-speaker">{speaker}</div>
                                <div className={`bubble bubble-persona${thought}`}>{b.text}</div>
                              </div>
                            )
                          }
                          const bubbleColor = isConvChar ? 'bubble-char' : 'bubble-third'
                          return (
                            <div key={i} className="seq-block seq-left">
                              <div className="seq-speaker">
                                <span>{speaker}</span>
                              </div>
                              <div className={`bubble ${bubbleColor}${thought}`}>{b.text}</div>
                            </div>
                          )
                        })}
                      </>
                    ) : (
                      /* ── 폴백: 파싱 불가 시 원본 표시 ── */
                      <div className="seq-block seq-left">
                        <div className="seq-speaker">
                          <span>{msgChar.name}</span>
                        </div>
                        <div className="bubble bubble-char" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                      </div>
                    )}

                    {/* ── 스토리 선택지 ── */}
                    {isStoryOrMulti && !isYou && isLast && !typing && storyParsed && storyParsed.choices.length > 0 && (
                      <div className="vstack" style={{ gap: 5, marginTop: 8, paddingLeft: 4 }}>
                        {storyParsed.choices.map((choice, i) => (
                          <div key={i} className="hstack" style={{ gap: 4, alignItems: 'stretch' }}>
                            <button
                              className="btn ghost"
                              style={{ flex: 1, textAlign: 'left', fontSize: 11, padding: '5px 10px', lineHeight: 1.5, whiteSpace: 'normal' }}
                              onClick={() => send(choice)}
                            >
                              {i + 1}. {choice}
                            </button>
                            <button
                              className="btn ghost"
                              style={{ fontSize: 10, padding: '0 7px', flexShrink: 0 }}
                              title="수정 후 전송"
                              onClick={() => fillComposer(choice)}
                            >✏</button>
                          </div>
                        ))}
                        {/* 이어쓰기: 본문이 짧을 때만 표시 */}
                        {storyParsed.body.length < 350 && (
                          <button
                            className="btn ghost"
                            style={{ fontSize: 10, padding: '3px 10px', opacity: 0.7, alignSelf: 'flex-start' }}
                            onClick={() => send('(계속 써줘)')}
                          >계속 →</button>
                        )}
                      </div>
                    )}
                    {/* 이어쓰기 — 스토리 외 모드, 마지막 AI 응답이 짧을 때 */}
                    {!isStoryOrMulti && !isYou && isLast && !typing && m.content.length < 350 && (
                      <div style={{ paddingLeft: 4, marginTop: 4 }}>
                        <button
                          className="btn ghost"
                          style={{ fontSize: 10, padding: '3px 10px', opacity: 0.7 }}
                          onClick={() => send('(계속 써줘)')}
                        >계속 →</button>
                      </div>
                    )}

                    {/* ── 호버/탭 액션 ── */}
                    {!isEditing && (
                      <div className={`msg-actions ${isYou ? 'you' : ''}`}>
                        {/* 재생성 내비 — 첫 줄 중앙 */}
                        {!isYou && (m.branchCount ?? 1) > 1 && m.siblingIds && (
                          <div className="msg-actions-row" style={{ justifyContent: 'center' }}>
                            <button className="msg-action-btn" style={{ padding: '1px 5px' }}
                              onClick={async () => {
                                const ids = m.siblingIds!
                                const idx = ids.indexOf(m.id)
                                const prevId = ids[(idx - 1 + ids.length) % ids.length]
                                if (prevId !== m.id) await handleBranchSwitch(prevId)
                              }}>←</button>
                            <span className="tiny muted" style={{ fontSize: 9 }}>{m.branchIndex}/{m.branchCount}</span>
                            <button className="msg-action-btn" style={{ padding: '1px 5px' }}
                              onClick={async () => {
                                const ids = m.siblingIds!
                                const idx = ids.indexOf(m.id)
                                const nextId = ids[(idx + 1) % ids.length]
                                if (nextId !== m.id) await handleBranchSwitch(nextId)
                              }}>→</button>
                          </div>
                        )}
                        {/* 액션 버튼 — 둘째 줄 */}
                        <div className="msg-actions-row">
                          {isLast && isLastAssistant && !isYou && (
                            <button className="msg-action-btn" aria-label="재생성" onClick={handleRegenerate}>↺ 재생성</button>
                          )}
                          {!isYou && (
                            <button
                              className="msg-action-btn"
                              style={{ color: speakingId === m.id ? 'var(--pink)' : undefined }}
                              aria-label={speakingId === m.id ? '읽기 정지' : '소리로 읽기'}
                              onClick={() => speakingId === m.id ? stopSpeaking() : speak(m.content, m.id)}
                            >{speakingId === m.id ? '■ 정지' : '🔊'}</button>
                          )}
                          <button className="msg-action-btn" aria-label="편집" onClick={() => startEdit(m.id)}>✏ 편집</button>
                          <button
                            className="msg-action-btn"
                            aria-label="분기 만들기"
                            onClick={() => { setBranchTargetMsgId(m.id); setBranchDesc(''); setShowBranchModal(true) }}
                          >⑂ 분기</button>
                          <button className="msg-action-btn danger" aria-label="메시지 삭제" onClick={() => setConfirmDeleteId(m.id)}>✕ 삭제</button>
                        </div>
                      </div>
                    )}
                    {/* 토큰 사용량 — 마지막 AI 메시지에만 */}
                    {isLast && !isYou && (m.inputTokens ?? 0) > 0 && (
                      <div style={{ fontSize: 9, color: 'var(--ink-soft)', opacity: 0.55, paddingLeft: 4, marginTop: 2 }}>
                        in {m.inputTokens?.toLocaleString()} / out {m.outputTokens?.toLocaleString()} tok
                      </div>
                    )}
                  </div>
                  </div>
                )
              })}

              {(typing || streaming) && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="msg-seq">
                  <div className="seq-block seq-left">
                    <div className="seq-speaker">
                      <span>{streamingChar.name}</span>
                    </div>
                    {streaming
                      ? <>
                          {(() => {
                            const ps = replaceDisplayPlaceholders(streaming, conv.personaCharacter?.name ?? '나', streamingChar.name)
                            return isNovel || isTikiTaka
                              ? <NovelScene text={ps} personaName={conv?.personaCharacter?.name ?? '주인공'} charName={streamingChar.name} />
                              : <MessageBlocks text={ps} />
                          })()}
                          {typingDuration >= 8 && (
                            <div className="tiny" style={{ opacity: 0.6, marginTop: 4, fontStyle: 'italic' }}>✦ 다듬는 중…</div>
                          )}
                        </>
                      : <div className="bubble dots" style={{ fontSize: 18, letterSpacing: 3, padding: '6px 10px' }}>
                          {typingDuration >= 3
                            ? <span style={{ fontSize: 11, letterSpacing: 0, opacity: 0.7 }}>{typingDuration}초째 생성 중...</span>
                            : <><span>•</span><span>•</span><span>•</span></>
                          }
                        </div>
                    }
                  </div>
                  <button className="msg-action-btn" style={{ alignSelf: 'flex-start', marginTop: 2 }} onClick={stopStream}>■ 중단</button>
                </div>
              )}

            </div>

            {hasNew && (
              <div style={{ position: 'relative', height: 0, overflow: 'visible', zIndex: 10 }}>
                <button
                  onClick={scrollToBottom}
                  style={{
                    position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                    background: 'transparent',
                    border: '1.5px solid #5d0f4a',
                    borderRadius: 20, padding: '4px 14px', fontSize: 11, cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,.2)', whiteSpace: 'nowrap',
                    color: '#ff2e93',
                  }}
                >새 답변 ↓</button>
              </div>
            )}

            {sendError && (
              <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1 }}>⚠ {sendError}</span>
                {sendErrorRetryable && lastSentRef.current && (
                  <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => { setSendError(''); send(lastSentRef.current) }}>↺ 재시도</button>
                )}
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setSendError('')}>닫기</button>
              </div>
            )}
            {conv?.suggestRepliesEnabled && !typing && messages[messages.length - 1]?.role === 'assistant' && (
              <div className="melting-suggests">
                {suggestLoading && suggestions.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--m-ink-soft, #9b9aa8)', padding: '4px 2px' }}>추천 답변 생성 중…</div>
                ) : suggestions.length > 0 ? (
                  <>
                    {suggestions.map((s, i) => (
                      <div className="melting-suggest-row" key={i}>
                        <button className="melting-suggest-chip" onClick={() => fillComposer(s)}>{s}</button>
                      </div>
                    ))}
                    <button className="melting-suggest-regen" disabled={suggestLoading} onClick={loadSuggestions}>
                      {suggestLoading ? '…' : '🔄 새로 생성'}
                    </button>
                  </>
                ) : null}
              </div>
            )}
            <div className="vstack" style={{ gap: 0, position: 'relative' }}>
              {showCommandMenu && (
                <div 
                  style={{ position: 'fixed', inset: 0, zIndex: 19 }} 
                  onClick={() => setShowCommandMenu(false)} 
                />
              )}
              {showCommandMenu && filteredCommands.length > 0 && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 20,
                  marginBottom: 6,
                  background: 'rgba(15, 10, 20, 0.93)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1.5px solid rgba(255, 46, 147, 0.4)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(255, 46, 147, 0.15)',
                  overflow: 'hidden',
                  padding: '4px 0'
                }}>
                  <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#ff2e93', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    💡 시스템 명령어 자동완성 (이동: ↑↓, 선택: Enter)
                  </div>
                  <div className="vstack" style={{ gap: 0, maxHeight: 200, overflowY: 'auto' }}>
                    {filteredCommands.map((cmd, idx) => {
                      const isActive = idx === selectedCommandIndex
                      return (
                        <div
                          key={cmd.name}
                          onClick={() => selectCommand(cmd.name)}
                          onMouseEnter={() => setSelectedCommandIndex(idx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            background: isActive ? 'rgba(255, 46, 147, 0.2)' : 'transparent',
                            transition: 'background 0.2s',
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
                            {cmd.name}
                          </span>
                          <span style={{ fontSize: 11, color: isActive ? '#eee' : 'var(--muted)' }}>
                            {cmd.desc}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="composer" style={{ alignItems: 'flex-end' }}>
                <textarea
                  ref={composerRef}
                  className="field"
                  rows={1}
                  style={{ resize: 'none', overflow: 'hidden', minHeight: 36, maxHeight: 120, lineHeight: '1.5' }}
                  placeholder={typing ? 'AI가 응답 중...'
                    : isNovel ? '장면을 지시해보세요…'
                    : isStoryOrMulti ? '직접 입력하거나 선택지를 클릭하세요…'
                    : isTikiTaka ? '메시지를 입력하면 모두가 응답합니다…'
                    : `${char.name}에게 말 걸기…`}
                  disabled={typing}
                  onInput={handleComposerInput}
                  onKeyDown={e => {
                    if (showCommandMenu && filteredCommands.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setSelectedCommandIndex(prev => (prev + 1) % filteredCommands.length)
                        return
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setSelectedCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length)
                        return
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        selectCommand(filteredCommands[selectedCommandIndex].name)
                        return
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setShowCommandMenu(false)
                        return
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                    if (e.key === 'ArrowUp' && !composerRef.current?.value && lastSentRef.current) {
                      e.preventDefault()
                      if (composerRef.current) composerRef.current.value = lastSentRef.current
                    }
                  }}
                />
              {/* ── STT 마이크 버튼 ── */}
              <button
                className={`btn ${isListening ? 'primary' : 'ghost'}`}
                style={{ padding: '0 10px', fontSize: 15, flexShrink: 0, minHeight: 36 }}
                onClick={isListening ? stopListening : startListening}
                disabled={typing}
                aria-label={isListening ? '녹음 중지' : '음성 입력'}
                title={isListening ? '녹음 중지' : '음성 입력 (STT)'}
              >{isListening ? '⏹' : '🎤'}</button>
              {/* ── /STT 마이크 버튼 ── */}
              <button className="btn primary" onClick={() => send()} disabled={typing}>전송</button>
            </div>
            {/* 글자 수 힌트 — 50자 이상일 때만 */}
            <ComposerCharCount composerRef={composerRef} />
            </div>
          </div>

          {showStats && conv.statsConfig && (
            <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowStats(false)} />
            <div style={{
              position: 'fixed', top: 56, right: 12, zIndex: 10,
              background: 'var(--chrome-face)', border: '1.5px solid var(--chrome-border)',
              borderRadius: 'var(--radius)', padding: '12px 14px', minWidth: 'min(200px, 90vw)', maxWidth: 'min(260px, 90vw)',
              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            }}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 10 }}>📊 스탯</div>
              <div className="vstack" style={{ gap: 8 }}>
                {conv.statsConfig.map(stat => {
                  const pct = Math.round(((stat.value - stat.min) / (stat.max - stat.min)) * 100)
                  const color = pct >= 70 ? 'var(--pink)' : pct >= 40 ? 'var(--lavender)' : 'var(--ink-soft)'
                  return (
                    <div key={stat.name}>
                      <div className="spread" style={{ marginBottom: 3 }}>
                        <span className="tiny" style={{ fontWeight: 700 }}>{stat.name}</span>
                        <span className="tiny muted">{stat.value} / {stat.max}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--chrome-border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            </>
          )}

          {showInventory && (
            <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowInventory(false)} />
            <div style={{
              position: 'fixed', top: 56, right: 12, zIndex: 10,
              background: 'var(--chrome-face)', border: '1.5px solid var(--chrome-border)',
              borderRadius: 'var(--radius)', padding: '12px 14px', minWidth: 'min(200px, 90vw)', maxWidth: 'min(280px, 90vw)',
              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            }}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 10 }}>🎒 인벤토리</div>
              {(!conv.inventory || conv.inventory.length === 0) ? (
                <div className="tiny muted">보유 아이템이 없습니다.</div>
              ) : (
                <div className="vstack" style={{ gap: 6 }}>
                  {conv.inventory.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--chrome-border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="hstack" style={{ gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{item.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--pink)', fontWeight: 700 }}>×{item.qty}</span>
                        </div>
                        {item.description && (
                          <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
                        )}
                      </div>
                      <button
                        className="btn ghost"
                        style={{ padding: '1px 5px', fontSize: 11, color: 'var(--ink-muted)', flexShrink: 0 }}
                        onClick={() => handleInventoryDelete(i)}
                        title="삭제"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>
          )}

          {showPanel && (
            <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9 }}
              onClick={() => setShowPanel(false)}
            />
            <div className="side-panel">
              <div className="side-panel-header spread">
                <span style={{ fontWeight: 700, fontSize: 11 }}>대화 설정</span>
                <button className="btn ghost" style={{ padding: '1px 5px', fontSize: 11 }} aria-label="닫기" onClick={() => setShowPanel(false)}>×</button>
              </div>

              {branches.length > 1 && (
                <div className="side-section">
                  <div className="label">분기 설명 <span className="tiny muted">(현재 버전: v{branches.find(b => b.id === params.id)?.version ?? 1})</span></div>
                  <input
                    className="field"
                    style={{ fontSize: 11 }}
                    placeholder="예: 루나가 거절하는 방향"
                    value={conv.branchDescription ?? ''}
                    onChange={e => handleBranchDescription(e.target.value)}
                    maxLength={100}
                  />
                </div>
              )}

              <div className="side-section">
                <div className="label">대화 제목</div>
                {editingTitle ? (
                  <div className="hstack" style={{ gap: 4 }}>
                    <input
                      className="field" style={{ flex: 1, fontSize: 11 }}
                      value={titleInput}
                      onChange={e => setTitleInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false) }}
                      autoFocus
                    />
                    <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} onClick={handleTitleSave}>저장</button>
                    <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => setEditingTitle(false)}>취소</button>
                  </div>
                ) : (
                  <div className="spread" style={{ gap: 4 }}>
                    <div className="tiny" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                    <button className="msg-action-btn" style={{ fontSize: 9 }} onClick={() => { setTitleInput(conv.title); setEditingTitle(true) }}>✏</button>
                  </div>
                )}
              </div>

              {/* 화면 테마 및 배경 설정 */}
              <div className="side-section">
                <div className="label">화면 테마 설정</div>
                <select
                  className="field"
                  style={{ fontSize: 11 }}
                  value={currentTheme}
                  onChange={async e => {
                    const val = e.target.value
                    setCurrentTheme(val)
                    applyTheme(val)
                    await api.patch('/api/user/settings', { theme: val }).catch(() => {})
                  }}
                >
                  {THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.label} ({t.desc})</option>
                  ))}
                </select>
              </div>

              <div className="side-section">
                <div className="label">대화방 배경 이미지 (URL)</div>
                <div className="hstack" style={{ gap: 4 }}>
                  <input
                    className="field"
                    style={{ fontSize: 11, flex: 1 }}
                    placeholder="https://example.com/image.jpg"
                    value={customBg}
                    onChange={e => {
                      const val = e.target.value
                      setCustomBg(val)
                      localStorage.setItem('sf_bg_' + params.id, val)
                    }}
                  />
                  {customBg && (
                    <button
                      className="btn ghost"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => {
                        setCustomBg('')
                        localStorage.removeItem('sf_bg_' + params.id)
                      }}
                    >✕</button>
                  )}
                </div>
              </div>

              <div className="side-section">
                <div className="label">대화 참여자</div>
                <div className="vstack" style={{ gap: 4 }}>
                  {conv.characters.map(cc => (
                    <div key={cc.character.id} className="hstack" style={{ gap: 6, padding: '4px 0' }}>
                      <div className="thumb" style={{ width: 22, height: 22, flexShrink: 0 }}>
                        {cc.character.avatarUrl
                          ? <img src={cc.character.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <PixelAvatar kind={cc.character.kind as any} size={22} />
                        }
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700 }}>{cc.character.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="side-section">
                <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, persona: !o.persona }))}>
                  <span>내 역할</span>
                  <span className={`acc-arrow ${panelOpen.persona ? 'open' : ''}`}>▼</span>
                </button>
                {!panelOpen.persona && (
                  <div className="hstack" style={{ gap: 6, padding: '4px 0', opacity: 0.75 }}>
                    <div className="thumb" style={{ width: 18, height: 18, flexShrink: 0 }}>
                      {conv.personaCharacter?.avatarUrl
                        ? <img src={conv.personaCharacter.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                        : <PixelAvatar kind={conv.personaCharacter ? (conv.personaCharacter as any).kind ?? 'player' : 'player'} size={16} />}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.personaCharacter ? conv.personaCharacter.name : '없음 (기본 유저)'}
                    </div>
                    <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>
                  </div>
                )}
                {panelOpen.persona && (
                <div className="vstack" style={{ gap: 4, marginTop: 6 }}>
                  <div
                    className={`persona-option ${!conv.personaCharacter ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handlePersonaChange(null)}
                  >
                    <div className="thumb" style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <PixelAvatar kind="player" size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 10 }}>없음</div>
                      <div className="tiny muted">기본 유저</div>
                    </div>
                    {!conv.personaCharacter && <span style={{ color: 'var(--hot-pink)', fontSize: 10 }}>✓</span>}
                  </div>
                  {allChars.filter(c => !conv.characters.some(cc => cc.character.id === c.id)).map(c => (
                    <div
                      key={c.id}
                      className={`persona-option ${conv.personaCharacter?.id === c.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handlePersonaChange(c.id)}
                    >
                      <div className="thumb" style={{ width: 22, height: 22, flexShrink: 0 }}>
                        {c.avatarUrl
                          ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                          : <PixelAvatar kind={c.kind as any} size={20} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 10 }}>{c.name}</div>
                        <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 2).join(' · ')}</div>
                      </div>
                      {conv.personaCharacter?.id === c.id && <span style={{ color: 'var(--hot-pink)', fontSize: 10 }}>✓</span>}
                    </div>
                  ))}
                </div>
                )}
              </div>

              <div className="side-section">
                <div className="spread" style={{ marginBottom: 4 }}>
                  <div className="label" style={{ marginBottom: 0 }}>시나리오 배경</div>
                  <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => setInfoTip(t => t === 'scenario' ? null : 'scenario')}>?</button>
                </div>
                {infoTip === 'scenario' && (
                  <div className="info-tip">이 대화의 세계관·장소·상황을 설명합니다. AI가 대화를 시작하기 전에 읽는 배경 정보입니다.{'\n\n'}예: "현대 판타지 세계. 주인공은 마법 고등학교 3학년이다. 오늘은 수능 전날 밤."</div>
                )}
                <textarea
                  className="field" rows={3}
                  placeholder={"이 대화의 세계관·배경을 설정하세요\n예: 마법 학원 천문대, 루나는 오늘 밤 예언을 완성해야 한다."}
                  value={conv.scenarioDescription}
                  onChange={e => handleScenarioDescription(e.target.value)}
                />
              </div>

              <div className="side-section">
                <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, style: !o.style }))}>
                  <span>🎨 스타일 설정</span>
                  <span className={`acc-arrow ${panelOpen.style ? 'open' : ''}`}>▼</span>
                </button>
                {panelOpen.style && (
                  <div className="vstack" style={{ gap: 6, marginTop: 6 }}>
                    <div className="tiny muted" style={{ marginBottom: 2 }}>버튼을 다시 누르면 해제됩니다.</div>
                    {([
                      { key: 'pov',    label: '시점',     opts: ['1인칭', '3인칭'] },
                      { key: 'tense',  label: '시제',     opts: ['현재형', '과거형'] },
                      { key: 'mood',   label: '분위기',   opts: ['밝음', '중립', '어두움'] },
                      { key: 'style',  label: '문체',     opts: ['문학적', '일상적', '극적'] },
                      { key: 'length', label: '응답 길이', opts: ['짧게', '보통', '길게'] },
                      { key: 'pace',   label: '전개 속도', opts: ['빠름', '보통', '느림'] },
                    ] as const).map(({ key, label, opts }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, width: 54, flexShrink: 0 }}>{label}</span>
                        <div className="hstack" style={{ gap: 3, flexWrap: 'wrap' }}>
                          {opts.map(opt => (
                            <button
                              key={opt}
                              className={`btn ${conv?.styleConfig?.[key] === opt ? 'primary' : 'ghost'}`}
                              style={{ fontSize: 9, padding: '2px 7px' }}
                              onClick={() => handleStyleConfig(key, opt)}
                            >{opt}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="side-section">
                <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, memory: !o.memory }))}>
                  <span>📌 기억 · 상태</span>
                  <span className={`acc-arrow ${panelOpen.memory ? 'open' : ''}`}>▼</span>
                </button>
                {panelOpen.memory && <>
                  <div className="spread" style={{ marginBottom: 4, marginTop: 4 }}>
                    <div className="hstack" style={{ gap: 4, alignItems: 'center' }}>
                      <div className="label" style={{ marginBottom: 0 }}>핵심 메모리</div>
                      <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => setInfoTip(t => t === 'core' ? null : 'core')}>?</button>
                    </div>
                    <button
                      className="btn ghost"
                      style={{ fontSize: 9, padding: '1px 5px' }}
                      onClick={async () => {
                        const fresh = await api.get(`/api/conversations/${params.id}`).catch(() => null)
                        if (fresh) setConv(c => c ? { ...c, coreMemory: fresh.coreMemory, statusTimeline: fresh.statusTimeline } : c)
                      }}
                    >↺</button>
                  </div>
                  {infoTip === 'core' && (
                    <div className="info-tip">대화 내내 AI가 절대 잊으면 안 되는 사실을 저장합니다.{'\n\n'}예: "유저의 이름은 하루. 쌍둥이 동생 미래가 있다. 마법을 쓸 수 없다."</div>
                  )}
                  <textarea
                    className="field" rows={3}
                    placeholder={"절대 잊으면 안 되는 설정을 적어두세요\n예: 유저는 마왕의 딸이다."}
                    value={conv.coreMemory}
                    onChange={e => handleCoreMemory(e.target.value)}
                  />
                  <div className="label" style={{ marginTop: 8, marginBottom: 2 }}>타임라인 상태</div>
                  <textarea
                    className="field" rows={2}
                    placeholder={"현재 에피소드 상태\n예: 마왕성 탐험 중 / 루나가 다리를 다침"}
                    value={conv.statusTimeline}
                    onChange={e => handleStatusTimeline(e.target.value)}
                  />
                </>}
              </div>

              <div className="side-section">
                <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, lorebook: !o.lorebook }))}>
                  <span>📖 로어북 <span className="tiny muted" style={{ fontWeight: 400 }}>({lorebooks.length})</span></span>
                  <span className={`acc-arrow ${panelOpen.lorebook ? 'open' : ''}`}>▼</span>
                </button>
                {panelOpen.lorebook && <>
                  <div className="spread" style={{ marginBottom: 4, marginTop: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => setInfoTip(t => t === 'lorebook' ? null : 'lorebook')}>?</button>
                    <div className="hstack" style={{ gap: 3 }}>
                      <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => { setShowLorebookImport(v => !v); setLorebookAdd(false) }}>📥 가져오기</button>
                      {lorebooks.length < 20
                        ? <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => { setLorebookAdd(a => !a); setLorebookEditId(null); setShowLorebookImport(false) }}>+ 추가</button>
                        : <span className="tiny muted" style={{ fontSize: 9 }}>최대 20개</span>
                      }
                    </div>
                  </div>
                  {conv.sourceLorebookUrls && conv.sourceLorebookUrls.length > 0 && (
                    <div className="vstack" style={{ gap: 3, marginBottom: 6, padding: '5px 7px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
                      <div className="tiny muted" style={{ fontSize: 9 }}>원본 로어북</div>
                      {conv.sourceLorebookUrls.map((lb, i) => (
                        <a key={i} href={lb.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ↗ {lb.name}
                        </a>
                      ))}
                    </div>
                  )}
                  {showLorebookImport && (
                    <div className="vstack" style={{ gap: 5, marginBottom: 8, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
                      <div className="tiny muted" style={{ fontSize: 9, lineHeight: 1.5 }}>Zeta 로어북 페이지 전체 텍스트를 붙여넣으세요. AI가 자동으로 항목을 분리해 저장합니다.</div>
                      <textarea
                        className="field" rows={6} style={{ fontSize: 10, resize: 'none' }}
                        placeholder="Zeta 로어북 페이지에서 Ctrl+A → Ctrl+C 후 여기에 붙여넣기"
                        value={lorebookImportText}
                        onChange={e => setLorebookImportText(e.target.value)}
                      />
                      <div className="hstack" style={{ gap: 4 }}>
                        <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} disabled={lorebookImporting || !lorebookImportText.trim()} onClick={handleImportLorebook}>
                          {lorebookImporting ? '파싱 중...' : '✦ 저장'}
                        </button>
                        <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => { setShowLorebookImport(false); setLorebookImportText('') }}>취소</button>
                      </div>
                    </div>
                  )}
                {infoTip === 'lorebook' && (
                  <div className="info-tip">특정 키워드가 대화에 등장하면 관련 세계관 정보를 AI에게 자동 주입합니다. 최근 N턴(탐색깊이)만 스캔하며, 우선순위 높은 항목부터 최대 1,000 토큰까지 포함됩니다.{'\n\n'}예: 키워드 "마왕성" → "마왕성은 100년 전 악마왕이 건설한 요새로, 총 7개 층이다."</div>
                )}
                <div className="tiny muted" style={{ marginBottom: 6 }}>키워드 감지 시 자동으로 세계관 정보를 AI에게 주입합니다.</div>

                {lorebookAdd && (
                  <div className="vstack" style={{ gap: 5, marginBottom: 8, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
                    <input
                      className="field" style={{ fontSize: 10 }} placeholder="키워드 (쉼표 구분)"
                      value={lbForm.keywords} onChange={e => setLbForm(f => ({ ...f, keywords: e.target.value }))}
                    />
                    <textarea
                      className="field" rows={2} style={{ fontSize: 10 }} placeholder="세계관 정보 내용"
                      value={lbForm.content} onChange={e => setLbForm(f => ({ ...f, content: e.target.value }))}
                    />
                    <div className="hstack" style={{ gap: 4 }}>
                      <label className="tiny muted">우선순위
                        <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
                          value={lbForm.priority} onChange={e => setLbForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
                      </label>
                      <label className="tiny muted">탐색깊이
                        <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
                          min={1} max={20} value={lbForm.scanDepth} onChange={e => setLbForm(f => ({ ...f, scanDepth: parseInt(e.target.value) || 5 }))} />
                      </label>
                      <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} onClick={handleAddLorebook}>저장</button>
                      <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => setLorebookAdd(false)}>취소</button>
                    </div>
                  </div>
                )}

                {lorebookError && (
                  <div className="tiny" style={{ color: '#ff6b8a', marginBottom: 4 }}>⚠ 로어북 로드 실패</div>
                )}
                {lorebooks.length === 0 && !lorebookAdd && !lorebookError && (
                  <div className="lorebook-placeholder"><span>로어북 항목이 없습니다</span></div>
                )}

                {lorebooks.map(lb => (
                  <div key={lb.id} style={{ marginBottom: 6, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
                    {lorebookEditId === lb.id ? (
                      <LorebookEditForm entry={lb} onSave={data => handlePatchLorebook(lb.id, data)} onCancel={() => setLorebookEditId(null)} />
                    ) : (
                      <>
                        <div className="spread" style={{ marginBottom: 2 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pink)' }}>{lb.keyword.join(', ')}</div>
                          <div className="hstack" style={{ gap: 3 }}>
                            <button className="msg-action-btn" style={{ fontSize: 9 }} onClick={() => { setLorebookEditId(lb.id); setLorebookAdd(false) }}>✏</button>
                            <button className="msg-action-btn danger" style={{ fontSize: 9 }} onClick={() => handleDeleteLorebook(lb.id)}>✕</button>
                          </div>
                        </div>
                        <div className="tiny muted" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 2 }}>{lb.content}</div>
                        <div className="tiny muted">우선순위 {lb.priority} · 탐색 {lb.scanDepth}턴</div>
                      </>
                    )}
                  </div>
                ))}
                </>}
              </div>

              <div className="side-section">
                <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, longmem: !o.longmem }))}>
                  <span>🧠 장기 메모리 <span className="tiny muted" style={{ fontWeight: 400 }}>({memories.length})</span></span>
                  <span className={`acc-arrow ${panelOpen.longmem ? 'open' : ''}`}>▼</span>
                </button>
                {panelOpen.longmem && <>
                  <div className="tiny muted" style={{ marginBottom: 6, marginTop: 4 }}>10턴마다 자동 요약 · 선택 후 핵심메모리로 올릴 수 있습니다.</div>
                {selectedMemoryIds.size > 0 && (
                  <button
                    className="btn primary"
                    style={{ fontSize: 10, padding: '3px 8px', width: '100%', marginBottom: 6 }}
                    disabled={promoting}
                    onClick={handlePromoteMemories}
                  >{promoting
                    ? (selectedMemoryIds.size > 1 ? '요약해서 올리는 중...' : '올리는 중...')
                    : `↑ 선택한 항목 핵심 메모리로 올리기 (${selectedMemoryIds.size})`}</button>
                )}
                {memoryError && (
                  <div className="tiny" style={{ color: '#ff6b8a', marginBottom: 4 }}>⚠ 메모리 로드 실패</div>
                )}
                {memories.length === 0 && !memoryError ? (
                  <div className="lorebook-placeholder"><span>아직 요약된 메모리가 없습니다</span></div>
                ) : (
                  memories.map((mem, i) => {
                    const checked = selectedMemoryIds.has(mem.id)
                    const isPromoted = mem.promoted
                    const isExpanded = expandedPromotedIds.has(mem.id)
                    return (
                      <div
                        key={mem.id}
                        style={{
                          marginBottom: 6, padding: 6, borderRadius: 'var(--radius)', cursor: 'pointer',
                          background: isPromoted ? 'color-mix(in srgb, var(--accent, #0095f6) 10%, var(--pane))' : checked ? 'var(--lavender)' : 'var(--pane)',
                          border: `1px solid ${isPromoted ? 'color-mix(in srgb, var(--accent, #0095f6) 40%, transparent)' : checked ? 'var(--pink)' : 'var(--chrome-border)'}`,
                          opacity: isPromoted && !isExpanded ? 0.65 : 1,
                        }}
                        onClick={isPromoted
                          ? (e) => { e.stopPropagation(); toggleExpandPromoted(mem.id) }
                          : () => toggleMemorySelect(mem.id)}
                      >
                        <div className="spread" style={{ marginBottom: isPromoted && !isExpanded ? 0 : 4 }}>
                          <div className="hstack" style={{ gap: 5 }}>
                            {isPromoted
                              ? <span style={{ fontSize: 9, color: 'var(--accent, #0095f6)', fontWeight: 700 }}>↑ 핵심</span>
                              : <input type="checkbox" checked={checked} onChange={() => {}} style={{ cursor: 'pointer' }} />
                            }
                            <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>요약 #{i + 1}</div>
                          </div>
                          <div className="hstack" style={{ gap: 4 }}>
                            {isPromoted && (
                              <span style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{isExpanded ? '▲' : '▼'}</span>
                            )}
                            <button
                              className="msg-action-btn danger"
                              style={{ fontSize: 9 }}
                              onClick={e => { e.stopPropagation(); handleDeleteMemory(mem.id) }}
                            >✕</button>
                          </div>
                        </div>
                        {(!isPromoted || isExpanded) && (
                          <div className="tiny muted" style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{mem.summary}</div>
                        )}
                      </div>
                    )
                  })
                )}
                </>}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </Win>
    {showVoiceCall && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(10, 8, 16, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="win" style={{
          width: 'min(360px, 92vw)',
          background: 'rgba(25, 20, 35, 0.85)',
          border: '1.5px solid #ff2e93',
          boxShadow: '0 0 30px rgba(255, 46, 147, 0.35), inset 0 0 15px rgba(255, 46, 147, 0.1)',
          borderRadius: '16px',
          overflow: 'hidden',
        }}>
          <style>{`
            @keyframes neon-pulse {
              0% {
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(255, 46, 147, 0.6), 0 0 0 0 rgba(0, 255, 204, 0.3);
              }
              70% {
                transform: scale(1.04);
                box-shadow: 0 0 0 15px rgba(255, 46, 147, 0), 0 0 0 20px rgba(0, 255, 204, 0);
              }
              100% {
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(255, 46, 147, 0), 0 0 0 0 rgba(0, 255, 204, 0);
              }
            }
            .pulse-avatar {
              animation: neon-pulse 2s infinite ease-in-out;
              border: 3px solid #ff2e93;
            }
          `}</style>

          <div className="win-title" style={{
            background: '#ff2e93',
            color: '#fff',
            borderBottom: 'none',
            display: 'flex',
            justifyContent: 'center',
            padding: '10px 14px',
            fontWeight: 700,
          }}>
            📞 Live Voice Call
          </div>

          <div className="win-body vstack" style={{
            alignItems: 'center',
            gap: 20,
            padding: '24px 20px',
            background: 'transparent',
          }}>
            <div style={{ position: 'relative', margin: '10px 0' }}>
              <div className="pulse-avatar" style={{
                width: 100, height: 100,
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'var(--lavender)',
                display: 'grid',
                placeItems: 'center',
              }}>
                {char.avatarUrl ? (
                  <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                ) : (
                  <PixelAvatar kind={char.kind as any} size={80} />
                )}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                {char.name}
              </div>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                color: voiceCallStatus === 'speaking' ? '#ff2e93'
                  : voiceCallStatus === 'listening' ? '#00ffcc'
                  : voiceCallStatus === 'thinking' ? '#ffd700'
                  : '#aaa',
                textTransform: 'uppercase',
              }}>
                {voiceCallStatus === 'connecting' && '연결 중...'}
                {voiceCallStatus === 'speaking' && '🔊 통화 중...'}
                {voiceCallStatus === 'listening' && '🎤 당신의 말을 듣는 중...'}
                {voiceCallStatus === 'thinking' && '⚡ 생각 중...'}
              </div>
            </div>

            <div className="vstack" style={{
              width: '100%',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '12px 14px',
              minHeight: 120,
              maxHeight: 180,
              overflowY: 'auto',
              gap: 10,
            }}>
              <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: '#ff2e93', marginRight: 6 }}>{char.name}:</span>
                <span style={{ color: '#eee', fontStyle: 'italic' }}>
                  {charCallText ? `"${charCallText}"` : '...'}
                </span>
              </div>

              <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: '#00ffcc', marginRight: 6 }}>당신:</span>
                <span style={{ color: '#eee' }}>
                  {userCallText ? `"${userCallText}"` : '말씀하세요...'}
                </span>
              </div>
            </div>

            <button
              onClick={endVoiceCall}
              style={{
                width: 50, height: 50,
                borderRadius: '50%',
                background: '#ed4956',
                border: 'none',
                color: '#fff',
                fontSize: 20,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 4px 15px rgba(237, 73, 86, 0.4)',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              aria-label="통화 종료"
            >
              📞
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function LorebookEditForm({ entry, onSave, onCancel }: { entry: LbEntry; onSave: (data: Partial<LbEntry>) => void; onCancel: () => void }) {
  const [keywords, setKeywords] = useState(entry.keyword.join(', '))
  const [content, setContent] = useState(entry.content)
  const [priority, setPriority] = useState(entry.priority)
  const [scanDepth, setScanDepth] = useState(entry.scanDepth)
  return (
    <div className="vstack" style={{ gap: 5 }}>
      <input className="field" style={{ fontSize: 10 }} placeholder="키워드 (쉼표 구분)" value={keywords} onChange={e => setKeywords(e.target.value)} />
      <textarea className="field" rows={2} style={{ fontSize: 10 }} value={content} onChange={e => setContent(e.target.value)} />
      <div className="hstack" style={{ gap: 4 }}>
        <label className="tiny muted">우선순위
          <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
            value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)} />
        </label>
        <label className="tiny muted">탐색깊이
          <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
            min={1} max={20} value={scanDepth} onChange={e => setScanDepth(parseInt(e.target.value) || 5)} />
        </label>
        <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }}
          onClick={() => onSave({ keyword: keywords.split(',').map(k => k.trim()).filter(Boolean), content, priority, scanDepth })}>저장</button>
        <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

function MessageEdit({ initialContent, isUser, onSave, onSaveOnly, onCancel }: {
  initialContent: string
  isUser?: boolean
  onSave: (content: string) => void
  onSaveOnly: (content: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const get = () => ref.current?.value ?? ''
  return (
    <div className="vstack" style={{ gap: 4, alignItems: isUser ? 'flex-end' : undefined }}>
      <textarea
        ref={ref}
        className="field" rows={3}
        defaultValue={initialContent}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(get()) } }}
        autoFocus
        style={{ minWidth: isUser ? 200 : 0 }}
      />
      <div className="hstack" style={{ gap: 4 }}>
        {isUser ? (
          <>
            <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSave(get())}>저장 + 재생성</button>
            <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSaveOnly(get())}>저장만</button>
          </>
        ) : (
          <>
            <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSaveOnly(get())}>저장만</button>
            <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSave(get())}>저장 + 재생성</button>
          </>
        )}
        <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
