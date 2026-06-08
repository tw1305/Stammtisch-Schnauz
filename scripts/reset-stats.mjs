import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ztzoplidkicdribaxdfl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0em9wbGlka2ljZHJpYmF4ZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTg0NDUsImV4cCI6MjA5NjQ5NDQ0NX0.9wyi0EtW1il04z-eZKBrrVanJmCrXneUlcD7V0jxFVE'
)

// Reset all "achievement" stats to zero on the carry-over rounds (round_number = 0)
// while keeping balance_change (the money) untouched.
const { data: carryRounds } = await supabase
  .from('rounds')
  .select('id')
  .eq('round_number', 0)

const ids = (carryRounds || []).map(r => r.id)
console.log('Carry-over Runden:', ids.length)

// Remove fake winners on carry-over rounds (kills wins + streaks)
const { error: e1 } = await supabase.from('rounds').update({ winner_id: null }).eq('round_number', 0)
console.log('rounds.winner_id genullt:', e1?.message ?? 'ok')

// Reset all stat flags on their round_players (balance_change stays)
for (const id of ids) {
  const { error } = await supabase
    .from('round_players')
    .update({
      is_winner: false,
      reached_final: false,
      was_first_eliminated: false,
      was_revived: false,
      revives_given: 0,
    })
    .eq('round_id', id)
  console.log('  round_players reset', id, '→', error?.message ?? 'ok')
}

console.log('\n✅ Alle Statistiken (Siege, Streaks, Finals, Revivals, 1. Aus) auf Null. Bilanzen unverändert.')
