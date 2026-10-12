'use client'

import { useState } from 'react'
import BackHeader from '@/components/ui/BackHeader'
import { PATCH_NOTES, type ChangeType } from '@/lib/patchnotes'

const TYPE_STYLE: Record<ChangeType, { label: string; cls: string }> = {
  neu: { label: 'Neu', cls: 'bg-[#2E6B3A]/12 text-[#2E6B3A]' },
  verbessert: { label: 'Verbessert', cls: 'bg-[#2F6FA8]/12 text-[#2F6FA8]' },
  behoben: { label: 'Behoben', cls: 'bg-[#B85C1E]/12 text-[#9A4A15]' },
  entfernt: { label: 'Entfernt', cls: 'bg-[#C8443B]/12 text-[#C8443B]' },
}
const ORDER: ChangeType[] = ['neu', 'verbessert', 'behoben', 'entfernt']

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PatchNotesPage() {
  // Newest release open, older ones collapsed.
  const [open, setOpen] = useState<Set<string>>(new Set([PATCH_NOTES[0].version]))

  function toggle(v: string) {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      <BackHeader title="Patch Notes" />

      <div className="px-4 pb-6 space-y-3">
        {PATCH_NOTES.map((note, i) => {
          const isOpen = open.has(note.version)
          const latest = i === 0
          return (
            <div
              key={note.version}
              className={`bg-[#FBF6EA] rounded-2xl border overflow-hidden ${latest ? 'border-[#2E6B3A]' : 'border-[#E4D9BF]'}`}
            >
              <button
                onClick={() => toggle(note.version)}
                aria-expanded={isOpen}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left ${latest ? 'bg-[#2E6B3A]/8' : 'bg-[#FFFDF7]'}`}
              >
                <span
                  className={`shrink-0 font-bold text-[13px] tabular-nums px-2.5 py-1 rounded-lg ${
                    latest ? 'bg-[#2E6B3A] text-white' : 'bg-[#E4D9BF] text-[#23201A]'
                  }`}
                >
                  v{note.version}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[#23201A] font-semibold leading-tight">{note.title}</span>
                  <span className="block text-[#7C7461] text-xs mt-0.5">
                    {formatDate(note.date)}
                    {latest && <span className="ml-1.5 text-[#2E6B3A] font-semibold">· Aktuell</span>}
                  </span>
                </span>
                <span
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center border-2 transition-transform ${
                    isOpen ? 'rotate-180 border-[#2E6B3A] text-[#2E6B3A]' : 'border-[#E4D9BF] text-[#7C7461]'
                  }`}
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="px-4 py-3 border-t border-[#E4D9BF] space-y-3 animate-fade-in">
                  {ORDER.map(type => {
                    const items = note.changes.filter(c => c.type === type)
                    if (items.length === 0) return null
                    return (
                      <div key={type}>
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${TYPE_STYLE[type].cls}`}>
                          {TYPE_STYLE[type].label}
                        </span>
                        <ul className="mt-1.5 space-y-1.5">
                          {items.map((c, j) => (
                            <li key={j} className="flex gap-2 text-sm text-[#23201A] leading-snug">
                              <span className="text-[#B0A084] shrink-0">•</span>
                              <span>{c.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
