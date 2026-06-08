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
}

type Sizing = { avatar: number; name: string; bal: string; radius: number }

function sizingFor(count: number): Sizing {
  if (count <= 3) return { avatar: 94, name: 'text-base', bal: 'text-sm', radius: 35 }
  if (count === 4) return { avatar: 84, name: 'text-sm', bal: 'text-[13px]', radius: 36 }
  if (count === 5) return { avatar: 76, name: 'text-sm', bal: 'text-xs', radius: 37 }
  if (count === 6) return { avatar: 68, name: 'text-[13px]', bal: 'text-xs', radius: 38 }
  if (count === 7) return { avatar: 62, name: 'text-xs', bal: 'text-[11px]', radius: 39 }
  if (count === 8) return { avatar: 58, name: 'text-xs', bal: 'text-[11px]', radius: 40 }
  return { avatar: 52, name: 'text-[11px]', bal: 'text-[10px]', radius: 41 }
}

export default function GameTable({
  sessionPlayers,
  roundPlayers = [],
  sessionBalances = {},
  onPlayerTap,
  isRoundActive = false,
}: GameTableProps) {
  const count = sessionPlayers.length
  const { avatar, name: nameClass, bal: balClass, radius } = sizingFor(count)

  const positions = Array.from({ length: count }, (_, i) => {
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
    <div className="relative w-full max-w-[380px] aspect-square mx-auto">
      {/* Ambient glow */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl pointer-events-none"
        style={{ width: '55%', height: '55%', background: 'radial-gradient(circle, rgba(99,102,241,0.18), transparent 70%)' }}
      />

      {/* Center table */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: '44%', height: '44%' }}
      >
        <div
          className="w-full h-full rounded-full bg-[#141925] border border-[#2A3344] flex flex-col items-center justify-center"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 30px rgba(0,0,0,0.4)' }}
        >
          <span className="font-[family-name:var(--font-display)] text-[#6366F1] text-base font-bold tracking-tight">
            ♠ Schnauz
          </span>
          {isRoundActive && (
            <span className="text-[#8B95A7] text-[10px] mt-1 px-3 text-center leading-tight">
              Tippen zum Ausscheiden
            </span>
          )}
        </div>
      </div>

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
            className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 active:scale-95 transition-transform"
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
          >
            <PlayerAvatar
              name={player.name}
              avatarUrl={player.avatar_url}
              size={avatar}
              eliminated={isEliminated}
              isWinner={isWinner}
            />
            <span
              className={`${nameClass} font-semibold text-center leading-tight max-w-[92px] truncate
                ${isEliminated ? 'text-[#8B95A7] line-through' : 'text-[#F1F5F9]'}
              `}
            >
              {player.name}
            </span>
            {!isRoundActive && (
              <span className={`${balClass} font-bold ${getBalanceColor(balance)}`}>
                {formatBalance(balance)}
              </span>
            )}
            {isRoundActive && isEliminated && (
              <span className="text-xs leading-none">💀</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
