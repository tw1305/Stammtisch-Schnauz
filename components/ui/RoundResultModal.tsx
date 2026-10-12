'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import PlayerAvatar from './PlayerAvatar'
import GhostBurst, { type GhostWave } from './GhostBurst'
import { formatBalance, getBalanceColor } from '@/lib/game-logic'
import { animationsEnabled } from '@/lib/feedback'
import { ON_FIRE_STREAK } from '@/lib/stats'
import type { RoundPlayer } from '@/types/database'

type Props = {
  winnerId: string
  /** Winner's streak including this round: 1 gold ring, 2 glowing ring, 3+ flames. */
  winnerStreak: number
  players: RoundPlayer[]
  sessionBalances: Record<string, number>
  onNewRound: () => void
  onManagePlayers: () => void
  onEndSession: () => void
  onUndo?: () => void
}

/**
 * Round result. Sequence (when animations are on):
 *  1. award – the winner's portrait appears big in the middle of the screen and
 *     receives its gold ring / glowing ring / flames with an animation;
 *  2. fly   – the portrait flies to its spot at the top of the result card while
 *     the card fades in around it;
 *  3. done  – the full overview.
 */
type Phase = 'award' | 'fly' | 'done'
const AWARD_MS = 2000
const FLY_MS = 750
const AVATAR = 128
/** "Aus dem Jenseits": a burst during the award, a smaller one once the portrait has landed. */
const GHOST_WAVES: GhostWave[] = [
  { delay: 0.6, count: 7 },
  { delay: (AWARD_MS + FLY_MS) / 1000 + 0.2, count: 4 },
]

function streakText(streak: number): string | null {
  if (streak >= ON_FIRE_STREAK) return `🔥 ${streak} Siege in Folge – On Fire!`
  if (streak === 2) return '✨ 2 Siege in Folge – der Ring glüht!'
  return null
}

