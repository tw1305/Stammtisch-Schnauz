'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-Mail oder Passwort falsch.')
      setLoading(false)
    } else {
      router.push('/spiel')
      router.refresh()
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F4ECDA] px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-[#2E6B3A] mb-2">
            Schnauz
          </h1>
          <p className="text-[#7C7461] text-sm">Stammtisch Tracker</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-[#7C7461] mb-1.5" htmlFor="email">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-[#FBF6EA] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] placeholder-[#7C7461] outline-none focus:border-[#2E6B3A] transition-colors"
              placeholder="name@beispiel.de"
            />
          </div>

          <div>
            <label className="block text-sm text-[#7C7461] mb-1.5" htmlFor="password">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-[#FBF6EA] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] placeholder-[#7C7461] outline-none focus:border-[#2E6B3A] transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[#C8443B] text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors mt-2"
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}
