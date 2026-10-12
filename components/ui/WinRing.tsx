'use client'

import { useId } from 'react'

/**
 * Golden ring around the profile picture of a player on a winning streak:
 * - tier 1 (won the last round): gold ring with a sheen running around it
 * - tier 2 (won the last two rounds): same ring, additionally glowing/pulsing
 * (From the third win in a row the FireRing takes over.)
 * With `appear`, the ring draws itself in — used for the round-end award.
 */
export default function WinRing({
  size,
  tier,
  appear = false,
  delay = 0,
}: {
  size: number
  tier: 1 | 2
  appear?: boolean
  delay?: number // seconds before the draw-in starts
}) {
  const id = useId().replace(/:/g, '')
  const stroke = Math.max(3, size * 0.065)
  const r = 50 - (stroke / size) * 50 // radius in viewBox units, ring sits on the avatar edge
  const sw = (stroke / size) * 100

  return (
    <div className="absolute inset-0 pointer-events-none z-[5]" aria-hidden="true">
      {tier === 2 && (
        <div
          className={`absolute inset-0 rounded-full wr-glow ${appear ? 'wr-fade-in' : ''}`}
          style={appear ? { animationDelay: `0s, ${delay + 0.6}s` } : undefined}
        />
      )}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`wr-gold-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF2B0" />
            <stop offset="0.35" stopColor="#F2C744" />
            <stop offset="0.7" stopColor="#C9971F" />
            <stop offset="1" stopColor="#FFE07A" />
          </linearGradient>
          <linearGradient id={`wr-sheen-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Dark outline for contrast on light and dark avatars */}
        <circle cx="50" cy="50" r={r} fill="none" stroke="#7A5512" strokeOpacity="0.55" strokeWidth={sw + 1.6} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#wr-gold-${id})`}
          strokeWidth={sw}
          pathLength={100}
          transform="rotate(-90 50 50)"
          className={appear ? 'wr-draw' : undefined}
          style={appear ? { animationDelay: `${delay}s` } : undefined}
        />
        {/* Sheen: a short bright arc travelling around the ring */}
        <g className="wr-sheen" style={appear ? { opacity: 0, animation: `wr-spin 2.6s linear ${delay + 0.9}s infinite, wr-show 0.3s ease-out ${delay + 0.9}s forwards` } : undefined}>
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`url(#wr-sheen-${id})`}
            strokeWidth={sw * 0.8}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="14 86"
          />
        </g>
      </svg>
    </div>
  )
}
