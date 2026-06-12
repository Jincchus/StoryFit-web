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

  useEffect(() => {
    if (showVoiceCall) {
      const initialText = getLastAssistantText() ?? (openingMessage || '안녕하세요.')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVoiceCall, openingMessage])

  useEffect(() => {
    if (!showVoiceCall) return
    if (!typing && voiceCallStatus === 'thinking') {
      const lastText = getLastAssistantText()
      if (lastText) {
        speakVoiceCall(extractDialogue(lastText))
      } else {
        setVoiceCallStatus('listening')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, showVoiceCall, speakVoiceCall, voiceCallStatus])

  return { showVoiceCall, setShowVoiceCall, voiceCallStatus, userCallText, charCallText, endVoiceCall }
}
