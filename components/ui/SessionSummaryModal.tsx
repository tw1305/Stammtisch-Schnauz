'use client'

import Portal from './Portal'
import PlayerAvatar from './PlayerAvatar'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import type { Player } from '@/types/database'

export type SessionSummary = {
  rounds: number
  players: { player: Player; balance: number; wins: number }[]
}

export default function SessionSummaryModal({
  summary,
  onClose,
}: {
  summary: SessionSummary
  onClose: () => void
}) {
  return (
    <Portal>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
        <div
          className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[85vh] flex flex-col animate-pop-in"
          onClick={e => e.stopPropagation()}
        >
          <div
            className="px-5 py-6 text-center border-b border-[#E4D9BF]"
            style={{ background: 'linear-gradient(160deg, rgba(46,107,58,0.16), rgba(255,253,247,0.6))' }}
          >
            <div className="text-4xl mb-1.5">🍻</div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A]">
              Session beendet
            </h2>
            <p className="text-[#7C7461] text-sm mt-1">
              {summary.rounds} {summary.rounds === 1 ? 'Runde' : 'Runden'} gespielt
            </p>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-3">
            {summary.players.length === 0 ? (
              <p className="text-[#7C7461] text-sm text-center py-6">Keine gespielten Runden in dieser Session.</p>
            ) : (
              <div className="space-y-1.5">
                {summary.players.map(p => (
                  <div key={p.player.id} className="flex items-center gap-3 px-2 py-2">
                    <PlayerAvatar name={p.player.name} avatarUrl={p.player.avatar_url} size={38} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#23201A] font-medium truncate">{p.player.name}</p>
                      <p className="text-[#7C7461] text-xs">{p.wins} {p.wins === 1 ? 'Sieg' : 'Siege'}</p>
                    </div>
                    <span className={`font-bold ${getBalanceColor(p.balance)}`}>{formatBalance(p.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-[#E4D9BF]">
            <button onClick={onClose} className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] text-white font-semibold rounded-2xl py-3.5 transition-colors">
              Fertig
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
