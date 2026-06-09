'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/hooks/useSession'
import GameTable from '@/components/ui/GameTable'
import RoundResultModal from '@/components/ui/RoundResultModal'
import SessionSummaryModal, { type SessionSummary } from '@/components/ui/SessionSummaryModal'
import PlayerAvatar from '@/components/ui/PlayerAvatar'
import Portal from '@/components/ui/Portal'
import { feedbackEliminate, feedbackRevive, feedbackWinner } from '@/lib/feedback'
import type { Season, Player, RoundPlayer, SessionPlayer } from '@/types/database'

const STAKE_OPTIONS = [
  { label: 'Standard', multiplier: 1 },
  { label: 'Double', multiplier: 2 },
  { label: 'Triple', multiplier: 3 },
  { label: 'Quattro', multiplier: 4 },
]

const DEFAULT_PLAYERS = ['Domi', 'Tom', 'André']

export default function SpielPage() {
  const router = useRouter()
  const supabase = createClient()
  const {
    session,
    sessionPlayers,
    activeRound,
    roundPlayers,
    loading,
    completedRound,
    startSession,
    addPlayerToSession,
    removePlayerFromSession,
    startRound,
    eliminatePlayer,
    revivePlayer,
    undoLast,
    canUndo,
    reopenLastRound,
    moveSeat,
    setDealer,
    dealerId,
    endSession,
    dismissCompletedRound,
    reload,
  } = useSession()

  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [defaultStake, setDefaultStake] = useState(3)
  const [selectedMultiplier, setSelectedMultiplier] = useState(1)
  const [customStake, setCustomStake] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [showPlayerManager, setShowPlayerManager] = useState(false)
  const [sessionBalances, setSessionBalances] = useState<Record<string, number>>({})
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())
  const [reviveTarget, setReviveTarget] = useState<string | null>(null)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)

  useEffect(() => {
    loadMeta()
  }, [])

  useEffect(() => {
    if (activeSeason) loadSeasonBalances()
  }, [activeSeason, session, completedRound, roundPlayers])

  // Winner feedback when a round completes
  useEffect(() => {
    if (completedRound) feedbackWinner()
  }, [completedRound])

  async function loadMeta() {
    const { data: seasons } = await supabase
      .from('seasons')
      .select('*')
      .eq('status', 'active')
      .limit(1)
    setActiveSeason(seasons?.[0] ?? null)

    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setAllPlayers(players || [])

    // Default selection: Domi, Tom, André (if they exist)
    const defaults = (players || []).filter(p => DEFAULT_PLAYERS.includes(p.name)).map(p => p.id)
    setPickedIds(new Set(defaults))

    const saved = localStorage.getItem('schnauz_default_stake')
    if (saved) setDefaultStake(parseInt(saved))
  }

  // Season-wide balance (carry-over + all sessions of the active season)
  async function loadSeasonBalances() {
    if (!activeSeason) return
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('season_id', activeSeason.id)

    const sessionIds = (sessions || []).map(s => s.id)
    if (sessionIds.length === 0) {
      setSessionBalances({})
      return
    }

    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .in('session_id', sessionIds)
      .eq('status', 'completed')

    const roundIds = (rounds || []).map(r => r.id)
    if (roundIds.length === 0) {
      setSessionBalances({})
      return
    }

    const { data: rps } = await supabase
      .from('round_players')
      .select('player_id, balance_change')
      .in('round_id', roundIds)

    const balances: Record<string, number> = {}
    for (const rp of rps || []) {
      if (rp.balance_change != null) {
        balances[rp.player_id] = (balances[rp.player_id] ?? 0) + rp.balance_change
      }
    }
    setSessionBalances(balances)
  }

  const effectiveStake = showCustomInput
    ? parseInt(customStake) || defaultStake
    : defaultStake * selectedMultiplier

  function togglePick(id: string) {
    setPickedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 9) next.add(id)
      return next
    })
  }

  async function handleStartSession() {
    if (!activeSeason || pickedIds.size < 2) return
    await startSession(activeSeason.id, [...pickedIds])
  }

  async function handleStartRound() {
    if (sessionPlayers.length < 2) return
    await startRound(effectiveStake)
  }

  async function handlePlayerTap(playerId: string) {
    if (!activeRound) return
    const rp = roundPlayers.find(r => r.player_id === playerId)
    if (!rp) return
    if (rp.is_active) {
      feedbackEliminate()
      await eliminatePlayer(playerId)
    } else {
      // Reviving requires choosing who revived this player
      setReviveTarget(playerId)
    }
  }

  async function buildSessionSummary(sessionId: string): Promise<SessionSummary> {
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'completed')
      .gt('round_number', 0)
    const roundIds = (rounds || []).map(r => r.id)
    if (roundIds.length === 0) return { rounds: 0, players: [] }

    const { data: rps } = await supabase
      .from('round_players')
      .select('player_id, balance_change, is_winner, player:players(id, name, avatar_url, is_active, created_at)')
      .in('round_id', roundIds)

    const map: Record<string, { player: Player; balance: number; wins: number }> = {}
    for (const rp of rps || []) {
      const p = rp.player as unknown as Player
      if (!p) continue
      if (!map[rp.player_id]) map[rp.player_id] = { player: p, balance: 0, wins: 0 }
      if (rp.balance_change != null) map[rp.player_id].balance += rp.balance_change
      if (rp.is_winner) map[rp.player_id].wins++
    }
    return { rounds: roundIds.length, players: Object.values(map).sort((a, b) => b.balance - a.balance) }
  }

  async function handleEndSession() {
    if (!session) return
    if (!confirm('Session wirklich beenden?')) return
    const summary = await buildSessionSummary(session.id)
    await endSession()
    setSessionSummary(summary)
    reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-[#7C7461]">Laden...</div>
      </div>
    )
  }

  // No active session → player picker
  if (!session) {
    return (
      <div className="flex flex-col max-w-md mx-auto w-full min-h-[85vh] px-4 pt-8 pb-6">
        <div className="text-center mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold text-[#23201A] tracking-tight">
            Stammtisch <span className="text-[#2E6B3A]">Schnauz</span>
          </h1>
          {activeSeason ? (
            <p className="text-[#7C7461] mt-1">{activeSeason.name}</p>
          ) : (
            <p className="text-[#C8443B] text-sm mt-2">Keine aktive Season — lege zuerst eine an.</p>
          )}
        </div>

        {activeSeason && (
          <>
            <p className="text-[#7C7461] text-xs uppercase tracking-wider mb-3 font-medium">
              Wer spielt mit? ({pickedIds.size})
            </p>
            <div className="grid grid-cols-3 gap-2.5 flex-1 content-start">
              {allPlayers.map(p => {
                const picked = pickedIds.has(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePick(p.id)}
                    className={`flex flex-col items-center gap-2 rounded-2xl py-4 border transition-all ${
                      picked
                        ? 'border-[#2E6B3A] bg-[#2E6B3A]/10'
                        : 'border-[#E4D9BF] bg-[#FBF6EA] opacity-60'
                    }`}
                  >
                    <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={56} />
                    <span className="text-[#23201A] text-xs font-medium truncate max-w-[80px]">{p.name}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleStartSession}
              disabled={pickedIds.size < 2}
              className="mt-6 w-full bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-40 text-white font-semibold rounded-2xl py-4 text-base transition-colors"
            >
              ▶ Session starten
            </button>
          </>
        )}

        {!activeSeason && (
          <button
            onClick={() => router.push('/seasons')}
            className="mt-6 w-full bg-[#2E6B3A] text-white font-semibold rounded-2xl py-4 transition-colors"
          >
            Zu den Seasons
          </button>
        )}

        {sessionSummary && (
          <SessionSummaryModal summary={sessionSummary} onClose={() => setSessionSummary(null)} />
        )}
      </div>
    )
  }

  // Active round
  if (activeRound) {
    return (
      <div className="flex flex-col min-h-[85vh] max-w-md mx-auto w-full">
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-display)] text-[#23201A] font-bold text-lg">
              Runde {activeRound.round_number}
            </span>
            <span className="text-[#2E6B3A] text-sm font-semibold bg-[#2E6B3A]/10 px-2 py-0.5 rounded-full">
              {activeRound.stake} €
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={undoLast}
              disabled={!canUndo}
              className="h-9 px-3 flex items-center gap-1 rounded-full text-sm font-medium transition-colors disabled:opacity-35 bg-[#FBF6EA] border border-[#E4D9BF] text-[#23201A]"
            >
              ↩ Rückgängig
            </button>
            <button
              onClick={() => router.push('/einstellungen')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#7C7461] text-lg transition-colors"
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <GameTable
            sessionPlayers={sessionPlayers}
            roundPlayers={roundPlayers}
            onPlayerTap={handlePlayerTap}
            isRoundActive={true}
            dealerId={dealerId}
          />
        </div>

        <div className="px-4 pb-4 text-center text-[#7C7461] text-sm">
          💡 Spieler antippen zum Ausscheiden / Wiederbeleben
        </div>

        {reviveTarget && (
          <ReviveModal
            revivedName={roundPlayers.find(r => r.player_id === reviveTarget)?.player?.name ?? ''}
            candidates={roundPlayers.filter(r => r.is_active && r.player_id !== reviveTarget)}
            onPick={async reviverId => {
              const target = reviveTarget
              setReviveTarget(null)
              if (target) {
                feedbackRevive()
                await revivePlayer(target, reviverId)
              }
            }}
            onClose={() => setReviveTarget(null)}
          />
        )}
      </div>
    )
  }

  // Between rounds
  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <span className="font-[family-name:var(--font-display)] text-[#23201A] font-bold text-lg">
          {activeSeason?.name ?? 'Session'}
        </span>
        <button
          onClick={() => router.push('/einstellungen')}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FFFDF7] text-[#7C7461] text-lg transition-colors"
        >
          ⚙
        </button>
      </div>

      {/* Table */}
      <div className="flex justify-center px-4 py-2">
        <GameTable
          sessionPlayers={sessionPlayers}
          sessionBalances={sessionBalances}
          isRoundActive={false}
          dealerId={dealerId}
        />
      </div>

      {/* Dealer + player management */}
      <div className="px-4 mb-4 space-y-2">
        <div className="flex items-center justify-center gap-1.5 text-sm text-[#7C7461]">
          <span>🃏 Geber:</span>
          <span className="font-semibold text-[#23201A]">
            {sessionPlayers.find(sp => sp.player_id === dealerId)?.player?.name ?? '—'}
          </span>
        </div>
        <button
          onClick={() => setShowPlayerManager(true)}
          className="w-full bg-[#FBF6EA] border border-[#E4D9BF] text-[#23201A] rounded-2xl py-3 text-sm font-medium hover:border-[#2E6B3A]/50 transition-colors"
        >
          👥 Spieler & Sitzordnung
        </button>
      </div>

      {/* Stake selection */}
      <div className="px-4 mb-4">
        <p className="text-[#7C7461] text-xs mb-2 font-medium uppercase tracking-wider">Einsatz wählen</p>
        <div className="flex gap-2 flex-wrap">
          {STAKE_OPTIONS.map(opt => {
            const amount = defaultStake * opt.multiplier
            const isSelected = !showCustomInput && selectedMultiplier === opt.multiplier
            return (
              <button
                key={opt.multiplier}
                onClick={() => { setSelectedMultiplier(opt.multiplier); setShowCustomInput(false) }}
                className={`flex-1 min-w-[60px] rounded-xl py-3 text-sm font-semibold transition-colors border
                  ${isSelected
                    ? 'bg-[#2E6B3A] border-[#2E6B3A] text-white'
                    : 'bg-[#FBF6EA] border-[#E4D9BF] text-[#23201A]'
                  }`}
              >
                {amount} €
              </button>
            )
          })}
          <button
            onClick={() => setShowCustomInput(true)}
            className={`flex-1 min-w-[44px] rounded-xl py-3 text-sm font-semibold transition-colors border
              ${showCustomInput
                ? 'bg-[#2E6B3A] border-[#2E6B3A] text-white'
                : 'bg-[#FBF6EA] border-[#E4D9BF] text-[#7C7461]'
              }`}
          >
            ✏️
          </button>
        </div>

        {showCustomInput && (
          <input
            type="number"
            min="1"
            step="1"
            value={customStake}
            onChange={e => setCustomStake(e.target.value)}
            placeholder="Eigener Einsatz (€)"
            className="mt-2 w-full bg-[#FBF6EA] border border-[#2E6B3A] rounded-xl px-4 py-3 text-[#23201A] outline-none text-sm"
            autoFocus
          />
        )}
      </div>

      {/* Actions */}
      <div className="px-4 space-y-2 pb-4">
        <button
          onClick={handleStartRound}
          disabled={sessionPlayers.length < 2}
          className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-50 text-white font-semibold rounded-2xl py-4 text-base transition-colors"
        >
          ▶ Neue Runde starten · {effectiveStake} €
        </button>
        <button
          onClick={handleEndSession}
          className="w-full bg-[#FBF6EA] border border-[#E4D9BF] hover:bg-[#FFFDF7] text-[#7C7461] font-medium rounded-2xl py-3 text-sm transition-colors"
        >
          Session beenden
        </button>
      </div>

      {showPlayerManager && (
        <PlayerManagerOverlay
          sessionPlayers={sessionPlayers}
          allPlayers={allPlayers}
          dealerId={dealerId}
          onAdd={addPlayerToSession}
          onRemove={removePlayerFromSession}
          onMove={moveSeat}
          onSetDealer={setDealer}
          onClose={() => setShowPlayerManager(false)}
        />
      )}

      {completedRound && (
        <RoundResultModal
          winnerId={completedRound.winnerId}
          players={completedRound.players}
          sessionBalances={sessionBalances}
          onNewRound={dismissCompletedRound}
          onUndo={reopenLastRound}
          onManagePlayers={() => {
            dismissCompletedRound()
            setShowPlayerManager(true)
          }}
        />
      )}

      {sessionSummary && (
        <SessionSummaryModal summary={sessionSummary} onClose={() => setSessionSummary(null)} />
      )}
    </div>
  )
}

