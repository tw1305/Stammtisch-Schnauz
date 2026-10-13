'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { feedbackWinner, initFeedback } from '@/lib/feedback'
import { STORM_LEVELS, stormFor } from '@/lib/effects'
import RoundResultModal from './RoundResultModal'
import PlayerAvatar from './PlayerAvatar'
import { NoobSign, NOOB_LEAVE_MS, Bandage, RainCloud, type NoobSignState } from './RoundEffects'
import { findMilestones, EMPTY_TOTALS, type PlayerMilestones } from '@/lib/milestones'
import type { Player, RoundPlayer } from '@/types/database'

type Preview = { stake: number; firstBlood: boolean; milestones: boolean; key: number }

/**
 * Example milestones for the preview (worst case for the layout: lots of them):
 * winner 100. Sieg + 5 in a row + 100 €, everyone else a round / fire / shame jubilee.
 */
function demoMilestones(players: Player[]): PlayerMilestones[] {
  const t = EMPTY_TOTALS
  const [w, ...rest] = players
  const out: PlayerMilestones[] = []
  if (w) out.push({ playerId: w.id, name: w.name, items: findMilestones({ ...t, wins: 99, streak: 4, balance: 90 }, { ...t, wins: 100, streak: 5, balance: 110 }) })
  rest.forEach((p, i) => {
    const before = [{ ...t, rounds: 99 }, { ...t, firstOuts: 49, balance: -95 }, { ...t, fires: 0 }][i % 3]
    const after = [{ ...t, rounds: 100 }, { ...t, firstOuts: 50, balance: -101 }, { ...t, fires: 1 }][i % 3]
    out.push({ playerId: p.id, name: p.name, items: findMilestones(before, after) })
  })
  return out
}

/**
 * Test-mode playground for the round effects: opens the real result screen with
 * made-up data (First Blood, every storm level, milestones, combinations) and
 * shows the portrait decorations (Noob sign, band-aids, rain cloud). Nothing is stored.
 */
export default function EffectPreview() {
  const [players, setPlayers] = useState<Player[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [sign, setSign] = useState<NoobSignState | null>(null)
  const [bandage, setBandage] = useState(false)
  const [cloud, setCloud] = useState(false)

  useEffect(() => {
    createClient()
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .limit(9)
      .then(({ data }) => setPlayers((data || []) as Player[]))
    initFeedback()
  }, [])

  // One button per storm level, plus First Blood alone (stake below the first level) and the full combo.
  const top = STORM_LEVELS[STORM_LEVELS.length - 1].minStake
  const buttons = [
    { label: '🩸 First Blood', stake: STORM_LEVELS[0].minStake - 1, firstBlood: true },
    ...STORM_LEVELS.map((l, i) => ({ label: `${i >= 3 ? '⛈️' : '⚡'} ${l.minStake} €`, stake: l.minStake, firstBlood: false })),
    { label: `🩸⛈️ ${top} €`, stake: top, firstBlood: true },
    { label: '🏅 Meilenstein', stake: STORM_LEVELS[0].minStake - 1, firstBlood: false, milestones: true },
  ]

  function open(stake: number, firstBlood: boolean, milestones = false) {
    feedbackWinner({ firstBlood })
    setPreview(p => ({ stake, firstBlood, milestones, key: (p?.key ?? 0) + 1 }))
  }

  function dropSign() {
    setSign(null)
    requestAnimationFrame(() => setSign('enter'))
  }
  function toppleSign() {
    setSign('leave')
    setTimeout(() => setSign(cur => (cur === 'leave' ? null : cur)), NOOB_LEAVE_MS)
  }

  const fakeRound: RoundPlayer[] = preview
    ? players.map((p, i) => ({
        id: `preview-${p.id}`,
        round_id: 'preview',
        player_id: p.id,
        is_active: i === 0,
        was_revived: false,
        was_first_eliminated: i === players.length - 1,
        reached_final: i < 2,
        is_winner: i === 0,
        balance_change: i === 0 ? preview.stake * (players.length - 1) : -preview.stake,
        revives_given: 0,
        player: p,
      }))
    : []
  const demo = players[0]

  return (
    <div className="px-4 pb-3.5 space-y-3">
      <div>
        <p className="text-[#5E5544] text-[11px] font-medium mb-1.5">Siegerbildschirm-Effekte (Gewitter je Einsatz):</p>
        <div className="grid grid-cols-4 gap-1.5">
          {buttons.map(b => (
            <button
              key={b.label}
              onClick={() => open(b.stake, b.firstBlood, 'milestones' in b && b.milestones)}
              disabled={players.length < 2}
              className="bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl py-2 text-[11px] font-medium text-[#23201A] active:bg-[#E4D9BF] disabled:opacity-40"
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {demo && (
        <div className="flex items-center gap-3">
          <div className="relative w-[64px] h-[64px] mt-16 shrink-0">
            <PlayerAvatar name={demo.name} avatarUrl={demo.avatar_url} size={64} />
            {sign && <NoobSign key={sign === 'enter' ? 'enter' : 'other'} size={64} state={sign} />}
            {bandage && <Bandage size={64} />}
            {cloud && <RainCloud size={64} raised={!!sign && sign !== 'leave'} />}
          </div>
          <div className="grid grid-cols-2 gap-1.5 flex-1">
            <button onClick={dropSign} className="bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl py-2 text-[11px] font-medium text-[#23201A]">
              Noob-Schild fällt
            </button>
            <button onClick={toppleSign} disabled={!sign} className="bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl py-2 text-[11px] font-medium text-[#23201A] disabled:opacity-40">
              Schild kippt weg
            </button>
            <button onClick={() => setBandage(v => !v)} className={`border rounded-xl py-2 text-[11px] font-medium text-[#23201A] ${bandage ? 'bg-[#E4D9BF] border-[#C9B990]' : 'bg-[#FFFDF7] border-[#E4D9BF]'}`}>
              🩹 Pflaster
            </button>
            <button onClick={() => setCloud(v => !v)} className={`border rounded-xl py-2 text-[11px] font-medium text-[#23201A] ${cloud ? 'bg-[#E4D9BF] border-[#C9B990]' : 'bg-[#FFFDF7] border-[#E4D9BF]'}`}>
              🌧️ Regenwolke
            </button>
          </div>
        </div>
      )}

      {preview && players.length >= 2 && (
        <RoundResultModal
          key={preview.key}
          winnerId={players[0].id}
          winnerStreak={0}
          players={fakeRound}
          sessionBalances={{}}
          onNewRound={() => setPreview(null)}
          onManagePlayers={() => setPreview(null)}
          onEndSession={() => setPreview(null)}
          onUndo={() => setPreview(null)}
          firstBlood={preview.firstBlood}
          storm={stormFor(preview.stake)}
          milestones={preview.milestones ? demoMilestones(players) : []}
        />
      )}
    </div>
  )
}
