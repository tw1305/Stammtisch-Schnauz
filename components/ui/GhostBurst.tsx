'use client'

import { useEffect, useRef } from 'react'

export type GhostWave = { delay: number; count: number } // delay in seconds
const DEFAULT_WAVES: GhostWave[] = [{ delay: 0.5, count: 7 }]

/**
 * Ghosts flying out from behind a profile picture — shown when a round is won
 * "aus dem Jenseits" (eliminated, revived, then won). Rendered BEHIND the
 * avatar (and its ring/flames): the ghosts start hidden at the centre and
 * become visible as they escape past the rim, so it works with every streak tier.
 *
 * Each wave launches `count` ghosts in a fan of directions (biased upward) on
 * slightly wobbly paths, staggered, fading out at the end.
 */
export default function GhostBurst({
  size,
  waves = DEFAULT_WAVES,
}: {
  size: number
  /** Keep this array stable (module constant): a new array restarts the animation. */
  waves?: GhostWave[]
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const ghosts = [...root.querySelectorAll<HTMLElement>('[data-ghost]')]
    const anims: Animation[] = []
    let i = 0
    for (const wave of waves) {
      for (let k = 0; k < wave.count; k++, i++) {
        const el = ghosts[i]
        if (!el) continue
        // Spread evenly around the circle with jitter, favouring the upper half.
        const base = (k / wave.count) * Math.PI * 2 + (wave.delay * 1.7) // rotate each wave a bit
        const angle = base + (Math.random() - 0.5) * 0.5
        const up = Math.sin(angle) > 0 ? 0.55 : 1 // shorten downward flights (towards the card text)
        const dist = size * (1.0 + Math.random() * 0.55) * up
        const dx = Math.cos(angle) * dist
        const dy = Math.sin(angle) * dist - size * 0.25 // ghosts drift upwards
        const wobble = size * 0.12 * (Math.random() < 0.5 ? -1 : 1)
        const flip = dx < 0 ? -1 : 1 // face the direction of travel
        const tilt = Math.max(-25, Math.min(25, dx / size * 18))
        const t = (x: number, y: number, s: number, r = 0) =>
          `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${r}deg) scale(${s * flip}, ${s})`
        anims.push(
          el.animate(
            [
              { transform: t(0, 0, 0.35), opacity: 0, offset: 0 },
              { transform: t(dx * 0.3 + wobble, dy * 0.3, 0.75, tilt * 0.5), opacity: 0.95, offset: 0.2 },
              { transform: t(dx * 0.65 - wobble, dy * 0.65, 1, tilt), opacity: 0.9, offset: 0.55 },
              { transform: t(dx, dy - size * 0.15, 1.08, tilt * 0.6), opacity: 0, offset: 1 },
            ],
            {
              duration: 1700 + Math.random() * 700,
              delay: (wave.delay + k * 0.09 + Math.random() * 0.12) * 1000,
              easing: 'cubic-bezier(0.25, 0.7, 0.4, 1)',
              fill: 'both',
            }
          )
        )
      }
    }
    return () => anims.forEach(a => a.cancel())
  }, [size, waves])

  const total = waves.reduce((n, w) => n + w.count, 0)
  const g = size * 0.34 // ghost width

  return (
    <div ref={ref} className="absolute left-1/2 top-1/2 pointer-events-none" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} data-ghost className="absolute left-0 top-0" style={{ width: g, height: g * 1.2, opacity: 0 }}>
          <Ghost />
        </div>
      ))}
    </div>
  )
}

/** A friendly little ghost. */
function Ghost() {
  return (
    <svg viewBox="0 0 50 60" className="w-full h-full overflow-visible" style={{ filter: 'drop-shadow(0 0 5px rgba(190,220,255,0.95)) drop-shadow(0 2px 3px rgba(30,45,80,0.45))' }}>
      <path
        d="M25 2 C11 2 4 13 4 26 L4 52 C4 56 8 57 10 54 C12 51 15 51 17 54 C19 57 23 57 25 54 C27 51 31 51 33 54 C35 57 39 57 41 54 C43 51 46 52 46 52 L46 26 C46 13 39 2 25 2 Z"
        fill="#F7FAFF"
        stroke="#8296BA"
        strokeWidth="1.8"
      />
      <ellipse cx="18" cy="24" rx="3.6" ry="5" fill="#2A2F3A" />
      <ellipse cx="32" cy="24" rx="3.6" ry="5" fill="#2A2F3A" />
      <circle cx="19.2" cy="22.2" r="1.2" fill="#FFFFFF" />
      <circle cx="33.2" cy="22.2" r="1.2" fill="#FFFFFF" />
      <ellipse cx="25" cy="35" rx="3.4" ry="4.2" fill="#2A2F3A" opacity="0.85" />
      <ellipse cx="12" cy="32" rx="3" ry="1.8" fill="#FFB8C8" opacity="0.6" />
      <ellipse cx="38" cy="32" rx="3" ry="1.8" fill="#FFB8C8" opacity="0.6" />
    </svg>
  )
}
