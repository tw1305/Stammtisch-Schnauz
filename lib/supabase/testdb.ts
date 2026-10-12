/**
 * Test mode ("Testmodus"): a local stand-in for the game tables.
 *
 * While test mode is on, every query on seasons/sessions/rounds/… runs against
 * a small in-browser database (persisted in localStorage) instead of Supabase,
 * so sessions and rounds can be played through without touching real data.
 * Players and rules are still read from (and written to) the real database —
 * they are master data, not game events.
 *
 * The query builder mimics exactly the subset of the supabase-js API the app
 * uses: select (incl. embedded `alias:table(...)` joins), insert/update/delete,
 * eq/neq/is/in/gt/gte/lt/lte, order, limit, range, single/maybeSingle.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null; count?: number | null }

export const LOCAL_TABLES = ['seasons', 'sessions', 'session_players', 'rounds', 'round_players', 'round_fires'] as const
type LocalTable = (typeof LOCAL_TABLES)[number]
type DB = Record<LocalTable, Row[]>

const DB_KEY = 'schnauz_test_db'
export const TEST_MODE_KEY = 'schnauz_test_mode'

const now = () => new Date().toISOString()
const today = () => now().split('T')[0]

/** Column defaults, mirroring the real table definitions. */
const DEFAULTS: Record<LocalTable, () => Row> = {
  seasons: () => ({ start_date: today(), end_date: null, status: 'active', created_at: now() }),
  sessions: () => ({ created_by: null, started_at: now(), ended_at: null, status: 'active', dealer_player_id: null }),
  session_players: () => ({ joined_at: now(), removed_at: null, seat_order: null }),
  rounds: () => ({ winner_id: null, started_at: now(), ended_at: null, status: 'active', player_count: 0, stake: 0 }),
  round_players: () => ({
    is_active: true,
    was_revived: false,
    was_first_eliminated: false,
    reached_final: false,
    is_winner: false,
    balance_change: null,
    revives_given: 0,
  }),
  round_fires: () => ({ created_at: now() }),
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function emptyDb(): DB {
  const db = Object.fromEntries(LOCAL_TABLES.map(t => [t, []])) as unknown as DB
  // Start with a ready-to-use season so a test session can begin right away.
  db.seasons.push({ id: uuid(), name: 'Test-Season', ...DEFAULTS.seasons() })
  return db
}

let cache: DB | null = null

function load(): DB {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(DB_KEY)
    cache = raw ? (JSON.parse(raw) as DB) : emptyDb()
    for (const t of LOCAL_TABLES) cache[t] ??= []
  } catch {
    cache = emptyDb()
  }
  return cache
}

function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(cache))
  } catch {
    /* storage full/unavailable: keep working in memory */
  }
}

/** Deletes all test data (a fresh Test-Season is created on next use). */
export function resetTestData() {
  cache = null
  try {
    localStorage.removeItem(DB_KEY)
  } catch {
    /* ignore */
  }
}

// Real master data (players) needed for embedded joins, cached briefly.
let realPlayers: { at: number; rows: Row[] } | null = null
async function realRows(real: SupabaseClient, table: string): Promise<Row[]> {
  if (table === 'players') {
    if (realPlayers && Date.now() - realPlayers.at < 5000) return realPlayers.rows
    const { data } = await real.from('players').select('*')
    realPlayers = { at: Date.now(), rows: (data || []) as Row[] }
    return realPlayers.rows
  }
  const { data } = await real.from(table).select('*')
  return (data || []) as Row[]
}

const isLocal = (t: string): t is LocalTable => (LOCAL_TABLES as readonly string[]).includes(t)

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1 // nulls last (Postgres default for ASC)
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

class LocalQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private selectStr: string | null = null
  private returning = false
  private filters: ((r: Row) => boolean)[] = []
  private orders: { col: string; asc: boolean }[] = []
  private lim: number | null = null
  private rng: [number, number] | null = null
  private one: 'single' | 'maybe' | null = null

  constructor(private table: LocalTable, private real: SupabaseClient) {}

  select(cols = '*') {
    if (this.op === 'select') this.selectStr = cols
    else {
      this.returning = true
      this.selectStr = cols
    }
    return this
  }
  insert(values: Row | Row[]) {
    this.op = 'insert'
    this.payload = values
    return this
  }
  update(values: Row) {
    this.op = 'update'
    this.payload = values
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(c: string, v: unknown) {
    this.filters.push(r => r[c] === v)
    return this
  }
  neq(c: string, v: unknown) {
    this.filters.push(r => r[c] !== v)
    return this
  }
  is(c: string, v: unknown) {
    this.filters.push(r => (v === null ? r[c] == null : r[c] === v))
    return this
  }
  in(c: string, vs: unknown[]) {
    const set = new Set(vs)
    this.filters.push(r => set.has(r[c]))
    return this
  }
  gt(c: string, v: unknown) {
    this.filters.push(r => r[c] != null && cmp(r[c], v) > 0)
    return this
  }
  gte(c: string, v: unknown) {
    this.filters.push(r => r[c] != null && cmp(r[c], v) >= 0)
    return this
  }
  lt(c: string, v: unknown) {
    this.filters.push(r => r[c] != null && cmp(r[c], v) < 0)
    return this
  }
  lte(c: string, v: unknown) {
    this.filters.push(r => r[c] != null && cmp(r[c], v) <= 0)
    return this
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ col, asc: opts.ascending !== false })
    return this
  }
  limit(n: number) {
    this.lim = n
    return this
  }
  range(from: number, to: number) {
    this.rng = [from, to]
    return this
  }
  single() {
    this.one = 'single'
    return this
  }
  maybeSingle() {
    this.one = 'maybe'
    return this
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.exec().then(ok, fail)
  }

  private matches(r: Row) {
    return this.filters.every(f => f(r))
  }

  /** Adds embedded relations like `player:players(...)` or `round:rounds(...)`. */
  private async embed(rows: Row[]): Promise<Row[]> {
    if (!this.selectStr) return rows.map(r => ({ ...r }))
    const embeds = [...this.selectStr.matchAll(/(\w+):(\w+)\(/g)].map(m => ({ alias: m[1], table: m[2] }))
    if (embeds.length === 0) return rows.map(r => ({ ...r }))
    const out = rows.map(r => ({ ...r }))
    for (const { alias, table } of embeds) {
      const source = isLocal(table) ? load()[table] : await realRows(this.real, table)
      const byId = new Map(source.map(x => [x.id, x]))
      for (const r of out) r[alias] = byId.get(r[`${alias}_id`]) ?? null
    }
    return out
  }

  private async exec(): Promise<Result> {
    const db = load()
    const table = db[this.table]

    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]
      const inserted = list.map(v => ({ id: uuid(), ...DEFAULTS[this.table](), ...v }))
      table.push(...inserted)
      save()
      if (!this.returning) return { data: null, error: null }
      return this.shape(await this.embed(inserted))
    }

    if (this.op === 'update') {
      const changed: Row[] = []
      for (const r of table) {
        if (this.matches(r)) {
          Object.assign(r, this.payload)
          changed.push(r)
        }
      }
      save()
      if (!this.returning) return { data: null, error: null }
      return this.shape(await this.embed(changed))
    }

    if (this.op === 'delete') {
      db[this.table] = table.filter(r => !this.matches(r))
      save()
      return { data: null, error: null }
    }

    let rows = table.filter(r => this.matches(r))
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const { col, asc } of this.orders) {
          const d = cmp(a[col], b[col])
          if (d !== 0) return asc ? d : -d
        }
        return 0
      })
    }
    if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1)
    if (this.lim != null) rows = rows.slice(0, this.lim)
    return this.shape(await this.embed(rows))
  }

  private shape(rows: Row[]): Result {
    if (this.one) {
      if (rows.length === 1) return { data: rows[0], error: null }
      if (rows.length === 0 && this.one === 'maybe') return { data: null, error: null }
      return { data: null, error: { message: `Expected 1 row, got ${rows.length}` } }
    }
    return { data: rows, error: null }
  }
}

/** A channel that never fires (no live sync for local test data). */
const deadChannel = {
  on() {
    return deadChannel
  },
  subscribe() {
    return deadChannel
  },
  unsubscribe() {
    return Promise.resolve('ok')
  },
}

/**
 * Wraps the real client: game tables go to the local test DB, everything else
 * (players, rules, …) to Supabase. Realtime is disabled.
 */
export function createTestClient(real: SupabaseClient): SupabaseClient {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => (isLocal(table) ? new LocalQuery(table, target) : target.from(table))
      }
      if (prop === 'channel') return () => deadChannel
      if (prop === 'removeChannel') return () => Promise.resolve('ok')
      return Reflect.get(target, prop, receiver)
    },
  })
}
