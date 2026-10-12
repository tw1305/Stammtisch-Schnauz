/**
 * Sound, vibration and animation preferences + synthesized game sounds.
 *
 * Audio notes (why the old version was mostly silent):
 * - Browsers start an AudioContext "suspended" unless it is created/resumed inside
 *   a user gesture. Sounds triggered later (e.g. the winner sound after the round
 *   was saved) therefore never played. We now keep ONE shared context and unlock
 *   it on the first tap anywhere (see initFeedback).
 * - Sounds are synthesized louder and in a frequency range phone speakers can play.
 * - iPhone: the ring/silent switch mutes web audio, and Safari has no Vibration
 *   API — we fall back to the iOS 18+ "switch" haptic trick where possible.
 */

const SOUND_KEY = 'schnauz_feedback'
const ANIM_KEY = 'schnauz_animations'

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(key) !== 'off'
  } catch {
    return true
  }
}

function writeFlag(key: string, on: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
  } catch {
    /* storage unavailable — keep default */
  }
}

export const feedbackEnabled = () => readFlag(SOUND_KEY)
export const setFeedbackEnabled = (on: boolean) => writeFlag(SOUND_KEY, on)
export const animationsEnabled = () => readFlag(ANIM_KEY)
export const setAnimationsEnabled = (on: boolean) => writeFlag(ANIM_KEY, on)

// ---------- Audio engine ----------

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      ctx = new Ctx()
      // Compressor keeps layered sounds loud but free of clipping on phone speakers.
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 6
      master = ctx.createGain()
      master.gain.value = 0.9
      master.connect(comp)
      comp.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return { ctx, out: master! }
  } catch {
    return null
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf
  const len = Math.floor(c.sampleRate * 1.5)
  noiseBuf = c.createBuffer(1, len, c.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}

/** One tone with attack/decay envelope and optional pitch glide. */
function tone(
  freq: number,
  start: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number; lowpass?: number } = {}
) {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t0 = c.currentTime + start
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur)
  const peak = opts.gain ?? 0.3
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  let node: AudioNode = osc
  if (opts.lowpass) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = opts.lowpass
    osc.connect(f)
    node = f
  }
  node.connect(g)
  g.connect(out)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** Filtered noise burst (whoosh, hiss, explosion). */
function hiss(
  start: number,
  dur: number,
  opts: { type?: BiquadFilterType; from?: number; to?: number; gain?: number; q?: number } = {}
) {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t0 = c.currentTime + start
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const f = c.createBiquadFilter()
  f.type = opts.type ?? 'lowpass'
  f.Q.value = opts.q ?? 0.8
  f.frequency.setValueAtTime(opts.from ?? 2000, t0)
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.5, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f)
  f.connect(g)
  g.connect(out)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

// ---------- Haptics ----------

let iosSwitch: HTMLLabelElement | null = null

/** iOS 18+ Safari plays a haptic tick when a native switch checkbox toggles. */
function iosTick() {
  try {
    if (!iosSwitch) {
      const label = document.createElement('label')
      label.ariaHidden = 'true'
      label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      label.appendChild(input)
      document.body.appendChild(label)
      iosSwitch = label
    }
    iosSwitch.click()
  } catch {
    /* not supported */
  }
}

function vib(pattern: number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
      return
    }
    // No Vibration API (iPhone): one haptic tick per vibration segment.
    let t = 0
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) {
        if (t === 0) iosTick()
        else setTimeout(iosTick, t)
      }
      t += ms
    })
  } catch {
    /* vibration not available — ignore */
  }
}

// ---------- Unlock ----------

let initialized = false

/**
 * Registers gesture listeners that create/resume the shared AudioContext, so
 * sounds fired later (outside a tap) are audible. Safe to call repeatedly.
 */
export function initFeedback() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const unlock = () => {
    if (!feedbackEnabled()) return
    const a = audio()
    if (!a) return
    // Play an inaudible blip — required by older iOS to fully unlock audio.
    try {
      const src = a.ctx.createBufferSource()
      src.buffer = a.ctx.createBuffer(1, 1, 22050)
      src.connect(a.ctx.destination)
      src.start(0)
    } catch {
      /* ignore */
    }
  }
  for (const ev of ['touchend', 'click', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true })
  }
}

// ---------- Game sounds ----------

/** Player knocked out: heavy thud + sad "womp womp" + vibration. */
export function feedbackEliminate() {
  if (!feedbackEnabled()) return
  vib([90, 60, 180])
  tone(150, 0, 0.25, { type: 'sine', to: 55, gain: 0.5 })
  hiss(0, 0.18, { from: 900, to: 120, gain: 0.35 })
  tone(330, 0.18, 0.32, { type: 'sawtooth', to: 311, gain: 0.16, lowpass: 1400 })
  tone(294, 0.5, 0.6, { type: 'sawtooth', to: 220, gain: 0.16, lowpass: 1200 })
}

/** Player revived: injection hiss + rising sparkle arpeggio. */
export function feedbackRevive() {
  if (!feedbackEnabled()) return
  vib([30, 50, 30, 50, 70])
  hiss(0, 0.22, { type: 'highpass', from: 3500, to: 6000, gain: 0.22 })
  const notes = [523, 659, 784, 1047, 1319]
  notes.forEach((f, i) => {
    tone(f, 0.18 + i * 0.075, 0.35, { type: 'triangle', gain: 0.22 })
    tone(f * 2, 0.18 + i * 0.075, 0.25, { type: 'sine', gain: 0.06 })
  })
  tone(2093, 0.6, 0.6, { type: 'sine', gain: 0.08 })
}

/** Feuer (three aces): explosion boom + crackle. */
export function feedbackFire() {
  if (!feedbackEnabled()) return
  vib([220, 60, 120, 60, 70])
  tone(140, 0, 0.6, { type: 'sine', to: 40, gain: 0.7 })
  hiss(0, 1.1, { from: 4000, to: 180, gain: 0.7 })
  hiss(0.05, 0.5, { type: 'bandpass', from: 1500, to: 400, gain: 0.35, q: 1.5 })
  // Crackling embers
  for (let i = 0; i < 10; i++) {
    hiss(0.25 + Math.random() * 0.9, 0.035, { type: 'highpass', from: 2500 + Math.random() * 2500, gain: 0.25 })
  }
}

/** Round won: shower of coin "pling"s. */
export function feedbackWinner() {
  if (!feedbackEnabled()) return
  vib([40, 40, 40, 40, 40, 40, 260])
  const coin = (t: number, pitch = 1, gain = 0.16) => {
    tone(988 * pitch, t, 0.07, { type: 'square', gain, lowpass: 5000 })
    tone(1319 * pitch, t + 0.07, 0.38, { type: 'square', gain, lowpass: 5000 })
  }
  coin(0, 1, 0.2)
  for (let i = 1; i < 9; i++) coin(0.12 + i * 0.13 + Math.random() * 0.05, 0.94 + Math.random() * 0.14, 0.09)
}
