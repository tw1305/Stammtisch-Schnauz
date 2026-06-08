'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import PlayerAvatar from '@/components/ui/PlayerAvatar'
import type { Player } from '@/types/database'

const STAKE_KEY = 'schnauz_default_stake'

export default function EinstellungenPage() {
  const supabase = createClient()
  const [defaultStake, setDefaultStake] = useState(3)
  const [stakeInput, setStakeInput] = useState('3')
  const [players, setPlayers] = useState<Player[]>([])
  const [newPlayerName, setNewPlayerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(STAKE_KEY)
    if (saved) {
      setDefaultStake(parseInt(saved))
      setStakeInput(saved)
    }
    loadPlayers()
  }, [])

  async function loadPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')
    setPlayers(data || [])
    setLoading(false)
  }

  function saveStake() {
    const val = parseInt(stakeInput)
    if (!val || val < 1) return
    localStorage.setItem(STAKE_KEY, String(val))
    setDefaultStake(val)
    setSaveMsg('Gespeichert ✓')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  async function addPlayer() {
    const name = newPlayerName.trim()
    if (!name) return
    await supabase.from('players').insert({ name })
    setNewPlayerName('')
    loadPlayers()
  }

  async function togglePlayerActive(player: Player) {
    await supabase
      .from('players')
      .update({ is_active: !player.is_active })
      .eq('id', player.id)
    loadPlayers()
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#9A9A9A]">Laden...</div>
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-5 pb-3 border-b border-[#2E2E2E]">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#F5F5F5]">
          Einstellungen
        </h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Default stake */}
        <div>
          <p className="text-[#9A9A9A] text-xs uppercase tracking-wider mb-3 font-medium">Basiseinsatz</p>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              step="1"
              value={stakeInput}
              onChange={e => setStakeInput(e.target.value)}
              className="flex-1 bg-[#1C1C1C] border border-[#2E2E2E] rounded-xl px-4 py-2.5 text-[#F5F5F5] outline-none focus:border-[#D4A017]"
            />
            <span className="flex items-center text-[#9A9A9A]">€</span>
            <button
              onClick={saveStake}
              className="bg-[#D4A017] text-[#111111] font-semibold rounded-xl px-4 py-2.5 text-sm"
            >
              {saveMsg || 'Speichern'}
            </button>
          </div>
          <p className="text-[#9A9A9A] text-xs mt-1.5">
            Aktuell: {defaultStake} € · Double = {defaultStake * 2} € · Triple = {defaultStake * 3} €
          </p>
        </div>

        {/* Players */}
        <div>
          <p className="text-[#9A9A9A] text-xs uppercase tracking-wider mb-3 font-medium">Spieler verwalten</p>

          <div className="flex gap-2 mb-3">
            <input
              value={newPlayerName}
              onChange={e => setNewPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              placeholder="Neuer Spieler..."
              className="flex-1 bg-[#1C1C1C] border border-[#2E2E2E] rounded-xl px-4 py-2.5 text-[#F5F5F5] text-sm outline-none focus:border-[#D4A017]"
            />
            <button
              onClick={addPlayer}
              disabled={!newPlayerName.trim()}
              className="bg-[#D4A017] disabled:opacity-50 text-[#111111] font-semibold rounded-xl px-4 py-2.5 text-sm"
            >
              + Hinzufügen
            </button>
          </div>

          <div className="bg-[#1C1C1C] rounded-2xl border border-[#2E2E2E] overflow-hidden">
            {players.length === 0 ? (
              <p className="text-[#9A9A9A] text-sm text-center py-6">Noch keine Spieler</p>
            ) : (
              players.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-[#2E2E2E] last:border-0"
                >
                  <PlayerAvatar
                    name={p.name}
                    avatarUrl={p.avatar_url}
                    size={36}
                    eliminated={!p.is_active}
                  />
                  <span className={`flex-1 text-sm ${p.is_active ? 'text-[#F5F5F5]' : 'text-[#9A9A9A] line-through'}`}>
                    {p.name}
                  </span>
                  <button
                    onClick={() => togglePlayerActive(p)}
                    className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                      p.is_active
                        ? 'text-[#9A9A9A] bg-[#2E2E2E] hover:bg-[#EF4444]/20 hover:text-[#EF4444]'
                        : 'text-[#22C55E] bg-[#22C55E]/10 hover:bg-[#22C55E]/20'
                    }`}
                  >
                    {p.is_active ? 'Deaktivieren' : 'Reaktivieren'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
