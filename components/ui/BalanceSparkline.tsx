type Props = {
  history: number[]
  width?: number
  height?: number
}

/** Lightweight cumulative-balance line chart (pure SVG, no dependency). */
export default function BalanceSparkline({ history, width = 280, height = 64 }: Props) {
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

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
      <polygon points={areaPoints} fill={stroke} opacity={0.1} />
      {/* zero baseline */}
      <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="#E4D9BF" strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={linePoints} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(history.length - 1)} cy={y(last)} r="3" fill={stroke} />
    </svg>
  )
}
