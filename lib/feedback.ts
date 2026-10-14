/**
 * Sound, vibration and animation preferences + synthesized game sounds.
 *
 * Audio notes (why the old version was mostly silent):
 * - Browsers start an AudioContext "suspended" unless it is created/resumed inside
 *   a user gesture. Sounds triggered later (e.g. the winner sound after the round
 *   was saved) therefore never played. We now keep ONE shared context and unlock
 *   it on the first tap anywhere (see initFeedback).
 * - Sounds are synthesized louder and in a frequency range phone speakers can play.
 * - iPhone: the ring/silent switch mutes web audio.
 *
 * Vibration uses the Vibration API, which only Android browsers implement (and only
 * outside silent / do-not-disturb mode). Safari on iPhone has none — not even for
 * home-screen apps; the old hidden-switch haptic trick was unreliable and Apple
 * closed it, so iPhones simply don't vibrate.
 */

const SOUND_KEY = 'schnauz_feedback' // historical name: this is the sound toggle
const VIB_KEY = 'schnauz_vibration'
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

export const soundEnabled = () => readFlag(SOUND_KEY)
export const setSoundEnabled = (on: boolean) => writeFlag(SOUND_KEY, on)
/** Whether this browser can vibrate at all (Android yes, iPhone no). */
export const vibrationSupported = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
export const vibrationEnabled = () => vibrationSupported() && readFlag(VIB_KEY)
export const setVibrationEnabled = (on: boolean) => writeFlag(VIB_KEY, on)
export const animationsEnabled = () => readFlag(ANIM_KEY)
/** The device asks for reduced motion: effects stay, but calmer (no shake, less flicker). */
export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
export const setAnimationsEnabled = (on: boolean) => {
  writeFlag(ANIM_KEY, on)
  applyAnimationPref()
}

/** Mirrors the preference on <html data-anim> so CSS can pause looping ring animations. */
export function applyAnimationPref() {
  if (typeof document !== 'undefined') document.documentElement.dataset.anim = animationsEnabled() ? 'on' : 'off'
}

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

