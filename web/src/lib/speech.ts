/**
 * Browser speech: talk to your receptionist in a test call.
 * Uses the Web Speech API where available (Chrome, Edge, Safari).
 */

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

function ctor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export const LANG_BCP47: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', ml: 'ml-IN', mr: 'mr-IN', gu: 'gu-IN', es: 'es-ES' }
export const LANG_NAMES: Record<string, string> = { en: 'English', hi: 'हिन्दी Hindi', te: 'తెలుగు Telugu', ta: 'தமிழ் Tamil', ml: 'മലയാളം Malayalam', mr: 'मराठी Marathi', gu: 'ગુજરાતી Gujarati', es: 'Español Spanish' }
export const LANG_SHORT: Record<string, string> = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati', es: 'Spanish' }

export const canListen = () => typeof window !== 'undefined' && !!ctor()
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function listen(onText: (text: string, final: boolean) => void, onDone: () => void, lang?: string): () => void {
  const C = ctor()
  if (!C) { onDone(); return () => {} }
  const r = new C()
  r.lang = lang || navigator.language || 'en-US'
  r.interimResults = true
  r.continuous = false
  r.onresult = (e) => {
    const res = e.results[e.results.length - 1]
    onText(res[0].transcript, res.isFinal)
  }
  r.onend = onDone
  r.onerror = () => onDone()
  r.start()
  return () => r.stop()
}

export function speak(text: string, onEnd?: () => void, lang = 'en') {
  if (!canSpeak() || !text) { onEnd?.(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/I'm disconnecting the call now\.?|Transferring you now\.?/gi, ''))
  const voices = window.speechSynthesis.getVoices()
  const code = lang.slice(0, 2)
  const preferred = code === 'en'
    ? voices.find(v => /Samantha|Google US English|Aria|Jenny|Natural/i.test(v.name) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en'))
    : voices.find(v => v.lang.toLowerCase().startsWith(code))
  u.lang = LANG_BCP47[code] || lang
  if (preferred) u.voice = preferred
  u.rate = 1.04
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
}
