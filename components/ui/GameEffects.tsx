'use client'

import { useEffect, useRef } from 'react'
import Portal from './Portal'
import { getFireSprites, FIRE_SPRITE_STEPS } from './fireSprites'

/** A short one-shot animation anchored on a player at the table. */
export type EffectKind = 'rip' | 'revive' | 'fire'
export type GameEffect = { id: number; kind: EffectKind; playerId: string }

/** How long each effect stays mounted (ms) — matches the CSS animation lengths. */
export const EFFECT_DURATION: Record<EffectKind, number> = { rip: 1900, revive: 1700, fire: 1600 }

/** Renders one effect centred on an avatar of the given size. */
export function PlayerEffect({ kind, size }: { kind: EffectKind; size: number }) {
  if (kind === 'rip') return <Tombstone size={size} />
  if (kind === 'revive') return <ReviveSyringe size={size} />
  return <FireExplosion size={size} />
}

// ---------- R.I.P. tombstone ----------

function Tombstone({ size }: { size: number }) {
  const w = size * 1.3
  return (
    <div
      className="absolute left-1/2 top-1/2 pointer-events-none"
      style={{ width: w, height: w * 1.2, marginLeft: -w / 2, marginTop: -w * 0.62 }}
      aria-hidden="true"
    >
      {/* Dust puffs where the stone breaks through the ground */}
      {[-1, 1].map(side => (
        <span
          key={side}
          className="fx-dust absolute rounded-full"
          style={{
            width: w * 0.42,
            height: w * 0.42,
            bottom: -w * 0.08,
            left: side < 0 ? -w * 0.18 : undefined,
            right: side > 0 ? -w * 0.18 : undefined,
            background: 'radial-gradient(circle, rgba(150,128,100,0.75), rgba(150,128,100,0) 70%)',
          }}
        />
      ))}
      <svg viewBox="0 0 100 120" className="fx-rip absolute inset-0 w-full h-full overflow-visible drop-shadow-lg">
        <defs>
          <linearGradient id="fx-stone" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#A9AEB2" />
            <stop offset="0.55" stopColor="#80868B" />
            <stop offset="1" stopColor="#5C6266" />
          </linearGradient>
        </defs>
        <ellipse cx="50" cy="116" rx="44" ry="7" fill="#6B5034" />
        <path d="M14,116 L14,46 Q14,8 50,8 Q86,8 86,46 L86,116 Z" fill="url(#fx-stone)" stroke="#4A4F53" strokeWidth="2.5" />
        <path d="M20,112 L20,47 Q20,15 50,15 Q80,15 80,47 L80,112" fill="none" stroke="#B9BEC2" strokeWidth="1.2" opacity="0.6" />
        <path d="M68,30 L62,44 L67,52 L60,66" fill="none" stroke="#4A4F53" strokeWidth="1.3" opacity="0.7" />
        <text
          x="50"
          y="66"
          textAnchor="middle"
          fontFamily="var(--font-display), Georgia, serif"
          fontWeight="800"
          fontSize="25"
          fill="#1F2225"
          stroke="#D6DADD"
          strokeWidth="0.8"
          paintOrder="stroke"
          letterSpacing="1"
        >
          R.I.P
        </text>
        <path d="M40,82 L60,82 M50,74 L50,98" stroke="#3E4246" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
        {/* Grass tufts */}
        <path d="M8,116 l3,-9 l2,9 l3,-7 l2,7 M80,116 l3,-8 l2,8 l3,-10 l2,10" stroke="#3E7A3A" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  )
}

// ---------- Revive syringe ----------

