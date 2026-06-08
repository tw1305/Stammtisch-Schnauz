'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/hooks/useSession'
import GameTable from '@/components/ui/GameTable'
import RoundResultModal from '@/components/ui/RoundResultModal'
import type { Season, Player } from '@/types/database'

const STAKE_OPTIONS = [
  { label: 'Standard', multiplier: 1 },
  { label: 'Double', multiplier: 2 },
  { label: 'Triple', multiplier: 3 },
  { label: 'Quattro', multiplier: 4 },
]

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

  async function handleStartSession() {
    if (!activeSeason || allPlayers.length < 2) return
    await startSession(activeSeason.id, allPlayers.slice(0, 9).map(p => p.id))
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
        <div className="text-[#9A9A9A]">Laden...</div>
      </div>
    )
  }

  // No active session
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 gap-6">
        <div className="text-center">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#D4A017] mb-2">
            Schnauz
          </h1>
          {activeSeason ? (
            <p className="text-[#9A9A9A]">{activeSeason.name}</p>
          ) : (
            <p className="text-[#EF4444] text-sm">Keine aktive Season — bitte zuerst eine Season anlegen.</p>
          )}
        </div>

        {activeSeason && (
          <button
            onClick={handleStartSession}
            disabled={allPlayers.length < 2}
            className="bg-[#D4A017] hover:bg-[#E8B420] disabled:opacity-50 text-[#111111] font-semibold rounded-xl px-8 py-4 text-lg transition-colors"
          >
            ▶ Neue Session starten
          </button>
        )}

        <button
          onClick={() => router.push('/seasons')}
          className="text-[#9A9A9A] text-sm underline"
        >
          Seasons verwalten
        </button>
      </div>
    )
  }

  // Active round
  if (activeRound) {
    return (
      <div className="flex flex-col min-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <span className="text-[#F5F5F5] font-semibold">Runde #{activeRound.round_number}</span>
            <span className="text-[#9A9A9A] text-sm ml-2">· {activeRound.stake} €</span>
          </div>
          <button
            onClick={() => router.push('/einstellungen')}
            className="text-[#9A9A9A] text-xl p-2"
          >
            ⚙
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-2">
          <GameTable
            sessionPlayers={sessionPlayers}
            roundPlayers={roundPlayers}
            onPlayerTap={handlePlayerTap}
            isRoundActive={true}
          />
        </div>

        <div className="px-4 pb-4 text-center text-[#9A9A9A] text-sm">
          💡 Spieler antippen zum Ausscheiden / Wiederbeleben
        </div>
      </div>
    )
  }

  // Between rounds (or start of session)
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <span className="text-[#F5F5F5] font-semibold">{activeSeason?.name ?? 'Session'}</span>
        </div>
        <button
          onClick={() => router.push('/einstellungen')}
          className="text-[#9A9A9A] text-xl p-2"
        >
          ⚙
        </button>
      </div>

      {/* Table */}
      <div className="flex justify-center px-2 py-2">
        <GameTable
          sessionPlayers={sessionPlayers}
          sessionBalances={sessionBalances}
          isRoundActive={false}
        />
      </div>

      {/* Player management buttons */}
      <div className="flex gap-2 px-4 mb-4">
        <button
          onClick={() => setShowPlayerManager(true)}
          className="flex-1 bg-[#242424] border border-[#2E2E2E] text-[#F5F5F5] rounded-xl py-2.5 text-sm font-medium"
        >
          + / − Spieler
        </button>
      </div>

      {/* Stake selection */}
      <div className="px-4 mb-4">
        <p className="text-[#9A9A9A] text-xs mb-2 font-medium uppercase tracking-wider">Einsatz wählen</p>
        <div className="flex gap-2 flex-wrap">
          {STAKE_OPTIONS.map(opt => {
            const amount = defaultStake * opt.multiplier
            const isSelected = !showCustomInput && selectedMultiplier === opt.multiplier
            return (
              <button
                key={opt.multiplier}
                onClick={() => { setSelectedMultiplier(opt.multiplier); setShowCustomInput(false) }}
                className={`flex-1 min-w-[60px] rounded-xl py-2.5 text-sm font-semibold transition-colors border
                  ${isSelected
                    ? 'bg-[#D4A017] border-[#D4A017] text-[#111111]'
                    : 'bg-[#242424] border-[#2E2E2E] text-[#F5F5F5]'
                  }`}
              >
                {amount} €
              </button>
            )
          })}
          <button
            onClick={() => setShowCustomInput(true)}
            className={`flex-1 min-w-[44px] rounded-xl py-2.5 text-sm font-semibold transition-colors border
              ${showCustomInput
                ? 'bg-[#D4A017] border-[#D4A017] text-[#111111]'
                : 'bg-[#242424] border-[#2E2E2E] text-[#9A9A9A]'
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
            className="mt-2 w-full bg-[#1C1C1C] border border-[#D4A017] rounded-xl px-4 py-2.5 text-[#F5F5F5] outline-none text-sm"
            autoFocus
          />
        )}
      </div>

      {/* Actions */}
      <div className="px-4 space-y-2 pb-4">
        <button
          onClick={handleStartRound}
          disabled={sessionPlayers.length < 2}
          className="w-full bg-[#D4A017] hover:bg-[#E8B420] disabled:opacity-50 text-[#111111] font-semibold rounded-xl py-4 text-base transition-colors"
        >
          ▶ Neue Runde starten ({effectiveStake} €)
        </button>
        <button
          onClick={handleEndSession}
          className="w-full bg-[#242424] border border-[#2E2E2E] hover:bg-[#2E2E2E] text-[#9A9A9A] font-medium rounded-xl py-3 text-sm transition-colors"
        >
          Session beenden
        </button>
      </div>

      {/* Player manager overlay */}
      {showPlayerManager && (
        <PlayerManagerOverlay
          sessionPlayers={sessionPlayers}
          allPlayers={allPlayers}
          onAdd={addPlayerToSession}
          onRemove={removePlayerFromSession}
          onClose={() => setShowPlayerManager(false)}
        />
      )}

      {/* Round result modal */}
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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
      <div className="w-full bg-[#1C1C1C] rounded-t-2xl border-t border-[#2E2E2E] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2E2E2E]">
          <h2 className="font-semibold text-[#F5F5F5]">Spieler verwalten</h2>
          <button onClick={onClose} className="text-[#9A9A9A] text-xl p-1">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {allPlayers.map(p => {
            const sp = sessionPlayers.find(s => s.player_id === p.id)
            const inSession = activeIds.has(p.id)
            return (
              <div key={p.id} className="flex items-center justify-between py-2">
                <span className="text-[#F5F5F5]">{p.name}</span>
                {inSession ? (
                  <button
                    onClick={() => sp && onRemove(sp.id)}
                    className="text-[#EF4444] text-sm font-medium px-3 py-1 rounded-lg bg-[#EF4444]/10"
                  >
                    Entfernen
                  </button>
                ) : (
                  <button
                    onClick={() => canAdd && onAdd(p.id)}
                    disabled={!canAdd}
                    className="text-[#22C55E] text-sm font-medium px-3 py-1 rounded-lg bg-[#22C55E]/10 disabled:opacity-40"
                  >
                    Hinzufügen
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-5 py-4 border-t border-[#2E2E2E]">
          <button onClick={onClose} className="w-full bg-[#D4A017] text-[#111111] font-semibold rounded-xl py-3">
            Fertig
          </button>
        </div>
      </div>
    </div>
  )
}
