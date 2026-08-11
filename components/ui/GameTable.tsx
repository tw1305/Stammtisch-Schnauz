'use client'

import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import PlayerAvatar from './PlayerAvatar'
import type { SessionPlayer, RoundPlayer } from '@/types/database'

type GameTableProps = {
  sessionPlayers: SessionPlayer[]
  roundPlayers?: RoundPlayer[]
  sessionBalances?: Record<string, number>
  onPlayerTap?: (playerId: string) => void
  isRoundActive?: boolean
  dealerId?: string | null
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

// Exact seat centers (% of the container) measured directly off the 10 tree-stump
// seats drawn in table-active-bg.png (1024×1536, native 2:3 — no cropping needed).
// Ordered clockwise starting at the top stump. For fewer players we sample this
// list evenly by index so the used seats stay spread around the table instead of
// clustering on one side.
const ACTIVE_SEATS: { left: number; top: number }[] = [
  { left: 48.8, top: 38.4 }, // back, top-center
  { left: 67.9, top: 40.2 }, // back-right
  { left: 84.0, top: 47.5 }, // right
  { left: 86.4, top: 57.9 }, // right, lower
  { left: 71.3, top: 67.9 }, // front-right
  { left: 46.2, top: 70.8 }, // front, bottom-center
  { left: 22.3, top: 68.2 }, // front-left
  { left: 12.2, top: 56.6 }, // left, lower
  { left: 15.9, top: 46.2 }, // left
  { left: 31.7, top: 39.9 }, // back-left
]

// Fallback for the rare session with more players than drawn seats (11+): grows an
// ellipse (fitted to the same 10 seats) outward into the surrounding clearing,
// clamped so nobody drifts into the treeline or off the image.
const ACTIVE_TABLE = { cx: 48.7, cy: 53.4, rx: 37.3, ry: 16.9 }
const ACTIVE_BOUNDS = { left: [4, 96] as [number, number], top: [36, 74] as [number, number] }

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

export default function GameTable({
  sessionPlayers,
  roundPlayers = [],
  sessionBalances = {},
  onPlayerTap,
  isRoundActive = false,
  dealerId = null,
}: GameTableProps) {
  const count = sessionPlayers.length
  const base = sizingFor(count)
  const active = isRoundActive ? activeSizingFor(count) : null
  const avatar = active?.avatar ?? base.avatar
  const nameClass = active?.name ?? base.name
  const balClass = active?.bal ?? base.bal
  const minW = active?.minW ?? 58
  const maxW = active?.maxW ?? 104
  const { radius } = base

  const positions = Array.from({ length: count }, (_, i) => {
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

  function getRoundPlayer(playerId: string): RoundPlayer | undefined {
    return roundPlayers.find(rp => rp.player_id === playerId)
  }

  return (
    <div
      className={
        isRoundActive
          ? 'relative w-full aspect-[2/3] max-h-[64vh] mx-auto'
          : 'relative w-full max-w-[380px] aspect-square mx-auto'
      }
    >
      {/* Center — the illustrated table appears only while a round is being played, so
          the setup screen is clearly distinguishable from an active round. */}
      {isRoundActive ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/table-active-bg.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover rounded-3xl border border-[#E4D9BF] shadow-sm"
        />
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

      {/* Players */}
      {sessionPlayers.map((sp, i) => {
        const pos = positions[i]
        const rp = getRoundPlayer(sp.player_id)
        const isEliminated = isRoundActive && rp ? !rp.is_active : false
        const isWinner = isRoundActive && rp ? rp.is_winner : false
        const balance = sessionBalances[sp.player_id] ?? 0
        const player = sp.player!

        return (
          <button
            key={sp.player_id}
            onClick={() => onPlayerTap?.(sp.player_id)}
            disabled={!onPlayerTap}
            className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 active:scale-95 transition-transform"
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
          >
            <div className="relative">
              <PlayerAvatar
                name={player.name}
                avatarUrl={player.avatar_url}
                size={avatar}
                eliminated={isEliminated}
                isWinner={isWinner}
                birthday={player.birthday}
              />
              {dealerId === sp.player_id && (
                <span
                  className="absolute -top-1 -left-1 bg-[#2E6B3A] text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow ring-2 ring-[#F4ECDA]"
                  title="Geber"
                >
                  G
                </span>
              )}
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
              style={{ minWidth: minW, maxWidth: maxW }}
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
    </div>
  )
}
