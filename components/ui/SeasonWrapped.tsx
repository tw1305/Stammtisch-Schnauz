'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeSeasonWrapped, type Leaders, type SeasonWrapped as Wrapped } from '@/lib/wrapped'
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

function Rise({ delay = 0, className = '', children }: { delay?: number; className?: string; children: ReactNode }) {
  return (
    <div className={`sw-rise ${className}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  )
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <Rise>
      <p className="text-[11px] uppercase tracking-[0.22em] font-semibold" style={{ color: GOLD }}>
        {children}
      </p>
    </Rise>
  )
}

function Title({ children, delay = 0.1 }: { children: ReactNode; delay?: number }) {
  return (
    <Rise delay={delay}>
      <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.6rem,7.5vw,2.25rem)] font-extrabold leading-tight mt-2" style={{ color: CREAM }}>
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
  size = 120,
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
  const s = players.length > 1 ? Math.round(size * (players.length > 2 ? 0.6 : 0.75)) : size
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4">
      {players.map(p => (
        <div key={p.id} className="flex flex-col items-center gap-2.5">
          <div className="relative">
            {glow && <Glow color={glow} size={s} />}
            {ghosts && animationsEnabled() && <GhostBurst size={s} waves={GHOSTS} />}
            <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={s} winStreak={streak} eliminated={eliminated} />
          </div>
          <span className="font-semibold text-lg leading-tight" style={{ color: CREAM }}>{p.name}</span>
        </div>
      ))}
    </div>
  )
}

function BigNumber({ children, sub, color = CREAM, delay = 0.35 }: { children: ReactNode; sub?: ReactNode; color?: string; delay?: number }) {
  return (
    <Rise delay={delay} className="text-center">
      <p className="font-[family-name:var(--font-display)] text-6xl font-extrabold tabular-nums leading-none" style={{ color }}>
        {children}
      </p>
      {sub && <p className="text-sm mt-2" style={{ color: MUTED }}>{sub}</p>}
    </Rise>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl px-3 py-3 text-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold tabular-nums leading-none" style={{ color: CREAM }}>{children}</p>
      <p className="text-[11px] mt-1.5 uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
    </div>
  )
}

function Row({ players, title, text, delay, ghosts }: { players: Player[]; title: string; text: string; delay: number; ghosts?: boolean }) {
  return (
    <Rise delay={delay}>
      <div className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
        {/* Ties: overlapping avatars */}
        <div className="flex shrink-0">
          {players.slice(0, 3).map((p, i) => (
            <div key={p.id} className="relative" style={{ marginLeft: i > 0 ? -18 : 0, zIndex: 3 - i }}>
              {ghosts && animationsEnabled() && <GhostBurst size={52} waves={GHOSTS} />}
              <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={52} />
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: GOLD }}>{title}</p>
          <p className="font-semibold leading-snug" style={{ color: CREAM }}>{text}</p>
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
  const [paused, setPaused] = useState(false)
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
          <Rise delay={0.5} className="grid grid-cols-2 gap-2.5 mt-8">
            <Fact label="Abende"><CountUp value={d.sessions} delay={0.6} /></Fact>
            <Fact label="Runden"><CountUp value={d.rounds} delay={0.7} /></Fact>
            <Fact label="Stunden am Tisch"><CountUp value={d.hours} decimals={d.hours < 10 ? 1 : 0} delay={0.8} /></Fact>
            <Fact label="€ gewonnen"><CountUp value={d.moneyMoved} delay={0.9} /></Fact>
          </Rise>
          <Rise delay={0.9}>
            <p className="text-sm mt-5" style={{ color: MUTED }}>
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
      const steps: Record<number, number> = { 0: 104, 1: 74, 2: 52 }
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
            <div className="flex items-end justify-center gap-2 mt-8">
              {order.map(s => {
                const rank = ranked.indexOf(s)
                const size = rank === 0 ? 96 : 68
                return (
                  <div key={s.player.id} className="flex flex-col items-center flex-1 max-w-[120px]">
                    <Rise delay={0.9 - rank * 0.25} className="flex flex-col items-center">
                      <div className="relative">
                        {rank === 0 && <Glow color="rgba(233,196,106,0.75)" size={size} />}
                        <PlayerAvatar name={s.player.name} avatarUrl={s.player.avatar_url} size={size} />
                        {rank === 0 && <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-3xl drop-shadow-lg">👑</div>}
                      </div>
                      <span className="font-semibold mt-2 truncate max-w-full" style={{ color: CREAM }}>{s.player.name}</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: s.total_balance >= 0 ? PLUS : MINUS }}>
                        <CountUp value={s.total_balance} format={formatBalance} delay={1.1 - rank * 0.25} />
                      </span>
                    </Rise>
                    <div
                      className="sw-grow w-full rounded-t-xl mt-2 flex items-start justify-center pt-2 font-[family-name:var(--font-display)] text-2xl font-extrabold"
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
            <Rise delay={0.35} className="mt-8">
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
            <div className="space-y-3 mt-8">
              {d.bestEvening && (
                <Row
                  delay={0.4}
                  players={[d.bestEvening.player]}
                  title={`Bester Abend · ${dayLabel(d.bestEvening.date)}`}
                  text={`${d.bestEvening.player.name} räumt ${formatBalance(d.bestEvening.delta)} ab`}
                />
              )}
              {d.worstEvening && (
                <Row
                  delay={0.8}
                  players={[d.worstEvening.player]}
                  title={`Härtester Abend · ${dayLabel(d.worstEvening.date)}`}
                  text={`${d.worstEvening.player.name} lässt ${euro(-d.worstEvening.delta)} liegen`}
                />
              )}
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
            <Rise delay={0.35} className="mt-8">
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
            <Rise delay={0.35} className="mt-8">
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
            <Rise delay={0.35} className="mt-7">
              <Heroes players={d.firstOut.players} eliminated />
            </Rise>
            <BigNumber delay={0.6} sub="als Erster ausgeschieden – öfter als alle anderen">
              <CountUp value={d.firstOut.value} delay={0.7} format={n => `${n}×`} />
            </BigNumber>
            {d.finalist && (
              <Rise delay={1.4} className="mt-7">
                <p className="text-sm" style={{ color: MUTED }}>
                  Ganz anders {names(d.finalist.players)}: <span style={{ color: CREAM }} className="font-semibold">{d.finalist.value}× im Finale</span> –
                  öfter als alle anderen unter den letzten zwei.
                </p>
              </Rise>
            )}
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
            <div className="space-y-3 mt-8">
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
              <Rise delay={1} className="mt-8">
                <Heroes players={[r.winner]} size={96} glow="rgba(233,196,106,0.5)" />
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
            <Rise delay={0.4} className="mt-8">
              <Heroes players={regulars} size={96} />
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
            <Rise delay={0.3} className="grid grid-cols-3 gap-3 mt-7" >
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
                  <PlayerAvatar name={s.player.name} avatarUrl={s.player.avatar_url} size={56} />
                  <span className="text-xs font-semibold truncate max-w-full px-1" style={{ color: CREAM }}>{s.player.name}</span>
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
        const best = d.personalBest[mine.player.id]
        const badges = d.badges[mine.player.id] ?? []
        list.push({
          key: `me-${mine.player.id}`,
          bg: BG.night,
          ms: null,
          view: (
            <div className="text-center w-full">
              <Kicker>Deine Season</Kicker>
              <Rise delay={0.15} className="mt-5">
                <Heroes players={[mine.player]} size={88} glow="rgba(233,196,106,0.35)" />
              </Rise>
              <Rise delay={0.3}>
                <p className="text-sm mt-1" style={{ color: MUTED }}>Platz {rank} von {ranked.length}</p>
                <p className="font-[family-name:var(--font-display)] text-5xl font-extrabold tabular-nums mt-1" style={{ color: mine.total_balance >= 0 ? PLUS : MINUS }}>
                  <CountUp value={mine.total_balance} format={formatBalance} delay={0.4} />
                </p>
              </Rise>
              <Rise delay={0.5} className="grid grid-cols-3 gap-2 mt-5">
                <Fact label="Siege">{mine.wins}</Fact>
                <Fact label="Siegquote">{Math.round(mine.win_rate * 100)}%</Fact>
                <Fact label="Abende">{d.attendance[mine.player.id] ?? 0}</Fact>
              </Rise>
              <div className="space-y-2.5 mt-3">
                {nem ? (
                  <Row
                    delay={0.7}
                    players={nem.opponents}
                    title="Dein Erzfeind 😤"
                    text={`${nem.count} ${nem.count === 1 ? 'Finale' : 'Finals'} gegen ${names(nem.opponents)} verloren`}
                  />
                ) : (
                  <Rise delay={0.7}>
                    <p className="text-sm rounded-2xl px-3 py-3" style={{ color: CREAM, background: 'rgba(255,255,255,0.08)' }}>
                      Kein Erzfeind – du hast kein einziges Finale verloren 💪
                    </p>
                  </Rise>
                )}
                {best && (
                  <Rise delay={0.85}>
                    <p className="text-sm" style={{ color: MUTED }}>
                      Dein bester Abend: <span className="font-semibold" style={{ color: PLUS }}>{formatBalance(best.delta)}</span> am {dayLabel(best.date)}
                    </p>
                  </Rise>
                )}
                {badges.length > 0 && (
                  <Rise delay={1} className="flex flex-wrap justify-center gap-1.5 pt-1">
                    {badges.map(b => (
                      <span key={b.label} className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ color: CREAM, background: 'rgba(233,196,106,0.18)', border: '1px solid rgba(233,196,106,0.4)' }}>
                        {b.icon} {b.label}
                      </span>
                    ))}
                  </Rise>
                )}
              </div>
              <Rise delay={1.1} className="flex gap-2 mt-5">
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

    // 12 — Endstand + teilen
    list.push({
      key: 'end',
      bg: BG.gold,
      ms: null,
      view: (
        <div className="text-center w-full">
          <Kicker>Endstand · {mainName}</Kicker>
          <Title>Danke für eine legendäre Season!</Title>
          <Rise delay={0.3} className="mt-5 rounded-2xl overflow-hidden text-left" >
            <div style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.12)' }} className="rounded-2xl">
              {ranked.map((s, i) => (
                <div key={s.player.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  <span className="w-5 text-center font-bold tabular-nums text-sm" style={{ color: i === 0 ? GOLD : MUTED }}>{i + 1}</span>
                  <PlayerAvatar name={s.player.name} avatarUrl={s.player.avatar_url} size={32} />
                  <span className="flex-1 min-w-0 truncate font-medium" style={{ color: CREAM }}>{s.player.name}</span>
                  <span className="font-bold tabular-nums" style={{ color: s.total_balance >= 0 ? PLUS : MINUS }}>{formatBalance(s.total_balance)}</span>
                </div>
              ))}
            </div>
          </Rise>
          <Rise delay={0.5} className="grid grid-cols-2 gap-2 mt-5">
            <button {...stop} onClick={() => share(d)} className="col-span-2 rounded-2xl py-3.5 font-semibold" style={{ color: '#1A1206', background: GOLD }}>
              {copied ? 'In die Zwischenablage kopiert ✓' : '📤 Rückblick teilen'}
            </button>
            <button {...stop} onClick={() => { setIdx(0); setCycle(c => c + 1) }} className="rounded-2xl py-3 text-sm font-semibold" style={{ color: CREAM, background: 'rgba(255,255,255,0.1)' }}>
              ↺ Nochmal
            </button>
            <button {...stop} onClick={onClose} className="rounded-2xl py-3 text-sm font-semibold" style={{ color: CREAM, background: 'rgba(255,255,255,0.1)' }}>
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
        <div className="shrink-0 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] max-w-md w-full mx-auto">
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
            <span className="text-xs font-semibold tracking-wide" style={{ color: MUTED }}>
              {season.name} · Rückblick
            </span>
            <div className="flex items-center -mr-1.5">
              {soundEnabled() && (
                <button {...stop} onClick={toggleMusic} aria-label={musicOn ? 'Musik aus' : 'Musik an'} className="w-9 h-9 flex items-center justify-center rounded-full text-lg" style={{ color: CREAM }}>
                  {musicOn ? '🔊' : '🔇'}
                </button>
              )}
              <button {...stop} onClick={onClose} aria-label="Schließen" className="w-9 h-9 flex items-center justify-center rounded-full text-xl" style={{ color: CREAM }}>
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
            setPaused(true)
          }}
          onPointerUp={e => {
            setPaused(false)
            if (Date.now() - press.current > 300) return
            if (e.clientX < window.innerWidth * 0.3) prev()
            else if (slide?.ms != null) next()
          }}
          onPointerCancel={() => setPaused(false)}
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
            <div key={`${slide.key}-${cycle}`} className="m-auto w-full max-w-md px-6 py-6 flex flex-col items-center pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {slide.view}
            </div>
          )}
        </div>
      </div>
      {coins && <CoinRain onDone={() => setCoins(false)} />}
    </Portal>
  )
}
