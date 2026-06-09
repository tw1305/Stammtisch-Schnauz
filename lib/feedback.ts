const KEY = 'schnauz_feedback'

export function feedbackEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(KEY) !== 'off'
}

export function setFeedbackEnabled(on: boolean) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, on ? 'on' : 'off')
}

function beep(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.05) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.value = gain
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start()
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000)
    osc.stop(ctx.currentTime + durationMs / 1000)
    osc.onended = () => ctx.close()
  } catch {
    /* audio not available — ignore */
  }
}

function vib(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* vibration not available — ignore */
  }
}

export function feedbackEliminate() {
  if (!feedbackEnabled()) return
  vib(40)
  beep(200, 90, 'triangle', 0.04)
}

export function feedbackRevive() {
  if (!feedbackEnabled()) return
  vib([20, 40, 20])
  beep(540, 110, 'sine', 0.04)
}

export function feedbackWinner() {
  if (!feedbackEnabled()) return
  vib([60, 40, 140])
  beep(660, 130, 'sine', 0.05)
  setTimeout(() => beep(880, 180, 'sine', 0.05), 130)
}