function PlayerManagerOverlay({
  sessionPlayers,
  allPlayers,
  dealerId,
  onAdd,
  onRemove,
  onMove,
  onSetDealer,
  onClose,
}: {
  sessionPlayers: SessionPlayer[]
  allPlayers: Player[]
  dealerId: string | null
  onAdd: (playerId: string) => Promise<void>
  onRemove: (sessionPlayerId: string) => Promise<void>
  onMove: (sessionPlayerId: string, dir: -1 | 1) => Promise<void>
  onSetDealer: (playerId: string) => Promise<void>
  onClose: () => void
}) {
  const activeIds = new Set(sessionPlayers.map(sp => sp.player_id))
  const others = allPlayers.filter(p => !activeIds.has(p.id))
  const canAdd = sessionPlayers.length < 9

  return (
    <Portal>
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[82vh] flex flex-col animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4D9BF]">
          <h2 className="font-[family-name:var(--font-display)] font-bold text-[#23201A]">Spieler & Sitzordnung</h2>
          <button onClick={onClose} className="text-[#7C7461] text-2xl leading-none w-8 h-8">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3">
          <p className="text-[#7C7461] text-[10px] uppercase tracking-wider mb-2 font-medium px-1">Am Tisch · Reihenfolge & Geber</p>
          <div className="space-y-1.5 mb-4">
            {sessionPlayers.map((sp, i) => {
              const isDealer = sp.player_id === dealerId
              return (
                <div key={sp.id} className="flex items-center gap-2 py-1.5 px-2 bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl">
                  <div className="flex flex-col">
                    <button
                      onClick={() => i > 0 && onMove(sp.id, -1)}
                      disabled={i === 0}
                      className="text-[#7C7461] text-xs leading-none disabled:opacity-30 px-1"
                      aria-label="nach oben"
                    >▲</button>
                    <button
                      onClick={() => i < sessionPlayers.length - 1 && onMove(sp.id, 1)}
                      disabled={i === sessionPlayers.length - 1}
                      className="text-[#7C7461] text-xs leading-none disabled:opacity-30 px-1"
                      aria-label="nach unten"
                    >▼</button>
                  </div>
                  <PlayerAvatar name={sp.player?.name ?? ''} avatarUrl={sp.player?.avatar_url} size={34} />
                  <span className="text-[#23201A] flex-1 text-sm truncate">{sp.player?.name}</span>
                  <button
                    onClick={() => onSetDealer(sp.player_id)}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${
                      isDealer ? 'bg-[#2E6B3A] text-white' : 'bg-[#E4D9BF]/60 text-[#7C7461]'
                    }`}
                  >
                    {isDealer ? '🃏 Geber' : 'Geber'}
                  </button>
                  <button
                    onClick={() => onRemove(sp.id)}
                    className="text-[#C8443B] text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#C8443B]/10"
                  >
                    Entfernen
                  </button>
                </div>
              )
            })}
          </div>

          {others.length > 0 && (
            <>
              <p className="text-[#7C7461] text-[10px] uppercase tracking-wider mb-2 font-medium px-1">Weitere Spieler</p>
              <div className="space-y-1.5">
                {others.map(p => (
                  <div key={p.id} className="flex items-center gap-3 py-1.5 px-2">
                    <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={34} eliminated />
                    <span className="text-[#7C7461] flex-1 text-sm">{p.name}</span>
                    <button
                      onClick={() => canAdd && onAdd(p.id)}
                      disabled={!canAdd}
                      className="text-[#1F9D57] text-sm font-medium px-3 py-1.5 rounded-lg bg-[#1F9D57]/10 disabled:opacity-40"
                    >
                      Hinzufügen
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#E4D9BF]">
          <button onClick={onClose} className="w-full bg-[#2E6B3A] text-white font-semibold rounded-2xl py-3">
            Fertig
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}

function ReviveModal({
  revivedName,
  candidates,
  onPick,
  onClose,
}: {
  revivedName: string
  candidates: RoundPlayer[]
  onPick: (reviverId: string) => void
  onClose: () => void
}) {
  return (
    <Portal>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
        <div
          className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[80vh] flex flex-col animate-pop-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-[#E4D9BF]">
            <h2 className="font-[family-name:var(--font-display)] font-bold text-[#23201A]">
              {revivedName} wiederbeleben
            </h2>
            <p className="text-[#7C7461] text-sm mt-0.5">Wer hat sich vergeben?</p>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
            {candidates.length === 0 ? (
              <p className="text-[#7C7461] text-sm text-center py-4">Keine möglichen Wiederbeleber</p>
            ) : (
              candidates.map(c => (
                <button
                  key={c.player_id}
                  onClick={() => onPick(c.player_id)}
                  className="w-full flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-[#FFFDF7] transition-colors"
                >
                  <PlayerAvatar name={c.player?.name ?? ''} avatarUrl={c.player?.avatar_url} size={36} />
                  <span className="text-[#23201A] flex-1 text-left">{c.player?.name}</span>
                  <span className="text-[#2E6B3A] text-sm font-medium">wählen</span>
                </button>
              ))
            )}
          </div>
          <div className="px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#E4D9BF]">
            <button onClick={onClose} className="w-full bg-[#FFFDF7] border border-[#E4D9BF] text-[#7C7461] font-medium rounded-2xl py-3">
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
