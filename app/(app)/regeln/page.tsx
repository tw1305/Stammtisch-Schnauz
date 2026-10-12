'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import BackHeader from '@/components/ui/BackHeader'
import { DEFAULT_RULES, SORT_STEP, groupRules, displayOrder, rulesLastChanged, toRoman } from '@/lib/rules'
import type { Rule } from '@/types/database'

const SERIF = 'Georgia, "Times New Roman", serif'
const INK = '#1F2A22'
const SEAL = '#8E2A22'

type Draft = { id?: string; section: string; title: string; body: string }

function formatStand(d: Date | null): string {
  return d ? d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
}

/** Read-only fallback rules when the `rules` table doesn't exist yet. */
function fallbackRules(): Rule[] {
  const now = new Date().toISOString()
  return DEFAULT_RULES.map((r, i) => ({
    ...r,
    id: `default-${i}`,
    sort_order: (i + 1) * SORT_STEP,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }))
}

export default function RegelnPage() {
  const supabase = createClient()
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('rules').select('*').order('sort_order')
    if (error) {
      setMissingTable(true)
      setRules(fallbackRules())
      setLoading(false)
      return
    }
    if ((data || []).length === 0) {
      // First open: take over the rules from the WhatsApp group description.
      await supabase.from('rules').insert(
        DEFAULT_RULES.map((r, i) => ({ ...r, sort_order: (i + 1) * SORT_STEP }))
      )
      const { data: seeded } = await supabase.from('rules').select('*').order('sort_order')
      setRules((seeded || []) as Rule[])
    } else {
      setRules(data as Rule[])
    }
    setMissingTable(false)
    setLoading(false)
  }

  useEffect(() => {
    // Async data load; state is only set after the awaited queries resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Writes sort_order = 10, 20, 30 … for the given display order (only rows that changed). */
  async function persistOrder(ordered: Rule[]) {
    for (let i = 0; i < ordered.length; i++) {
      const want = (i + 1) * SORT_STEP
      if (ordered[i].sort_order !== want && !ordered[i].id.startsWith('new')) {
        await supabase.from('rules').update({ sort_order: want }).eq('id', ordered[i].id)
      }
    }
  }

  /** Display order with `rule` placed at the end of its section (new section → at the end). */
  function placeAtSectionEnd(rule: Rule): Rule[] {
    const ordered = displayOrder(rules).filter(r => r.id !== rule.id)
    let idx = -1
    ordered.forEach((r, i) => { if (r.section === rule.section) idx = i })
    ordered.splice(idx >= 0 ? idx + 1 : ordered.length, 0, rule)
    return ordered
  }

  async function saveDraft(d: Draft) {
    setBusy(true)
    const now = new Date().toISOString()
    const fields = { section: d.section.trim(), title: d.title.trim(), body: d.body.trim(), updated_at: now }
    try {
      if (d.id) {
        const existing = rules.find(r => r.id === d.id)!
        await supabase.from('rules').update(fields).eq('id', d.id)
        if (existing.section !== fields.section) {
          // Moved to another topic → append it there.
          const ordered = placeAtSectionEnd({ ...existing, ...fields })
          await persistOrder(ordered)
        }
      } else {
        const placeholder = { ...fields, id: 'new', sort_order: 0, created_at: now, deleted_at: null } as Rule
        const ordered = placeAtSectionEnd(placeholder)
        const pos = ordered.findIndex(r => r.id === 'new')
        await persistOrder(ordered)
        await supabase.from('rules').insert({ ...fields, sort_order: (pos + 1) * SORT_STEP })
      }
      setDraft(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function move(rule: Rule, dir: -1 | 1) {
    const ordered = displayOrder(rules)
    const i = ordered.findIndex(r => r.id === rule.id)
    const j = i + dir
    if (j < 0 || j >= ordered.length || ordered[j].section !== rule.section) return
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
    setBusy(true)
    await persistOrder(ordered)
    await supabase.from('rules').update({ updated_at: new Date().toISOString() }).eq('id', rule.id)
    await load()
    setBusy(false)
  }

  async function remove(rule: Rule) {
    if (!confirm(`„${rule.title || 'Regel'}“ wirklich aus dem Regelwerk streichen?`)) return
    setBusy(true)
    const now = new Date().toISOString()
    await supabase.from('rules').update({ deleted_at: now, updated_at: now }).eq('id', rule.id)
    await load()
    setBusy(false)
  }

  const sections = groupRules(rules)
  const stand = formatStand(rulesLastChanged(rules))
  const sectionNames = sections.map(s => s.name)

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#7C7461]">Laden...</div>
  }

  return (
    <div className="flex flex-col max-w-md mx-auto w-full pb-6">
      <BackHeader title="Regeln">
        {!missingTable && (
          <button
            onClick={() => setEditMode(v => !v)}
            className={`h-9 px-3.5 rounded-full text-sm font-semibold border transition-colors shrink-0 ${
              editMode ? 'bg-[#2E6B3A] border-[#2E6B3A] text-white' : 'bg-[#FBF6EA] border-[#E4D9BF] text-[#23201A]'
            }`}
          >
            {editMode ? '✓ Fertig' : '✏️ Bearbeiten'}
          </button>
        )}
      </BackHeader>

      {missingTable && (
        <div className="mx-3 mb-3 rounded-xl border border-[#C8443B]/40 bg-[#C8443B]/5 px-3 py-2.5 text-xs text-[#8A2E28] leading-snug">
          Bearbeiten ist erst möglich, wenn die Datenbank-Migration <code>20261012_rules.sql</code> ausgeführt wurde.
          Angezeigt wird die Ausgangsfassung.
        </div>
      )}

      {/* The document */}
      <article
        className="relative mx-3 bg-[#FFFDF7] rounded-sm shadow-[0_2px_10px_rgba(60,45,20,0.12)] px-5 pt-7 pb-6"
        style={{ fontFamily: SERIF, color: INK, border: '1px solid #CDBF9C', outline: '3px double #B9A77E', outlineOffset: '-9px' }}
      >
        {/* Heading */}
        <header className="text-center">
          <Seal />
          <p className="mt-3 text-[11px] tracking-[0.32em] uppercase text-[#5E5544]">Stammtisch Schnauz</p>
          <h1
            className="font-[family-name:var(--font-display)] text-[30px] leading-tight font-extrabold tracking-tight mt-1"
            style={{ color: INK }}
          >
            Regelwerk
          </h1>
          <p className="text-[12px] italic text-[#5E5544] mt-1">Amtliche Fassung</p>
          <p className="mt-3 inline-block text-[12px] tracking-wide border-y border-[#B9A77E] py-1 px-3">
            Stand: <span className="font-bold">{stand}</span>
          </p>
        </header>

        <Ornament />

        {sections.length === 0 && (
          <p className="text-center italic text-[#5E5544] py-6">Das Regelwerk enthält derzeit keine Regeln.</p>
        )}

        {sections.map((s, si) => (
          <section key={s.name} className="mt-5 first-of-type:mt-2">
            <div className="text-center mb-3">
              <p className="text-[11px] tracking-[0.3em] uppercase text-[#5E5544]">Abschnitt {toRoman(si + 1)}</p>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mt-0.5" style={{ color: INK }}>
                {s.name}
              </h2>
              <div className="mx-auto mt-1.5 h-px w-16 bg-[#B9A77E]" />
            </div>

            <div className="space-y-3.5">
              {s.rules.map((r, ri) => (
                <div key={r.id}>
                  <h3 className="text-[15px] font-bold leading-snug">
                    <span className="mr-1.5">§ {r.paragraph}</span>
                    {r.title && <span>{r.title}</span>}
                  </h3>
                  <p className="text-[15px] leading-relaxed mt-0.5 hyphens-auto" lang="de">
                    {r.body}
                  </p>

                  {editMode && (
                    <div className="flex items-center gap-1.5 mt-1.5" style={{ fontFamily: 'var(--font-body)' }}>
                      <IconBtn label="Nach oben" disabled={busy || ri === 0} onClick={() => move(r, -1)}>▲</IconBtn>
                      <IconBtn label="Nach unten" disabled={busy || ri === s.rules.length - 1} onClick={() => move(r, 1)}>▼</IconBtn>
                      <button
                        onClick={() => setDraft({ id: r.id, section: r.section, title: r.title, body: r.body })}
                        disabled={busy}
                        className="h-9 px-3 rounded-lg bg-[#2E6B3A]/10 text-[#2E6B3A] text-xs font-semibold disabled:opacity-40"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => remove(r)}
                        disabled={busy}
                        className="h-9 px-3 rounded-lg bg-[#C8443B]/10 text-[#C8443B] text-xs font-semibold disabled:opacity-40"
                      >
                        Streichen
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {editMode && (
              <button
                onClick={() => setDraft({ section: s.name, title: '', body: '' })}
                className="mt-3 w-full h-10 rounded-lg border border-dashed border-[#B9A77E] text-[#5E5544] text-xs font-semibold"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                + Regel in „{s.name}“
              </button>
            )}
          </section>
        ))}

        {editMode && (
          <button
            onClick={() => setDraft({ section: '', title: '', body: '' })}
            className="mt-5 w-full h-11 rounded-lg bg-[#2E6B3A] text-white text-sm font-semibold"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            + Neue Regel / neuer Abschnitt
          </button>
        )}

        <Ornament />

        {/* Closing formula */}
        <footer className="text-center text-[12px] text-[#5E5544] leading-relaxed">
          <p className="italic">Ausgefertigt für den Stammtisch Schnauz</p>
          <p className="mt-0.5">Stand: {stand}</p>
        </footer>
      </article>

      {draft && (
        <RuleEditor
          draft={draft}
          sections={sectionNames}
          busy={busy}
          onCancel={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}
    </div>
  )
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-9 h-9 rounded-lg bg-[#E4D9BF]/60 text-[#23201A] text-sm disabled:opacity-25"
    >
      {children}
    </button>
  )
}

/** Decorative divider: rule – § – rule */
function Ornament() {
  return (
    <div className="flex items-center gap-3 my-5 text-[#B9A77E]" aria-hidden="true">
      <span className="flex-1 h-px bg-current" />
      <span className="text-lg leading-none" style={{ fontFamily: SERIF }}>§</span>
      <span className="flex-1 h-px bg-current" />
    </div>
  )
}

/** Official-looking round seal. */
function Seal() {
  return (
    <svg viewBox="0 0 100 100" width="76" height="76" className="mx-auto block" aria-hidden="true">
      <defs>
        <path id="seal-text" d="M50,50 m-35,0 a35,35 0 1,1 70,0 a35,35 0 1,1 -70,0" />
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke={SEAL} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="43" fill="none" stroke={SEAL} strokeWidth="0.8" />
      <circle cx="50" cy="50" r="27" fill="none" stroke={SEAL} strokeWidth="0.8" />
      <text fontSize="7.4" fontFamily={SERIF} fill={SEAL} letterSpacing="1.15" fontWeight="bold">
        <textPath href="#seal-text" startOffset="0">STAMMTISCH SCHNAUZ · REGELWERK ·</textPath>
      </text>
      <text x="50" y="58" textAnchor="middle" fontSize="26" fontFamily={SERIF} fill={SEAL} fontWeight="bold">§</text>
      <text x="50" y="70" textAnchor="middle" fontSize="7" fontFamily={SERIF} fill={SEAL}>♠ ♥ ♦ ♣</text>
    </svg>
  )
}

function RuleEditor({
  draft,
  sections,
  busy,
  onCancel,
  onSave,
}: {
  draft: Draft
  sections: string[]
  busy: boolean
  onCancel: () => void
  onSave: (d: Draft) => void
}) {
  const NEW = '__new__'
  const [sectionChoice, setSectionChoice] = useState(draft.section && sections.includes(draft.section) ? draft.section : NEW)
  const [newSection, setNewSection] = useState(sections.includes(draft.section) ? '' : draft.section)
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const section = sectionChoice === NEW ? newSection : sectionChoice
  const valid = section.trim() !== '' && body.trim() !== ''

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onCancel}>
        <div
          className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[90vh] flex flex-col animate-pop-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4D9BF]">
            <h2 className="font-[family-name:var(--font-display)] font-bold text-[#23201A]">
              {draft.id ? 'Regel bearbeiten' : 'Neue Regel'}
            </h2>
            <button onClick={onCancel} className="text-[#7C7461] text-2xl leading-none w-8 h-8">×</button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <div>
              <label className="block text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Abschnitt (Thema)</label>
              <select
                value={sectionChoice}
                onChange={e => setSectionChoice(e.target.value)}
                className="w-full bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-3 py-3 text-[#23201A] outline-none focus:border-[#2E6B3A]"
              >
                {sections.map(s => <option key={s} value={s}>{s}</option>)}
                <option value={NEW}>+ Neuer Abschnitt …</option>
              </select>
              {sectionChoice === NEW && (
                <input
                  value={newSection}
                  onChange={e => setNewSection(e.target.value)}
                  placeholder="Name des neuen Abschnitts"
                  className="mt-2 w-full bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] outline-none focus:border-[#2E6B3A]"
                />
              )}
            </div>
            <div>
              <label className="block text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Überschrift (optional)</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="z. B. Schieben"
                className="w-full bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] outline-none focus:border-[#2E6B3A]"
              />
            </div>
            <div>
              <label className="block text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Regeltext</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                className="w-full bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] outline-none focus:border-[#2E6B3A] resize-y"
                style={{ fontFamily: SERIF }}
              />
            </div>
            <p className="text-[#7C7461] text-[11px] leading-snug">Beim Speichern wird das „Stand“-Datum des Regelwerks aktualisiert.</p>
          </div>

          <div className="px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[#E4D9BF]">
            <button
              onClick={() => onSave({ id: draft.id, section, title, body })}
              disabled={!valid || busy}
              className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-50 text-white font-semibold rounded-2xl py-3.5 transition-colors"
            >
              {busy ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
