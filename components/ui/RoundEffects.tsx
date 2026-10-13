'use client'

import { useEffect, useMemo, useRef } from 'react'
import { POT_TIERS, type StormLevel } from '@/lib/effects'
import { reducedMotion } from '@/lib/feedback'

/** Small deterministic PRNG, so generated shapes stay identical across renders. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth closed path through points (Catmull-Rom → cubic Bézier). */
function smoothClosed(pts: [number, number][]): string {
  const n = pts.length
  const p = (i: number) => pts[(i + n) % n]
  let d = `M${p(0)[0].toFixed(1)},${p(0)[1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d + 'Z'
}

// =====================================================================
// First Blood: blood oozing out from behind the winner's portrait
// =====================================================================

type Drip = { x: number; y: number; w: number; len: number; dur: number; delay: number }

function bloodShape() {
  const r = rng(1337)
  // Pool: wobbly blob a bit larger than the avatar (radius 50 units), with lobes.
  // Units: the avatar radius is 50; the lower edge stays short so the title below stays clear.
  const N = 30
  // Lobes spread evenly around the rim (with jitter), so the pool stays centred on the portrait.
  const lobes = Array.from({ length: 8 }, (_, i) => ({
    at: ((i + 0.3) / 8) * Math.PI * 2 + (r() - 0.5) * 0.5,
    amp: 3 + r() * 16,
    wid: 0.22 + r() * 0.22,
  }))
  const radius = (a: number) => {
    let ext = 9 + r() * 3
    for (const l of lobes) {
      const d = Math.atan2(Math.sin(a - l.at), Math.cos(a - l.at))
      ext += l.amp * Math.exp(-(d * d) / (2 * l.wid * l.wid))
    }
    const down = Math.max(0, Math.sin(a)) // 1 = straight down (SVG y points down)
    return 50 + ext * (1 - 0.65 * down)
  }
  const pool: [number, number][] = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2
    const rad = radius(a)
    return [Math.cos(a) * rad, Math.sin(a) * rad]
  })
  // Splatter: streaks + droplets flung outwards (not downwards, towards the text)
  const awayFromBottom = () => {
    let a = 0
    do a = r() * Math.PI * 2
    while (Math.sin(a) > 0.55)
    return a
  }
  const streaks = Array.from({ length: 7 }, () => {
    const a = awayFromBottom()
    return { a, from: 54, to: 68 + r() * 18, w: 3 + r() * 3.5 }
  })
  const drops = Array.from({ length: 8 }, () => {
    const a = awayFromBottom()
    return { x: Math.cos(a) * (70 + r() * 20), y: Math.sin(a) * (70 + r() * 20), rad: 1.6 + r() * 3.2 }
  })
  // Drips running down from the lower half of the pool's rim
  const drips: Drip[] = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI * (0.16 + (i / 5) * 0.68)) + (r() - 0.5) * 0.12 // spread across the bottom
    const rad = radius(a) - 4
    const w = 4.5 + r() * 3.5
    return {
      x: Math.cos(a) * rad,
      y: Math.sin(a) * rad,
      w,
      len: 7 + r() * 13 + Math.abs(Math.cos(a)) * 8, // side drips may run a bit longer
      dur: 2600 + r() * 2200,
      delay: 900 + r() * 1100,
    }
  })
  return { pool: smoothClosed(pool), streaks, drops, drips }
}

/**
 * Blood pooling out from behind a profile picture (First Blood). Render it
 * BEFORE the avatar inside a `relative` box of the avatar's size: the pool
 * starts hidden behind the portrait and spreads past its rim, then drips run
 * slowly down. The avatar on top stays fully visible.
 */
export function BloodSplash({ size, delay = 0.25 }: { size: number; delay?: number }) {
  const shape = useMemo(() => bloodShape(), [])
  const S = size * 2 // viewBox −100..100 = twice the avatar (radius 50 units)
  const dripRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const root = dripRef.current
    if (!root) return
    const instant = reducedMotion()
    const anims: Animation[] = []
    root.querySelectorAll<SVGGElement>('[data-drip]').forEach((g, i) => {
      const d = shape.drips[i]
      const bar = g.querySelector<SVGRectElement>('rect')
      const bulb = g.querySelector<SVGCircleElement>('circle')
      if (!bar || !bulb) return
      const opts: KeyframeAnimationOptions = {
        duration: instant ? 1 : d.dur,
        delay: instant ? 0 : delay * 1000 + d.delay,
        easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', // slows down as the blood runs dry
        fill: 'both',
      }
      anims.push(bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], opts))
      anims.push(
        bulb.animate(
          [
            { transform: 'translateY(0px) scale(0.6)', opacity: 0 },
            { transform: `translateY(${d.len * 0.1}px) scale(1)`, opacity: 1, offset: 0.08 },
            { transform: `translateY(${d.len}px) scale(1)`, opacity: 1 },
          ],
          opts
        )
      )
    })
    return () => anims.forEach(a => a.cancel())
  }, [shape, delay])

  const layer = 'absolute inset-0 w-full h-full overflow-visible'
  return (
    <div
      className="absolute left-1/2 top-1/2 pointer-events-none"
      style={{ width: S, height: S, marginLeft: -S / 2, marginTop: -S / 2 }}
      aria-hidden="true"
    >
      <svg viewBox="-100 -100 200 200" className={`${layer} bl-ooze`} style={{ animationDelay: `${delay}s` }}>
        <defs>
          <radialGradient id="bl-pool" cx="0" cy="0" r="90" gradientUnits="userSpaceOnUse">
            <stop offset="0.55" stopColor="#A10B18" />
            <stop offset="0.8" stopColor="#7E0712" />
            <stop offset="1" stopColor="#5A040C" />
          </radialGradient>
        </defs>
        <path d={shape.pool} fill="url(#bl-pool)" stroke="#4A030A" strokeWidth="1.2" />
        {/* wet gloss */}
        <ellipse cx="-44" cy="-42" rx="9" ry="3.5" transform="rotate(-40 -44 -42)" fill="#FFFFFF" opacity="0.28" />
        <ellipse cx="52" cy="-30" rx="5" ry="2" transform="rotate(55 52 -30)" fill="#FFFFFF" opacity="0.22" />
      </svg>
      <svg viewBox="-100 -100 200 200" className={`${layer} bl-splat`} style={{ animationDelay: `${delay + 0.35}s` }}>
        {shape.streaks.map((s, i) => {
          const [c, n] = [Math.cos(s.a), Math.sin(s.a)]
          const [px, py] = [-n, c] // perpendicular
          const tip = [c * s.to, n * s.to]
          const b1 = [c * s.from + px * s.w, n * s.from + py * s.w]
          const b2 = [c * s.from - px * s.w, n * s.from - py * s.w]
          return (
            <g key={i} fill="#8E0914">
              <path d={`M${b1[0]},${b1[1]} Q${c * (s.to - 6) + px * 1.2},${n * (s.to - 6) + py * 1.2} ${tip[0]},${tip[1]} Q${c * (s.to - 6) - px * 1.2},${n * (s.to - 6) - py * 1.2} ${b2[0]},${b2[1]} Z`} />
              <circle cx={c * (s.to + 3.5)} cy={n * (s.to + 3.5)} r={s.w * 0.55} />
            </g>
          )
        })}
        {shape.drops.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.rad} fill="#8E0914" />
        ))}
      </svg>
      <svg viewBox="-100 -100 200 200" className={layer}>
        <g ref={dripRef}>
          {shape.drips.map((d, i) => (
            <g key={i} data-drip fill="#8A0913">
              <rect
                x={d.x - d.w / 2}
                y={d.y}
                width={d.w}
                height={d.len}
                rx={d.w / 2}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 0%' }}
              />
              <circle cx={d.x} cy={d.y} r={d.w * 0.68} style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

// =====================================================================
// Storm: lightning above the standard stake (StormLevel from lib/effects)
// =====================================================================

type Seg = [number, number, number, number]
type Bolt = { born: number; segs: Seg[]; branch: Seg[] }

/** Jagged bolt from (x0,y0) to (x1,y1) by midpoint displacement. */
function boltPath(x0: number, y0: number, x1: number, y1: number, rough: number, depth: number, out: Seg[]) {
  if (depth === 0) {
    out.push([x0, y0, x1, y1])
    return
  }
  const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * rough
  const my = (y0 + y1) / 2 + (Math.random() - 0.5) * rough * 0.3
  boltPath(x0, y0, mx, my, rough / 2, depth - 1, out)
  boltPath(mx, my, x1, y1, rough / 2, depth - 1, out)
}

function makeBolt(W: number, H: number, born: number): Bolt {
  const x0 = W * (0.12 + Math.random() * 0.76)
  const x1 = x0 + (Math.random() - 0.5) * W * 0.45
  const y1 = H * (0.45 + Math.random() * 0.4)
  const segs: Seg[] = []
  boltPath(x0, -10, x1, y1, W * 0.22, 6, segs)
  const branch: Seg[] = []
  const nb = 1 + Math.floor(Math.random() * 3)
  for (let b = 0; b < nb; b++) {
    const s = segs[Math.floor(segs.length * (0.2 + Math.random() * 0.5))]
    const ang = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6)
    const len = H * (0.08 + Math.random() * 0.16)
    boltPath(s[2], s[3], s[2] + Math.sin(ang) * len, s[3] + Math.cos(ang) * len, len * 0.5, 4, branch)
  }
  return { born, segs, branch }
}

/** Strike times (ms) for a level: the first hits right away, the rest spread out, partly in quick doubles. */
function strikeTimes(level: StormLevel): number[] {
  const t: number[] = [250]
  const n = level.bolts - 1
  for (let i = 0; i < n; i++) {
    const base = 250 + ((i + 1) / Math.max(1, n)) * (level.durationMs - 250)
    t.push(base + (Math.random() - 0.5) * (level.durationMs / Math.max(2, level.bolts)) * 0.8)
  }
  // Big storms: some strikes come as rapid doubles
  if (level.bolts >= 8) for (let i = 0; i < level.bolts / 4; i++) t.push(t[1 + Math.floor(Math.random() * n)] + 90 + Math.random() * 90)
  return t.sort((a, b) => a - b)
}

const BOLT_LIFE = 280
const RAIN_FADE = 1500

/**
 * Full-screen storm behind the result card: darkened sky, clouds, rain, lightning
 * and flashes. Runs for the level's duration, then stops its animation loop (the
 * darkened sky stays). `onStrike` lets the caller shake its content.
 */
export function StormOverlay({ level, onStrike }: { level: StormLevel; onStrike?: (shakePx: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const strikeRef = useRef(onStrike)
  useEffect(() => {
    strikeRef.current = onStrike
  }, [onStrike])

  useEffect(() => {
    const canvas = canvasRef.current
    const flashEl = flashRef.current
    if (!canvas || !flashEl) return
    const W = window.innerWidth
    const H = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    const g = canvas.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)

    // Fewer drops on weaker phones
    const weak = (navigator.hardwareConcurrency || 8) <= 4
    const rainCount = Math.round(level.rain * (weak ? 0.6 : 1))
    const drops = Array.from({ length: rainCount }, () => ({
      x: Math.random() * W * 1.2,
      y: Math.random() * H,
      len: 10 + Math.random() * 16,
      v: 11 + Math.random() * 9,
    }))
    const strikes = strikeTimes(level)
    const bolts: Bolt[] = []
    const anims: Animation[] = []
    const end = Math.max(level.durationMs, strikes[strikes.length - 1] ?? 0) + BOLT_LIFE
    const t0 = performance.now()
    let next = 0
    let raf = 0

    const flash = () => {
      const f = level.flash
      const frames = level.flicker
        ? [{ opacity: f }, { opacity: f * 0.15, offset: 0.25 }, { opacity: f * 0.8, offset: 0.4 }, { opacity: f * 0.1, offset: 0.65 }, { opacity: f * 0.4, offset: 0.78 }, { opacity: 0 }]
        : [{ opacity: f }, { opacity: 0 }]
      anims.push(flashEl.animate(frames, { duration: level.flicker ? 520 : 260, easing: 'ease-out' }))
    }

    const loop = (now: number) => {
      const t = now - t0
      while (next < strikes.length && t >= strikes[next]) {
        bolts.push(makeBolt(W, H, t))
        flash()
        if (level.shake > 0) strikeRef.current?.(level.shake)
        next++
      }
      g.clearRect(0, 0, W, H)

      // Rain: one path for all drops, fading out once the storm is over
      if (drops.length > 0) {
        const fade = t < level.durationMs ? 1 : Math.max(0, 1 - (t - level.durationMs) / RAIN_FADE)
        if (fade > 0) {
          g.strokeStyle = `rgba(175,195,235,${0.42 * fade})`
          g.lineWidth = 1.2
          g.beginPath()
          for (const d of drops) {
            d.y += d.v
            d.x -= d.v * 0.18
            if (d.y > H + 20) {
              d.y = -20 - Math.random() * 40
              d.x = Math.random() * W * 1.2
            }
            g.moveTo(d.x, d.y)
            g.lineTo(d.x - d.len * 0.18, d.y + d.len)
          }
          g.stroke()
        }
      }

      // Lightning: glow + white-hot core, flickering while it fades
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i]
        const age = t - b.born
        if (age > BOLT_LIFE) {
          bolts.splice(i, 1)
          continue
        }
        let a = 1 - age / BOLT_LIFE
        if (age > 70 && Math.floor(age / 35) % 2 === 1) a *= 0.45
        const stroke = (segs: Seg[], width: number, color: string) => {
          g.strokeStyle = color
          g.lineWidth = width
          g.beginPath()
          for (const [x0, y0, x1, y1] of segs) {
            g.moveTo(x0, y0)
            g.lineTo(x1, y1)
          }
          g.stroke()
        }
        g.lineCap = 'round'
        stroke(b.segs, 9, `rgba(140,170,255,${0.22 * a})`)
        stroke(b.branch, 5, `rgba(140,170,255,${0.18 * a})`)
        stroke(b.segs, 2.4, `rgba(255,255,255,${a})`)
        stroke(b.branch, 1.3, `rgba(235,240,255,${0.85 * a})`)
      }

      if (t < end + (drops.length > 0 ? RAIN_FADE : 0)) raf = requestAnimationFrame(loop)
      else g.clearRect(0, 0, W, H) // done: stop the loop for good
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      anims.forEach(a => a.cancel())
    }
  }, [level])

  const d = level.darken
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 st-sky"
        style={{ background: `linear-gradient(to bottom, rgba(6,10,26,${d}) 0%, rgba(10,14,30,${d * 0.75}) 55%, rgba(10,14,30,${d * 0.5}) 100%)` }}
      />
      {level.clouds &&
        [
          { left: '-25%', top: '-14%', w: '95%', h: '34%', delay: '0s' },
          { left: '30%', top: '-18%', w: '100%', h: '38%', delay: '-5s' },
          { left: '-5%', top: '4%', w: '80%', h: '24%', delay: '-9s' },
        ].map((c, i) => (
          <div
            key={i}
            className="absolute st-cloud"
            style={{
              left: c.left,
              top: c.top,
              width: c.w,
              height: c.h,
              animationDelay: c.delay,
              background: 'radial-gradient(closest-side, rgba(22,26,40,0.95), rgba(22,26,40,0.6) 55%, rgba(22,26,40,0))',
            }}
          />
        ))}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div ref={flashRef} className="absolute inset-0" style={{ background: '#DCE4FF', opacity: 0, mixBlendMode: 'screen' }} />
    </div>
  )
}

// =====================================================================
// Gold pile on the table (possible winnings)
// =====================================================================

const PILE_W = 240
const BASE_Y = 122
const PILE_BOTTOM = BASE_Y + 10 // room for the shadow and loose coins

/** Dome height (units of the 240-wide graphic): taller with every tier. */
const domeHeight = (tier: number) => 56 + tier * 8
/** Coins, bars & co. are drawn bigger on small heaps, so a few euros still read as a treasure. */
const itemScale = (tier: number) => 1.75 - tier * 0.12
/** Top of the graphic: dome + whatever sits on it (crown). */
function pileTop(tier: number) {
  const k = itemScale(tier)
  return BASE_Y - domeHeight(tier) - (POT_TIERS[tier].crown ? 30 * k : 10 * k) - 4
}
/** Height ÷ width of the pile graphic for a tier (for layout). */
export const goldPileAspect = (tier: number) => (PILE_BOTTOM - pileTop(tier)) / PILE_W

type PileItem =
  | { kind: 'coin'; x: number; y: number; s: number; tilt: number; up: boolean }
  | { kind: 'bar'; x: number; y: number; rot: number }
  | { kind: 'gem'; x: number; y: number; color: string; s: number }

const GEM_COLORS = ['#E0245E', '#1FAF6A', '#2E7BEA', '#B44CE0']

function pileShape(tier: number) {
  const t = POT_TIERS[tier]
  const r = rng(4242 + tier * 97)
  const hw = 100 // dome half width (units)
  const H = domeHeight(tier)
  const k = itemScale(tier)
  const surface = (x: number) => {
    const u = Math.min(1, Math.abs(x - 120) / hw)
    return BASE_Y - H * Math.pow(1 - u * u, 0.62)
  }
  const items: PileItem[] = []
  // Bars lying in the heap (drawn among the coins by height)
  for (let i = 0; i < t.bars; i++) {
    const x = 120 + (r() * 2 - 1) * hw * 0.62
    items.push({ kind: 'bar', x, y: surface(x) + 6 * k + r() * 10, rot: (r() - 0.5) * 34 })
  }
  for (let i = 0; i < t.coins; i++) {
    const x = 120 + (r() * 2 - 1) * hw * 0.9
    const top = surface(x)
    // mostly on the surface, so the coins form the heap's bumpy silhouette
    const y = top + 3 * k + Math.pow(r(), 2.2) * (BASE_Y - top) * 0.8
    items.push({ kind: 'coin', x, y, s: k * (0.85 + r() * 0.3), tilt: (r() - 0.5) * 40, up: r() < 0.22 })
  }
  for (let i = 0; i < t.gems; i++) {
    const x = 120 + (r() * 2 - 1) * hw * 0.45
    items.push({ kind: 'gem', x, y: surface(x) + 4 * k + r() * 6, color: GEM_COLORS[i % GEM_COLORS.length], s: k * (1.1 + r() * 0.3) })
  }
  items.sort((a, b) => a.y - b.y) // higher up = further back → drawn first
  // A few loose coins on the table around the heap
  const loose = Array.from({ length: 2 + Math.min(3, tier) }, (_, i) => ({
    x: 120 + (i % 2 ? 1 : -1) * (hw * 0.95 + 6 * k + r() * 10),
    y: BASE_Y - 1 + r() * 4,
    s: k * 0.9,
  }))
  const sparkles = Array.from({ length: 3 + Math.min(4, tier) }, () => {
    const x = 120 + (r() * 2 - 1) * hw * 0.8
    return { x, y: surface(x) + 2 + r() * 14, s: k * (0.8 + r() * 0.6), delay: r() * 2.4 }
  })
  const dome = `M${120 - hw - 4},${BASE_Y} C${120 - hw * 0.8},${BASE_Y - H * 0.85} ${120 - hw * 0.45},${BASE_Y - H} 120,${BASE_Y - H} C${120 + hw * 0.45},${BASE_Y - H} ${120 + hw * 0.8},${BASE_Y - H * 0.85} ${120 + hw + 4},${BASE_Y} Z`
  return { items, loose, sparkles, dome, top: BASE_Y - H, crown: t.crown, k, viewTop: pileTop(tier) }
}

function Coin({ x, y, s = 1, tilt = 0, up = false }: { x: number; y: number; s?: number; tilt?: number; up?: boolean }) {
  if (up) {
    // A coin standing on its edge, facing us
    return (
      <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
        <ellipse cx="1.2" cy="0" rx="6.4" ry="7.6" fill="#9A6A0C" />
        <ellipse cx="0" cy="0" rx="6.4" ry="7.6" fill="url(#gp-coin)" stroke="#9A6A0C" strokeWidth="0.8" />
        <ellipse cx="0" cy="0" rx="4.3" ry="5.3" fill="none" stroke="#B88413" strokeWidth="0.8" />
        <ellipse cx="-2" cy="-3" rx="1.6" ry="2.4" fill="#FFF6C8" opacity="0.8" />
      </g>
    )
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt * 0.3}) scale(${s})`}>
      <ellipse cx="0" cy="1.8" rx="8.6" ry="3.9" fill="#8A5E0A" />
      <ellipse cx="0" cy="0" rx="8.6" ry="3.9" fill="url(#gp-coin)" stroke="#9A6A0C" strokeWidth="0.7" />
      <ellipse cx="0" cy="0" rx="5.6" ry="2.3" fill="none" stroke="#C48E1A" strokeWidth="0.7" />
      <ellipse cx="-3" cy="-1" rx="2.4" ry="0.9" fill="#FFF6C8" opacity="0.85" />
    </g>
  )
}

