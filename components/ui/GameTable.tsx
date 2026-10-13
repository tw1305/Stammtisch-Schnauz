'use client'

import { useEffect, useRef, useState } from 'react'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import PlayerAvatar from './PlayerAvatar'
import { PlayerEffect, SyringeFlight, type GameEffect } from './GameEffects'
import { GoldPile, goldPileAspect, NoobSign, type NoobSignState } from './RoundEffects'
import { POT_TIERS, potTierIndex } from '@/lib/effects'
import type { SessionPlayer, RoundPlayer } from '@/types/database'

type GameTableProps = {
  sessionPlayers: SessionPlayer[]
  roundPlayers?: RoundPlayer[]
  sessionBalances?: Record<string, number>
  onPlayerTap?: (playerId: string) => void
  isRoundActive?: boolean
  dealerId?: string | null
  /** Current winning streak per player (gold ring / glowing ring / flames). */
  winStreaks?: Map<string, number>
  /** One-shot animations (R.I.P., revive, fire) anchored on a player */
  effects?: GameEffect[]
  /** Possible winnings of the running round (stake × players): the gold pile on the table. */
  pot?: number
  /** "Noob" signs above portraits (repeatedly first out). */
  noobSigns?: Map<string, NoobSignState>
}

type Sizing = { avatar: number; name: string; bal: string; radius: number }

function sizingFor(count: number): Sizing {
  if (count <= 3) return { avatar: 100, name: 'text-sm', bal: 'text-sm', radius: 38 }
  if (count === 4) return { avatar: 90, name: 'text-sm', bal: 'text-[13px]', radius: 38 }
  if (count === 5) return { avatar: 80, name: 'text-[13px]', bal: 'text-xs', radius: 39 }
  if (count === 6) return { avatar: 72, name: 'text-xs', bal: 'text-xs', radius: 39 }
  if (count === 7) return { avatar: 66, name: 'text-xs', bal: 'text-[11px]', radius: 40 }
  if (count === 8) return { avatar: 60, name: 'text-[11px]', bal: 'text-[11px]', radius: 41 }
  return { avatar: 56, name: 'text-[11px]', bal: 'text-[10px]', radius: 41 }
}

/** Scene shown while a round is played (Season 4: autumn forest at golden hour). */
const ACTIVE_BG = '/table-season4.webp'

// Exact seat centers (% of the image) measured off the 10 tree-stump tops in
// table-season4.webp (1024×1536, native 2:3). Ordered clockwise starting at the
// back-centre stump. For fewer players we sample this list evenly by index so the
// used seats stay spread around the table instead of clustering on one side.
const ACTIVE_SEATS: { left: number; top: number }[] = [
  { left: 50.5, top: 42.0 }, // back, top-center
  { left: 71.1, top: 44.9 }, // back-right
  { left: 85.9, top: 53.1 }, // right
  { left: 86.9, top: 65.8 }, // right, lower
  { left: 72.3, top: 76.2 }, // front-right
  { left: 48.8, top: 79.8 }, // front, bottom-center
  { left: 26.4, top: 74.9 }, // front-left
  { left: 12.7, top: 64.8 }, // left, lower
  { left: 14.4, top: 52.7 }, // left
  { left: 29.1, top: 45.2 }, // back-left
]

// Fallback for the rare session with more players than drawn seats (11+): grows an
// ellipse (fitted to the same 10 seats) outward into the surrounding clearing,
// clamped so nobody drifts into the treeline or off the image.
const ACTIVE_TABLE = { cx: 49.8, cy: 60.9, rx: 37.1, ry: 18.9 }
const ACTIVE_BOUNDS = { left: [4, 96] as [number, number], top: [40, 86] as [number, number] }

function activeScaleFor(count: number): number {
  if (count <= ACTIVE_SEATS.length) return 1
  return Math.min(1 + (count - ACTIVE_SEATS.length) * 0.12, 1.3)
}

type ActiveSizing = { avatar: number; name: string; bal: string; minW: number; maxW: number }

function activeSizingFor(count: number): ActiveSizing {
  if (count <= 2) return { avatar: 100, name: 'text-sm', bal: 'text-sm', minW: 58, maxW: 104 }
  if (count === 3) return { avatar: 88, name: 'text-sm', bal: 'text-xs', minW: 54, maxW: 96 }
  if (count === 4) return { avatar: 72, name: 'text-xs', bal: 'text-xs', minW: 48, maxW: 84 }
  if (count === 5) return { avatar: 62, name: 'text-xs', bal: 'text-[11px]', minW: 44, maxW: 76 }
  if (count === 6) return { avatar: 52, name: 'text-[11px]', bal: 'text-[11px]', minW: 40, maxW: 68 }
  if (count === 7) return { avatar: 46, name: 'text-[11px]', bal: 'text-[10px]', minW: 38, maxW: 62 }
  if (count === 8) return { avatar: 42, name: 'text-[10px]', bal: 'text-[10px]', minW: 36, maxW: 58 }
  if (count === 9) return { avatar: 40, name: 'text-[10px]', bal: 'text-[9px]', minW: 34, maxW: 56 }
  if (count === 10) return { avatar: 38, name: 'text-[9px]', bal: 'text-[9px]', minW: 32, maxW: 52 }
  return { avatar: 34, name: 'text-[9px]', bal: 'text-[8px]', minW: 30, maxW: 48 }
}

