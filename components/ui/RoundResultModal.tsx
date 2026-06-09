'use client'

import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import type { RoundPlayer } from '@/types/database'

type Props = {
  winnerId: string
  players: RoundPlayer[]
  sessionBalances: Record<string, number>
  onNewRound: () => void
  onManagePlayers: () => void
  onUndo?: () => void
}

export default function RoundResultModal({
  winnerId,
  players,
  sessionBalances,
  onNewRound,
  onManagePlayers,
  onUndo,
}: Props) {
  const winner = players.find(p => p.player_id === winnerId)
  const winnerName = winner?.player?.name ?? 'Unbekannt'
  const winnerGain = winner?.balance_change ?? 0

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-end justify-center z-[60] p-4 pb-24 animate-fade-in">
      <div className="w-full max-w-sm bg-[#FBF6EA] rounded-3xl border border-[#E4D9BF] overflow-hidden shadow-2xl animate-pop-in">
        {/* Header */}
        <div className="px-5 py-6 text-center border-b border-[#E4D9BF] relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(46,107,58,0.16), rgba(255,253,247,0.6))' }}
        >
          <div className="text-4xl mb-1.5">🏆</div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A]">
            {winnerName} gewinnt!
          </h2>
          <p className="text-[#1F9D57] font-bold text-lg mt-1">
            {formatBalance(winnerGain)} in dieser Runde
          </p>
        </div>

        {/* Session Standings */}
        <div className="px-5 py-4">
          <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">
            Saison-Stand
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
                    <span className="text-[#23201A] text-sm">
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
            className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] text-white font-semibold rounded-xl py-3 transition-colors"
          >
            ▶ Neue Runde
          </button>
          <button
            onClick={onManagePlayers}
            className="w-full bg-[#FFFDF7] hover:bg-[#E4D9BF] text-[#23201A] font-medium rounded-xl py-3 transition-colors"
          >
            👥 Spielerverwaltung
          </button>
          {onUndo && (
            <button
              onClick={onUndo}
              className="w-full text-[#7C7461] hover:text-[#C8443B] text-sm font-medium py-2 transition-colors"
            >
              ↩ Versehen? Runde rückgängig machen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