/** Vibrates (on/off pattern in ms) if supported and switched on in the settings. */
export function vib(pattern: number | number[]) {
  if (!vibrationEnabled()) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* blocked (e.g. no tap on the page yet) — ignore */
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
  applyAnimationPref()
  const unlock = () => {
    if (!soundEnabled()) return
    const a = audio()
    if (!a) return
    preloadSounds()
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

// ---------- Recorded sounds (public/sounds) ----------

/** Fart recordings (freesound.org), converted to small mono WAVs; picked at random. */
const FART_FILES = [
  '/sounds/fart-01.wav', '/sounds/fart-02.wav', '/sounds/fart-03.wav', '/sounds/fart-04.wav',
  '/sounds/fart-05.wav', '/sounds/fart-06.wav', '/sounds/fart-07.wav', '/sounds/fart-08.wav',
  '/sounds/fart-09.wav', '/sounds/fart-10.mp3', '/sounds/fart-11.mp3',
]
/** Fire explosion (freesound #186932 by readeonly), trimmed to start at 1.1 s. */
const FIRE_FILE = '/sounds/fire.wav'
/** Shouted right after the explosion (user-supplied clip). */
const FEUERBALL_FILE = '/sounds/feuerball.mp3'
/** Seconds after the explosion starts: overlaps its fading tail a little. */
const FEUERBALL_DELAY = 1.7
/**
 * The clip is recorded ~24 dB quieter than the explosion. ×22 with soft clipping
 * matches it (measured: avg −8.3 vs −8.2 dB, loudest 50 ms −3.9 vs −3.7 dB, no clipping).
 */
const FEUERBALL_GAIN = 22
/** Revive: soldier yelling "MEDIC!" (freesound #800868 by tyranttim), 0.84 s, loud until ~0.6 s. */
const MEDIC_FILE = '/sounds/medic.wav'
/** When the syringe (sound + animation) follows the medic call, in ms. */
export const MEDIC_MS = 650
/** Round won: one of these clips at random (cut by the user, fade-outs included). */
const WIN_FILES = [
  '/sounds/win/cant-be-touched.mp3', // Body Head Bangerz – Can't Be Touched
  '/sounds/win/win-jay-rock.mp3', // Jay Rock – WIN
  '/sounds/win/money-trees.mp3', // Kendrick Lamar – Money Trees
  '/sounds/win/cwwdbi.mp3', // Haftbefehl – CWWDBI
  '/sounds/win/started-from-the-bottom.mp3', // Drake – Started From the Bottom
  '/sounds/win/make-it-rain.mp3', // Fat Joe – Make It Rain
  '/sounds/win/big-pimpin.mp3', // JAY-Z – Big Pimpin'
  '/sounds/win/cream.mp3', // Wu-Tang Clan – C.R.E.A.M.
  '/sounds/win/geld-essen.mp3', // K.I.Z – Geld essen
  '/sounds/win/hustlin.mp3', // Rick Ross – Hustlin'
  '/sounds/win/i-get-money.mp3', // 50 Cent – I Get Money
]

/** First round of a session won: Counter-Strike "First Blood" call (~3 s) before the song. */
const FIRST_BLOOD_FILE = '/sounds/first-blood.mp3'
/** If the call isn't decoded by then, the song starts without it. */
const FIRST_BLOOD_WAIT_MS = 1500

const sampleCache = new Map<string, Promise<AudioBuffer | null>>()
let sampleOut: GainNode | null = null
let winSource: AudioBufferSourceNode | null = null
let introSource: AudioBufferSourceNode | null = null
let winToken = 0
let preloaded = false

function loadSample(url: string): Promise<AudioBuffer | null> {
  const a = audio()
  if (!a) return Promise.resolve(null)
  let p = sampleCache.get(url)
  if (!p) {
    p = fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      // Callback form: older iOS Safari has no promise-based decodeAudioData.
      .then(data => new Promise<AudioBuffer>((res, rej) => a.ctx.decodeAudioData(data, res, rej)))
      .catch(() => {
        sampleCache.delete(url) // allow a retry later (e.g. after being offline)
        return null
      })
    sampleCache.set(url, p)
  }
  return p
}

/** Fetches and decodes all recorded sounds once, so they play instantly later. */
function preloadSounds() {
  if (preloaded) return
  preloaded = true
  for (const url of [...FART_FILES, FIRE_FILE, FEUERBALL_FILE, MEDIC_FILE, FIRST_BLOOD_FILE]) void loadSample(url)
  // Win songs are bigger: only the one that plays next is fetched and decoded ahead.
  pickNextWin()
}

/**
 * Plays a recorded sound. Resolves to the playing source, or null if the file
 * couldn't be loaded — callers then fall back to the synthesized sound.
 * Recordings bypass the compressor (they are already mastered). `softClip`
 * is for quiet recordings boosted far beyond 0 dBFS: a tanh curve rounds the
 * peaks off instead of letting them crackle.
 */
async function playSample(url: string, gain = 0.9, delay = 0, softClip = false): Promise<AudioBufferSourceNode | null> {
  const a = audio()
  if (!a) return null
  const buf = await loadSample(url)
  if (!buf) return null
  if (!sampleOut) {
    sampleOut = a.ctx.createGain()
    sampleOut.connect(a.ctx.destination)
  }
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  const g = a.ctx.createGain()
  src.connect(g)
  if (softClip) {
    // The shaper's input range is ±1, so pre-scale by the curve's drive.
    g.gain.value = gain / CLIP_DRIVE
    const shaper = a.ctx.createWaveShaper()
    shaper.curve = softClipCurve()
    shaper.oversample = '4x'
    g.connect(shaper)
    shaper.connect(sampleOut)
  } else {
    g.gain.value = gain
    g.connect(sampleOut)
  }
  src.start(a.ctx.currentTime + delay)
  return src
}

const CLIP_DRIVE = 4
let clipCurve: Float32Array<ArrayBuffer> | null = null

/** tanh soft clipper: linear for quiet parts, peaks rounded off just below full scale. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  if (!clipCurve) {
    clipCurve = new Float32Array(2049)
    for (let i = 0; i < clipCurve.length; i++) clipCurve[i] = 0.95 * Math.tanh(CLIP_DRIVE * (i / 1024 - 1))
  }
  return clipCurve
}

// ---------- Sound building blocks ----------

let brownBuf: AudioBuffer | null = null

/** Brown (red) noise: deep, rumbling — the body of a fire's roar. */
function brown(c: AudioContext): AudioBuffer {
  if (brownBuf && brownBuf.sampleRate === c.sampleRate) return brownBuf
  const len = Math.floor(c.sampleRate * 3)
  brownBuf = c.createBuffer(1, len, c.sampleRate)
  const d = brownBuf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    d[i] = last * 3.5
  }
  return brownBuf
}

/** Output node, optionally panned left/right (coins land all around you). */
function panned(c: AudioContext, out: AudioNode, pan: number): AudioNode {
  if (!pan || typeof c.createStereoPanner !== 'function') return out
  const p = c.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  p.connect(out)
  return p
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

// ---------- Fart synthesis ----------

type FartParams = {
  dur: number // seconds
  f0: number // start pitch (Hz)
  f1: number // end pitch (Hz)
  wobble: number // pitch wobble rate (Hz)
  wobbleDepth: number // pitch wobble depth (Hz)
  flutter: number // "brrrr" amplitude flutter rate (Hz)
  cutoff: number // lowpass cutoff — lower = muffled, higher = squeaky
  q: number // filter resonance
  air: number // amount of breathy noise (0..1)
  wave: OscillatorType
}

/** One toot: buzzing oscillator + pitch wobble + amplitude flutter + air, through a resonant lowpass. */
function toot(start: number, p: FartParams, gain = 0.5) {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t0 = c.currentTime + start
  const t1 = t0 + p.dur

  const osc = c.createOscillator()
  osc.type = p.wave
  osc.frequency.setValueAtTime(p.f0, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.f1), t1)

  // Pitch wobble
  const lfo = c.createOscillator()
  lfo.frequency.value = p.wobble
  const lfoGain = c.createGain()
  lfoGain.gain.value = p.wobbleDepth
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)

  // Amplitude flutter ("brrrr")
  const am = c.createGain()
  am.gain.value = 0.6
  const flut = c.createOscillator()
  flut.type = 'square'
  flut.frequency.setValueAtTime(p.flutter, t0)
  flut.frequency.linearRampToValueAtTime(p.flutter * rand(0.7, 1.3), t1)
  const flutGain = c.createGain()
  flutGain.gain.value = 0.4
  flut.connect(flutGain)
  flutGain.connect(am.gain)

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(p.cutoff, t0)
  lp.frequency.exponentialRampToValueAtTime(p.cutoff * 0.6, t1)
  lp.Q.value = p.q

  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.025)
  env.gain.setValueAtTime(gain, Math.max(t0 + 0.03, t1 - 0.08))
  env.gain.exponentialRampToValueAtTime(0.0001, t1)

  osc.connect(am)
  am.connect(lp)
  lp.connect(env)
  env.connect(out)

  // Breathy air
  if (p.air > 0) {
    const n = c.createBufferSource()
    n.buffer = noise(c)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = p.cutoff * 0.9
    bp.Q.value = 0.9
    const ng = c.createGain()
    ng.gain.value = p.air
    n.connect(bp)
    bp.connect(ng)
    ng.connect(am)
    n.start(t0)
    n.stop(t1 + 0.05)
  }

  for (const o of [osc, lfo, flut]) {
    o.start(t0)
    o.stop(t1 + 0.05)
  }
}

