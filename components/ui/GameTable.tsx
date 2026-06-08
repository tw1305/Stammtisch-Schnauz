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
      {/* Soft shadow under the table */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl pointer-events-none"
        style={{ width: '54%', height: '54%', background: 'radial-gradient(circle, rgba(90,62,34,0.28), transparent 72%)' }}
      />

      {/* Center table — oak plank */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: '47%', height: '47%' }}
      >
        <div
          className="w-full h-full rounded-full flex flex-col items-center justify-center text-center"
          style={{
            backgroundColor: '#C29A5E',
            backgroundImage: [
              'radial-gradient(120% 120% at 35% 28%, rgba(255,244,222,0.55) 0%, rgba(255,244,222,0) 45%)',
              'repeating-linear-gradient(96deg, rgba(120,80,40,0.16) 0px, rgba(120,80,40,0.16) 2px, rgba(120,80,40,0) 3px, rgba(120,80,40,0) 13px)',
              'repeating-linear-gradient(96deg, rgba(80,52,24,0.20) 0px, rgba(80,52,24,0.20) 1px, rgba(80,52,24,0) 2px, rgba(80,52,24,0) 7px)',
              'linear-gradient(96deg, #B8884E 0%, #CDA468 35%, #BD9156 65%, #A87B45 100%)',
            ].join(', '),
            border: '6px solid #6E4A24',
            boxShadow:
              'inset 0 2px 6px rgba(255,240,210,0.35), inset 0 -8px 18px rgba(60,38,16,0.45), 0 10px 26px rgba(54,34,14,0.45)',
          }}
        >
          <span
            className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight"
            style={{ color: '#4A2E12', textShadow: '0 1px 0 rgba(255,238,210,0.45)' }}
          >
            ♠ Schnauz
          </span>
          {isRoundActive && (
            <span className="text-[10px] mt-1 px-4 leading-tight" style={{ color: '#5A3E22' }}>
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
                ${isEliminated ? 'text-[#7C7461] line-through' : 'text-[#23201A]'}
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