// ---------- Active-round layout ----------

/** Reference table width the active sizings above were designed for (phone width). */
const REF_WIDTH = 343
/** Part of the scene image that must stay visible (the rest may be cropped). */
const VIS_X = 0.95 // crop at most 2.5 % per side, so the outer stumps keep room for their tokens
const VIS_Y = 0.6 // keeps the band around the stumps (≈ 31–91 % of the height)
const SEAT_CENTER_Y = 0.61 // vertical centre of the stump ring in the image
const PLATE_H = 36 // name plate height (px at scale 1) below the avatar
/** Largest side of the setup (between rounds) table. */
const SETUP_MAX = 380
/** Where the gold pile stands: bottom centre on the table top, in % of the scene image. */
const PILE_ANCHOR = { left: 50.5, top: 66 }

type ActiveLayout = {
  img: { left: number; top: number; w: number; h: number }
  seats: { left: number; top: number }[] // % of the box
  scale: number // token scale relative to the phone-sized design
}

/**
 * Fits the 2:3 scene into a box of any shape: as large as possible while the
 * stump ring stays visible, centred on the stumps. Tokens scale with the image;
 * the vertical fit caps that scale, and a token at the very left/right edge is
 * nudged inward a little rather than shrinking every token.
 */
function layoutActive(
  W: number,
  H: number,
  rawSeats: { left: number; top: number }[],
  avatar0: number,
  plate0: number
): ActiveLayout {
  const w = Math.min(W / VIS_X, H / (1.5 * VIS_Y))
  const h = w * 1.5
  const left = (W - w) / 2
  let top = H / 2 - SEAT_CENTER_Y * h
  if (h >= H) top = Math.min(0, Math.max(H - h, top))
  else top = (H - h) / 2
  const px = rawSeats.map(r => ({ x: left + (r.left / 100) * w, y: top + (r.top / 100) * h }))

  let scale = Math.min(1.9, w / REF_WIDTH)
  for (const { y } of px) {
    scale = Math.min(
      scale,
      (y - 2) / (avatar0 / 2), // top edge (avatar)
      (H - y - 2) / (avatar0 / 2 + PLATE_H) // bottom edge (avatar + name plate)
    )
  }
  scale = Math.max(0.6, scale)
  const halfW = (Math.max(avatar0, plate0) / 2) * scale
  const clampX = (x: number) => Math.min(W - halfW - 2, Math.max(halfW + 2, x))
  return {
    img: { left, top, w, h },
    seats: px.map(({ x, y }) => ({ left: (clampX(x) / W) * 100, top: (y / H) * 100 })),
    scale,
  }
}

