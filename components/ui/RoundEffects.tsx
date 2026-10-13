'use client'

import { useEffect, useMemo, useRef } from 'react'
import { type StormLevel } from '@/lib/effects'
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

// =====================================================================
// Final duel: spotlight on the last two players
// =====================================================================

type Px = { x: number; y: number }

/** Jagged line from a to b (seeded, so it doesn't jump on re-renders). */
function duelBoltPath(a: Px, b: Px, gap: number): string {
  const r = rng(Math.round(a.x * 7 + b.y * 13))
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const [ux, uy] = [dx / len, dy / len]
  const [nx, ny] = [-uy, ux]
  const from = { x: a.x + ux * gap, y: a.y + uy * gap }
  const span = Math.max(0, len - gap * 2)
  const steps = Math.max(4, Math.round(span / 22))
  let d = `M${from.x.toFixed(1)},${from.y.toFixed(1)}`
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const off = i === steps ? 0 : (r() - 0.5) * 18
    d += ` L${(from.x + ux * span * t + nx * off).toFixed(1)},${(from.y + uy * span * t + ny * off).toFixed(1)}`
  }
  return d
}

/**
 * Final duel: the table dims, two soft spotlights fall on the remaining players,
 * a lightning bolt crackles between them and a "VS" badge pops up in the middle.
 * Coordinates are px in the table box; never takes pointer events (eliminated
 * players stay tappable for a revive).
 */
