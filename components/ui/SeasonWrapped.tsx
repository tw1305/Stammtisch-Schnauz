'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeSeasonWrapped, type Leaders, type SeasonWrapped as Wrapped, type Swing } from '@/lib/wrapped'
import { calculateBalances, formatBalance } from '@/lib/game-logic'
import {
  animationsEnabled,
  feedbackEliminate,
  feedbackFire,
  initFeedback,
  recapMusicPlaying,
  resumeRecapMusic,
  soundEnabled,
  stopRecapMusic,
} from '@/lib/feedback'
import { ON_FIRE_STREAK } from '@/lib/stats'
import PlayerAvatar from './PlayerAvatar'
import GhostBurst, { type GhostWave } from './GhostBurst'
import { CoinRain } from './GameEffects'
import Portal from './Portal'
import type { Player, Season } from '@/types/database'

/**
 * Season-Rückblick ("Wrapped"): a full-screen story of the season's highlights.
 * Tap right/left to skip, hold to pause; the progress bar's CSS animation is the
 * slide timer. Interactive slides (player picker, personal card, finale) wait
 * for the viewer instead of auto-advancing. "I Get Money" runs underneath the
 * whole story (started by the opening tap, see startRecapMusic).
 */

const SLIDE_MS = 6500
const CREAM = '#FBF6EA'
const MUTED = 'rgba(251,246,234,0.68)'
const GOLD = '#E9C46A'
const PLUS = '#74D69A'
const MINUS = '#F08A7E'

const BG = {
  forest: 'radial-gradient(120% 80% at 50% 0%, #2F6B3D 0%, #16341D 55%, #0B1A0F 100%)',
  gold: 'radial-gradient(120% 80% at 50% 10%, #6B4E16 0%, #33240A 55%, #150E04 100%)',
  ember: 'radial-gradient(120% 80% at 50% 100%, #7A2410 0%, #3A1007 55%, #170603 100%)',
  night: 'radial-gradient(120% 80% at 50% 0%, #2A3D6B 0%, #141F3B 55%, #0A0F1E 100%)',
  swamp: 'radial-gradient(120% 80% at 50% 0%, #4F5326 0%, #262812 55%, #11120A 100%)',
  teal: 'radial-gradient(120% 80% at 50% 0%, #1D6460 0%, #0E3331 55%, #061716 100%)',
  violet: 'radial-gradient(120% 80% at 50% 0%, #5B3F99 0%, #2C1E4D 55%, #120B21 100%)',
  wood: 'radial-gradient(120% 80% at 50% 0%, #7A5230 0%, #3B2716 55%, #1A1109 100%)',
  wine: 'radial-gradient(120% 80% at 50% 0%, #6B1F2A 0%, #351017 55%, #16070A 100%)',
  dusk: 'radial-gradient(120% 80% at 50% 0%, #6B3F5E 0%, #34192D 55%, #150A12 100%)',
  steel: 'radial-gradient(120% 80% at 50% 0%, #46546B 0%, #212937 55%, #0D1117 100%)',
}

const GHOSTS: GhostWave[] = [
  { delay: 0.6, count: 7 },
  { delay: 2.4, count: 5 },
]

type Slide = { key: string; bg: string; ms: number | null; view: ReactNode; enter?: () => void }

// ---------- helpers ----------

function names(players: Player[]): string {
  const n = players.map(p => p.name)
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('de-DE')
const euro = (n: number) => `${n.toLocaleString('de-DE')} €`

/** "Season 3 - Storchenseason" → ["Season 3", "Storchenseason"] */
function splitName(name: string): [string, string | null] {
  const m = name.split(/\s+[-–]\s+/)
  return m.length > 1 ? [m[0], m.slice(1).join(' – ')] : [name, null]
}

function shareText(d: Wrapped): string {
  const lines = [
    `🃏 Stammtisch Schnauz – ${d.season.name}: der Rückblick`,
    `${d.sessions} Abende · ${d.rounds} Runden · ${d.hours.toLocaleString('de-DE')} Std. am Tisch`,
    '',
    ...d.stats.map((s, i) => `${i === 0 ? '🏆' : `${i + 1}.`} ${s.player.name} ${formatBalance(s.total_balance)}`),
  ]
  const extra: string[] = []
  if (d.streak && d.streak.value >= 2) extra.push(`☄️ Längste Serie: ${names(d.streak.players)} (${d.streak.value} am Stück)`)
  if (d.fireKing) extra.push(`🔥 Feuer-König: ${names(d.fireKing.players)} (${d.fireKing.value}×)`)
  if (d.bestEvening) extra.push(`🌟 Bester Abend: ${d.bestEvening.player.name} ${formatBalance(d.bestEvening.delta)}`)
  if (d.firstOut) extra.push(`💨 Erster raus: ${names(d.firstOut.players)} (${d.firstOut.value}×)`)
  return [...lines, ...(extra.length ? ['', ...extra] : [])].join('\n')
}

// ---------- small building blocks ----------

/** Counts up from 0 once the slide appears (shows the final value without animations). */
function CountUp({ value, decimals = 0, format, delay = 0.25 }: { value: number; decimals?: number; format?: (n: number) => string; delay?: number }) {
  const [v, setV] = useState(() => (animationsEnabled() ? 0 : value))
  useEffect(() => {
    if (!animationsEnabled()) return
    let raf = 0
    const t0 = performance.now() + delay * 1000
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / 1100))
      setV(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, delay])
  const n = Number(v.toFixed(decimals))
  return <>{format ? format(n) : n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>
}

function Rise({ delay = 0, className = '', style, children }: { delay?: number; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <div className={`sw-rise ${className}`} style={{ ...style, animationDelay: `${delay}s` }}>
      {children}
    </div>
  )
}

/** Hero avatar size: as big as the screen comfortably allows (phones ≈ 170 px). */
function heroSize(): number {
  if (typeof window === 'undefined') return 150
  return Math.round(Math.max(110, Math.min(window.innerWidth * 0.46, window.innerHeight * 0.22, 210)))
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <Rise>
      <p className="text-[13px] uppercase tracking-[0.22em] font-semibold" style={{ color: GOLD }}>
        {children}
      </p>
    </Rise>
  )
}

