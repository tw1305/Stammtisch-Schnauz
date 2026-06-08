import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ztzoplidkicdribaxdfl.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0em9wbGlka2ljZHJpYmF4ZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTg0NDUsImV4cCI6MjA5NjQ5NDQ0NX0.9wyi0EtW1il04z-eZKBrrVanJmCrXneUlcD7V0jxFVE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PLAYERS = [
  { name: 'Tom',      balance: 144 },
  { name: 'Domi',     balance: -90 },
  { name: 'André',    balance: -15 },
  { name: 'Steffi',   balance: -21 },
  { name: 'Laura',    balance:  -3 },
  { name: 'Kev',      balance: -18 },
  { name: 'Schmirgel',balance:  -6 },
  { name: 'Kanye',    balance:  12 },
  { name: 'Phoumezz', balance:  -3 },
]

async function seed() {
  console.log('🃏 Stammtisch Schnauz – Seed-Script')
  console.log('=====================================')

  // 1. Season anlegen
  console.log('\n1. Season anlegen...')
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .insert({
      name: 'Season 2 - Pferdeseason',
      start_date: '2026-01-01',
      status: 'active',
    })
    .select()
    .single()

  if (seasonErr) { console.error('❌ Season:', seasonErr.message); return }
  console.log('✓ Season:', season.name, '→', season.id)

  // 2. Spieler anlegen
  console.log('\n2. Spieler anlegen...')
  const { data: players, error: playerErr } = await supabase
    .from('players')
    .insert(PLAYERS.map(p => ({ name: p.name })))
    .select()

  if (playerErr) { console.error('❌ Spieler:', playerErr.message); return }
  console.log('✓ Spieler angelegt:', players.map(p => p.name).join(', '))

  // 3. Session anlegen (aktiv)
  console.log('\n3. Session anlegen...')
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .insert({ season_id: season.id, status: 'active' })
    .select()
    .single()

  if (sessionErr) { console.error('❌ Session:', sessionErr.message); return }
  console.log('✓ Session:', session.id)

  // 4. Alle Spieler zur Session hinzufügen
  await supabase.from('session_players').insert(
    players.map(p => ({ session_id: session.id, player_id: p.id }))
  )
  console.log('✓ Spieler zur Session hinzugefügt')

  // 5. Saldovortrag-Runde anlegen (abgeschlossen, stake=0)
  console.log('\n4. Saldovortrag-Runde anlegen...')
  const tomId = players.find(p => p.name === 'Tom')?.id

  const { data: round, error: roundErr } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      round_number: 0,
      stake: 0,
      player_count: players.length,
      status: 'completed',
      winner_id: tomId,
      ended_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (roundErr) { console.error('❌ Runde:', roundErr.message); return }

  // 6. round_players mit Saldovortrag
  const rpInserts = players.map(p => {
    const data = PLAYERS.find(pd => pd.name === p.name)
    return {
      round_id: round.id,
      player_id: p.id,
      is_active: false,
      is_winner: p.id === tomId,
      balance_change: data?.balance ?? 0,
    }
  })

  const { error: rpErr } = await supabase.from('round_players').insert(rpInserts)
  if (rpErr) { console.error('❌ round_players:', rpErr.message); return }

  console.log('✓ Saldovortrag eingetragen:')
  PLAYERS.forEach(p => {
    const sign = p.balance >= 0 ? '+' : ''
    console.log(`  ${p.name.padEnd(12)} ${sign}${p.balance} €`)
  })

  console.log('\n✅ Fertig! Die App zeigt jetzt Season 2 - Pferdeseason mit den korrekten Salden.')
}

seed().catch(console.error)
