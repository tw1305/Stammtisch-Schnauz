import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ztzoplidkicdribaxdfl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0em9wbGlka2ljZHJpYmF4ZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTg0NDUsImV4cCI6MjA5NjQ5NDQ0NX0.9wyi0EtW1il04z-eZKBrrVanJmCrXneUlcD7V0jxFVE'
)

const { data, error } = await supabase
  .from('players')
  .update({ avatar_url: '/avatars/tom.png' })
  .eq('name', 'Tom')
  .select()

if (error) {
  console.error('❌', error.message)
} else {
  console.log('✓ Tom avatar gesetzt:', data[0]?.id)
}
