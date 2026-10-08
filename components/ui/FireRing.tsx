/**
 * Ring of flames shown around a player who is "on fire" (won their last three
 * rounds). Drawn as scalable SVG like LaurelWreath; fills its container and the
 * avatar sits in the open centre.
 */

// Flame pointing up (tip at y=-10, base at y=0), outer + inner tongue.
const FLAME = 'M0,-10 C2.6,-6.5 4.2,-3.6 3.4,-1.2 C2.8,0.4 1.4,1 0,1 C-1.4,1 -2.8,0.4 -3.4,-1.2 C-4.2,-3.6 -2.6,-6.5 0,-10 Z'
const INNER = 'M0,-5.6 C1.3,-3.8 2,-2.2 1.5,-0.9 C1.2,-0.1 0.6,0.3 0,0.3 C-0.6,0.3 -1.2,-0.1 -1.5,-0.9 C-2,-2.2 -1.3,-3.8 0,-5.6 Z'

const COUNT = 24
const RADIUS = 34

export default function FireRing() {
  const flames = Array.from({ length: COUNT }, (_, i) => {
    const deg = (360 * i) / COUNT
    const a = ((deg - 90) * Math.PI) / 180
    return {
      x: 50 + RADIUS * Math.cos(a),
      y: 50 + RADIUS * Math.sin(a),
      rot: deg,
      s: i % 2 === 0 ? 1.45 : 1.05,
      delay: `${((i * 7) % COUNT) * 0.05}s`,
    }
  })

  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full block overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="fr-outer" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#E0461B" />
          <stop offset="0.6" stopColor="#F28A1E" />
          <stop offset="1" stopColor="#FFC93C" />
        </linearGradient>
        <radialGradient id="fr-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0.6" stopColor="#F26B1E" stopOpacity="0.75" />
          <stop offset="1" stopColor="#F28A1E" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#fr-glow)" />
      {flames.map((f, i) => (
        <g key={i} transform={`translate(${f.x} ${f.y}) rotate(${f.rot}) scale(${f.s})`}>
          <g className="fire-flame" style={{ animationDelay: f.delay }}>
            <path d={FLAME} fill="url(#fr-outer)" />
            <path d={INNER} fill="#FFE27A" />
          </g>
        </g>
      ))}
    </svg>
  )
}