function ReviveSyringe({ size }: { size: number }) {
  const w = size * 1.5
  return (
    <div
      className="absolute left-1/2 top-1/2 pointer-events-none"
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
      aria-hidden="true"
    >
      {/* Healing pulse: green glow rings spreading out as the dose goes in */}
      <span className="fx-heal absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 4px rgba(46,190,110,0.85), 0 0 30px 10px rgba(46,190,110,0.55)' }} />
      <span className="fx-heal fx-heal-2 absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 3px rgba(120,230,160,0.8)' }} />

      {/* Sparkles */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className="fx-sparkle absolute font-bold"
          style={{
            left: `${15 + ((i * 37) % 70)}%`,
            top: `${55 + ((i * 23) % 35)}%`,
            color: i % 2 ? '#2EBE6E' : '#FFFFFF',
            fontSize: size * (i % 2 ? 0.2 : 0.16),
            textShadow: '0 0 6px rgba(46,190,110,0.9)',
            animationDelay: `${0.75 + i * 0.07}s`,
          }}
        >
          {i % 2 ? '+' : '✦'}
        </span>
      ))}

      {/* Syringe flies in from the top right and injects */}
      <div
        className="fx-syringe absolute"
        style={{ width: w, height: w / 3, left: size * 0.2, top: size * -0.28 }}
      >
        <svg viewBox="0 0 120 40" className="w-full h-full overflow-visible drop-shadow-md" style={{ transform: 'rotate(140deg)' }}>
          <defs>
            <linearGradient id="fx-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="1" stopColor="#D8E6EE" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {/* Plunger rod + thumb rest (slides right while injecting) */}
          <g className="fx-plunger">
            <rect x="4" y="17" width="34" height="6" rx="1.5" fill="#9AA7B0" />
            <rect x="2" y="9" width="5" height="22" rx="2" fill="#6F7E88" />
            <rect x="34" y="13" width="6" height="14" rx="1" fill="#4F5B63" />
          </g>
          {/* Barrel */}
          <rect x="30" y="11" width="66" height="18" rx="3" fill="url(#fx-glass)" stroke="#7C8C96" strokeWidth="1.6" />
          {/* Green serum, draining towards the needle */}
          <rect className="fx-serum" x="40" y="13.5" width="54" height="13" rx="2" fill="#2EBE6E" />
          {[50, 60, 70, 80].map(x => (
            <line key={x} x1={x} y1="11" x2={x} y2="17" stroke="#7C8C96" strokeWidth="1" />
          ))}
          <rect x="26" y="7" width="5" height="26" rx="2" fill="#6F7E88" />
          <rect x="96" y="16" width="7" height="8" rx="1.5" fill="#9AA7B0" />
          <line x1="103" y1="20" x2="122" y2="20" stroke="#C3CCD2" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

// ---------- Fire explosion ----------

function FireExplosion({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const S = size * 3.4

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(S * dpr)
    canvas.height = Math.round(S * dpr)
    const g = canvas.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    const spr = getFireSprites()
    const c = S / 2
    const unit = size / 100

    type Q = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number }
    const parts: Q[] = []
    const burst = (n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = (0.4 + Math.random()) * speed * unit
        parts.push({
          x: c + Math.cos(a) * size * 0.2,
          y: c + Math.sin(a) * size * 0.2,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0,
          max: 35 + Math.random() * 35,
          r: size * (0.12 + Math.random() * 0.2),
        })
      }
    }
    burst(140, 7)
    let frame = 0
    let raf = 0
    const loop = () => {
      frame++
      if (frame < 18) burst(14, 3) // secondary billowing flames
      g.clearRect(0, 0, S, S)

      // Initial white-hot flash
      if (frame < 14) {
        const fl = g.createRadialGradient(c, c, 0, c, c, size * (0.6 + frame * 0.09))
        fl.addColorStop(0, `rgba(255,255,235,${1 - frame / 14})`)
        fl.addColorStop(1, 'rgba(255,200,80,0)')
        g.fillStyle = fl
        g.fillRect(0, 0, S, S)
      }

      g.globalCompositeOperation = 'lighter'
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.life++
        if (p.life >= p.max) {
          parts.splice(i, 1)
          continue
        }
        p.vx *= 0.92
        p.vy = p.vy * 0.92 - 0.06 * unit // hot gas rises
        p.x += p.vx
        p.y += p.vy
        const k = p.life / p.max
        const rad = p.r * (0.6 + k * 0.7)
        g.globalAlpha = k > 0.6 ? (1 - k) * 2.2 : 0.9
        g.drawImage(spr[Math.min(FIRE_SPRITE_STEPS - 1, Math.floor(k * FIRE_SPRITE_STEPS))], p.x - rad, p.y - rad, rad * 2, rad * 2)
      }
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      if (parts.length > 0 && frame < 120) raf = requestAnimationFrame(loop)
      else g.clearRect(0, 0, S, S)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [S, size])

  return (
    <div className="absolute left-1/2 top-1/2 pointer-events-none" style={{ width: S, height: S, marginLeft: -S / 2, marginTop: -S / 2 }} aria-hidden="true">
      {/* Shock wave */}
      <span
        className="fx-shock absolute rounded-full"
        style={{ left: '50%', top: '50%', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, border: '3px solid rgba(255,170,60,0.9)' }}
      />
      <canvas ref={ref} className="absolute inset-0" style={{ width: S, height: S }} />
    </div>
  )
}

