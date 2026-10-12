import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTestClient, TEST_MODE_KEY } from './testdb'

let testClient: SupabaseClient | null = null

/** Whether "Testmodus" is on (game data then lives only on this device). */
export function isTestMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(TEST_MODE_KEY) === 'on'
  } catch {
    return false
  }
}

/** Switches test mode and reloads, so every page starts over with the right data source. */
export function setTestMode(on: boolean) {
  try {
    localStorage.setItem(TEST_MODE_KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  window.location.reload()
}

export function createClient() {
  const real = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  if (!isTestMode()) return real
  // One stable instance: hooks list the client as a dependency.
  testClient ??= createTestClient(real as unknown as SupabaseClient)
  return testClient as unknown as typeof real
}
