'use client'
import { useState, useRef, useEffect } from 'react'

export function useSpeech(composerRef: React.RefObject<HTMLTextAreaElement>, ttsRate = 1.0) {
  const [isListening, setIsListening] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const ttsRateRef = useRef(ttsRate)
  useEffect(() => { ttsRateRef.current = ttsRate }, [ttsRate])

  const startListening = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      if (composerRef.current) {
        composerRef.current.value = composerRef.current.value
          ? composerRef.current.value + ' ' + transcript
          : transcript
      }
      composerRef.current?.focus()
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  const speak = (content: string, id: string) => {
    window.speechSynthesis.cancel()
    if (speakingId === id) { setSpeakingId(null); return }
    const plain = content.replace(/\*([^*]+)\*/g, '$1').replace(/["""]/g, '')
    const utter = new SpeechSynthesisUtterance(plain)
    utter.lang = 'ko-KR'
    utter.rate = ttsRateRef.current
    utter.onend = () => setSpeakingId(null)
    utter.onerror = () => setSpeakingId(null)
    setSpeakingId(id)

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
  }

  const stopSpeaking = () => {
    window.speechSynthesis.cancel()
    setSpeakingId(null)
  }

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop() } catch {}
      try { window.speechSynthesis?.cancel() } catch {}
    }
  }, [])

  return { isListening, speakingId, startListening, stopListening, speak, stopSpeaking }
}
