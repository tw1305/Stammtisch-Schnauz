import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ztzoplidkicdribaxdfl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0em9wbGlka2ljZHJpYmF4ZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTg0NDUsImV4cCI6MjA5NjQ5NDQ0NX0.9wyi0EtW1il04z-eZKBrrVanJmCrXneUlcD7V0jxFVE'
)

const SEASON2 = '85ca3f1a-9b0b-46c3-902e-0f1983fb30ea'

const BALANCES = {
  Tom: 144,
  Domi: -90,
  'André': -15,
  Steffi: -21,
  Laura: -3,
  Kev: -18,
  Schmirgel: -6,
  Kanye: 12,
  Phoumezz: -3,
}

async function run() {
  console.log('🃏 Season 2 Saldo wiederherstellen (als eigene Saldovortrag-Session)')

  // Saison-Startdatum für sinnvolle Zeitstempel
  const { data: season } = await supabase.from('seasons').select('start_date').eq('id', SEASON2).single()
  const ts = `${season?.start_date ?? '2026-04-01'}T00:00:00Z`

  // Spieler-IDs holen
  const names = Object.keys(BALANCES)
  const { data: players } = await supabase.from('players').select('id, name').in('name', names)
  const missing = names.filter(n => !players.find(p => p.name === n))
  if (missing.length) { console.error('❌ Spieler fehlen:', missing.join(', ')); return }

  // Sicherheits-Check: existiert schon ein Vortrag (round_number 0) in Season 2?
  const { data: existingSessions } = await supabase.from('sessions').select('id').eq('season_id', SEASON2)
  const sids = (existingSessions || []).map(s => s.id)
  if (sids.length) {
    const { data: existing0 } = await supabase.from('rounds').select('id').in('session_id', sids).eq('round_number', 0)
    if (existing0 && existing0.length) {
      console.log('⚠️  Es existiert bereits ein Saldovortrag in Season 2. Abbruch, um Doppelung zu vermeiden.')
      return
    }
  }

  // Eigene, abgeschlossene Saldovortrag-Session (KEINE Spiel-Session)
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .insert({ season_id: SEASON2, status: 'completed', started_at: ts, ended_at: ts })
    .select()
    .single()
  if (sErr) { console.error('❌ Session:', sErr.message); return }
  console.log('✓ Saldovortrag-Session:', session.id)

  // Vortrags-Runde (round_number 0, kein Gewinner -> keine Statistik)
  const { data: round, error: rErr } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      round_number: 0,
      stake: 0,
      player_count: names.length,
      status: 'completed',
      winner_id: null,
      ended_at: ts,
    })
    .select()
    .single()
  if (rErr) { console.error('❌ Runde:', rErr.message); return }

  // Bilanzen pro Spieler
  const rpInserts = players.map(p => ({
    round_id: round.id,
    player_id: p.id,
    is_active: false,
    is_winner: false,
    reached_final: false,
    was_first_eliminated: false,
    was_revived: false,
    balance_change: BALANCES[p.name],
  }))
  const { error: rpErr } = await supabase.from('round_players').insert(rpInserts)
  if (rpErr) { console.error('❌ round_players:', rpErr.message); return }

  console.log('\n✓ Season-2-Saldo wiederhergestellt:')
  for (const n of names) console.log(`  ${n.padEnd(11)} ${BALANCES[n] >= 0 ? '+' : ''}${BALANCES[n]} €`)
  console.log('\n✅ Liegt in einer eigenen abgeschlossenen Session — die nächste Spiel-Session startet bei 0.')
}

run().catch(console.error)
