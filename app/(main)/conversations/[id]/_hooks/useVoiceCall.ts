'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceCallStatus = 'connecting' | 'speaking' | 'listening' | 'thinking'

function extractDialogue(content: string): string {
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

export function useVoiceCall({ send, typing, ttsRate, openingMessage, getLastAssistantText, setToast }: {
  send: (content: string) => void
  typing: boolean
  ttsRate: number
  openingMessage?: string
  getLastAssistantText: () => string | null
  setToast: (msg: string) => void
}) {
  const [showVoiceCall, setShowVoiceCall] = useState(false)
  const [voiceCallStatus, setVoiceCallStatus] = useState<VoiceCallStatus>('connecting')
  const [userCallText, setUserCallText] = useState('')
  const [charCallText, setCharCallText] = useState('')
  const callRecognitionRef = useRef<any>(null)
  const callUtteranceRef = useRef<any>(null)
  const activeRef = useRef(false)
  const speakWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startListeningCall = useCallback(() => {
    if (typeof window === 'undefined' || !activeRef.current) return
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) {
      setToast('이 브라우저는 음성 인식을 지원하지 않습니다. (Chrome/Edge 브라우저에서 이용하세요)')
      setVoiceCallStatus('listening')
      return
    }

    if (callRecognitionRef.current) {
      try { callRecognitionRef.current.stop() } catch {}
    }

    const recognition = new SR()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    let gotResult = false

    recognition.onstart = () => {
      setVoiceCallStatus('listening')
    }
    recognition.onresult = (e: any) => {
      gotResult = true
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
      gotResult = true
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setToast('마이크 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해주세요.')
        return
      }
      console.error('Call Recognition error:', e)
      setTimeout(() => {
        if (activeRef.current) startListeningCall()
      }, 1000)
    }
    recognition.onend = () => {
      // 침묵 등으로 결과 없이 끝나면 자동 재시작
      if (!gotResult && activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) startListeningCall()
        }, 300)
      }
    }

    callRecognitionRef.current = recognition
    try { recognition.start() } catch {}
  }, [send, setToast])

  const speakVoiceCall = useCallback((text: string) => {
    if (typeof window === 'undefined' || !activeRef.current) return
    if (!window.speechSynthesis) {
      setToast('이 브라우저는 음성 합성을 지원하지 않습니다. (Chrome/Edge 브라우저에서 이용하세요)')
      startListeningCall()
      return
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.resume()
    if (callRecognitionRef.current) {
      try { callRecognitionRef.current.stop() } catch {}
    }

    const plain = text.replace(/\*([^*]+)\*/g, '$1').replace(/["'"]/g, '')
    const utter = new SpeechSynthesisUtterance(plain)
    utter.lang = 'ko-KR'
    utter.rate = ttsRate

    utter.onstart = () => {
      if (speakWatchdogRef.current) { clearTimeout(speakWatchdogRef.current); speakWatchdogRef.current = null }
      setVoiceCallStatus('speaking')
      setCharCallText(text)
    }
    utter.onend = () => {
      startListeningCall()
    }
    utter.onerror = (e) => {
      console.error('TTS Call error:', e)
      if (speakWatchdogRef.current) { clearTimeout(speakWatchdogRef.current); speakWatchdogRef.current = null }
      startListeningCall()
    }

    callUtteranceRef.current = utter

    const doSpeak = () => {
      if (!activeRef.current) return
      const voices = window.speechSynthesis.getVoices()
      const koVoice = voices.find(v => v.lang.startsWith('ko'))
      if (koVoice) utter.voice = koVoice
      window.speechSynthesis.resume()
      window.speechSynthesis.speak(utter)
      // onstart가 일정 시간 내 안 오면 (WebView·TTS 고장 등) 듣기로 폴백
      speakWatchdogRef.current = setTimeout(() => {
        speakWatchdogRef.current = null
        window.speechSynthesis.cancel()
        setCharCallText(text)
        setToast('음성 재생이 지원되지 않아 텍스트로 표시합니다.')
        startListeningCall()
      }, 4000)
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      doSpeak()
    } else {
      let fired = false
      window.speechSynthesis.onvoiceschanged = () => {
        if (fired) return
        fired = true
        window.speechSynthesis.onvoiceschanged = null
        doSpeak()
      }
      // 일부 브라우저는 onvoiceschanged가 영원히 안 옴 → 기본 보이스로 강행
      setTimeout(() => {
        if (fired) return
        fired = true
        window.speechSynthesis.onvoiceschanged = null
        doSpeak()
      }, 1200)
    }
  }, [ttsRate, startListeningCall, setToast])

  const cleanup = useCallback(() => {
    activeRef.current = false
    if (speakWatchdogRef.current) { clearTimeout(speakWatchdogRef.current); speakWatchdogRef.current = null }
    window.speechSynthesis?.cancel()
    if (callRecognitionRef.current) {
      try { callRecognitionRef.current.stop() } catch {}
      callRecognitionRef.current = null
    }
  }, [])

  const endVoiceCall = useCallback(() => {
    setShowVoiceCall(false)
    cleanup()
  }, [cleanup])

  useEffect(() => {
    if (showVoiceCall) {
      activeRef.current = true
      setVoiceCallStatus('connecting')
      setUserCallText('')
      setCharCallText('')
      const initialText = getLastAssistantText() ?? (openingMessage || '안녕하세요.')
      speakVoiceCall(extractDialogue(initialText))
    } else {
      cleanup()
    }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVoiceCall])

  useEffect(() => {
    if (!showVoiceCall) return
    if (!typing && voiceCallStatus === 'thinking') {
      const lastText = getLastAssistantText()
      if (lastText) {
        speakVoiceCall(extractDialogue(lastText))
      } else {
        setVoiceCallStatus('listening')
        startListeningCall()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, showVoiceCall, voiceCallStatus])

  return { showVoiceCall, setShowVoiceCall, voiceCallStatus, userCallText, charCallText, endVoiceCall }
}