export default function GameTable({
  sessionPlayers,
  roundPlayers = [],
  sessionBalances = {},
  onPlayerTap,
  isRoundActive = false,
  dealerId = null,
  winStreaks,
  effects = [],
  pot,
  noobSigns,
}: GameTableProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    // Measure right away (ResizeObserver callbacks can be delayed, e.g. in background tabs).
    const r = el.getBoundingClientRect()
    if (r.width > 0) setBox({ w: r.width, h: r.height })
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox(b => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isRoundActive])

  const count = sessionPlayers.length
  const base = sizingFor(count)
  const active = isRoundActive ? activeSizingFor(count) : null
  const avatar = active?.avatar ?? base.avatar
  const nameClass = active?.name ?? base.name
  const balClass = active?.bal ?? base.bal
  const minW = active?.minW ?? 58
  const maxW = active?.maxW ?? 104
  const { radius } = base

  const rawPositions = Array.from({ length: count }, (_, i) => {
    if (isRoundActive) {
      if (count <= ACTIVE_SEATS.length) {
        // Evenly sample the 10 measured seats by index so N players stay spread
        // around the table instead of clustering on consecutive drawn stumps.
        const seat = ACTIVE_SEATS[Math.floor((i * ACTIVE_SEATS.length) / count)]
        return { left: seat.left, top: seat.top }
      }
      // More players than drawn seats — grow the fitted ellipse outward, clamped
      // to stay on the visible ground.
      const scale = activeScaleFor(count)
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      const rawLeft = ACTIVE_TABLE.cx + ACTIVE_TABLE.rx * scale * Math.cos(angle)
      const rawTop = ACTIVE_TABLE.cy + ACTIVE_TABLE.ry * scale * Math.sin(angle)
      return {
        left: Math.min(ACTIVE_BOUNDS.left[1], Math.max(ACTIVE_BOUNDS.left[0], rawLeft)),
        top: Math.min(ACTIVE_BOUNDS.top[1], Math.max(ACTIVE_BOUNDS.top[0], rawTop)),
      }
    }
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    return {
      left: 50 + radius * Math.cos(angle),
      top: 50 + radius * Math.sin(angle),
    }
  })

  // Active round: scale the scene + tokens to the measured box (see layoutActive).
  const layout =
    isRoundActive && box.w > 0 && active ? layoutActive(box.w, box.h, rawPositions, active.avatar, active.maxW) : null
  const positions = layout ? layout.seats : rawPositions
  // Setup view: the round table is the largest square that fits the box, and the
  // tokens shrink with it (designed for a phone-wide table), so the page around it
  // never has to scroll.
  const side = !isRoundActive ? Math.min(box.w, box.h, SETUP_MAX) : 0
  const tokenScale = layout?.scale ?? (side > 0 ? Math.min(1.1, Math.max(0.5, side / REF_WIDTH)) : 1)
  const avatarPx = Math.round(avatar * tokenScale)

  // Gold pile: sized by tier, but never taller than the gap up to the token
  // sitting behind the table (its name plate), so it can't hide a player.
  let pile: { left: number; top: number; width: number; tier: number } | null = null
  if (layout && pot != null && pot > 0) {
    const tier = potTierIndex(pot)
    const left = layout.img.left + (PILE_ANCHOR.left / 100) * layout.img.w
    const top = layout.img.top + (PILE_ANCHOR.top / 100) * layout.img.h
    let width = POT_TIERS[tier].width * layout.img.w
    for (const p of positions) {
      const x = (p.left / 100) * box.w
      const y = (p.top / 100) * box.h
      if (y >= top || Math.abs(x - left) > width / 2 + avatarPx / 2) continue
      const tokenBottom = y + avatarPx / 2 + (PLATE_H - 10) * tokenScale
      width = Math.min(width, Math.max(0, top - tokenBottom - 4) / goldPileAspect(tier))
    }
    if (width >= 24) pile = { left, top, width, tier }
  }

  function playerEffectsFor(playerId: string) {
    return effects.filter(e => e.playerId === playerId)
  }

  function seatOf(playerId: string) {
    const i = sessionPlayers.findIndex(sp => sp.player_id === playerId)
    return i >= 0 ? positions[i] : null
  }

  function getRoundPlayer(playerId: string): RoundPlayer | undefined {
    return roundPlayers.find(rp => rp.player_id === playerId)
  }

  return (
    <div ref={boxRef} className="relative w-full h-full">
      {(isRoundActive || side > 0) && (
      <div
        className="absolute"
        style={
          isRoundActive
            ? { inset: 0 }
            : { left: (box.w - side) / 2, top: (box.h - side) / 2, width: side, height: side }
        }
      >
      {/* Center — the illustrated table appears only while a round is being played, so
          the setup screen is clearly distinguishable from an active round. */}
      {isRoundActive ? (
        <div className="absolute inset-0 rounded-3xl overflow-hidden border border-[#E4D9BF] shadow-sm bg-[#5E7A3A]">
          {/* Blurred copy fills any space the scene doesn't cover, so the forest seems to continue. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ACTIVE_BG}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-125"
            style={{ filter: 'blur(18px) saturate(1.1)' }}
          />
          {layout && (
            <div
              className="absolute"
              style={{
                left: layout.img.left,
                top: layout.img.top,
                width: layout.img.w,
                height: layout.img.h,
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 4%, #000 96%, transparent)',
                maskImage: 'linear-gradient(to bottom, transparent, #000 4%, #000 96%, transparent)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ACTIVE_BG}
                alt=""
                className="w-full h-full"
                style={{
                  WebkitMaskImage: 'linear-gradient(to right, transparent, #000 4%, #000 96%, transparent)',
                  maskImage: 'linear-gradient(to right, transparent, #000 4%, #000 96%, transparent)',
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex flex-col items-center justify-center text-center border-2 border-dashed border-[#D8C9A6] bg-[#F4ECDA]/50"
          style={{ width: '47%', height: '47%' }}
        >
          <span className="font-[family-name:var(--font-display)] text-sm font-bold text-[#B0A084] tracking-tight">
            ♠ Schnauz
          </span>
          <span className="text-[10px] mt-0.5 px-4 leading-tight text-[#B0A084]">
            Runde noch nicht gestartet
          </span>
        </div>
      )}

      {/* Possible winnings as a treasure heap on the table (under the players, never tappable) */}
      {pile && (
        <div className="absolute pointer-events-none" style={{ left: pile.left - pile.width / 2, top: pile.top - pile.width * goldPileAspect(pile.tier) }}>
          <GoldPile tier={pile.tier} width={pile.width} label={`Möglicher Gewinn: ${pot} €`} />
        </div>
      )}

      {/* Players (active round: only once the box is measured, so nothing jumps) */}
      {(!isRoundActive || layout) && sessionPlayers.map((sp, i) => {
        const pos = positions[i]
        const rp = getRoundPlayer(sp.player_id)
        // The medic call + revive animation keep the player grey until the syringe has injected.
        const heldGray = playerEffectsFor(sp.player_id).some(e => (e.kind === 'revive' || e.kind === 'medic') && e.holdGray)
        const shaking = playerEffectsFor(sp.player_id).some(e => e.kind === 'medic')
        const isEliminated = isRoundActive && rp ? !rp.is_active || heldGray : false
        const isWinner = isRoundActive && rp ? rp.is_winner : false
        const balance = sessionBalances[sp.player_id] ?? 0
        const player = sp.player!
        const playerEffects = playerEffectsFor(sp.player_id)

        return (
          <button
            key={sp.player_id}
            onClick={() => onPlayerTap?.(sp.player_id)}
            disabled={!onPlayerTap}
            className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 active:scale-95 transition-transform"
            // Lift a seat above its neighbours while an effect plays so it isn't clipped by them.
            style={{ left: `${pos.left}%`, top: `${pos.top}%`, zIndex: playerEffects.length > 0 ? 40 : undefined }}
          >
            <div className="relative">
              {/* "MEDIC!": only the portrait shakes; the speech bubble below stays steady */}
              <div className={shaking ? 'fx-shake' : undefined}>
              <PlayerAvatar
                name={player.name}
                avatarUrl={player.avatar_url}
                size={avatarPx}
                eliminated={isEliminated}
                isWinner={isWinner}
                birthday={player.birthday}
                winStreak={winStreaks?.get(sp.player_id) ?? 0}
              />
              </div>
              {noobSigns?.has(sp.player_id) && <NoobSign size={avatarPx} state={noobSigns.get(sp.player_id)!} />}
              {dealerId === sp.player_id && (
                <span
                  className="absolute -top-1 -left-1 bg-[#2E6B3A] text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow ring-2 ring-[#F4ECDA]"
                  title="Geber"
                  style={{ zoom: tokenScale }}
                >
                  G
                </span>
              )}
              {playerEffects.map(e => (
                <div key={e.id} className="absolute inset-0 z-30 pointer-events-none">
                  <PlayerEffect kind={e.kind} size={avatarPx} align={pos.left > 68 ? 'right' : pos.left < 32 ? 'left' : 'center'} />
                </div>
              ))}
            </div>
            {/* Name plate — ties avatar, name and balance into one token */}
            <div
              className={`-mt-2.5 px-2.5 py-1 rounded-xl border shadow-sm flex flex-col items-center relative z-10
                ${isEliminated
                  ? 'bg-[#F0E8D6] border-[#E4D9BF] opacity-60'
                  : isWinner
                    ? 'bg-[#FFFDF7] border-[#2E6B3A]'
                    : 'bg-[#FFFDF7] border-[#E4D9BF]'}
              `}
              style={{ minWidth: minW, maxWidth: maxW, zoom: tokenScale }}
            >
              <span
                className={`${nameClass} font-semibold leading-tight truncate max-w-full
                  ${isEliminated ? 'text-[#7C7461] line-through' : 'text-[#23201A]'}
                `}
              >
                {player.name}
              </span>
              {/* Balance stays visible during play so the standings are always readable */}
              <span className={`${balClass} font-bold leading-tight flex items-center gap-0.5 ${getBalanceColor(balance)}`}>
                {isRoundActive && isEliminated && <span className="text-[10px]">💀</span>}
                {formatBalance(balance)}
              </span>
            </div>
          </button>
        )
      })}

      {/* Revive syringes travel across the table from the reviver to the revived */}
      {effects.map(e => {
        if (e.kind !== 'revive' || !e.fromPlayerId) return null
        const from = seatOf(e.fromPlayerId)
        const to = seatOf(e.playerId)
        if (!from || !to) return null
        return <SyringeFlight key={e.id} from={from} to={to} avatar={avatarPx} />
      })}
      </div>
      )}
    </div>
  )
}
