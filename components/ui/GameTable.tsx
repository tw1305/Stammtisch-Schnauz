'use client'

import { distributeOnCircle, formatBalance, getBalanceColor } from '@/lib/game-logic'
import PlayerAvatar from './PlayerAvatar'
import type { SessionPlayer, RoundPlayer } from '@/types/database'

type GameTableProps = {
  sessionPlayers: SessionPlayer[]
  roundPlayers?: RoundPlayer[]
  sessionBalances?: Record<string, number>
  onPlayerTap?: (playerId: string) => void
  isRoundActive?: boolean
}

export default function GameTable({
  sessionPlayers,
  roundPlayers = [],
  sessionBalances = {},
  onPlayerTap,
  isRoundActive = false,
}: GameTableProps) {
  const count = sessionPlayers.length

  // Responsive circle sizing
  const containerSize = 320
  const cx = containerSize / 2
  const cy = containerSize / 2
  const radius = count <= 4 ? 110 : count <= 6 ? 120 : 130

  const positions = distributeOnCircle(count, radius, cx, cy)

  function getRoundPlayer(playerId: string): RoundPlayer | undefined {
    return roundPlayers.find(rp => rp.player_id === playerId)
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: containerSize, height: containerSize }}>
        {/* Table */}
        <div
          className="absolute rounded-full border-4 border-[#2E2E2E] bg-[#1C1C1C]"
          style={{
            width: radius * 0.95,
            height: radius * 0.95,
            left: cx - (radius * 0.95) / 2,
            top: cy - (radius * 0.95) / 2,
          }}
        >
          <div className="flex flex-col items-center justify-center h-full">
            <span className="font-[family-name:var(--font-display)] text-[#D4A017] text-sm font-semibold leading-tight text-center">
              Schnauz
            </span>
            {isRoundActive && (
              <span className="text-[#9A9A9A] text-[10px] mt-0.5">Tippen zum Ausscheiden</span>
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
              className="absolute flex flex-col items-center gap-1 transform -translate-x-1/2 -translate-y-1/2 min-w-[56px]"
              style={{ left: pos.x, top: pos.y }}
            >
              <PlayerAvatar
                name={player.name}
                avatarUrl={player.avatar_url}
                size={52}
                eliminated={isEliminated}
                isWinner={isWinner}
              />
              <span
                className={`text-[10px] font-medium text-center leading-tight max-w-[60px] truncate
                  ${isEliminated ? 'text-[#9A9A9A] line-through' : 'text-[#F5F5F5]'}
                `}
              >
                {player.name}
              </span>
              {!isRoundActive && (
                <span className={`text-[10px] font-semibold ${getBalanceColor(balance)}`}>
                  {formatBalance(balance)}
                </span>
              )}
              {isRoundActive && isEliminated && (
                <span className="text-[10px] text-[#9A9A9A]">💀</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
