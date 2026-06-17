'use client'
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Toast from '@/components/ui/Toast'
import CharacterCardModal from '@/components/ui/CharacterCardModal'
import type { Character } from '@/types'
import { getConvStream, clearConvStream, subscribeConvStream, runConvStream, runConvRegenerate, runConvContinue } from '@/lib/conversationStream'
import { getSavedTheme } from '@/lib/theme'
import { haptic } from '@/lib/haptics'
import { useSpeech } from './_hooks/useSpeech'
import { useVoiceCall } from './_hooks/useVoiceCall'
import { COMMANDS, parseStoryChoices, type Msg, type Conv, type ConvChar, type BranchInfo } from './_lib/chatShared'
import MessageList from './_components/MessageList'
import SidePanel from './_components/SidePanel'
import BranchModal from './_components/BranchModal'
import CommandMenu from './_components/CommandMenu'
import VoiceCallOverlay from './_components/VoiceCallOverlay'
import { StatsPopover, InventoryPopover, RecapPopover } from './_components/HeaderPopovers'
import ChapterNav from './_components/ChapterNav'
import type { ChapterAnchor } from '@/lib/chapters'

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

export default function ChatPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetMsgId = searchParams.get('msg')
  const [cardChar, setCardChar] = useState<ConvChar['character'] | null>(null)
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
  const [chapterMeta, setChapterMeta] = useState<ChapterAnchor[]>([])
  const [streaming, setStreaming] = useState('')
  const [typing, setTyping] = useState(false)
  const [revising, setRevising] = useState(false)
  const [streamingCharId, setStreamingCharId] = useState<string | null>(null)
  const [sendError, setSendError] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const [showRecap, setShowRecap] = useState(false)
  const [recapText, setRecapText] = useState('')
  const [recapLoading, setRecapLoading] = useState(false)
  const [showDicePicker, setShowDicePicker] = useState(false)
  const [showAutoPicker, setShowAutoPicker] = useState(false)
  const [autoPlayLeft, setAutoPlayLeft] = useState(0)
  const autoPlayRef = useRef(0)

  const loadRecap = async (force = false) => {
    if (recapLoading) return
    if (recapText && !force) return
    setRecapLoading(true)
    try {
      const res = await api.post(`/api/conversations/${params.id}/recap`, {})
      setRecapText(res.recap ?? '')
    } catch (e: any) {
      setToast(e.message ?? '줄거리 생성에 실패했습니다')
      setShowRecap(false)
    } finally {
      setRecapLoading(false)
    }
  }
  const [editingId, setEditingId] = useState<string | null>(null)
  const [allChars, setAllChars] = useState<Character[]>([])
  const [hasNew, setHasNew] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const oldestIdRef = useRef<string | null>(null)
  const shouldScrollRef = useRef(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [sendErrorRetryable, setSendErrorRetryable] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [branchTargetMsgId, setBranchTargetMsgId] = useState<string | null>(null)
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
      const [data, msgRes]: [Conv, { messages: Msg[]; hasMore: boolean; oldestId: string | null; chapterMeta: ChapterAnchor[] }] = await Promise.all([
        api.get(`/api/conversations/${params.id}`),
        api.get(`/api/conversations/${params.id}/messages`),
      ])
      setConv(data)
      if (logRef.current && !shouldScrollRef.current) {
        scrollSnapRef.current = { top: logRef.current.scrollTop, height: logRef.current.scrollHeight }
      }
      setMessages(msgRes.messages)
      setChapterMeta(msgRes.chapterMeta ?? [])
      setHasMore(msgRes.hasMore)
      oldestIdRef.current = msgRes.oldestId
      convModeRef.current = data.mode
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
      setRevising(cs.phase === 'revising')
      if (cs.error) { setSendError(cs.error); setSendErrorRetryable(cs.retryable) }
      if (cs.done) {
        setTyping(false)
        setRevising(false)
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
      const res: { messages: Msg[]; hasMore: boolean; oldestId: string | null; chapterMeta: ChapterAnchor[] } =
        await api.get(`/api/conversations/${params.id}/messages?cursor=${oldestIdRef.current}`)
      setMessages(prev => [...res.messages, ...prev])
      setChapterMeta(res.chapterMeta ?? [])
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

  // 본문 검색/북마크에서 진입 시 해당 메시지 위치로 이동 (없으면 이전 페이지를 추가 로드하며 탐색)
  const [jumpTarget, setJumpTarget] = useState<string | null>(targetMsgId)
  const jumpDoneRef = useRef(false)
  const jumpAttemptsRef = useRef(0)
  const jumpToMessage = (msgId: string) => {
    jumpDoneRef.current = false
    jumpAttemptsRef.current = 0
    setJumpTarget(msgId)
  }
  useEffect(() => {
    if (!jumpTarget || jumpDoneRef.current || loadingConv || messages.length === 0) return
    if (messages.some(m => m.id === jumpTarget)) {
      jumpDoneRef.current = true
      shouldScrollRef.current = false
      requestAnimationFrame(() => {
        const el = document.getElementById(`msg-${jumpTarget}`)
        if (el) {
          el.scrollIntoView({ block: 'center' })
          el.classList.add('msg-jump-highlight')
          setTimeout(() => el.classList.remove('msg-jump-highlight'), 2500)
        }
      })
      return
    }
    if (hasMore && !loadingMore && jumpAttemptsRef.current < 12) {
      jumpAttemptsRef.current += 1
      loadMore()
    } else if (!hasMore || jumpAttemptsRef.current >= 12) {
      jumpDoneRef.current = true
      setToast('메시지 위치를 찾지 못했습니다')
    }
  }, [jumpTarget, messages, hasMore, loadingMore, loadingConv])

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
      setRevising(cs.phase === 'revising')
      if (cs.error) { setSendError(cs.error); setSendErrorRetryable(cs.retryable) }
      if (cs.done) {
        const hadError = !!cs.error
        setTyping(false)
        setRevising(false)
        setStreamingCharId(null)
        clearConvStream(convId)
        streamUnsubRef.current = null
        unsub()
        loadConv().then(() => {
          setStreaming('')
          if (hadError) { autoPlayRef.current = 0; setAutoPlayLeft(0); return }
          if (autoPlayRef.current > 0) {
            autoPlayRef.current -= 1
            setAutoPlayLeft(autoPlayRef.current)
            if (autoPlayRef.current > 0) continueOnce()
          }
        }).catch(() => setStreaming(''))
      }
    })
    streamUnsubRef.current = unsub
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConv])

  useEffect(() => {
    return () => {
      streamUnsubRef.current?.()
      streamUnsubRef.current = null
    }
  }, [params.id])

  useEffect(() => {
    if (conv?.mode !== 'story' && conv?.mode !== 'multiStory') return
    if (typing) return
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') loadSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.mode, typing, messages.length])

  const fillComposer = (content: string) => {
    if (composerRef.current) {
      composerRef.current.value = content
      composerRef.current.focus()
    }
  }

  const send = (content?: string, dice?: { stat?: string }) => {
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
    setMessages(prev => [...prev, { id: 'tmp-' + Date.now(), role: 'user', content: dice ? `${msg}\n\n🎲 판정 중...` : msg }])
    setTyping(true)
    setStreaming('')
    setRevising(false)
    setSendError('')
    setSendErrorRetryable(false)
    runConvStream(params.id, msg, dice).catch(() => {})
    subscribeStream(params.id)
  }

  const stopStream = () => {
    autoPlayRef.current = 0
    setAutoPlayLeft(0)
    streamUnsubRef.current?.()
    streamUnsubRef.current = null
    clearConvStream(params.id)
    setTyping(false)
    setStreaming('')
    setRevising(false)
    setStreamingCharId(null)
    setMessages(prev => prev.filter(m => !m.id.startsWith('tmp-')))
    loadConv().catch(() => {})
  }

  const continueOnce = () => {
    typingStartRef.current = Date.now()
    setTypingDuration(0)
    shouldScrollRef.current = true
    setTyping(true)
    setStreaming('')
    setRevising(false)
    setSendError('')
    setSendErrorRetryable(false)
    runConvContinue(params.id).catch(() => {})
    subscribeStream(params.id)
  }

  const startAutoPlay = (n: number) => {
    if (typing) return
    autoPlayRef.current = n
    setAutoPlayLeft(n)
    setShowAutoPicker(false)
    continueOnce()
  }

  const stopAutoPlay = () => {
    autoPlayRef.current = 0
    setAutoPlayLeft(0)
  }

  const [comebackElapsed, setComebackElapsed] = useState<string | null>(null)
  const comebackCheckedRef = useRef(false)
  useEffect(() => {
    if (comebackCheckedRef.current || loadingConv || !conv || messages.length === 0) return
    comebackCheckedRef.current = true
    if (conv.mode !== 'story' && conv.mode !== 'multiStory') return
    const last = messages[messages.length - 1]
    if (!last.createdAt) return
    const gapMs = Date.now() - new Date(last.createdAt).getTime()
    if (gapMs < 24 * 3600 * 1000) return
    if (sessionStorage.getItem(`sf_comeback_${params.id}_${last.id}`)) return
    const days = Math.floor(gapMs / 86400000)
    setComebackElapsed(days >= 1 ? `${days}일` : `${Math.floor(gapMs / 3600000)}시간`)
  }, [loadingConv, conv, messages, params.id])

  const dismissComeback = () => {
    const last = messages[messages.length - 1]
    if (last) sessionStorage.setItem(`sf_comeback_${params.id}_${last.id}`, '1')
    setComebackElapsed(null)
  }

  const acceptComeback = () => {
    if (typing || !comebackElapsed) return
    const elapsed = comebackElapsed
    dismissComeback()
    typingStartRef.current = Date.now()
    setTypingDuration(0)
    shouldScrollRef.current = true
    setTyping(true)
    setStreaming('')
    setRevising(false)
    setSendError('')
    setSendErrorRetryable(false)
    runConvContinue(params.id, { elapsed }).catch(() => {})
    subscribeStream(params.id)
  }

  const handleToggleBookmark = (msgId: string, next: boolean) => {
    haptic('light')
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, bookmarked: next } : m))
    api.patch(`/api/conversations/${params.id}/messages`, { messageId: msgId, bookmarked: next })
      .catch(() => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, bookmarked: !next } : m))
        setToast('북마크 저장에 실패했습니다')
      })
  }

  // ── 커스텀 배경 및 테마 설정 ──────────────────────────────────────────
  const [customBg, setCustomBg] = useState('')
  const [currentTheme, setCurrentTheme] = useState('retro')
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [plusMenuSeen, setPlusMenuSeen] = useState(true)
  useEffect(() => { setPlusMenuSeen(!!localStorage.getItem('sf_seen_plusmenu')) }, [])
  useEffect(() => {
    if (loadingConv || messages.length === 0) return
    if (localStorage.getItem('sf_hint_msgactions')) return
    localStorage.setItem('sf_hint_msgactions', '1')
    setToast('💡 메시지를 탭하면 편집·북마크·분기 메뉴가 열려요')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingConv])
  const [showTimelineFull, setShowTimelineFull] = useState(false)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [diceRolling, setDiceRolling] = useState<string | null>(null)
  const prevTypingRef = useRef(false)
  useEffect(() => {
    if (prevTypingRef.current && !typing) haptic('light')
    prevTypingRef.current = typing
  }, [typing])
  const [chatFontSize, setChatFontSize] = useState(14)
  useEffect(() => {
    const saved = parseInt(localStorage.getItem('sf-chat-fs') ?? '', 10)
    if (saved >= 13 && saved <= 16) setChatFontSize(saved)
  }, [])
  const changeChatFontSize = (size: number) => {
    setChatFontSize(size)
    localStorage.setItem('sf-chat-fs', String(size))
  }
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentTheme(getSavedTheme())
      if (params.id) {
        setCustomBg(localStorage.getItem('sf_bg_' + params.id) || '')
      }
    }
  }, [params.id])

  const activeCharForCall = conv?.characters[0]?.character

  const { showVoiceCall, setShowVoiceCall, voiceCallStatus, userCallText, charCallText, endVoiceCall } = useVoiceCall({
    send,
    typing,
    ttsRate,
    openingMessage: activeCharForCall?.openingMessage,
    getLastAssistantText: () => [...messagesRef.current].reverse().find(m => m.role === 'assistant')?.content ?? null,
    setToast,
  })

  // ── 커스텀 훅 인스턴스화 ──────────────────────────────────────────────
  const { isListening, speakingId, startListening, stopListening, speak, stopSpeaking } = useSpeech(composerRef, ttsRate)

  const handleCreateBranch = async (description: string) => {
    if (!branchTargetMsgId) return
    try {
      const { id } = await api.post(`/api/conversations/${params.id}/branch`, {
        branchFromMessageId: branchTargetMsgId,
        description,
      })
      router.push(`/conversations/${id}`)
    } catch (err) {
      setToast('분기 생성에 실패했습니다')
      throw err
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
    setRevising(false)
    setSendError('')
    setSendErrorRetryable(false)
    runConvRegenerate(params.id).catch(() => {})
    subscribeStream(params.id)
  }

  const handleBranchSwitch = async (targetMessageId: string) => {
    await api.patch(`/api/conversations/${params.id}/messages`, { targetMessageId })
    await loadConv()
  }

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

  const handleInventoryDelete = async (index: number) => {
    if (!conv?.inventory) return
    const next = conv.inventory.filter((_, i) => i !== index)
    try {
      await api.patch(`/api/conversations/${params.id}`, { inventory: next })
      setConv(c => c ? { ...c, inventory: next } : c)
    } catch { setToast('인벤토리 저장에 실패했습니다') }
  }

  const pendingPatchRef = useRef<Record<string, string>>({})

  const debouncedPatch = (field: string, value: string) => {
    pendingPatchRef.current[field] = value
    if (patchDebounceRef.current[field]) clearTimeout(patchDebounceRef.current[field]!)
    patchDebounceRef.current[field] = setTimeout(() => {
      delete pendingPatchRef.current[field]
      api.patch(`/api/conversations/${params.id}`, { [field]: value }).catch(() => setToast('변경사항 저장에 실패했습니다'))
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

  const isMulti = conv.mode === 'multiStory'
  const isStoryOrMulti = conv.mode === 'story' || isMulti

  const charMap = new Map(conv.characters.map(cc => [cc.character.id, cc.character]))
  const getMsgChar = (m: Msg) => (m.characterId ? charMap.get(m.characterId) ?? char : char)
  const streamingChar = streamingCharId ? charMap.get(streamingCharId) ?? char : char

  return (
    <>
    {toast && <Toast message={toast} onDone={() => setToast('')} />}
    {diceRolling && <DiceRollOverlay label={diceRolling} onDone={() => { setDiceRolling(null); haptic('medium') }} />}
    {confirmDeleteId && (
      <ConfirmDialog
        message="이 메시지를 삭제할까요? 복구할 수 없습니다."
        onConfirm={() => handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    )}
    {showBranchModal && (
      <BranchModal onCreate={handleCreateBranch} onClose={() => setShowBranchModal(false)} />
    )}
    <Win title={isMulti ? `채팅 — ${conv.characters.map(cc => cc.character.name).join(', ')}` : `채팅 — ${char.name}`} icon={PixelIcons.chat} noTitle>
      <div className="vstack" style={{ gap: 8, flex: 1, minHeight: 0 }}>
        {headerCollapsed ? (
          <div className="chat-header spread" style={{ padding: '4px 10px', minHeight: 0 }}>
            <div className="hstack" style={{ gap: 6, minWidth: 0, flex: 1 }}>
              <button className="btn ghost" onClick={() => router.push('/chatlist')} style={{ padding: '2px 6px', flexShrink: 0 }} aria-label="채팅 목록으로">←</button>
              <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                {isMulti ? conv.characters.map(cc => cc.character.name).join(' · ') : char.name}
              </span>
            </div>
            <button
              className="btn ghost"
              style={{ padding: '2px 8px', fontSize: 12, flexShrink: 0, color: 'var(--ink-soft)' }}
              aria-label="헤더 펼치기"
              onClick={() => setHeaderCollapsed(false)}
            >▾</button>
          </div>
        ) : (
          <div className="chat-header spread">
            <div className="hstack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
              <button className="btn ghost" onClick={() => router.push('/chatlist')} style={{ padding: '2px 6px', flexShrink: 0 }} aria-label="채팅 목록으로">←</button>
              <div
                className="thumb"
                style={{ width: 34, height: 34, background: 'var(--lavender)', border: '1.5px solid var(--chrome-border)', display: 'grid', placeItems: 'center', imageRendering: 'pixelated', borderRadius: 'var(--radius)', flexShrink: 0, cursor: 'pointer' }}
                onClick={() => setHeaderCollapsed(true)}
                title="헤더 접기"
              >
                {char.avatarUrl
                  ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <PixelAvatar kind={char.kind as any} size={30} />
                }
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="hstack" style={{ gap: 5, overflow: 'hidden' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isMulti ? conv.characters.map(cc => cc.character.name).join(' · ') : char.name}
                    {conv.personaCharacter
                      ? <button className="btn ghost" style={{ fontSize: 10, padding: '0 5px', fontWeight: 400, color: 'var(--ink-soft)' }} onClick={() => setShowPanel(true)} aria-label="페르소나 변경">· {conv.personaCharacter.name} ▾</button>
                      : <button className="btn ghost" style={{ fontSize: 10, padding: '0 5px', fontWeight: 400, color: 'var(--ink-faint)' }} onClick={() => setShowPanel(true)} aria-label="페르소나 설정">+ 페르소나</button>
                    }
                  </span>
                  <span className="mode-badge">{isMulti ? '👥 멀티' : '스토리'}</span>
                  {conv?.autoChapterEnabled && (conv.chapter ?? 1) > 1 && (
                    <span className="melting-chapter-badge" style={{ marginLeft: 6 }}>{conv.chapter ?? 1}장</span>
                  )}
                </div>
                <div
                  className="tiny muted"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: conv.statusTimeline ? 'pointer' : 'default' }}
                  onClick={() => conv.statusTimeline && setShowTimelineFull(p => !p)}
                  role={conv.statusTimeline ? 'button' : undefined}
                  aria-label="현재 상황 전체 보기"
                >
                  턴 {Math.floor(messages.length / 2)}
                  {conv.statusTimeline && <span> · {conv.statusTimeline} {showTimelineFull ? '▴' : '▾'}</span>}
                </div>
              </div>
            </div>
            <div className="hstack" style={{ flexShrink: 0, gap: 4 }}>
              {isStoryOrMulti && conv.inventoryEnabled && (
                <button
                  className={`btn ${showInventory ? 'primary' : 'ghost'}`}
                  style={{ minWidth: 34, minHeight: 34, padding: '5px 8px', fontSize: 14, justifyContent: 'center' }}
                  aria-label="인벤토리"
                  onClick={() => { setShowInventory(p => !p); setShowStats(false) }}
                >🎒</button>
              )}
              {isStoryOrMulti && conv.statsEnabled && conv.statsConfig && conv.statsConfig.length > 0 && (
                <button
                  className={`btn ${showStats ? 'primary' : 'ghost'}`}
                  style={{ minWidth: 34, minHeight: 34, padding: '5px 8px', fontSize: 14, justifyContent: 'center' }}
                  aria-label="스탯"
                  onClick={() => { setShowStats(p => !p); setShowInventory(false) }}
                >STAT</button>
              )}
              {isStoryOrMulti && (
                <button
                  className={`btn ${showRecap ? 'primary' : 'ghost'}`}
                  style={{ minWidth: 34, minHeight: 34, padding: '5px 8px', fontSize: 14, justifyContent: 'center' }}
                  aria-label="지금까지의 줄거리"
                  title="지금까지의 줄거리"
                  onClick={() => { setShowRecap(true); setShowStats(false); setShowInventory(false); loadRecap() }}
                >📜</button>
              )}
              <button
                className="btn ghost"
                style={{ minWidth: 34, minHeight: 34, padding: '5px 8px', fontSize: 14, justifyContent: 'center' }}
                aria-label="음성 통화"
                title="실시간 음성 통화"
                onClick={() => setShowVoiceCall(true)}
              >📞</button>
              <button
                className={`btn ${showPanel ? 'primary' : 'ghost'}`}
                style={{ minWidth: 34, minHeight: 34, padding: '5px 8px', fontSize: 14, justifyContent: 'center' }}
                aria-label="대화 설정"
                onClick={() => setShowPanel(p => !p)}
              >⚙</button>
              <button
                className="btn ghost"
                style={{ minWidth: 28, minHeight: 34, padding: '5px 4px', fontSize: 11, justifyContent: 'center', color: 'var(--ink-soft)' }}
                aria-label="헤더 접기"
                onClick={() => setHeaderCollapsed(true)}
              >▴</button>
            </div>
          </div>
        )}

        {showTimelineFull && conv.statusTimeline && (
          <div className="tiny" style={{ padding: '8px 12px', margin: '0 4px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)', flexShrink: 0 }}>
            🎬 {conv.statusTimeline}
          </div>
        )}

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
                    style={{ opacity: 0.55, padding: '4px 7px', margin: '-4px -2px', cursor: 'pointer' }}
                  >✕</span>
                </div>
              )
            })}
          </div>
        )}

        <div className="chat-layout">
          <div className="chat-main">
            <div
              className={`chatlog${!isMulti ? ' story-log' : ''}`}
              ref={logRef}
              style={{
                backgroundImage: customBg ? `url(${customBg})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                zIndex: 1,
                fontSize: chatFontSize,
                lineHeight: 1.6,
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
                  <div style={{ fontSize: 24 }}>📖</div>
                  <div className="tiny muted" style={{ textAlign: 'center', lineHeight: 1.6 }}>
                    {isMulti
                      ? <>멀티스토리를 시작해보세요.<br />첫 메시지를 보내면 장면과 선택지가 나타납니다.</>
                      : <>스토리를 시작해보세요.<br />첫 메시지를 보내면 장면과 선택지가 나타납니다.</>
                    }
                  </div>
                </div>
              )}
              <ChapterNav
                chapterMeta={chapterMeta}
                currentChapter={conv.chapter ?? 1}
                plotOutline={conv.plotOutline as { chapters: { index: number; title: string }[] } | undefined}
                onJump={jumpToMessage}
              />
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
              <MessageList
                messages={messages}
                conv={conv}
                branches={branches}
                convId={params.id}
                isMulti={isMulti}
                isStoryOrMulti={isStoryOrMulti}
                typing={typing}
                streaming={streaming}
                streamingChar={streamingChar}
                typingDuration={typingDuration}
                revising={revising}
                activeId={activeId}
                setActiveId={setActiveId}
                editingId={editingId}
                setEditingId={setEditingId}
                speakingId={speakingId}
                speak={speak}
                stopSpeaking={stopSpeaking}
                send={send}
                fillComposer={fillComposer}
                saveEdit={saveEdit}
                saveEditOnly={saveEditOnly}
                onRequestDelete={setConfirmDeleteId}
                onToggleBookmark={handleToggleBookmark}
                onRegenerate={handleRegenerate}
                onBranchSwitch={handleBranchSwitch}
                onOpenBranchModal={msgId => { setBranchTargetMsgId(msgId); setShowBranchModal(true) }}
                onStopStream={stopStream}
                getMsgChar={getMsgChar}
                suggestions={suggestions}
                suggestLoading={suggestLoading}
                onRegenSuggestions={loadSuggestions}
              />
            </div>

            {hasNew && (
              <div style={{ position: 'relative', height: 0, overflow: 'visible', zIndex: 10 }}>
                <button
                  onClick={scrollToBottom}
                  style={{
                    position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--paper)',
                    border: '1.5px solid var(--hot-pink)',
                    borderRadius: 20, padding: '4px 14px', fontSize: 11, cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,.2)', whiteSpace: 'nowrap',
                    color: 'var(--hot-pink)',
                  }}
                >새 답변 ↓</button>
              </div>
            )}

            {comebackElapsed && !typing && (
              <div className="tiny" style={{
                padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)',
                margin: '0 4px 4px',
              }}>
                <span style={{ flex: 1, lineHeight: 1.5 }}>
                  💭 {comebackElapsed} 만이에요. <b>{char?.name ?? '캐릭터'}</b>{' '}이(가) 먼저 말을 걸고 싶어 해요.
                </span>
                <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }} onClick={acceptComeback}>인사 받기</button>
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }} onClick={dismissComeback}>무시</button>
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
            <div className="vstack" style={{ gap: 0, position: 'relative' }}>
              {showCommandMenu && (
                <CommandMenu
                  commands={filteredCommands}
                  selectedIndex={selectedCommandIndex}
                  onSelect={selectCommand}
                  onHover={setSelectedCommandIndex}
                  onClose={() => setShowCommandMenu(false)}
                />
              )}
              <div className="composer" style={{ alignItems: 'flex-end' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    className={`btn ${showPlusMenu ? 'primary' : 'ghost'}`}
                    style={{ width: 38, height: 38, padding: 0, fontSize: 20, borderRadius: '50%', justifyContent: 'center' }}
                    disabled={typing}
                    aria-label="기능 메뉴"
                    onClick={() => {
                      setShowPlusMenu(p => !p); setShowDicePicker(false); setShowAutoPicker(false)
                      if (!plusMenuSeen) { setPlusMenuSeen(true); localStorage.setItem('sf_seen_plusmenu', '1') }
                    }}
                  >＋</button>
                  {!plusMenuSeen && (
                    <span style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--hot-pink)', border: '1.5px solid var(--paper)', pointerEvents: 'none' }} />
                  )}
                  {showPlusMenu && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => { setShowPlusMenu(false); setShowDicePicker(false); setShowAutoPicker(false) }} />
                      <div style={{
                        position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 10,
                        background: 'var(--chrome-face)', border: '1px solid var(--chrome-border)',
                        borderRadius: 'var(--radius-lg)', padding: 6, minWidth: 210,
                        boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                      }}>
                        <button
                          className="btn ghost"
                          style={{ fontSize: 13, padding: '9px 10px', width: '100%', justifyContent: 'flex-start', gap: 8 }}
                          onClick={() => { setShowPlusMenu(false); isListening ? stopListening() : startListening() }}
                        >🎤 {isListening ? '음성 입력 중지' : '음성 입력'}</button>
                        {isStoryOrMulti && (
                          <>
                            <button
                              className="btn ghost"
                              style={{ fontSize: 13, padding: '9px 10px', width: '100%', justifyContent: 'space-between', gap: 8 }}
                              onClick={() => {
                                if (!composerRef.current?.value.trim()) { setToast('판정할 행동을 먼저 입력하세요'); return }
                                setShowDicePicker(p => !p); setShowAutoPicker(false)
                              }}
                            ><span>🎲 스탯 판정</span><span className="muted">{showDicePicker ? '▾' : '▸'}</span></button>
                            {showDicePicker && (
                              <div className="vstack" style={{ gap: 2, padding: '2px 0 6px 22px' }}>
                                {conv.statsEnabled && conv.statsConfig?.map(s => (
                                  <button
                                    key={s.name}
                                    className="btn ghost"
                                    style={{ fontSize: 12, padding: '6px 10px', justifyContent: 'space-between', display: 'flex' }}
                                    onClick={() => { setShowPlusMenu(false); setShowDicePicker(false); setDiceRolling(s.name); send(undefined, { stat: s.name }) }}
                                  >
                                    <span>{s.name}</span><span className="muted">{s.value}</span>
                                  </button>
                                ))}
                                <button
                                  className="btn ghost"
                                  style={{ fontSize: 12, padding: '6px 10px', justifyContent: 'flex-start' }}
                                  onClick={() => { setShowPlusMenu(false); setShowDicePicker(false); setDiceRolling('일반'); send(undefined, {}) }}
                                >일반 판정 (50%)</button>
                              </div>
                            )}
                            <button
                              className="btn ghost"
                              style={{ fontSize: 13, padding: '9px 10px', width: '100%', justifyContent: 'space-between', gap: 8 }}
                              onClick={() => { setShowAutoPicker(p => !p); setShowDicePicker(false) }}
                            ><span>⏩ 관전 모드</span><span className="muted">{showAutoPicker ? '▾' : '▸'}</span></button>
                            {showAutoPicker && (
                              <div className="vstack" style={{ gap: 2, padding: '2px 0 6px 22px' }}>
                                {[1, 3, 5, 10].map(n => (
                                  <button
                                    key={n}
                                    className="btn ghost"
                                    style={{ fontSize: 12, padding: '6px 10px', justifyContent: 'flex-start' }}
                                    onClick={() => { setShowPlusMenu(false); setShowAutoPicker(false); startAutoPlay(n) }}
                                  >{n}턴 자동 진행</button>
                                ))}
                              </div>
                            )}
                            <button
                              className="btn ghost"
                              style={{ fontSize: 13, padding: '9px 10px', width: '100%', justifyContent: 'flex-start', gap: 8 }}
                              onClick={() => { setShowPlusMenu(false); setShowRecap(true); loadRecap() }}
                            >📜 줄거리 요약</button>
                          </>
                        )}
                        <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 0' }} />
                        <div className="hstack" style={{ gap: 4, padding: '4px 10px 6px', alignItems: 'center' }}>
                          <span className="tiny muted" style={{ flexShrink: 0 }}>글자 크기</span>
                          {[13, 14, 15, 16].map(size => (
                            <button
                              key={size}
                              className={`btn ${chatFontSize === size ? 'primary' : 'ghost'}`}
                              style={{ fontSize: size - 2, padding: '3px 7px', minWidth: 28, justifyContent: 'center' }}
                              aria-label={`글자 크기 ${size}`}
                              onClick={() => changeChatFontSize(size)}
                            >가</button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <textarea
                  ref={composerRef}
                  className="field"
                  rows={1}
                  style={{ resize: 'none', overflow: 'hidden', minHeight: 36, maxHeight: 120, lineHeight: '1.5' }}
                  placeholder={typing ? 'AI가 응답 중...' : '직접 입력하거나 선택지를 클릭하세요…'}
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
              {autoPlayLeft > 0 && (
                <button
                  className="btn danger"
                  style={{ padding: '0 10px', fontSize: 11, minHeight: 38, whiteSpace: 'nowrap', flexShrink: 0 }}
                  aria-label="자동 진행 중지"
                  onClick={stopAutoPlay}
                >■ {autoPlayLeft}턴</button>
              )}
              <button className="btn primary" onClick={() => send()} disabled={typing}>전송</button>
            </div>
            {/* 글자 수 힌트 — 50자 이상일 때만 */}
            <ComposerCharCount composerRef={composerRef} />
            </div>
          </div>

          {showStats && conv.statsConfig && (
            <StatsPopover statsConfig={conv.statsConfig} onClose={() => setShowStats(false)} />
          )}

          {showInventory && (
            <InventoryPopover inventory={conv.inventory} onDelete={handleInventoryDelete} onClose={() => setShowInventory(false)} />
          )}

          {showRecap && (
            <RecapPopover
              recap={recapText}
              loading={recapLoading}
              onRegenerate={() => loadRecap(true)}
              onClose={() => setShowRecap(false)}
            />
          )}

          {showPanel && (
            <SidePanel
              convId={params.id}
              conv={conv}
              setConv={setConv}
              allChars={allChars}
              branches={branches}
              customBg={customBg}
              setCustomBg={setCustomBg}
              currentTheme={currentTheme}
              setCurrentTheme={setCurrentTheme}
              debouncedPatch={debouncedPatch}
              setToast={setToast}
              onShowCharCard={setCardChar}
              onJumpToMessage={jumpToMessage}
              onClose={() => setShowPanel(false)}
            />
          )}

          {cardChar && (
            <CharacterCardModal character={cardChar} personaName={conv?.personaCharacter?.name ?? conv?.user?.displayName ?? '나'} onClose={() => setCardChar(null)} />
          )}
        </div>
      </div>
    </Win>
    {showVoiceCall && (
      <VoiceCallOverlay
        char={char}
        status={voiceCallStatus}
        userText={userCallText}
        charText={charCallText}
        onEnd={endVoiceCall}
      />
    )}
    </>
  )
}

function DiceRollOverlay({ label, onDone }: { label: string; onDone: () => void }) {
  const [num, setNum] = useState(1)
  useEffect(() => {
    const iv = setInterval(() => setNum(Math.floor(Math.random() * 100) + 1), 60)
    const to = setTimeout(() => { clearInterval(iv); onDone() }, 1200)
    return () => { clearInterval(iv); clearTimeout(to) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 46, animation: 'dice-spin .5s linear infinite' }}>🎲</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>{num}</div>
        <div style={{ fontSize: 12, color: '#fff', opacity: .85 }}>{label} 판정 중…</div>
      </div>
    </div>
  )
}