/** Fart archetypes; each is randomised further on every call. */
const FARTS: (() => void)[] = [
  // Klassiker
  () => toot(0, { dur: rand(0.45, 0.7), f0: rand(85, 110), f1: rand(65, 85), wobble: rand(7, 11), wobbleDepth: 12, flutter: rand(24, 32), cutoff: 750, q: 4, air: 0.15, wave: 'sawtooth' }),
  // Quietscher
  () => toot(0, { dur: rand(0.28, 0.42), f0: rand(230, 280), f1: rand(300, 380), wobble: rand(12, 16), wobbleDepth: 30, flutter: rand(40, 52), cutoff: 2200, q: 6, air: 0.05, wave: 'square' }, 0.32),
  // Donnergrollen
  () => toot(0, { dur: rand(0.9, 1.3), f0: rand(62, 78), f1: rand(48, 60), wobble: rand(4, 6), wobbleDepth: 8, flutter: rand(16, 21), cutoff: 480, q: 3, air: 0.3, wave: 'sawtooth' }, 0.65),
  // Stotterer: 3–5 kurze Stöße
  () => {
    const n = 3 + Math.floor(Math.random() * 3)
    let t = 0
    for (let i = 0; i < n; i++) {
      const d = rand(0.07, 0.13)
      toot(t, { dur: d, f0: rand(95, 150), f1: rand(80, 120), wobble: 10, wobbleDepth: 10, flutter: 30, cutoff: 850, q: 4, air: 0.1, wave: 'sawtooth' }, 0.45)
      t += d + rand(0.04, 0.09)
    }
  },
  // Luft ablassen (absteigend)
  () => toot(0, { dur: rand(0.8, 1.1), f0: rand(170, 210), f1: rand(60, 75), wobble: rand(8, 12), wobbleDepth: 18, flutter: rand(30, 40), cutoff: 1300, q: 5, air: 0.12, wave: 'sawtooth' }),
  // Feucht
  () => {
    toot(0, { dur: rand(0.5, 0.7), f0: rand(75, 95), f1: rand(60, 75), wobble: 6, wobbleDepth: 10, flutter: rand(18, 24), cutoff: 600, q: 2, air: 0.6, wave: 'sawtooth' }, 0.55)
    for (let i = 0; i < 4; i++) hiss(rand(0.05, 0.55), 0.03, { type: 'bandpass', from: rand(250, 500), gain: 0.35, q: 4 })
  },
  // Fragend (steigt am Ende)
  () => toot(0, { dur: rand(0.45, 0.6), f0: rand(85, 100), f1: rand(150, 190), wobble: 9, wobbleDepth: 14, flutter: rand(26, 34), cutoff: 1000, q: 5, air: 0.1, wave: 'square' }, 0.4),
  // Doppelschlag
  () => {
    toot(0, { dur: 0.22, f0: rand(100, 120), f1: 90, wobble: 9, wobbleDepth: 10, flutter: 28, cutoff: 800, q: 4, air: 0.12, wave: 'sawtooth' })
    toot(0.3, { dur: rand(0.4, 0.55), f0: rand(80, 95), f1: 65, wobble: 7, wobbleDepth: 12, flutter: 24, cutoff: 650, q: 4, air: 0.2, wave: 'sawtooth' })
  },
]