function Bar({ x, y, rot, s }: { x: number; y: number; rot: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <polygon points="-17,0 15,0 20,-5 -12,-5" fill="#B9810F" />
      <polygon points="-17,0 15,0 11,-9 -13,-9" fill="url(#gp-bar)" stroke="#7A4E06" strokeWidth="0.8" />
      <polygon points="-13,-9 11,-9 15,-13 -9,-13" fill="#FFE68A" stroke="#7A4E06" strokeWidth="0.8" />
      <polygon points="11,-9 15,0 20,-5 15,-13" fill="#C99419" stroke="#7A4E06" strokeWidth="0.8" />
      <line x1="-9" y1="-4.5" x2="8" y2="-4.5" stroke="#FFF3B0" strokeWidth="1" opacity="0.8" />
    </g>
  )
}

function Gem({ x, y, color, s }: { x: number; y: number; color: string; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <polygon points="0,-8 7,-3 4,5 -4,5 -7,-3" fill={color} stroke="rgba(0,0,0,0.45)" strokeWidth="0.8" />
      <polygon points="0,-8 3,-3 0,5 -3,-3" fill="#FFFFFF" opacity="0.25" />
      <polygon points="-7,-3 7,-3 3,-3 0,-8 -3,-3" fill="#FFFFFF" opacity="0.35" />
      <circle cx="-2.5" cy="-4" r="1.1" fill="#FFFFFF" opacity="0.9" />
    </g>
  )
}

