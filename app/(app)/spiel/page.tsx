'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/hooks/useSession'
import GameTable from '@/components/ui/GameTable'
import RoundResultModal from '@/components/ui/RoundResultModal'
import PlayerAvatar from '@/components/ui/PlayerAvatar'
import Portal from '@/components/ui/Portal'
import type { Season, Player } from '@/types/database'

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

  useEffect(() => {
    loadMeta()
  }, [])

  useEffect(() => {
    if (session) loadSessionBalances()
  }, [session, completedRound])

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

  async function loadSessionBalances() {
    if (!session) return
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('session_id', session.id)
      .eq('status', 'completed')

    if (!rounds || rounds.length === 0) {
      setSessionBalances({})
      return
    }

    const roundIds = rounds.map(r => r.id)
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
    await eliminatePlayer(playerId)
  }

  async function handleEndSession() {
    if (!confirm('Session wirklich beenden?')) return
    await endSession()
    reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-[#8B95A7]">Laden...</div>
      </div>
    )
  }

  // No active session → player picker
  if (!session) {
    return (
      <div className="flex flex-col max-w-md mx-auto w-full min-h-[85vh] px-4 pt-8 pb-6">
        <div className="text-center mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold text-[#F1F5F9] tracking-tight">
            Stammtisch <span className="text-[#6366F1]">Schnauz</span>
          </h1>
          {activeSeason ? (
            <p className="text-[#8B95A7] mt-1">{activeSeason.name}</p>
          ) : (
            <p className="text-[#F87171] text-sm mt-2">Keine aktive Season — lege zuerst eine an.</p>
          )}
        </div>

        {activeSeason && (
          <>
            <p className="text-[#8B95A7] text-xs uppercase tracking-wider mb-3 font-medium">
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
                        ? 'border-[#6366F1] bg-[#6366F1]/10'
                        : 'border-[#2A3344] bg-[#141925] opacity-60'
                    }`}
                  >
                    <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={56} />
                    <span className="text-[#F1F5F9] text-xs font-medium truncate max-w-[80px]">{p.name}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleStartSession}
              disabled={pickedIds.size < 2}
              className="mt-6 w-full bg-[#6366F1] hover:bg-[#818CF8] disabled:opacity-40 text-white font-semibold rounded-2xl py-4 text-base transition-colors"
            >
              ▶ Session starten
            </button>
          </>
        )}

        {!activeSeason && (
          <button
            onClick={() => router.push('/seasons')}
            className="mt-6 w-full bg-[#6366F1] text-white font-semibold rounded-2xl py-4 transition-colors"
          >
            Zu den Seasons
          </button>
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
            <span className="font-[family-name:var(--font-display)] text-[#F1F5F9] font-bold text-lg">
              Runde {activeRound.round_number}
            </span>
            <span className="text-[#6366F1] text-sm font-semibold bg-[#6366F1]/10 px-2 py-0.5 rounded-full">
              {activeRound.stake} €
            </span>
          </div>
          <button
            onClick={() => router.push('/einstellungen')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#1B2230] text-[#8B95A7] text-lg transition-colors"
          >
            ⚙
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <GameTable
            sessionPlayers={sessionPlayers}
            roundPlayers={roundPlayers}
            onPlayerTap={handlePlayerTap}
            isRoundActive={true}
          />
        </div>

        <div className="px-4 pb-4 text-center text-[#8B95A7] text-sm">
          💡 Spieler antippen zum Ausscheiden / Wiederbeleben
        </div>
      </div>
    )
  }

  // Between rounds
  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <span className="font-[family-name:var(--font-display)] text-[#F1F5F9] font-bold text-lg">
          {activeSeason?.name ?? 'Session'}
        </span>
        <button
          onClick={() => router.push('/einstellungen')}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#1B2230] text-[#8B95A7] text-lg transition-colors"
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
        />
      </div>

      {/* Player management */}
      <div className="px-4 mb-4">
        <button
          onClick={() => setShowPlayerManager(true)}
          className="w-full bg-[#141925] border border-[#2A3344] text-[#F1F5F9] rounded-2xl py-3 text-sm font-medium hover:border-[#6366F1]/50 transition-colors"
        >
          👥 Spieler hinzufügen / entfernen
        </button>
      </div>

      {/* Stake selection */}
      <div className="px-4 mb-4">
        <p className="text-[#8B95A7] text-xs mb-2 font-medium uppercase tracking-wider">Einsatz wählen</p>
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
                    ? 'bg-[#6366F1] border-[#6366F1] text-white'
                    : 'bg-[#141925] border-[#2A3344] text-[#F1F5F9]'
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
                ? 'bg-[#6366F1] border-[#6366F1] text-white'
                : 'bg-[#141925] border-[#2A3344] text-[#8B95A7]'
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
            className="mt-2 w-full bg-[#141925] border border-[#6366F1] rounded-xl px-4 py-3 text-[#F1F5F9] outline-none text-sm"
            autoFocus
          />
        )}
      </div>

      {/* Actions */}
      <div className="px-4 space-y-2 pb-4">
        <button
          onClick={handleStartRound}
          disabled={sessionPlayers.length < 2}
          className="w-full bg-[#6366F1] hover:bg-[#818CF8] disabled:opacity-50 text-white font-semibold rounded-2xl py-4 text-base transition-colors"
        >
          ▶ Neue Runde starten · {effectiveStake} €
        </button>
        <button
          onClick={handleEndSession}
          className="w-full bg-[#141925] border border-[#2A3344] hover:bg-[#1B2230] text-[#8B95A7] font-medium rounded-2xl py-3 text-sm transition-colors"
        >
          Session beenden
        </button>
      </div>

      {showPlayerManager && (
        <PlayerManagerOverlay
          sessionPlayers={sessionPlayers}
          allPlayers={allPlayers}
          onAdd={addPlayerToSession}
          onRemove={removePlayerFromSession}
          onClose={() => setShowPlayerManager(false)}
        />
      )}

      {completedRound && (
        <RoundResultModal
          winnerId={completedRound.winnerId}
          players={completedRound.players}
          sessionBalances={sessionBalances}
          onNewRound={dismissCompletedRound}
          onManagePlayers={() => {
            dismissCompletedRound()
            setShowPlayerManager(true)
          }}
        />
      )}
    </div>
  )
}

function PlayerManagerOverlay({
  sessionPlayers,
  allPlayers,
  onAdd,
  onRemove,
  onClose,
}: {
  sessionPlayers: { id: string; player_id: string; player?: { name: string } }[]
  allPlayers: Player[]
  onAdd: (playerId: string) => Promise<void>
  onRemove: (sessionPlayerId: string) => Promise<void>
  onClose: () => void
}) {
  const activeIds = new Set(sessionPlayers.map(sp => sp.player_id))
  const canAdd = sessionPlayers.length < 9

  return (
    <Portal>
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md mx-auto bg-[#141925] rounded-t-3xl border-t border-[#2A3344] max-h-[80vh] flex flex-col animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A3344]">
          <h2 className="font-[family-name:var(--font-display)] font-bold text-[#F1F5F9]">Spieler verwalten</h2>
          <button onClick={onClose} className="text-[#8B95A7] text-2xl leading-none w-8 h-8">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
          {allPlayers.map(p => {
            const sp = sessionPlayers.find(s => s.player_id === p.id)
            const inSession = activeIds.has(p.id)
            return (
              <div key={p.id} className="flex items-center gap-3 py-2 px-2">
                <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={36} eliminated={!inSession} />
                <span className="text-[#F1F5F9] flex-1">{p.name}</span>
                {inSession ? (
                  <button
                    onClick={() => sp && onRemove(sp.id)}
                    className="text-[#F87171] text-sm font-medium px-3 py-1.5 rounded-lg bg-[#F87171]/10"
                  >
                    Entfernen
                  </button>
                ) : (
                  <button
                    onClick={() => canAdd && onAdd(p.id)}
                    disabled={!canAdd}
                    className="text-[#34D399] text-sm font-medium px-3 py-1.5 rounded-lg bg-[#34D399]/10 disabled:opacity-40"
                  >
                    Hinzufügen
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#2A3344]">
          <button onClick={onClose} className="w-full bg-[#6366F1] text-white font-semibold rounded-2xl py-3">
            Fertig
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
