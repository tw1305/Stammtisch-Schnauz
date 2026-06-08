'use client'

import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import type { RoundPlayer } from '@/types/database'

type Props = {
  winnerId: string
  players: RoundPlayer[]
  sessionBalances: Record<string, number>
  onNewRound: () => void
  onManagePlayers: () => void
}

export default function RoundResultModal({
  winnerId,
  players,
  sessionBalances,
  onNewRound,
  onManagePlayers,
}: Props) {
  const winner = players.find(p => p.player_id === winnerId)
  const winnerName = winner?.player?.name ?? 'Unbekannt'
  const winnerGain = winner?.balance_change ?? 0

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-4 pb-24">
      <div className="w-full max-w-sm bg-[#1C1C1C] rounded-2xl border border-[#2E2E2E] overflow-hidden">
        {/* Header */}
        <div className="bg-[#242424] px-5 py-5 text-center border-b border-[#2E2E2E]">
          <div className="text-3xl mb-1">🏆</div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#F5F5F5]">
            {winnerName} gewinnt!
          </h2>
          <p className="text-[#22C55E] font-semibold text-lg mt-0.5">
            {formatBalance(winnerGain)} in dieser Runde
          </p>
        </div>

        {/* Session Standings */}
        <div className="px-5 py-4">
          <p className="text-[#9A9A9A] text-xs uppercase tracking-wider mb-3 font-medium">
            Session-Stand
          </p>
          <div className="space-y-2">
            {players
              .sort((a, b) => (sessionBalances[b.player_id] ?? 0) - (sessionBalances[a.player_id] ?? 0))
              .map(rp => {
                const bal = sessionBalances[rp.player_id] ?? 0
                return (
                  <div
                    key={rp.player_id}
                    className="flex items-center justify-between"
                  >
                    <span className="text-[#F5F5F5] text-sm">
                      {rp.player?.name ?? ''}
                      {rp.player_id === winnerId && ' 👑'}
                    </span>
                    <span className={`text-sm font-semibold ${getBalanceColor(bal)}`}>
                      {formatBalance(bal)}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={onNewRound}
            className="w-full bg-[#D62839] hover:bg-[#E8364A] text-[#111111] font-semibold rounded-xl py-3 transition-colors"
          >
            ▶ Neue Runde
          </button>
          <button
            onClick={onManagePlayers}
            className="w-full bg-[#242424] hover:bg-[#2E2E2E] text-[#F5F5F5] font-medium rounded-xl py-3 transition-colors"
          >
            👥 Spielerverwaltung
          </button>
        </div>
      </div>
    </div>
  )
}