let lastFart = -1

// ---------- Game sounds ----------

/** Player knocked out: a random fart recording — never the same one twice in a row. */
export function feedbackEliminate() {
  vib([90, 60, 180])
  if (!soundEnabled()) return
  let i = Math.floor(Math.random() * FART_FILES.length)
  if (i === lastFart) i = (i + 1 + Math.floor(Math.random() * (FART_FILES.length - 1))) % FART_FILES.length
  lastFart = i
  void playSample(FART_FILES[i], 1).then(src => {
    if (!src) FARTS[Math.floor(Math.random() * FARTS.length)]() // offline fallback: synthesized fart
  })
}

/** Player revived: a soldier yells "MEDIC!", then injection hiss + rising sparkle arpeggio. */
export function feedbackRevive() {
  // Long buzz while the soldier yells, then the syringe pulses.
  vib([400, MEDIC_MS - 400, 60, 60, 60, 60, 140])
  if (!soundEnabled()) return
  void playSample(MEDIC_FILE, 1)
  const d = MEDIC_MS / 1000 // syringe starts once "MEDIC!" is (almost) over
  hiss(d, 0.22, { type: 'highpass', from: 3500, to: 6000, gain: 0.22 })
  const notes = [523, 659, 784, 1047, 1319]
  notes.forEach((f, i) => {
    tone(f, d + 0.18 + i * 0.075, 0.35, { type: 'triangle', gain: 0.22 })
    tone(f * 2, d + 0.18 + i * 0.075, 0.25, { type: 'sine', gain: 0.06 })
  })
  tone(2093, d + 0.6, 0.6, { type: 'sine', gain: 0.08 })
}

