'use client'

import { useState } from 'react'
import Portal from './Portal'
import PlayerAvatar from './PlayerAvatar'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import type { Player } from '@/types/database'
import type { SessionSummary } from './SessionSummaryModal'

export type SeasonSummary = {
  name: string
  startDate?: string | null
  players: { player: Player; total: number }[]
}

const MEDALS = ['🥇', '🥈', '🥉']

function medalColor(i: number): string | null {
  if (i === 0) return '#D4AF37'
  if (i === 1) return '#9CA3AA'
  if (i === 2) return '#B87333'
  return null
}

export default function SessionEndModal({
  sessionSummary,
  seasonSummary,
  onClose,
}: {
  sessionSummary: SessionSummary
  seasonSummary: SeasonSummary | null
  onClose: () => void
}) {
  const hasSeason = !!seasonSummary
  const [view, setView] = useState<'session' | 'season'>('session')

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
        <div
          className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[88vh] flex flex-col animate-pop-in"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-5 pt-6 pb-4 text-center border-b border-[#E4D9BF]"
            style={{ background: 'linear-gradient(160deg, rgba(46,107,58,0.16), rgba(255,253,247,0.6))' }}
          >
            <div className="text-4xl mb-1.5">🍻</div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#23201A]">Session beendet</h2>

            {hasSeason && (
              <div className="mt-3 inline-flex bg-[#F4ECDA] border border-[#E4D9BF] rounded-full p-0.5">
                <button
                  onClick={() => setView('session')}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    view === 'session' ? 'bg-[#2E6B3A] text-white' : 'text-[#7C7461]'
                  }`}
                >
                  Session
                </button>
                <button
                  onClick={() => setView('season')}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    view === 'season' ? 'bg-[#2E6B3A] text-white' : 'text-[#7C7461]'
                  }`}
                >
                  Saison
                </button>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-4 py-3">
            {view === 'season' && seasonSummary ? (
              <SeasonView summary={seasonSummary} />
            ) : (
              <SessionView summary={sessionSummary} />
            )}
          </div>

          <div className="px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-[#E4D9BF]">
            <button
              onClick={onClose}
              className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] text-white font-semibold rounded-2xl py-3.5 transition-colors"
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function SessionView({ summary }: { summary: SessionSummary }) {
  return (
    <>
      <p className="text-center text-[#7C7461] text-sm mb-3">
        {summary.rounds} {summary.rounds === 1 ? 'Runde' : 'Runden'} in dieser Session
      </p>
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
    </>
  )
}

/** Clean, ranked season standings — laid out to make a nice screenshot. */
function SeasonView({ summary }: { summary: SeasonSummary }) {
  return (
    <div className="rounded-2xl border border-[#E4D9BF] bg-[#FFFDF7] overflow-hidden">
      <div className="text-center px-4 pt-4 pb-3 border-b border-[#E4D9BF]">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold text-[#23201A] tracking-tight">
          {summary.name}
        </p>
        <p className="text-[#7C7461] text-[11px] uppercase tracking-wider mt-0.5">
          Saisonbilanz · Stammtisch Schnauz
        </p>
      </div>
      {summary.players.length === 0 ? (
        <p className="text-[#7C7461] text-sm text-center py-6">Noch keine Daten</p>
      ) : (
        summary.players.map((p, i) => {
          const medal = medalColor(i)
          return (
            <div
              key={p.player.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-[#E4D9BF] last:border-0"
            >
              <span className="w-6 text-center font-bold text-sm" style={{ color: medal ?? '#7C7461' }}>
                {i < 3 ? MEDALS[i] : i + 1}
              </span>
              <PlayerAvatar name={p.player.name} avatarUrl={p.player.avatar_url} size={30} />
              <span className="text-[#23201A] flex-1 truncate">{p.player.name}</span>
              <span className={`font-bold ${getBalanceColor(p.total)}`}>{formatBalance(p.total)}</span>
            </div>
          )
        })
      )}
    </div>
  )
}
