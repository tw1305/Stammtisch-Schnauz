import { formatBalance, getBalanceColor } from '@/lib/game-logic'

export type SparklineMarker = {
  index: number // position on the history array to anchor the marker
  value: number // amount shown in the flag (e.g. a season's net result)
  caption?: string // small label under the amount (e.g. season name)
}

type Props = {
  history: number[]
  width?: number
  height?: number
  markers?: SparklineMarker[]
}

/** Lightweight cumulative-balance line chart (pure SVG, no dependency). */
export default function BalanceSparkline({ history, width = 280, height = 64, markers }: Props) {
  if (!history || history.length < 2) {
    return <p className="text-[#7C7461] text-xs text-center py-3">Zu wenig Daten für einen Verlauf</p>
  }

  const pad = 6
  const min = Math.min(0, ...history)
  const max = Math.max(0, ...history)
  const span = max - min || 1
  const stepX = (width - pad * 2) / (history.length - 1)
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)
  const x = (i: number) => pad + i * stepX

  const linePoints = history.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const areaPoints = `${x(0)},${y(min)} ${linePoints} ${x(history.length - 1)},${y(min)}`
  const last = history[history.length - 1]
  const stroke = last > 0 ? '#1F9D57' : last < 0 ? '#C8443B' : '#7C7461'
  const zeroY = y(0)

  const activeMarkers = (markers ?? []).filter(m => m.index >= 0 && m.index < history.length)

  return (
    <div className={`relative w-full ${activeMarkers.length ? 'pt-6' : ''}`}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
        <polygon points={areaPoints} fill={stroke} opacity={0.1} />
        {/* zero baseline */}
        <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="#E4D9BF" strokeWidth="1" strokeDasharray="3 3" />
        <polyline points={linePoints} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(history.length - 1)} cy={y(last)} r="3" fill={stroke} />
      </svg>

      {activeMarkers.map((m, k) => {
        const leftPct = (x(m.index) / width) * 100
        const align =
          leftPct > 80
            ? '-translate-x-full pr-1 text-right'
            : leftPct < 20
              ? 'pl-1 text-left'
              : '-translate-x-1/2 text-center'
        return (
          <div key={k} className="pointer-events-none absolute top-0 bottom-0" style={{ left: `${leftPct}%` }}>
            <div className="absolute left-0 bottom-0 border-l border-dashed border-[#C9BCA0]" style={{ top: '1.5rem' }} />
            <div className={`absolute top-0 leading-tight whitespace-nowrap ${align}`}>
              <span className={`text-[10px] font-bold ${getBalanceColor(m.value)}`}>{formatBalance(m.value)}</span>
              {m.caption && <span className="block text-[8px] text-[#7C7461] font-medium">{m.caption}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