function Title({ children, delay = 0.1 }: { children: ReactNode; delay?: number }) {
  return (
    <Rise delay={delay}>
      <h2 className="font-[family-name:var(--font-display)] text-[clamp(2rem,9.5vw,2.9rem)] font-extrabold leading-[1.1] mt-2" style={{ color: CREAM }}>
        {children}
      </h2>
    </Rise>
  )
}

function Glow({ color, size }: { color: string; size: number }) {
  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full sw-glow pointer-events-none"
      style={{ width: size * 1.9, height: size * 1.9, background: `radial-gradient(circle, ${color} 0%, transparent 65%)` }}
    />
  )
}

/** One or more stars of a slide: avatar(s) with name, optional glow/ring/ghosts. */
function Heroes({
  players,
  size,
  glow,
  streak = 0,
  eliminated = false,
  ghosts = false,
}: {
  players: Player[]
  size?: number
  glow?: string
  streak?: number
  eliminated?: boolean
  ghosts?: boolean
}) {
  const base = size ?? heroSize()
  const s = players.length > 1 ? Math.round(base * (players.length > 2 ? 0.6 : 0.75)) : base
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4">
      {players.map(p => (
        <div key={p.id} className="flex flex-col items-center gap-3">
          <div className="relative">
            {glow && <Glow color={glow} size={s} />}
            {ghosts && animationsEnabled() && <GhostBurst size={s} waves={GHOSTS} />}
            <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={s} winStreak={streak} eliminated={eliminated} />
          </div>
          <span className="font-bold text-2xl leading-tight" style={{ color: CREAM }}>{p.name}</span>
        </div>
      ))}
    </div>
  )
}

function BigNumber({ children, sub, color = CREAM, delay = 0.35 }: { children: ReactNode; sub?: ReactNode; color?: string; delay?: number }) {
  return (
    <Rise delay={delay} className="text-center">
      <p className="font-[family-name:var(--font-display)] text-[clamp(3.75rem,21vw,6rem)] font-extrabold tabular-nums leading-none" style={{ color }}>
        {children}
      </p>
      {sub && <p className="text-base mt-3 leading-snug" style={{ color: MUTED }}>{sub}</p>}
    </Rise>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl px-3 py-[clamp(0.5rem,1.9vh,1rem)] text-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <p className="font-[family-name:var(--font-display)] text-[clamp(1.6rem,min(9vw,4.8vh),2.6rem)] font-extrabold tabular-nums leading-none" style={{ color: CREAM }}>{children}</p>
      <p className="text-xs mt-2 uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
    </div>
  )
}

/** Overlapping avatars for ties. */
function AvatarStack({ players, size, ghosts }: { players: Player[]; size: number; ghosts?: boolean }) {
  return (
    <div className="flex shrink-0">
      {players.slice(0, 3).map((p, i) => (
        <div key={p.id} className="relative" style={{ marginLeft: i > 0 ? -size * 0.35 : 0, zIndex: 3 - i }}>
          {ghosts && animationsEnabled() && <GhostBurst size={size} waves={GHOSTS} />}
          <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={size} />
        </div>
      ))}
    </div>
  )
}

function Row({ players, title, text, delay, ghosts }: { players: Player[]; title: string; text: string; delay: number; ghosts?: boolean }) {
  return (
    <Rise delay={delay}>
      <div className="flex items-center gap-4 rounded-2xl px-4 py-4 text-left" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
        <AvatarStack players={players} size={64} ghosts={ghosts} />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: GOLD }}>{title}</p>
          <p className="text-lg font-semibold leading-snug mt-0.5" style={{ color: CREAM }}>{text}</p>
        </div>
      </div>
    </Rise>
  )
}

