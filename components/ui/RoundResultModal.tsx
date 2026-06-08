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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-end justify-center z-50 p-4 pb-24 animate-fade-in">
      <div className="w-full max-w-sm bg-[#141925] rounded-3xl border border-[#2A3344] overflow-hidden shadow-2xl animate-pop-in">
        {/* Header */}
        <div className="px-5 py-6 text-center border-b border-[#2A3344] relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(99,102,241,0.22), rgba(27,34,48,0.4))' }}
        >
          <div className="text-4xl mb-1.5">🏆</div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#F1F5F9]">
            {winnerName} gewinnt!
          </h2>
          <p className="text-[#34D399] font-bold text-lg mt-1">
            {formatBalance(winnerGain)} in dieser Runde
          </p>
        </div>

        {/* Session Standings */}
        <div className="px-5 py-4">
          <p className="text-[#8B95A7] text-xs uppercase tracking-wider mb-3 font-medium">
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
                    <span className="text-[#F1F5F9] text-sm">
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
            className="w-full bg-[#6366F1] hover:bg-[#818CF8] text-white font-semibold rounded-xl py-3 transition-colors"
          >
            ▶ Neue Runde
          </button>
          <button
            onClick={onManagePlayers}
            className="w-full bg-[#1B2230] hover:bg-[#2A3344] text-[#F1F5F9] font-medium rounded-xl py-3 transition-colors"
          >
            👥 Spielerverwaltung
          </button>
        </div>
      </div>
    </div>
  )
}
