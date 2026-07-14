/**
 * Festive laurel wreath (Stammtisch style: laurel + wheat + clinking beers)
 * drawn as scalable SVG. Fills its container; the avatar sits in the open centre.
 */

const LEAF = 'M0,-5.6 C2.5,-3 2.5,3 0,5.6 C-2.5,3 -2.5,-3 0,-5.6 Z'

type Leaf = { x: number; y: number; rot: number; s: number; berry: boolean }

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) }
}

function buildBranch(side: 1 | -1): Leaf[] {
  const R = 40
  const N = 12
  const gapHalf = 24
  const bottom = 90
  const top = side === 1 ? -90 : 270 // both meet at the top
  const start = bottom - side * gapHalf
  const leaves: Leaf[] = []
  for (let k = 0; k < N; k++) {
    const a = start + (top - start) * (k / (N - 1))
    const { x, y } = polar(a, R)
    leaves.push({ x, y, rot: a + 90 - side * 42, s: 1 - 0.03 * k, berry: k % 2 === 1 })
  }
  return leaves
}

export default function LaurelWreath({ className = '' }: { className?: string }) {
  const leaves = [...buildBranch(1), ...buildBranch(-1)]

  return (
    <div className={`relative ${className}`} style={{ width: '100%', height: '100%' }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full block overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="lw-leaf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4C8A50" />
            <stop offset="1" stopColor="#256032" />
          </linearGradient>
          <linearGradient id="lw-wheat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E4C066" />
            <stop offset="1" stopColor="#B98B32" />
          </linearGradient>
        </defs>

        {/* Wheat ears flanking the beers in the bottom gap, below the avatar */}
        {[-1, 1].map(side => (
          <g key={side} transform={`translate(50 81) rotate(${side * 30})`}>
            <line x1="0" y1="0" x2="0" y2="13" stroke="#B98B32" strokeWidth="1" strokeLinecap="round" />
            {[4, 7.5, 11].map(gy => (
              <g key={gy}>
                <ellipse cx="-1.9" cy={gy} rx="1.3" ry="2.6" fill="url(#lw-wheat)" transform={`rotate(-34 -1.9 ${gy})`} />
                <ellipse cx="1.9" cy={gy} rx="1.3" ry="2.6" fill="url(#lw-wheat)" transform={`rotate(34 1.9 ${gy})`} />
              </g>
            ))}
            <ellipse cx="0" cy="13" rx="1.3" ry="2.8" fill="url(#lw-wheat)" />
          </g>
        ))}

        {/* Laurel leaves */}
        {leaves.map((l, i) => (
          <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.rot}) scale(${l.s})`}>
            <path d={LEAF} fill="url(#lw-leaf)" />
            <path d="M0,-4.6 L0,4.6" stroke="#1E4C27" strokeWidth="0.4" opacity="0.55" />
          </g>
        ))}

        {/* Gold berries near the inner edge */}
        {leaves.filter(l => l.berry).map((l, i) => {
          const p = polar(Math.atan2(l.y - 50, l.x - 50) * (180 / Math.PI), 34)
          return <circle key={`b${i}`} cx={p.x} cy={p.y} r="1.15" fill="#D9B24C" />
        })}

        {/* Clinking beers at the bottom gap */}
        <text x="50" y="90" textAnchor="middle" dominantBaseline="central" fontSize="15">🍻</text>
      </svg>
    </div>
  )
}