/**
 * Round start: a wooden knock each time a player's token lands on its seat
 * (low thump + short click). `landings` = seconds from now, one per player.
 */
export function feedbackRoundStart(landings: number[]) {
  if (landings.length === 0) return
  // One short buzz per landing (Android)
  const pattern: number[] = [Math.round(landings[0] * 1000)]
  landings.forEach((t, i) => {
    if (i > 0) pattern.push(Math.max(10, Math.round((t - landings[i - 1]) * 1000) - 30))
    pattern.push(30)
  })
  vib([0, ...pattern])
  if (!soundEnabled()) return
  for (const land of landings) {
    tone(rand(150, 175), land, 0.13, { type: 'sine', to: 70, gain: 0.34 })
    hiss(land, 0.045, { type: 'bandpass', from: rand(900, 1300), gain: 0.22, q: 2.5 })
  }
}

/** Feuer (three aces): fire explosion recording. */
export function feedbackFire() {
  vib([250, 70, 150, 70, 100, 70, 80])
  if (!soundEnabled()) return
  void playSample(FIRE_FILE, 1).then(src => {
    if (!src) synthFire()
  })
  // "So ein großer Feuerball, Junge!" — while the explosion dies away (it's loud until ~1.6 s).
  void playSample(FEUERBALL_FILE, FEUERBALL_GAIN, FEUERBALL_DELAY, true)
}

/** Fallback when the recording can't be loaded: ignition whoosh, roaring blaze, crackling embers. */
function synthFire() {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t0 = c.currentTime

  // "Wumm" of the ignition
  tone(110, 0, 0.45, { type: 'sine', to: 42, gain: 0.45 })
  // Whoosh as the flames catch: noise sweeping up
  hiss(0, 0.6, { type: 'bandpass', from: 250, to: 2600, gain: 0.45, q: 0.8 })

  // Roar: brown noise through a lowpass, swelling and flickering
  const roar = c.createBufferSource()
  roar.buffer = brown(c)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(350, t0)
  lp.frequency.linearRampToValueAtTime(900, t0 + 0.4)
  lp.frequency.linearRampToValueAtTime(500, t0 + 2.4)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.3)
  g.gain.setValueAtTime(0.55, t0 + 1.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6)
  const flicker = c.createOscillator()
  flicker.frequency.value = rand(4, 7)
  const fg = c.createGain()
  fg.gain.value = 0.15
  flicker.connect(fg)
  fg.connect(g.gain)
  roar.connect(lp)
  lp.connect(g)
  g.connect(out)
  roar.start(t0)
  roar.stop(t0 + 2.7)
  flicker.start(t0)
  flicker.stop(t0 + 2.7)

  // Licking flames: mid-range hiss fluttering quickly
  const lick = c.createBufferSource()
  lick.buffer = noise(c)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1100
  bp.Q.value = 0.6
  const lg = c.createGain()
  lg.gain.setValueAtTime(0.0001, t0)
  lg.gain.exponentialRampToValueAtTime(0.18, t0 + 0.35)
  lg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.3)
  const lf = c.createOscillator()
  lf.frequency.value = rand(9, 13)
  const lfg = c.createGain()
  lfg.gain.value = 0.1
  lf.connect(lfg)
  lfg.connect(lg.gain)
  lick.connect(bp)
  bp.connect(lg)
  lg.connect(out)
  lick.start(t0)
  lick.stop(t0 + 2.4)
  lf.start(t0)
  lf.stop(t0 + 2.4)

  // Crackling wood: many tiny sharp pops, denser early on
  for (let i = 0; i < 40; i++) {
    const t = 0.15 + Math.pow(Math.random(), 1.4) * 2.1
    hiss(t, rand(0.006, 0.02), { type: 'highpass', from: rand(1800, 6000), gain: rand(0.15, 0.55) })
  }
  // A few deeper knots popping
  for (let i = 0; i < 6; i++) {
    hiss(rand(0.3, 2), 0.035, { type: 'bandpass', from: rand(350, 800), gain: 0.45, q: 3 })
  }
}

