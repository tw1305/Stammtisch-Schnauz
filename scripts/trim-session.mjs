import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ztzoplidkicdribaxdfl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0em9wbGlka2ljZHJpYmF4ZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTg0NDUsImV4cCI6MjA5NjQ5NDQ0NX0.9wyi0EtW1il04z-eZKBrrVanJmCrXneUlcD7V0jxFVE'
)

const KEEP = ['Domi', 'Tom', 'André']

// Active session of Season 2
const { data: sessions } = await supabase.from('sessions').select('id').eq('status', 'active')
if (!sessions || sessions.length === 0) { console.log('Keine aktive Session.'); process.exit(0) }

const { data: keepPlayers } = await supabase.from('players').select('id, name').in('name', KEEP)
const keepIds = (keepPlayers || []).map(p => p.id)
console.log('Behalte:', keepPlayers.map(p => p.name).join(', '))

for (const sess of sessions) {
  const { data: sps } = await supabase
    .from('session_players')
    .select('id, player_id')
    .eq('session_id', sess.id)
    .is('removed_at', null)

  const toRemove = (sps || []).filter(sp => !keepIds.includes(sp.player_id))
  for (const sp of toRemove) {
    await supabase.from('session_players').update({ removed_at: new Date().toISOString() }).eq('id', sp.id)
  }
  console.log(`Session ${sess.id}: ${toRemove.length} Spieler entfernt, ${keepIds.length} aktiv am Tisch`)
}

console.log('\n✅ Aktive Session zeigt nur noch Domi, Tom, André. Carry-over-Bilanzen bleiben erhalten.')
