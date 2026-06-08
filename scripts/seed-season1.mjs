import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ztzoplidkicdribaxdfl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0em9wbGlka2ljZHJpYmF4ZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTg0NDUsImV4cCI6MjA5NjQ5NDQ0NX0.9wyi0EtW1il04z-eZKBrrVanJmCrXneUlcD7V0jxFVE'
)

const BALANCES = [
  { name: 'Domi',   balance:  114 },
  { name: 'Tom',    balance:  -90 },
  { name: 'André',  balance:    7 },
  { name: 'Kev',    balance:  -40 },
  { name: 'Steffi', balance:    9 },
]

async function seed() {
  console.log('🃏 Season 1 – Q1 2026 (abgeschlossen)')
  console.log('======================================')

  // 1. Season anlegen (abgeschlossen)
  const { data: season, error: sErr } = await supabase
    .from('seasons')
    .insert({
      name: 'Season 1 - Q1 2026',
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      status: 'completed',
    })
    .select()
    .single()

  if (sErr) { console.error('❌ Season:', sErr.message); return }
  console.log('✓ Season:', season.name)

  // 2. Spieler-IDs aus DB laden
  const names = BALANCES.map(b => b.name)
  const { data: players, error: pErr } = await supabase
    .from('players')
    .select('id, name')
    .in('name', names)

  if (pErr) { console.error('❌ Spieler laden:', pErr.message); return }

  const missing = names.filter(n => !players.find(p => p.name === n))
  if (missing.length > 0) {
    console.error('❌ Spieler nicht gefunden:', missing.join(', '))
    return
  }
  console.log('✓ Spieler gefunden:', players.map(p => p.name).join(', '))

  // 3. Session (abgeschlossen)
  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .insert({
      season_id: season.id,
      status: 'completed',
      ended_at: '2026-03-31T23:59:00Z',
    })
    .select()
    .single()

  if (sessErr) { console.error('❌ Session:', sessErr.message); return }

  await supabase.from('session_players').insert(
    players.map(p => ({ session_id: session.id, player_id: p.id }))
  )

  // 4. Saldovortrag-Runde (abgeschlossen)
  const domiId = players.find(p => p.name === 'Domi')?.id

  const { data: round, error: rErr } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      round_number: 0,
      stake: 0,
      player_count: players.length,
      status: 'completed',
      winner_id: domiId,
      ended_at: '2026-03-31T23:59:00Z',
    })
    .select()
    .single()

  if (rErr) { console.error('❌ Runde:', rErr.message); return }

  const rpInserts = players.map(p => {
    const b = BALANCES.find(x => x.name === p.name)
    return {
      round_id: round.id,
      player_id: p.id,
      is_active: false,
      is_winner: p.id === domiId,
      balance_change: b?.balance ?? 0,
    }
  })

  const { error: rpErr } = await supabase.from('round_players').insert(rpInserts)
  if (rpErr) { console.error('❌ round_players:', rpErr.message); return }

  console.log('\n✓ Salden eingetragen:')
  BALANCES.forEach(b => console.log(`  ${b.name.padEnd(10)} ${b.balance >= 0 ? '+' : ''}${b.balance} €`))
  console.log('\n✅ Season 1 fertig!')
}

seed().catch(console.error)