/** Compact tinted tile for "Deine Season": Erzfeind / Lieblingsgegner. */
function OpponentTile({ label, color, opponents, text }: { label: string; color: string; opponents: Player[]; text: string }) {
  return (
    <div
      className="rounded-2xl px-2.5 py-[clamp(0.5rem,1.5vh,0.75rem)] flex flex-col items-center text-center"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1.5px solid color-mix(in srgb, ${color} 50%, transparent)` }}
    >
      <p className="text-[11px] uppercase tracking-wider font-bold" style={{ color }}>{label}</p>
      {opponents.length > 0 ? (
        <>
          <div className="mt-1.5"><AvatarStack players={opponents} size={Math.round(Math.min(52, heroSize() * 0.3))} /></div>
          <p className="text-base font-bold leading-tight mt-1.5 truncate max-w-full" style={{ color: CREAM }}>{names(opponents)}</p>
        </>
      ) : (
        <p className="text-3xl mt-2">🤷</p>
      )}
      <p className="text-sm leading-snug mt-0.5" style={{ color: MUTED }}>{text}</p>
    </div>
  )
}

/** Season balance curve with the fall/climb segment drawn in `color` and its two ends labelled. */
function SwingChart({ swing, color, height }: { swing: Swing; color: string; height: number }) {
  const W = 300
  const H = height
  const padX = 8
  const padY = 18 // room for the end labels
  const h = swing.history
  const min = Math.min(0, ...h)
  const max = Math.max(0, ...h)
  const span = max - min || 1
  const x = (i: number) => padX + (i / Math.max(1, h.length - 1)) * (W - padX * 2)
  const y = (v: number) => H - padY - ((v - min) / span) * (H - padY * 2)
  const all = h.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const seg = h.slice(swing.fromIdx, swing.toIdx + 1).map((v, k) => `${x(swing.fromIdx + k)},${y(v)}`).join(' ')
  const label = (i: number, v: number, above: boolean) => {
    const lx = Math.min(W - 30, Math.max(30, x(i)))
    return (
      <text x={lx} y={above ? y(v) - 7 : y(v) + 15} textAnchor="middle" fontSize="12" fontWeight="700" fill={v >= 0 ? PLUS : MINUS}>
        {formatBalance(v)}
      </text>
    )
  }
  const fall = swing.to < swing.from
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block overflow-visible" aria-hidden="true">
      <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 4" />
      <polyline points={all} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.6" strokeLinejoin="round" />
      <polyline points={seg} fill="none" stroke={color} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="sw-draw" />
      <circle cx={x(swing.fromIdx)} cy={y(swing.from)} r="4" fill={CREAM} />
      <circle cx={x(swing.toIdx)} cy={y(swing.to)} r="5" fill={color} />
      {label(swing.fromIdx, swing.from, fall)}
      {label(swing.toIdx, swing.to, !fall)}
    </svg>
  )
}

/** Card for one rollercoaster ride: who, from where to where, and the curve. */
function SwingCard({ swing, label, color, delay }: { swing: Swing; label: string; color: string; delay: number }) {
  const amount = Math.abs(swing.to - swing.from)
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  return (
    <Rise delay={delay}>
      <div
        className="rounded-3xl px-4 pt-4 pb-2 text-left"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1.5px solid color-mix(in srgb, ${color} 55%, transparent)` }}
      >
        <div className="flex items-center gap-3.5">
          <PlayerAvatar name={swing.player.name} avatarUrl={swing.player.avatar_url} size={Math.round(Math.min(64, heroSize() * 0.4))} />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider font-bold whitespace-nowrap" style={{ color }}>{label}</p>
            <p className="text-xl font-bold leading-tight truncate" style={{ color: CREAM }}>{swing.player.name}</p>
          </div>
          <p className="font-[family-name:var(--font-display)] text-[clamp(2rem,10vw,2.8rem)] font-extrabold tabular-nums leading-none shrink-0" style={{ color }}>
            <CountUp value={amount} delay={delay + 0.2} format={n => `${swing.to < swing.from ? '−' : '+'}${n} €`} />
          </p>
        </div>
        <p className="text-sm mt-2" style={{ color: MUTED }}>
          von <span className="font-semibold" style={{ color: swing.from >= 0 ? PLUS : MINUS }}>{formatBalance(swing.from)}</span> auf{' '}
          <span className="font-semibold" style={{ color: swing.to >= 0 ? PLUS : MINUS }}>{formatBalance(swing.to)}</span>
        </p>
        <div className="mt-1">
          <SwingChart swing={swing} color={color} height={Math.round(Math.max(64, Math.min(110, vh * 0.12)))} />
        </div>
      </div>
    </Rise>
  )
}