// ---------- Coin rain (round won) ----------

let coinSprite: HTMLCanvasElement | null = null
function getCoinSprite(): HTMLCanvasElement {
  if (coinSprite) return coinSprite
  const s = document.createElement('canvas')
  s.width = s.height = 96
  const g = s.getContext('2d')!
  const grad = g.createRadialGradient(36, 32, 6, 48, 48, 48)
  grad.addColorStop(0, '#FFF3B0')
  grad.addColorStop(0.45, '#F5C542')
  grad.addColorStop(1, '#B07D12')
  g.fillStyle = grad
  g.beginPath()
  g.arc(48, 48, 46, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 5
  g.strokeStyle = '#9A6A0C'
  g.stroke()
  g.beginPath()
  g.arc(48, 48, 35, 0, Math.PI * 2)
  g.lineWidth = 2.5
  g.strokeStyle = 'rgba(154,106,12,0.7)'
  g.stroke()
  g.fillStyle = '#9A6A0C'
  g.font = 'bold 44px Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('€', 48, 51)
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.beginPath()
  g.ellipse(34, 28, 12, 6, -0.6, 0, Math.PI * 2)
  g.fill()
  coinSprite = s
  return s
}

/** Full-screen shower of spinning gold coins. Calls onDone when finished. */
export function CoinRain({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const W = window.innerWidth
    const H = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    const g = canvas.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    const coin = getCoinSprite()
    const base = Math.max(26, Math.min(W, H) * 0.075)

    type C = { x: number; y: number; vy: number; vx: number; spin: number; phase: number; r: number; delay: number }
    const coins: C[] = Array.from({ length: 70 }, () => ({
      x: Math.random() * W,
      y: -base * 2 - Math.random() * H * 0.3,
      vx: (Math.random() - 0.5) * 1.2,
      vy: 2 + Math.random() * 3,
      spin: 0.08 + Math.random() * 0.15,
      phase: Math.random() * Math.PI * 2,
      r: base * (0.7 + Math.random() * 0.6),
      delay: Math.random() * 70, // frames
    }))

    let frame = 0
    let raf = 0
    const loop = () => {
      frame++
      g.clearRect(0, 0, W, H)
      let alive = 0
      for (const c of coins) {
        if (frame < c.delay) {
          alive++
          continue
        }
        c.vy += 0.28
        c.x += c.vx
        c.y += c.vy
        c.phase += c.spin
        if (c.y - c.r > H) continue
        alive++
        const sx = Math.abs(Math.cos(c.phase)) // 3D flip
        g.save()
        g.translate(c.x, c.y)
        g.scale(Math.max(0.08, sx), 1)
        g.drawImage(coin, -c.r, -c.r, c.r * 2, c.r * 2)
        g.restore()
      }
      if (alive > 0 && frame < 400) raf = requestAnimationFrame(loop)
      else doneRef.current()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <Portal>
      <canvas ref={ref} aria-hidden="true" className="fixed inset-0 w-screen h-screen pointer-events-none z-[300]" />
    </Portal>
  )
}
