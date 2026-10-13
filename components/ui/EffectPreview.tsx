'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { feedbackWinner, initFeedback } from '@/lib/feedback'
import { POT_TIERS, stormFor } from '@/lib/effects'
import RoundResultModal from './RoundResultModal'
import PlayerAvatar from './PlayerAvatar'
import { GoldPile, NoobSign, NOOB_LEAVE_MS, type NoobSignState } from './RoundEffects'
import type { Player, RoundPlayer } from '@/types/database'

type Preview = { stake: number; firstBlood: boolean; key: number }

/**
 * Test-mode playground for the round effects: opens the real result screen with
 * made-up data (First Blood, every storm level, combinations), shows all gold
 * pile tiers and drops / topples a Noob sign. Nothing is stored.
 */
export default function EffectPreview({ standardStake }: { standardStake: number }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [sign, setSign] = useState<NoobSignState | null>(null)

  useEffect(() => {
    createClient()
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .limit(4)
      .then(({ data }) => setPlayers((data || []) as Player[]))
    initFeedback()
  }, [])

  const s = standardStake
  const buttons = [
    { label: '🩸 First Blood', stake: s, firstBlood: true },
    { label: `⚡ ${s + 1} €`, stake: s + 1, firstBlood: false },
    { label: `⚡ ${s * 2} €`, stake: s * 2, firstBlood: false },
    { label: `⚡ ${s * 3} €`, stake: s * 3, firstBlood: false },
    { label: `⛈️ ${s * 4} €`, stake: s * 4, firstBlood: false },
    { label: `⛈️ ${s * 6} €`, stake: s * 6, firstBlood: false },
    { label: `🩸⛈️ ${s * 6} €`, stake: s * 6, firstBlood: true },
  ]

  function open(stake: number, firstBlood: boolean) {
    feedbackWinner({ firstBlood })
    setPreview(p => ({ stake, firstBlood, key: (p?.key ?? 0) + 1 }))
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
        <p className="text-[#5E5544] text-[11px] font-medium mb-1.5">Siegerbildschirm-Effekte (Standardeinsatz {s} €):</p>
        <div className="grid grid-cols-4 gap-1.5">
          {buttons.map(b => (
            <button
              key={b.label}
              onClick={() => open(b.stake, b.firstBlood)}
              disabled={players.length < 2}
              className="bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl py-2 text-[11px] font-medium text-[#23201A] active:bg-[#E4D9BF] disabled:opacity-40"
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[#5E5544] text-[11px] font-medium mb-1.5">Goldhaufen-Stufen in Spielgröße (ab möglichem Gewinn):</p>
        <div className="grid grid-cols-2 gap-1.5">
          {POT_TIERS.map((t, i) => (
            <div key={i} className="rounded-xl bg-[#8A5A2C]/90 flex flex-col items-center justify-end pt-2 pb-1 h-32">
              {/* the table scene is ~360 px wide on a phone */}
              <GoldPile tier={i} width={t.width * 360} />
              <span className="text-[10px] font-semibold text-[#FFE9B8] mt-0.5">ab {t.min} €</span>
            </div>
          ))}
        </div>
      </div>

      {demo && (
        <div className="flex items-center gap-3">
          <div className="relative w-[64px] h-[64px] mt-6 shrink-0">
            <PlayerAvatar name={demo.name} avatarUrl={demo.avatar_url} size={64} />
            {sign && <NoobSign key={sign === 'enter' ? 'enter' : 'other'} size={64} state={sign} />}
          </div>
          <div className="flex gap-1.5 flex-1">
            <button onClick={dropSign} className="flex-1 bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl py-2 text-[11px] font-medium text-[#23201A]">
              Noob-Schild fällt
            </button>
            <button onClick={toppleSign} disabled={!sign} className="flex-1 bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl py-2 text-[11px] font-medium text-[#23201A] disabled:opacity-40">
              Schild kippt weg
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
          firstBlood={preview.firstBlood}
          storm={stormFor(preview.stake, s)}
        />
      )}
    </div>
  )
}