export default function RoundResultModal({
  winnerId,
  winnerStreak,
  players,
  sessionBalances,
  onNewRound,
  onManagePlayers,
  onEndSession,
  onUndo,
}: Props) {
  const winner = players.find(p => p.player_id === winnerId)
  const winnerName = winner?.player?.name ?? 'Unbekannt'
  const winnerGain = winner?.balance_change ?? 0
  const streakLine = streakText(winnerStreak)
  // Won "aus dem Jenseits": eliminated, revived, and then won the round.
  const comeback = !!winner?.was_revived

  const [animated] = useState(() => animationsEnabled())
  const [phase, setPhase] = useState<Phase>(animated ? 'award' : 'done')
  const [offset, setOffset] = useState<{ x: number; y: number; s: number } | null>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  // Measure where the portrait sits in the card, then start it from the screen centre.
  useLayoutEffect(() => {
    if (!animated) return
    const el = avatarRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const s = Math.min(1.9, (Math.min(window.innerWidth, window.innerHeight) * 0.48) / r.width)
    setOffset({
      x: window.innerWidth / 2 - (r.left + r.width / 2),
      y: window.innerHeight * 0.42 - (r.top + r.height / 2),
      s,
    })
    const t1 = setTimeout(() => setPhase('fly'), AWARD_MS)
    const t2 = setTimeout(() => setPhase('done'), AWARD_MS + FLY_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [animated])

  const award = phase === 'award'
  const fade = `transition-opacity duration-500 ${award ? 'opacity-0' : 'opacity-100'}`
  const avatarStyle: React.CSSProperties =
    award && offset
      ? { transform: `translate(${offset.x}px, ${offset.y}px) scale(${offset.s})`, transition: 'none' }
      : award
        ? { opacity: 0 } // until measured (same frame, before paint)
        : { transform: 'none', transition: `transform ${FLY_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` }

  const standings = [...players].sort(
    (a, b) => (sessionBalances[b.player_id] ?? 0) - (sessionBalances[a.player_id] ?? 0)
  )

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-3 animate-fade-in">
      {/* Award caption under the big portrait */}
      {animated && offset && (
        <div
          className={`fixed left-0 right-0 text-center pointer-events-none z-[2] transition-opacity duration-300 ${award ? 'opacity-100' : 'opacity-0'}`}
          style={{ top: window.innerHeight * 0.42 + (AVATAR * offset.s) / 2 + 22 }}
        >
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-white drop-shadow-lg">{winnerName} gewinnt!</p>
          {comeback && <p className="text-[#DCE8FF] font-semibold mt-1 drop-shadow">👻 Aus dem Jenseits!</p>}
          {streakLine && <p className="text-[#FFD86B] font-semibold mt-1 drop-shadow">{streakLine}</p>}
        </div>
      )}

      <div
        className={`relative w-full max-w-md max-h-[calc(100dvh-1.5rem)] flex flex-col rounded-3xl border transition-[background-color,border-color,box-shadow] duration-500 ${
          award ? 'bg-transparent border-transparent' : 'bg-[#FBF6EA] border-[#E4D9BF] shadow-2xl'
        }`}
      >
        {/* Header with the winner's portrait */}
        <div className="relative px-5 pt-12 pb-6 text-center shrink-0">
          <div
            className={`absolute inset-0 rounded-t-3xl ${fade}`}
            style={{ background: 'linear-gradient(160deg, rgba(212,175,55,0.28), rgba(255,253,247,0.6))' }}
          />
          <div ref={avatarRef} className="relative mx-auto w-fit z-[1]" style={avatarStyle}>
            <div className={`relative ${animated ? 'award-pop' : ''}`}>
              {/* Behind the portrait (and its ring/flames): ghosts escaping past the rim */}
              {comeback && animated && <GhostBurst size={AVATAR} waves={GHOST_WAVES} />}
              <PlayerAvatar
                name={winnerName}
                avatarUrl={winner?.player?.avatar_url}
                size={AVATAR}
                birthday={winner?.player?.birthday}
                winStreak={winnerStreak}
                ringAppear={animated}
                ringDelay={0.45}
              />
            </div>
          </div>
          <div className={`relative ${fade}`}>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#23201A] mt-4">
              🏆 {winnerName} gewinnt!
            </h2>
            <p className="text-[#1F9D57] font-bold text-lg mt-1">{formatBalance(winnerGain)} in dieser Runde</p>
            {comeback && <p className="text-[#4B5D86] font-semibold text-sm mt-1">👻 Aus dem Jenseits!</p>}
            {streakLine && <p className="text-[#9A6A0C] font-semibold text-sm mt-1">{streakLine}</p>}
          </div>
        </div>

        {/* Season standings */}
        <div className={`px-5 py-4 border-t border-[#E4D9BF] overflow-y-auto min-h-0 flex-1 ${fade}`}>
          <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">Saison-Stand</p>
          <div className="space-y-2.5">
            {standings.map(rp => {
              const bal = sessionBalances[rp.player_id] ?? 0
              return (
                <div key={rp.player_id} className="flex items-center gap-3">
                  <PlayerAvatar name={rp.player?.name ?? ''} avatarUrl={rp.player?.avatar_url} size={32} />
                  <span className="text-[#23201A] flex-1 truncate">
                    {rp.player?.name ?? ''}
                    {rp.player_id === winnerId && ' 👑'}
                  </span>
                  <span className={`font-semibold tabular-nums ${getBalanceColor(bal)}`}>{formatBalance(bal)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className={`px-5 pt-3 pb-5 space-y-2 border-t rounded-b-3xl border-[#E4D9BF] shrink-0 ${fade}`}>
          <button
            onClick={onNewRound}
            disabled={phase !== 'done'}
            className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] text-white font-semibold rounded-xl py-3.5 transition-colors"
          >
            ▶ Neue Runde
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onManagePlayers}
              disabled={phase !== 'done'}
              className="w-full bg-[#FFFDF7] border border-[#E4D9BF] hover:bg-[#E4D9BF] text-[#23201A] font-medium rounded-xl py-3 transition-colors text-sm"
            >
              👥 Spieler
            </button>
            <button
              onClick={onEndSession}
              disabled={phase !== 'done'}
              className="w-full bg-[#B85C1E]/10 border border-[#B85C1E]/50 hover:bg-[#B85C1E]/20 text-[#9A4A15] font-semibold rounded-xl py-3 transition-colors text-sm"
            >
              🏁 Session beenden
            </button>
          </div>
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={phase !== 'done'}
              className="w-full text-[#7C7461] hover:text-[#C8443B] text-sm font-medium py-1.5 transition-colors"
            >
              ↩ Versehen? Runde rückgängig machen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