/** One coin hitting something: short inharmonic metallic ring, panned. */
function clink(start: number, freq: number, gain: number, pan: number) {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t0 = c.currentTime + start
  const dest = panned(c, out, pan)
  // Inharmonic partials of a small metal disc
  const partials: [number, number, number][] = [
    [1, 1, rand(0.18, 0.4)],
    [2.76, 0.5, rand(0.1, 0.2)],
    [5.4, 0.25, rand(0.05, 0.1)],
  ]
  for (const [ratio, amp, decay] of partials) {
    const o = c.createOscillator()
    o.frequency.value = freq * ratio
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain * amp, t0 + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
    o.connect(g)
    g.connect(dest)
    o.start(t0)
    o.stop(t0 + decay + 0.02)
  }
  // Impact click
  const n = c.createBufferSource()
  n.buffer = noise(c)
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 5000
  const ng = c.createGain()
  ng.gain.setValueAtTime(gain * 0.8, t0)
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012)
  n.connect(hp)
  hp.connect(ng)
  ng.connect(dest)
  n.start(t0)
  n.stop(t0 + 0.02)
}

let lastWin = -1
let nextWin = -1

/** Chooses (and preloads) the song for the next win — never the one that just played. */
function pickNextWin() {
  let i = Math.floor(Math.random() * WIN_FILES.length)
  if (i === lastWin) i = (i + 1 + Math.floor(Math.random() * (WIN_FILES.length - 1))) % WIN_FILES.length
  nextWin = i
  void loadSample(WIN_FILES[i])
}

/**
 * Plays the First Blood call now. Resolves to the AudioContext time at which it
 * ends, or null if it couldn't be loaded in time (then the song just starts).
 */
async function playFirstBlood(): Promise<number | null> {
  const a = audio()
  if (!a) return null
  const buf = await Promise.race([
    loadSample(FIRST_BLOOD_FILE),
    new Promise<null>(res => setTimeout(() => res(null), FIRST_BLOOD_WAIT_MS)),
  ])
  if (!buf) return null
  const src = await playSample(FIRST_BLOOD_FILE, 1)
  if (!src) return null
  introSource = src
  return a.ctx.currentTime + buf.duration
}

function stopSource(src: AudioBufferSourceNode | null) {
  try {
    src?.stop()
  } catch {
    /* already stopped */
  }
}