/** Big tinted card for one highlight: who, how much, and a line of context. */
function Spotlight({
  players,
  label,
  color,
  value,
  sub,
  delay,
}: {
  players: Player[]
  label: string
  color: string
  value: ReactNode
  sub?: ReactNode
  delay: number
}) {
  return (
    <Rise delay={delay}>
      <div
        className="rounded-3xl px-4 py-5 text-left flex items-center gap-4"
        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1.5px solid color-mix(in srgb, ${color} 55%, transparent)` }}
      >
        <AvatarStack players={players} size={Math.round(heroSize() * 0.5)} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.16em] font-bold" style={{ color }}>{label}</p>
          <p className="text-xl font-bold leading-tight mt-1 truncate" style={{ color: CREAM }}>{names(players)}</p>
          <p className="font-[family-name:var(--font-display)] text-[clamp(2.3rem,11vw,3.2rem)] font-extrabold tabular-nums leading-none mt-1.5" style={{ color }}>
            {value}
          </p>
          {sub && <p className="text-sm mt-1.5 leading-snug" style={{ color: MUTED }}>{sub}</p>}
        </div>
      </div>
    </Rise>
  )
}

/** Stops taps on buttons from also skipping the slide. */
const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onPointerUp: (e: React.PointerEvent) => e.stopPropagation() }

// ---------- main component ----------

export default function SeasonWrapped({ season, onClose }: { season: Season; onClose: () => void }) {
  const [data, setData] = useState<Wrapped | null>(null)
  const [failed, setFailed] = useState(false)
  const [idx, setIdx] = useState(0)
  const [cycle, setCycle] = useState(0) // bumps to restart the current slide
  const [held, setHeld] = useState(false) // finger held down on the slide
  const [pinned, setPinned] = useState(false) // pause button
  const paused = held || pinned
  const [me, setMe] = useState<string | null>(null)
  const [coins, setCoins] = useState(false)
  const [copied, setCopied] = useState(false)
  const press = useRef(0)
  const [musicOn, setMusicOn] = useState(soundEnabled)

  // Soundtrack: keep it running while the recap is open, fade out on close.
  useEffect(() => {
    if (soundEnabled()) resumeRecapMusic()
    return () => stopRecapMusic()
  }, [])

  function toggleMusic() {
    if (musicOn) stopRecapMusic(250)
    else resumeRecapMusic()
    setMusicOn(!musicOn)
  }

  useEffect(() => {
    initFeedback()
    let cancelled = false
    computeSeasonWrapped(createClient(), season)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [season])

  async function share(d: Wrapped) {
    const text = shareText(d)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `${d.season.name} – Rückblick`, text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* share sheet closed */
    }
  }

  function buildSlides(d: Wrapped): Slide[] {
    const list: Slide[] = []
    const [mainName, subName] = splitName(d.season.name)
    const ranked = d.stats

    // 1 — Intro
    list.push({
      key: 'intro',
      bg: BG.forest,
      ms: SLIDE_MS,
      view: (
        <div className="text-center">
          <Kicker>Stammtisch Schnauz · Rückblick</Kicker>
          <Title>{mainName}</Title>
          {subName && (
            <Rise delay={0.2}>
              <p className="font-[family-name:var(--font-display)] text-xl italic mt-1" style={{ color: GOLD }}>{subName}</p>
            </Rise>
          )}
          <Rise delay={0.3}>
            <p className="text-sm mt-2" style={{ color: MUTED }}>
              {dateLabel(d.season.start_date)}
              {d.season.end_date && ` – ${dateLabel(d.season.end_date)}`}
            </p>
          </Rise>
          <Rise delay={0.5} className="grid grid-cols-2 gap-3 mt-10">
            <Fact label="Abende"><CountUp value={d.sessions} delay={0.6} /></Fact>
            <Fact label="Runden"><CountUp value={d.rounds} delay={0.7} /></Fact>
            <Fact label="Stunden am Tisch"><CountUp value={d.hours} decimals={d.hours < 10 ? 1 : 0} delay={0.8} /></Fact>
            <Fact label="€ gewonnen"><CountUp value={d.moneyMoved} delay={0.9} /></Fact>
          </Rise>
          <Rise delay={0.9}>
            <p className="text-base mt-6" style={{ color: MUTED }}>
              Im Schnitt {d.avgPlayers.toLocaleString('de-DE')} Spieler pro Runde
              {d.fires > 0 && ` · ${d.fires} Feuer`}
            </p>
          </Rise>
        </div>
      ),
    })

    // 2 — Podium
    if (ranked.length > 0) {
      const top = ranked.slice(0, 3)
      const order = [top[1], top[0], top[2]].filter(Boolean)
      // Steps and portraits grow with the screen.
      const vh = typeof window === 'undefined' ? 800 : window.innerHeight
      const steps: Record<number, number> = { 0: Math.round(vh * 0.17), 1: Math.round(vh * 0.12), 2: Math.round(vh * 0.085) }
      const hero = heroSize()
      list.push({
        key: 'podium',
        bg: BG.gold,
        ms: SLIDE_MS + 1500,
        enter: () => {
          if (animationsEnabled()) setCoins(true)
        },
        view: (
          <div className="text-center w-full">
            <Kicker>Das Podium</Kicker>
            <Title>Ganz oben: {top[0].player.name}</Title>
            <div className="flex items-end justify-center gap-2 mt-12">
              {order.map(s => {
                const rank = ranked.indexOf(s)
                const size = Math.round(hero * (rank === 0 ? 0.68 : 0.48))
                return (
                  <div key={s.player.id} className="flex flex-col items-center flex-1 min-w-0 max-w-[150px]">
                    <Rise delay={0.9 - rank * 0.25} className="flex flex-col items-center">
                      <div className="relative">
                        {rank === 0 && <Glow color="rgba(233,196,106,0.75)" size={size} />}
                        <PlayerAvatar name={s.player.name} avatarUrl={s.player.avatar_url} size={size} />
                        {rank === 0 && <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-4xl drop-shadow-lg">👑</div>}
                      </div>
                      <span className="text-lg font-bold mt-2 truncate max-w-full" style={{ color: CREAM }}>{s.player.name}</span>
                      <span className="text-base font-bold tabular-nums" style={{ color: s.total_balance >= 0 ? PLUS : MINUS }}>
                        <CountUp value={s.total_balance} format={formatBalance} delay={1.1 - rank * 0.25} />
                      </span>
                    </Rise>
                    <div
                      className="sw-grow w-full rounded-t-xl mt-2 flex items-start justify-center pt-2 font-[family-name:var(--font-display)] text-4xl font-extrabold"
                      style={{
                        height: steps[rank],
                        animationDelay: `${0.5 - rank * 0.12}s`,
                        background: rank === 0 ? 'linear-gradient(#E9C46A,#B8902E)' : rank === 1 ? 'linear-gradient(#D9DCE1,#9AA1AB)' : 'linear-gradient(#D49A62,#9C6334)',
                        color: '#2A1E08',
                      }}
                    >
                      {rank + 1}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ),
      })
    }

    // 3 — Rote Laterne
    const last = ranked[ranked.length - 1]
    if (ranked.length >= 2 && last.total_balance < 0) {
      list.push({
        key: 'laterne',
        bg: BG.wine,
        ms: SLIDE_MS,
        view: (
          <div className="text-center">
            <Kicker>Die rote Laterne 🏮</Kicker>
            <Title>Irgendwer muss ja zahlen.</Title>
            <Rise delay={0.35} className="mt-10">
              <Heroes players={[last.player]} glow="rgba(240,138,126,0.45)" />
            </Rise>
            <BigNumber color={MINUS} delay={0.6} sub="Nächste Season wird alles besser. Vielleicht.">
              <CountUp value={last.total_balance} format={formatBalance} delay={0.7} />
            </BigNumber>
          </div>
        ),
      })
    }

    // 4 — Abende für die Ewigkeit
    if (d.bestEvening || d.worstEvening) {
      list.push({
        key: 'evenings',
        bg: BG.night,
        ms: SLIDE_MS,
        view: (
          <div className="text-center w-full">
            <Kicker>Abende für die Ewigkeit</Kicker>
            <Title>Ein Abend kann alles ändern.</Title>
            <div className="space-y-4 mt-10">
              {d.bestEvening && (
                <Spotlight
                  delay={0.4}
                  players={[d.bestEvening.player]}
                  label="🌟 Bester Abend"
                  color={PLUS}
                  value={<CountUp value={d.bestEvening.delta} format={formatBalance} delay={0.5} />}
                  sub={`${dayLabel(d.bestEvening.date)} – alles abgeräumt`}
                />
              )}
              {d.worstEvening && (
                <Spotlight
                  delay={0.9}
                  players={[d.worstEvening.player]}
                  label="🥀 Härtester Abend"
                  color={MINUS}
                  value={<CountUp value={d.worstEvening.delta} format={formatBalance} delay={1} />}
                  sub={`${dayLabel(d.worstEvening.date)} – zum Vergessen`}
                />
              )}
            </div>
          </div>
        ),
      })
    }

    // 4b — Achterbahn: biggest fall from a high, biggest climb out of a low
    if (d.fall || d.rise) {
      list.push({
        key: 'rollercoaster',
        bg: BG.dusk,
        ms: SLIDE_MS + 1500,
        view: (
          <div className="text-center w-full">
            <Kicker>Achterbahn 🎢</Kicker>
            <Title>Wie gewonnen, so zerronnen.</Title>
            <div className="space-y-[clamp(0.75rem,2vh,1rem)] mt-[clamp(1rem,3.5vh,2.5rem)]">
              {d.fall && <SwingCard swing={d.fall} label="📉 Der tiefe Fall" color={MINUS} delay={0.4} />}
              {d.rise && <SwingCard swing={d.rise} label="📈 Das Comeback" color={PLUS} delay={1} />}
            </div>
          </div>
        ),
      })
    }

    // 5 — Hot Streak
    if (d.streak && d.streak.value >= 2) {
      list.push({
        key: 'streak',
        bg: BG.ember,
        ms: SLIDE_MS,
        view: (
          <div className="text-center">
            <Kicker>Hot Streak ☄️</Kicker>
            <Title>Nicht zu stoppen.</Title>
            <Rise delay={0.35} className="mt-10">
              <Heroes players={d.streak.players} streak={d.streak.value} />
            </Rise>
            <BigNumber delay={0.6} color={GOLD} sub="Siege am Stück – die längste Serie der Season">
              <CountUp value={d.streak.value} delay={0.7} />
            </BigNumber>
          </div>
        ),
      })
    }

    // 6 — Feuer-König
    if (d.fireKing) {
      list.push({
        key: 'fire',
        bg: BG.ember,
        ms: SLIDE_MS,
        enter: feedbackFire,
        view: (
          <div className="text-center">
            <Kicker>Burning Man 🔥</Kicker>
            <Title>{d.fireKing.players.length > 1 ? 'Die Feuer-Könige' : 'Der Feuer-König'}</Title>
            <Rise delay={0.35} className="mt-10">
              <Heroes players={d.fireKing.players} streak={ON_FIRE_STREAK} />
            </Rise>
            <BigNumber delay={0.6} color="#FFB24A" sub={`von insgesamt ${d.fires} Feuern in der Season`}>
              <CountUp value={d.fireKing.value} delay={0.7} format={n => `${n}× 🔥`} />
            </BigNumber>
          </div>
        ),
      })
    }

    // 7 — Erster raus / Finale
    if (d.firstOut) {
      list.push({
        key: 'firstout',
        bg: BG.swamp,
        ms: SLIDE_MS,
        enter: feedbackEliminate,
        view: (
          <div className="text-center w-full">
            <Kicker>Erster raus 💨</Kicker>
            <Title>Kaum gesetzt, schon weg.</Title>
            <Rise delay={0.35} className="mt-10">
              <Heroes players={d.firstOut.players} eliminated />
            </Rise>
            <BigNumber delay={0.6} sub="als Erster ausgeschieden – öfter als alle anderen">
              <CountUp value={d.firstOut.value} delay={0.7} format={n => `${n}×`} />
            </BigNumber>
          </div>
        ),
      })
    }

    // 7b — Das Finale: most finals played / won
    if (d.finalist || d.finalWinner) {
      const quote = (p: Player) => {
        const f = d.finals[p.id]
        return f && f.played > 0 ? Math.round((f.won / f.played) * 100) : 0
      }
      list.push({
        key: 'finals',
        bg: BG.steel,
        ms: SLIDE_MS + 500,
        view: (
          <div className="text-center w-full">
            <Kicker>Das Finale 🥊</Kicker>
            <Title>Wenn&apos;s drauf ankommt.</Title>
            <div className="space-y-4 mt-10">
              {d.finalist && (
                <Spotlight
                  delay={0.4}
                  players={d.finalist.players}
                  label="🎟️ Dauergast im Finale"
                  color={GOLD}
                  value={<CountUp value={d.finalist.value} delay={0.5} format={n => `${n}×`} />}
                  sub="unter den letzten zwei – öfter als alle anderen"
                />
              )}
              {d.finalWinner && (
                <Spotlight
                  delay={0.9}
                  players={d.finalWinner.players}
                  label="🏆 Finalkönig"
                  color={PLUS}
                  value={<CountUp value={d.finalWinner.value} delay={1} format={n => `${n}×`} />}
                  sub={
                    d.finalWinner.players.length === 1
                      ? `Finals gewonnen – ${quote(d.finalWinner.players[0])} % aller eigenen Finals`
                      : 'Finals gewonnen – die meisten der Season'
                  }
                />
              )}
            </div>
          </div>
        ),
      })
    }

    // 8 — Notaufnahme
    // text(n, plural): plural when several players share the top spot
    const care: { l: Leaders; title: string; text: (n: number, pl: boolean) => string; ghosts?: boolean }[] = []
    if (d.medic) care.push({ l: d.medic, title: 'Medic 🚑', text: (n, pl) => `${pl ? 'haben' : 'hat'} ${n}× jemanden wiederbelebt` })
    if (d.phoenix) care.push({ l: d.phoenix, title: 'Phönix 🐦', text: (n, pl) => `${pl ? 'wurden' : 'wurde'} ${n}× wiederbelebt` })
    if (d.comeback) care.push({ l: d.comeback, title: 'Aus dem Jenseits 👻', text: (n, pl) => `${pl ? 'haben' : 'hat'} ${n}× nach einer Wiederbelebung gewonnen`, ghosts: true })
    if (care.length > 0) {
      list.push({
        key: 'care',
        bg: BG.teal,
        ms: SLIDE_MS + 500,
        view: (
          <div className="text-center w-full">
            <Kicker>Die Notaufnahme</Kicker>
            <Title>Totgesagte leben länger.</Title>
            <div className="space-y-4 mt-10">
              {care.map((c, i) => (
                <Row
                  key={c.title}
                  delay={0.4 + i * 0.4}
                  players={c.l.players}
                  ghosts={c.ghosts}
                  title={c.title}
                  text={`${names(c.l.players)} ${c.text(c.l.value, c.l.players.length > 1)}`}
                />
              ))}
            </div>
          </div>
        ),
      })
    }

    // 9 — Die teuerste Runde
    if (d.biggestRound) {
      const r = d.biggestRound
      const gain = calculateBalances(r.players, r.stake).winnerGain
      list.push({
        key: 'biggest',
        bg: BG.violet,
        ms: SLIDE_MS,
        view: (
          <div className="text-center">
            <Kicker>Die teuerste Runde 💸</Kicker>
            <Title>Hier ging&apos;s um alles.</Title>
            <BigNumber delay={0.35} color={GOLD} sub={`Einsatz · ${dayLabel(r.date)} · ${r.players} Spieler am Tisch`}>
              <CountUp value={r.stake} delay={0.45} format={euro} />
            </BigNumber>
            {r.winner && (
              <Rise delay={1} className="mt-10">
                <Heroes players={[r.winner]} size={Math.round(heroSize() * 0.75)} glow="rgba(233,196,106,0.5)" />
                <p className="text-sm mt-2" style={{ color: MUTED }}>
                  hat abgeräumt: <span className="font-semibold" style={{ color: PLUS }}>{formatBalance(gain)}</span>
                </p>
              </Rise>
            )}
          </div>
        ),
      })
    }

    // 10 — Stammgäste
    if (ranked.length > 0) {
      const most = Math.max(...ranked.map(s => d.attendance[s.player.id] ?? 0))
      const regulars = d.regulars.length > 0 ? d.regulars : ranked.filter(s => d.attendance[s.player.id] === most).map(s => s.player)
      list.push({
        key: 'regulars',
        bg: BG.wood,
        ms: SLIDE_MS,
        view: (
          <div className="text-center w-full">
            <Kicker>Stammgäste 🍺</Kicker>
            <Title>{d.regulars.length > 0 ? `Bei allen ${d.sessions} Abenden dabei` : 'Am häufigsten am Tisch'}</Title>
            <Rise delay={0.4} className="mt-10">
              <Heroes players={regulars} />
            </Rise>
            {d.regulars.length === 0 && (
              <Rise delay={0.7}>
                <p className="text-sm mt-4" style={{ color: MUTED }}>{most} von {d.sessions} Abenden</p>
              </Rise>
            )}
          </div>
        ),
      })
    }

    // 11 — Und du? (picker + personal card)
    if (ranked.length > 0) {
      list.push({
        key: 'picker',
        bg: BG.forest,
        ms: null,
        view: (
          <div className="text-center w-full">
            <Kicker>Und jetzt du</Kicker>
            <Title>Wer bist du?</Title>
            <Rise
              delay={0.3}
              className="grid gap-[clamp(0.5rem,1.4vh,0.75rem)] mt-[clamp(1rem,3.5vh,2rem)]"
              style={{ gridTemplateColumns: `repeat(${ranked.length > 9 ? 4 : 3}, minmax(0, 1fr))` }}
            >
              {ranked.map(s => (
                <button
                  key={s.player.id}
                  {...stop}
                  onClick={() => {
                    setMe(s.player.id)
                    setIdx(i => i + 1)
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-2xl py-3 active:scale-95 transition-transform"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <PlayerAvatar name={s.player.name} avatarUrl={s.player.avatar_url} size={Math.round(Math.min(72, heroSize() * 0.42))} />
                  <span className="text-sm font-semibold truncate max-w-full px-1" style={{ color: CREAM }}>{s.player.name}</span>
                </button>
              ))}
            </Rise>
            <Rise delay={0.5}>
              <button {...stop} onClick={() => setIdx(i => i + 1)} className="text-sm mt-5 underline underline-offset-4" style={{ color: MUTED }}>
                Überspringen
              </button>
            </Rise>
          </div>
        ),
      })

      const mine = ranked.find(s => s.player.id === me)
      if (mine) {
        const rank = ranked.indexOf(mine) + 1
        const nem = d.nemesis[mine.player.id]
        const fav = d.favorite[mine.player.id]
        const best = d.personalBest[mine.player.id]
        const badges = d.badges[mine.player.id] ?? []
        list.push({
          key: `me-${mine.player.id}`,
          bg: BG.night,
          ms: null,
          view: (
            <div className="text-center w-full">
              <Kicker>Deine Season</Kicker>
              {/* Portrait left, rank + balance right: keeps the card one screen tall */}
              <Rise delay={0.15} className="flex items-center justify-center gap-5 mt-[clamp(0.5rem,2.4vh,1.25rem)]">
                <div className="relative">
                  <Glow color="rgba(233,196,106,0.35)" size={Math.round(heroSize() * 0.55)} />
                  <PlayerAvatar name={mine.player.name} avatarUrl={mine.player.avatar_url} size={Math.round(heroSize() * 0.55)} />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-2xl font-bold leading-tight truncate" style={{ color: CREAM }}>{mine.player.name}</p>
                  <p className="text-base" style={{ color: MUTED }}>Platz {rank} von {ranked.length}</p>
                  <p className="font-[family-name:var(--font-display)] text-[clamp(2.3rem,min(13vw,7vh),3.8rem)] font-extrabold tabular-nums leading-none mt-1" style={{ color: mine.total_balance >= 0 ? PLUS : MINUS }}>
                    <CountUp value={mine.total_balance} format={formatBalance} delay={0.4} />
                  </p>
                </div>
              </Rise>
              <Rise delay={0.5} className="grid grid-cols-3 gap-2 mt-[clamp(0.5rem,2.4vh,1.25rem)]">
                <Fact label="Siege">{mine.wins}</Fact>
                <Fact label="Siegquote">{Math.round(mine.win_rate * 100)}%</Fact>
                <Fact label="Abende">{d.attendance[mine.player.id] ?? 0}</Fact>
              </Rise>
              <Rise delay={0.7} className="grid grid-cols-2 gap-2 mt-2">
                <OpponentTile
                  label="Erzfeind 😤"
                  color={MINUS}
                  opponents={nem?.opponents ?? []}
                  text={nem ? `${nem.count} ${nem.count === 1 ? 'Finale' : 'Finals'} verloren` : 'kein Finale verloren 💪'}
                />
                <OpponentTile
                  label="Lieblingsgegner 😎"
                  color={PLUS}
                  opponents={fav?.opponents ?? []}
                  text={fav ? `${fav.count} ${fav.count === 1 ? 'Finale' : 'Finals'} gewonnen` : 'noch kein Finale gewonnen'}
                />
              </Rise>
              <div className="space-y-[clamp(0.25rem,1.2vh,0.625rem)] mt-[clamp(0.375rem,1.5vh,0.75rem)]">
                {best && (
                  <Rise delay={0.95}>
                    <p className="text-base" style={{ color: MUTED }}>
                      Dein bester Abend: <span className="font-semibold" style={{ color: PLUS }}>{formatBalance(best.delta)}</span> · {new Date(best.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </p>
                  </Rise>
                )}
                {badges.length > 0 && badges.length <= 4 && (
                  <Rise delay={1.05} className="flex flex-wrap justify-center gap-1.5 pt-0.5">
                    {badges.map(b => (
                      <span key={b.label} className="text-[clamp(0.75rem,1.9vh,0.875rem)] font-semibold rounded-full px-[clamp(0.5rem,1.6vh,0.75rem)] py-[clamp(0.2rem,0.8vh,0.375rem)]" style={{ color: CREAM, background: 'rgba(233,196,106,0.18)', border: '1px solid rgba(233,196,106,0.4)' }}>
                        {b.icon} {b.label}
                      </span>
                    ))}
                  </Rise>
                )}
                {/* Many achievements: icons only, so the card still fits one screen */}
                {badges.length > 4 && (
                  <Rise delay={1.05} className="pt-0.5">
                    <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: GOLD }}>{badges.length} Achievements</p>
                    <div className="flex flex-wrap justify-center gap-1.5 mt-1.5">
                      {badges.map(b => (
                        <span
                          key={b.label}
                          title={b.label}
                          aria-label={b.label}
                          className="w-9 h-9 flex items-center justify-center rounded-full text-lg"
                          style={{ background: 'rgba(233,196,106,0.18)', border: '1px solid rgba(233,196,106,0.4)' }}
                        >
                          {b.icon}
                        </span>
                      ))}
                    </div>
                  </Rise>
                )}
              </div>
              <Rise delay={1.15} className="flex gap-2 mt-[clamp(0.75rem,2.8vh,1.5rem)]">
                <button {...stop} onClick={() => setIdx(i => i - 1)} className="flex-1 rounded-2xl py-3 text-sm font-semibold" style={{ color: CREAM, background: 'rgba(255,255,255,0.1)' }}>
                  Andere Person
                </button>
                <button {...stop} onClick={() => setIdx(i => i + 1)} className="flex-1 rounded-2xl py-3 text-sm font-semibold" style={{ color: '#1A1206', background: GOLD }}>
                  Weiter
                </button>
              </Rise>
            </div>
          ),
        })
      }
    }

    // 12 — Endstand + teilen: rows share the screen height (bigger on big phones)
    const vhEnd = typeof window === 'undefined' ? 800 : window.innerHeight
    const endRow = Math.round(Math.max(34, Math.min(58, (vhEnd - 330) / Math.max(1, ranked.length))))
    list.push({
      key: 'end',
      bg: BG.gold,
      ms: null,
      view: (
        <div className="text-center w-full">
          <Kicker>Endstand · {mainName}</Kicker>
          <Title>Danke für diese Season!</Title>
          <Rise delay={0.3} className="mt-[clamp(0.75rem,2.5vh,1.5rem)] rounded-2xl overflow-hidden text-left">
            <div style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.12)' }} className="rounded-2xl">
              {ranked.map((s, i) => (
                <div key={s.player.id} className="flex items-center gap-3 px-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.1)', height: endRow }}>
                  <span className="w-6 text-center font-bold tabular-nums" style={{ color: i === 0 ? GOLD : MUTED }}>{i + 1}</span>
                  <PlayerAvatar name={s.player.name} avatarUrl={s.player.avatar_url} size={endRow - 10} />
                  <span className="flex-1 min-w-0 truncate font-semibold text-[clamp(0.95rem,2.2vh,1.15rem)]" style={{ color: CREAM }}>{s.player.name}</span>
                  <span className="font-bold tabular-nums text-[clamp(0.95rem,2.2vh,1.15rem)]" style={{ color: s.total_balance >= 0 ? PLUS : MINUS }}>{formatBalance(s.total_balance)}</span>
                </div>
              ))}
            </div>
          </Rise>
          <Rise delay={0.5} className="flex gap-2 mt-[clamp(0.75rem,2.5vh,1.5rem)]">
            <button {...stop} onClick={() => share(d)} className="flex-[1.6] rounded-2xl py-3.5 font-semibold" style={{ color: '#1A1206', background: GOLD }}>
              {copied ? 'Kopiert ✓' : '📤 Teilen'}
            </button>
            <button {...stop} onClick={() => { setIdx(0); setCycle(c => c + 1) }} className="flex-1 rounded-2xl py-3.5 text-sm font-semibold" style={{ color: CREAM, background: 'rgba(255,255,255,0.1)' }}>
              ↺ Nochmal
            </button>
            <button {...stop} onClick={onClose} className="flex-1 rounded-2xl py-3.5 text-sm font-semibold" style={{ color: CREAM, background: 'rgba(255,255,255,0.1)' }}>
              Schließen
            </button>
          </Rise>
        </div>
      ),
    })

    return list
  }

  const slides = useMemo<Slide[]>(() => (data ? buildSlides(data) : []), [data, me, copied]) // eslint-disable-line react-hooks/exhaustive-deps
  const slide = slides[Math.min(idx, slides.length - 1)]

  // Sounds / coin rain when a slide appears
  useEffect(() => {
    slide?.enter?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.key, cycle])

  const next = () => setIdx(i => Math.min(i + 1, slides.length - 1))
  const prev = () => {
    if (idx === 0) setCycle(c => c + 1)
    else setIdx(i => i - 1)
  }

  // Keyboard: ← → to skip, Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, slides.length - 1))
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0))
      else if (e.key === ' ') {
        e.preventDefault()
        setPinned(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, slides.length])

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[200] flex flex-col select-none animate-fade-in transition-[background] duration-700"
        style={{ background: slide?.bg ?? BG.forest }}
        onContextMenu={e => e.preventDefault()}
        // If the browser blocked autoplay, the next tap starts the song.
        onPointerDownCapture={() => {
          if (musicOn && !recapMusicPlaying()) resumeRecapMusic()
        }}
      >
        {/* Progress + close */}
        <div className="shrink-0 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] max-w-lg w-full mx-auto">
          <div className="flex gap-1">
            {slides.map((s, i) => (
              <div key={s.key} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.25)' }}>
                {i < idx || (i === idx && s.ms == null) ? (
                  <div className="h-full w-full" style={{ background: CREAM }} />
                ) : i === idx ? (
                  <div
                    key={`${s.key}-${cycle}`}
                    className="h-full w-full sw-progress"
                    style={{ background: CREAM, animationDuration: `${s.ms}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                    onAnimationEnd={next}
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-xs font-semibold tracking-wide truncate min-w-0" style={{ color: MUTED }}>
              {pinned ? '⏸ Pausiert' : `${season.name} · Rückblick`}
            </span>
            <div className="flex items-center -mr-1.5 shrink-0">
              <button
                {...stop}
                onClick={() => setPinned(p => !p)}
                aria-label={pinned ? 'Weiter abspielen' : 'Pause'}
                aria-pressed={pinned}
                className="w-10 h-10 flex items-center justify-center rounded-full"
                style={{ color: CREAM, background: pinned ? 'rgba(255,255,255,0.18)' : 'transparent' }}
              >
                {pinned ? (
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3.5v11l9-5.5z" fill="currentColor" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="4" y="3.5" width="3.5" height="11" rx="1" fill="currentColor" /><rect x="10.5" y="3.5" width="3.5" height="11" rx="1" fill="currentColor" /></svg>
                )}
              </button>
              {soundEnabled() && (
                <button {...stop} onClick={toggleMusic} aria-label={musicOn ? 'Musik aus' : 'Musik an'} className="w-10 h-10 flex items-center justify-center rounded-full text-lg" style={{ color: CREAM }}>
                  {musicOn ? '🔊' : '🔇'}
                </button>
              )}
              <button {...stop} onClick={onClose} aria-label="Schließen" className="w-10 h-10 flex items-center justify-center rounded-full text-xl" style={{ color: CREAM }}>
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Slide — tap left third: back, elsewhere: next; hold: pause */}
        <div
          className="flex-1 min-h-0 overflow-y-auto flex"
          onPointerDown={() => {
            press.current = Date.now()
            setHeld(true)
          }}
          onPointerUp={e => {
            setHeld(false)
            if (Date.now() - press.current > 300) return
            if (e.clientX < window.innerWidth * 0.3) prev()
            else if (slide?.ms != null) next()
          }}
          onPointerCancel={() => setHeld(false)}
        >
          {failed ? (
            <div className="m-auto text-center px-6" style={{ color: CREAM }}>
              Der Rückblick konnte nicht geladen werden.
            </div>
          ) : !slide ? (
            <div className="m-auto text-center px-6">
              <div className="text-4xl animate-pulse">🃏</div>
              <p className="text-sm mt-3" style={{ color: MUTED }}>Rückblick wird gemischt…</p>
            </div>
          ) : (
            <div key={`${slide.key}-${cycle}`} className="m-auto w-full max-w-lg px-5 pt-[clamp(0.5rem,2.5vh,1.5rem)] flex flex-col items-center pb-[calc(clamp(0.75rem,2.5vh,1.5rem)+env(safe-area-inset-bottom))]">
              {slide.view}
            </div>
          )}
        </div>
      </div>
      {coins && <CoinRain onDone={() => setCoins(false)} />}
    </Portal>
  )
}