function Crown({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-9) scale(${s})`}>
      <path d="M-17,0 L17,0 L20,-17 L10,-8 L0,-22 L-10,-8 L-20,-17 Z" fill="url(#gp-crown)" stroke="#7A4E06" strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="-17" y="-4.5" width="34" height="4.5" fill="#E8B330" stroke="#7A4E06" strokeWidth="0.9" />
      <circle cx="0" cy="-22" r="2.6" fill="#E0245E" stroke="#7A4E06" strokeWidth="0.6" />
      <circle cx="20" cy="-17" r="2.1" fill="#2E7BEA" stroke="#7A4E06" strokeWidth="0.6" />
      <circle cx="-20" cy="-17" r="2.1" fill="#1FAF6A" stroke="#7A4E06" strokeWidth="0.6" />
      <circle cx="-8" cy="-2.2" r="1.3" fill="#E0245E" />
      <circle cx="8" cy="-2.2" r="1.3" fill="#2E7BEA" />
      <path d="M-12,-9 L-5,-9" stroke="#FFF3B0" strokeWidth="1" opacity="0.8" />
    </g>
  )
}

/**
 * Heap of treasure for the possible winnings of the running round, sized by
 * tier (lib/effects POT_TIERS). Anchor the box at its bottom centre; it never
 * takes pointer events, so it can't block the player tokens drawn above it.
 */
export function GoldPile({ tier, width, label }: { tier: number; width: number; label?: string }) {
  const shape = useMemo(() => pileShape(tier), [tier])
  return (
    <div className="gp-appear pointer-events-none" style={{ width, height: width * goldPileAspect(tier) }} role="img" aria-label={label}>
      <svg viewBox={`0 ${shape.viewTop} ${PILE_W} ${PILE_BOTTOM - shape.viewTop}`} className="w-full h-full overflow-visible" style={{ filter: 'drop-shadow(0 3px 4px rgba(60,30,0,0.45))' }}>
        <defs>
          <radialGradient id="gp-coin" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#FFF3B0" />
            <stop offset="0.5" stopColor="#F5C542" />
            <stop offset="1" stopColor="#C38A14" />
          </radialGradient>
          <linearGradient id="gp-dome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE07A" />
            <stop offset="0.55" stopColor="#E3A92B" />
            <stop offset="1" stopColor="#9A6A0C" />
          </linearGradient>
          <linearGradient id="gp-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD75A" />
            <stop offset="1" stopColor="#C38A14" />
          </linearGradient>
          <linearGradient id="gp-crown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFF0A0" />
            <stop offset="1" stopColor="#D49A1C" />
          </linearGradient>
        </defs>
        <ellipse cx="120" cy={BASE_Y + 2} rx="116" ry="7" fill="rgba(50,25,0,0.35)" />
        <path d={shape.dome} fill="url(#gp-dome)" stroke="#8A5E0A" strokeWidth="1" />
        {shape.items.map((it, i) =>
          it.kind === 'coin' ? (
            <Coin key={i} x={it.x} y={it.y} s={it.s} tilt={it.tilt} up={it.up} />
          ) : it.kind === 'bar' ? (
            <Bar key={i} x={it.x} y={it.y} rot={it.rot} s={shape.k * 1.15} />
          ) : (
            <Gem key={i} x={it.x} y={it.y} color={it.color} s={it.s} />
          )
        )}
        {shape.crown && <Crown x={121} y={shape.top + 6 * shape.k} s={shape.k * 1.1} />}
        {shape.loose.map((c, i) => (
          <Coin key={`l${i}`} x={c.x} y={c.y} s={c.s} />
        ))}
        {/* Glints: four-point stars twinkling on the heap */}
        {shape.sparkles.map((s, i) => (
          <path
            key={`s${i}`}
            className="gp-twinkle"
            transform={`translate(${s.x} ${s.y}) scale(${s.s})`}
            d="M0,-7 L1.4,-1.4 L7,0 L1.4,1.4 L0,7 L-1.4,1.4 L-7,0 L-1.4,-1.4 Z"
            fill="#FFFFFF"
            style={{ animationDelay: `${s.delay}s` }}
          />
        ))}
      </svg>
    </div>
  )
}

// =====================================================================
// Noob sign above a player's portrait
// =====================================================================

export type NoobSignState = 'enter' | 'idle' | 'leave'
/** Mount time of the leave animation (ms), see .ns-leave in globals.css. */
export const NOOB_LEAVE_MS = 900

/**
 * Little wooden "Noob" sign whose post is stuck into the top of the portrait.
 * Render it inside the avatar's `relative` box. 'enter' drops it in from above
 * (impact, squash, wobble, dust), 'leave' topples it over and away.
 */
export function NoobSign({ size, state }: { size: number; state: NoobSignState }) {
  const W = Math.max(30, size * 0.8)
  return (
    <div
      className="absolute left-1/2 pointer-events-none z-20"
      style={{ width: W, height: W * 0.7, marginLeft: -W / 2, bottom: `calc(100% - ${size * 0.12}px)` }}
      aria-label="Noob"
      role="img"
    >
      {state === 'enter' &&
        [-1, 1].map(side => (
          <span
            key={side}
            className="ns-dust absolute rounded-full"
            style={{
              width: W * 0.42,
              height: W * 0.26,
              bottom: -W * 0.08,
              left: `calc(50% ${side < 0 ? '-' : '+'} ${W * 0.08}px)`,
              marginLeft: side < 0 ? -W * 0.42 : 0,
              background: 'radial-gradient(closest-side, rgba(170,150,120,0.85), rgba(170,150,120,0))',
            }}
          />
        ))}
      <div className={`absolute inset-0 ns-${state}`} style={{ transformOrigin: '50% 100%' }}>
        <svg viewBox="0 0 100 70" className="w-full h-full overflow-visible" style={{ filter: 'drop-shadow(0 2px 2px rgba(40,20,0,0.45))' }}>
          <defs>
            <linearGradient id="ns-wood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#D4A266" />
              <stop offset="1" stopColor="#A2703A" />
            </linearGradient>
          </defs>
          {/* post */}
          <rect x="45" y="30" width="10" height="40" rx="1.5" fill="#7A4E26" stroke="#4E2F14" strokeWidth="1.5" />
          <path d="M45,70 L50,76 L55,70 Z" fill="#7A4E26" stroke="#4E2F14" strokeWidth="1.5" strokeLinejoin="round" />
          {/* plank */}
          <rect x="3" y="3" width="94" height="38" rx="5" fill="url(#ns-wood)" stroke="#5A3618" strokeWidth="2.2" />
          <path d="M9,14 Q30,11 52,15 T92,13 M8,31 Q34,34 60,30 T93,32" fill="none" stroke="#8A5A2C" strokeWidth="1.1" opacity="0.6" />
          <circle cx="10" cy="22" r="2" fill="#4E3A2A" />
          <circle cx="90" cy="22" r="2" fill="#4E3A2A" />
          <text
            x="50"
            y="31"
            textAnchor="middle"
            fontFamily="var(--font-display), Georgia, serif"
            fontWeight="800"
            fontSize="25"
            fill="#3A220E"
            stroke="#E8C48E"
            strokeWidth="0.6"
            paintOrder="stroke"
          >
            Noob
          </text>
        </svg>
      </div>
    </div>
  )
}