/** Round won: a random victory song — after the "First Blood" call for a session's first round. */
export function feedbackWinner(opts: { firstBlood?: boolean } = {}) {
  vib([70, 50, 70, 50, 70, 50, 70, 50, 320])
  if (!soundEnabled()) return
  // A new win cuts off a still-playing previous one instead of overlapping it.
  stopSource(winSource)
  stopSource(introSource)
  winSource = introSource = null
  const token = ++winToken
  if (nextWin < 0) pickNextWin()
  const url = WIN_FILES[nextWin]
  lastWin = nextWin
  void (async () => {
    const introEnd = opts.firstBlood ? await playFirstBlood() : null
    if (token !== winToken) return // a newer win took over meanwhile
    // Make sure the song is decoded before scheduling it right at the end of the call.
    await loadSample(url)
    const a = audio()
    const delay = introEnd != null && a ? Math.max(0, introEnd - a.ctx.currentTime) : 0
    const src = await playSample(url, 0.85, delay)
    if (token !== winToken) {
      stopSource(src)
      return
    }
    if (src) winSource = src
    else synthCoins()
    sampleCache.delete(url) // the playing source keeps its buffer; don't hoard decoded songs
  })()
  pickNextWin()
}

/** Fallback when the recording can't be loaded: a shower of clinking, bouncing coins. */
function synthCoins() {
  // Jingling bed: the pile of coins shimmering
  hiss(0.05, 2.2, { type: 'bandpass', from: 7000, to: 5500, gain: 0.09, q: 1.2 })
  for (let i = 0; i < 48; i++) {
    const t = 0.03 + Math.pow(Math.random(), 1.35) * 2.0
    const f = rand(2300, 4800)
    const g = rand(0.11, 0.26)
    const pan = rand(-0.8, 0.8)
    clink(t, f, g, pan)
    // Most coins bounce once or twice with a slightly lower ring
    if (Math.random() < 0.7) clink(t + rand(0.06, 0.12), f * rand(0.97, 1.02), g * 0.45, pan)
    if (Math.random() < 0.3) clink(t + rand(0.15, 0.22), f * rand(0.97, 1.02), g * 0.2, pan)
  }
}

// ---------- Season recap soundtrack ----------

/** 50 Cent – "I Get Money" (full track), looped under the season recap. */
const RECAP_SONG = '/sounds/recap-song.mp3'
const RECAP_VOLUME = 0.8

let song: HTMLAudioElement | null = null
let songFade = 0

function songEl(): HTMLAudioElement {
  if (!song) {
    song = new Audio(RECAP_SONG)
    song.loop = true
    song.preload = 'auto'
  }
  return song
}

/**
 * Starts the recap song from the beginning. Call it synchronously inside the
 * tap that opens the recap: iPhones only let media start from a tap, and once
 * started there the element may be paused/resumed freely afterwards.
 */
export function startRecapMusic() {
  if (typeof window === 'undefined' || !soundEnabled()) return
  const el = songEl()
  clearInterval(songFade)
  el.volume = RECAP_VOLUME
  if (!el.paused) return
  try {
    el.currentTime = 0
  } catch {
    /* not loaded yet — starts at 0 anyway */
  }
  void el.play().catch(() => {})
}

/** Resumes the song (e.g. on a tap if autoplay was blocked); no-op while playing. */
export function resumeRecapMusic() {
  if (typeof window === 'undefined' || !soundEnabled()) return
  const el = songEl()
  clearInterval(songFade)
  el.volume = RECAP_VOLUME
  if (el.paused) void el.play().catch(() => {})
}

/** Pauses the song, fading out where the browser allows volume changes (not on iPhone). */
export function stopRecapMusic(fadeMs = 600) {
  if (!song || song.paused) return
  const el = song
  clearInterval(songFade)
  const steps = Math.max(1, Math.round(fadeMs / 50))
  let i = 0
  songFade = window.setInterval(() => {
    i++
    el.volume = Math.max(0, RECAP_VOLUME * (1 - i / steps))
    if (i >= steps) {
      clearInterval(songFade)
      el.pause()
      el.volume = RECAP_VOLUME
    }
  }, 50)
}

export const recapMusicPlaying = () => !!song && !song.paused