export function FinalDuel({ a, b, avatar, width, height }: { a: Px; b: Px; avatar: number; width: number; height: number }) {
  const hole = avatar * 1.05
  const bolt = duelBoltPath(a, b, avatar * 0.62) // seeded: identical on every render
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const vs = Math.max(30, avatar * 0.55)
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <svg className="absolute inset-0 w-full h-full fd-dim" width={width} height={height}>
        <defs>
          <radialGradient id="fd-hole">
            <stop offset="0.55" stopColor="#000" />
            <stop offset="1" stopColor="#fff" />
          </radialGradient>
          <mask id="fd-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="#fff" />
            <circle cx={a.x} cy={a.y} r={hole} fill="url(#fd-hole)" />
            <circle cx={b.x} cy={b.y} r={hole} fill="url(#fd-hole)" />
          </mask>
        </defs>
        <rect width={width} height={height} fill="rgba(8,6,18,0.58)" mask="url(#fd-mask)" />
        {/* warm light cones on the two finalists */}
        <circle cx={a.x} cy={a.y} r={hole * 0.95} fill="rgba(255,230,160,0.12)" />
        <circle cx={b.x} cy={b.y} r={hole * 0.95} fill="rgba(255,230,160,0.12)" />
        <path d={bolt} className="fd-bolt-glow" fill="none" stroke="rgba(150,180,255,0.55)" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
        <path d={bolt} className="fd-bolt" pathLength={100} fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div
        className="absolute fd-vs flex items-center justify-center rounded-full font-extrabold text-white"
        style={{
          left: mid.x - vs / 2,
          top: mid.y - vs / 2,
          width: vs,
          height: vs,
          fontSize: vs * 0.42,
          fontFamily: 'var(--font-display), Georgia, serif',
          background: 'radial-gradient(circle at 35% 30%, #FF8A3D, #C8243B 70%)',
          boxShadow: '0 0 0 3px #FFD86B, 0 0 18px rgba(255,120,40,0.85)',
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
      >
        VS
      </div>
    </div>
  )
}

// =====================================================================
// Band-aids on a revived player
// =====================================================================

function Plaster({ rot }: { rot: number }) {
  return (
    <g transform={`rotate(${rot} 30 30)`}>
      <rect x="4" y="22" width="52" height="16" rx="8" fill="#E9B98C" stroke="#B07A4E" strokeWidth="1.4" />
      <rect x="21" y="23.5" width="18" height="13" rx="2.5" fill="#F6DCC0" />
      {[10, 14, 46, 50].map(x => (
        <g key={x}>
          <circle cx={x} cy="27" r="0.9" fill="#B07A4E" />
          <circle cx={x} cy="33" r="0.9" fill="#B07A4E" />
        </g>
      ))}
    </g>
  )
}

/**
 * Two crossed band-aids on the lower right of the portrait (the dealer badge sits
 * top left). Render inside the avatar's `relative` box.
 */
export function Bandage({ size, faded = false }: { size: number; faded?: boolean }) {
  const w = Math.max(18, size * 0.46)
  return (
    <div
      className={`absolute pointer-events-none z-20 bd-slap ${faded ? 'opacity-50' : ''}`}
      style={{ width: w, height: w, right: -w * 0.12, bottom: size * 0.04 }}
      aria-label="Wiederbelebt"
      role="img"
    >
      <svg viewBox="0 0 60 60" className="w-full h-full overflow-visible" style={{ filter: 'drop-shadow(0 1px 1.5px rgba(60,30,10,0.5))' }}>
        <Plaster rot={-38} />
        <Plaster rot={38} />
      </svg>
    </div>
  )
}

// =====================================================================
// Rain cloud over a player on a losing streak
// =====================================================================

/**
 * Little grey cloud raining over the portrait. `raised` lifts it above a Noob
 * sign standing on the same portrait. Render inside the avatar's `relative` box.
 */
export function RainCloud({ size, raised = false }: { size: number; raised?: boolean }) {
  const W = Math.max(30, size * 0.78)
  const lift = raised ? size * 0.5 : -size * 0.04
  return (
    <div
      className="absolute left-1/2 pointer-events-none z-[21]"
      style={{ width: W, height: W * 0.85, marginLeft: -W / 2, bottom: `calc(100% + ${lift}px)` }}
      aria-label="Pechsträhne"
      role="img"
    >
      <svg viewBox="0 0 100 85" className="w-full h-full overflow-visible">
        <g className="rc-bob">
          {/* drops first, so they fall out from behind the cloud */}
          {[24, 40, 56, 72].map((x, i) => (
            <path
              key={x}
              className="rc-drop"
              d={`M${x},46 q-2,7 0,9 q2,-2 0,-9 Z`}
              fill="#6FA8E8"
              stroke="#3F78B8"
              strokeWidth="0.8"
              style={{ animationDelay: `${i * 0.27}s` }}
            />
          ))}
          <path
            d="M22,48 C8,48 6,30 20,28 C20,14 40,10 46,20 C52,8 74,10 76,26 C92,26 94,48 78,48 Z"
            fill="#9AA3AE"
            stroke="#5E6670"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="M28,30 C30,24 38,22 42,26" fill="none" stroke="#C9CFD6" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}

// =====================================================================
// Milestones on the result screen
// =====================================================================

/** Golden ribbon with a sweeping shine, e.g. "🏆 100. Sieg!". */
export function MilestoneBanner({ icon, text }: { icon: string; text: string }) {
  return (
    <span
      className="ms-banner relative inline-flex items-center gap-1.5 overflow-hidden rounded-full px-3.5 py-1 font-extrabold text-[#4A2E05]"
      style={{
        background: 'linear-gradient(180deg, #FFE68A, #E8B330 60%, #C98F14)',
        boxShadow: '0 0 0 2px #FFF3B0, 0 4px 14px rgba(212,160,30,0.55)',
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {text}
      <span className="ms-shine absolute inset-y-0 -left-1/2 w-1/3" aria-hidden="true" />
    </span>
  )
}

const CONFETTI_COLORS = ['#FFD86B', '#E0245E', '#2E7BEA', '#1FAF6A', '#FFFFFF', '#FF8A3D']

/** Short confetti burst from the centre of its box (one-shot, cleans itself up). */
export function ConfettiBurst({ delay = 0 }: { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion()) return
    const anims: Animation[] = []
    root.querySelectorAll<HTMLElement>('[data-c]').forEach((el, i) => {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.4
      const d = 70 + Math.random() * 90
      const dx = Math.cos(a) * d
      const dy = Math.sin(a) * d * 0.7 - 30
      anims.push(
        el.animate(
          [
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${360 + Math.random() * 360}deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${dx * 1.1}px, ${dy + 90}px) rotate(${720}deg)`, opacity: 0 },
          ],
          { duration: 1500 + Math.random() * 500, delay: delay * 1000, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'both' }
        )
      )
    })
    return () => anims.forEach(x => x.cancel())
  }, [delay])
  return (
    <div ref={ref} className="absolute left-1/2 top-1/2 pointer-events-none" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          data-c
          className="absolute block"
          style={{
            width: i % 3 ? 7 : 5,
            height: i % 3 ? 4 : 9,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            borderRadius: i % 4 === 0 ? '50%' : 1,
            opacity: 0,
          }}
        />
      ))}
    </div>
  )
}
