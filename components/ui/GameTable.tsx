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

// Seat ellipse fitted to the four tree-stump seats drawn in table-active-bg.png
// (cx/cy/rx/ry in % of the container). The image's stumps sit at the diagonals, so
// the angle offset starts a quarter-turn later than the setup circle.
// PROVISIONAL: table-active-bg.png is still the old 1:1 square image (4 stumps),
// rendered here inside a taller 2:3 box via object-cover, which crops ~17% off each
// side — rx is widened to compensate so the 4 seats still line up with the stumps.
// Once the new 9-stump image (native 2:3, see chat) lands, refit rx/cy/ry to it directly.
const ACTIVE_TABLE = { cx: 50, cy: 72, rx: 52, ry: 12 }
// Hard safety bounds so seats can never drift into the treeline or off the box,
// regardless of player count or how ACTIVE_TABLE ends up tuned.
const ACTIVE_BOUNDS = { left: [4, 96] as [number, number], top: [50, 92] as [number, number] }

function activeScaleFor(count: number): number {
  if (count <= 4) return 1
  return Math.min(1 + (count - 4) * 0.09, 1.35)
}

type ActiveSizing = { avatar: number; name: string; bal: string; minW: number; maxW: number }

function activeSizingFor(count: number): ActiveSizing {
  if (count <= 2) return { avatar: 96, name: 'text-sm', bal: 'text-sm', minW: 58, maxW: 104 }
  if (count === 3) return { avatar: 82, name: 'text-sm', bal: 'text-xs', minW: 56, maxW: 100 }
  if (count === 4) return { avatar: 64, name: 'text-xs', bal: 'text-xs', minW: 52, maxW: 92 }
  if (count === 5) return { avatar: 58, name: 'text-xs', bal: 'text-[11px]', minW: 50, maxW: 88 }
  if (count === 6) return { avatar: 54, name: 'text-[11px]', bal: 'text-[11px]', minW: 48, maxW: 84 }
  if (count === 7) return { avatar: 48, name: 'text-[11px]', bal: 'text-[10px]', minW: 44, maxW: 78 }
  if (count === 8) return { avatar: 46, name: 'text-[10px]', bal: 'text-[10px]', minW: 42, maxW: 72 }
  return { avatar: 42, name: 'text-[10px]', bal: 'text-[9px]', minW: 40, maxW: 68 }
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
      const scale = activeScaleFor(count)
      const angle = (2 * Math.PI * i) / count - Math.PI / 4
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
