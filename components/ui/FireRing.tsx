'use client'

import { useEffect, useRef } from 'react'
import { animationsEnabled } from '@/lib/feedback'
import { getFireSprites, FIRE_SPRITE_STEPS } from './fireSprites'

/**
 * Ring of real-looking fire around a player who is "on fire" (won their last
 * three rounds). A small particle simulation on a canvas: flame particles are
 * emitted along the avatar's rim and rise like real fire, cooling from a white-hot
 * core through yellow and orange to deep red, drawn additively for the glow.
 *
 * The canvas is larger than the avatar (flames lick upward above it); the avatar
 * itself is drawn on top by PlayerAvatar.
 */

const W_FACTOR = 2.3 // canvas width relative to avatar size
const H_FACTOR = 2.7 // canvas height (extra headroom for rising flames)
const CY = 0.66 // avatar centre as a fraction of canvas height

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; seed: number }

export default function FireRing({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const w = size * W_FACTOR
  const h = size * H_FACTOR

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const g = canvas.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)

    const spr = getFireSprites()
    const cx = w / 2
    const cy = h * CY
    const R = size / 2
    const particles: P[] = []
    const rate = Math.max(8, Math.round(size / 4.5)) // particles per frame
    const reduce =
      !animationsEnabled() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    function spawn() {
      // Favour the sides and top so the visible part of the ring is dense.
      const a = Math.random() * Math.PI * 2
      const rr = R * (0.94 + Math.random() * 0.14)
      const x = cx + Math.cos(a) * rr
      const y = cy + Math.sin(a) * rr
      const out = 0.35 + Math.random() * 0.5
      particles.push({
        x,
        y,
        vx: Math.cos(a) * out * (size / 100),
        vy: -(0.9 + Math.random() * 1.1) * (size / 100) + Math.sin(a) * 0.25 * (size / 100),
        life: 0,
        max: 24 + Math.random() * 22,
        r: size * (0.08 + Math.random() * 0.1),
        seed: Math.random() * 1000,
      })
    }

    function step(t: number) {
      for (let i = 0; i < rate; i++) spawn()
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        if (p.life >= p.max) {
          particles.splice(i, 1)
          continue
        }
        // Flicker: sideways turbulence; flames accelerate upward as they heat the air.
        p.vx += Math.sin(t * 0.008 + p.seed) * 0.03 * (size / 100)
        p.vx *= 0.96
        p.vy -= 0.02 * (size / 100)
        p.x += p.vx
        p.y += p.vy
      }
    }

    function draw() {
      g!.clearRect(0, 0, w, h)
      // Soft heat glow hugging the avatar.
      const glow = g!.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.45)
      glow.addColorStop(0, 'rgba(255,120,20,0.75)')
      glow.addColorStop(1, 'rgba(255,80,0,0)')
      g!.fillStyle = glow
      g!.beginPath()
      g!.arc(cx, cy, R * 1.45, 0, Math.PI * 2)
      g!.fill()

      g!.globalCompositeOperation = 'lighter'
      for (const p of particles) {
        const k = p.life / p.max
        const shrink = 1 - k * 0.75
        const rad = p.r * shrink
        const idx = Math.min(FIRE_SPRITE_STEPS - 1, Math.floor(k * FIRE_SPRITE_STEPS))
        g!.globalAlpha = k > 0.75 ? (1 - k) * 2.4 : 0.85
        g!.drawImage(spr[idx], p.x - rad, p.y - rad * 1.3, rad * 2, rad * 2.6) // taller than wide = flame tongue
      }
      g!.globalAlpha = 1
      g!.globalCompositeOperation = 'source-over'
    }

    let raf = 0
    let last = 0
    if (reduce) {
      // Static: warm the simulation up and draw a single frame.
      for (let i = 0; i < 60; i++) step(i * 16)
      draw()
      return
    }
    const loop = (t: number) => {
      // Cap the simulation at ~60 steps/s regardless of display refresh rate.
      if (t - last >= 15) {
        step(t)
        draw()
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [size, w, h])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute pointer-events-none"
      style={{ width: w, height: h, left: (size - w) / 2, top: size / 2 - h * CY }}
    />
  )
}
