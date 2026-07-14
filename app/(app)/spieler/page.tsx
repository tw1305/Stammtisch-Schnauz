'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import PlayerAvatar from '@/components/ui/PlayerAvatar'
import Portal from '@/components/ui/Portal'
import AvatarCropper from '@/components/ui/AvatarCropper'
import { formatBirthday, normalizeBirthday, maskBirthdayInput } from '@/lib/birthday'
import type { Player } from '@/types/database'

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

export default function SpielerPage() {
  const supabase = createClient()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [editing, setEditing] = useState<Player | null>(null)

  useEffect(() => { loadPlayers() }, [])

  async function loadPlayers() {
    const { data } = await supabase.from('players').select('*').order('name')
    setPlayers(data || [])
    setLoading(false)
  }

  async function addPlayer() {
    const name = newPlayerName.trim()
    if (!name) return
    await supabase.from('players').insert({ name })
    setNewPlayerName('')
    loadPlayers()
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#7C7461]">Laden...</div>
  }

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#23201A] tracking-tight">
          Spieler
        </h1>
        <p className="text-[#7C7461] text-sm mt-1">Profile & Bilder verwalten</p>
      </div>

      {/* Add new player */}
      <div className="px-4 mb-5">
        <div className="flex gap-2">
          <input
            value={newPlayerName}
            onChange={e => setNewPlayerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPlayer()}
            placeholder="Neuen Spieler anlegen..."
            className="flex-1 bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 py-3 text-[#23201A] text-sm outline-none focus:border-[#2E6B3A] transition-colors"
          />
          <button
            onClick={addPlayer}
            disabled={!newPlayerName.trim()}
            className="bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-40 text-white font-semibold rounded-2xl px-5 text-sm transition-colors"
          >
            Anlegen
          </button>
        </div>
      </div>

      {/* Player grid */}
      <div className="px-4 pb-6 space-y-2.5">
        {players.map(p => (
          <button
            key={p.id}
            onClick={() => setEditing(p)}
            className="w-full flex items-center gap-3.5 bg-[#FBF6EA] border border-[#E4D9BF] rounded-2xl px-4 py-3 hover:border-[#2E6B3A]/50 transition-colors text-left"
          >
            <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={48} eliminated={!p.is_active} birthday={p.birthday} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${p.is_active ? 'text-[#23201A]' : 'text-[#7C7461] line-through'}`}>
                {p.name}
              </p>
              <p className="text-[#7C7461] text-xs mt-0.5">
                {p.is_active ? 'Aktiv' : 'Inaktiv'}
                {formatBirthday(p.birthday) && ` · 🎂 ${formatBirthday(p.birthday)}`}
                {' · Zum Bearbeiten tippen'}
              </p>
            </div>
            <span className="text-[#7C7461] text-lg">›</span>
          </button>
        ))}
      </div>

      {editing && (
        <PlayerEditor
          player={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadPlayers() }}
        />
      )}
    </div>
  )
}

function PlayerEditor({
  player,
  onClose,
  onSaved,
}: {
  player: Player
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName] = useState(player.name)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(player.avatar_url)
  const [isActive, setIsActive] = useState(player.is_active)
  const [birthday, setBirthday] = useState(formatBirthday(player.birthday))
  const [saving, setSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readFile(file)
      setCropSrc(dataUrl) // open cropper with the chosen image
    } catch {
      alert('Bild konnte nicht geladen werden.')
    }
    e.target.value = '' // allow re-selecting the same file
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    await supabase
      .from('players')
      .update({ name: name.trim(), avatar_url: avatarUrl, is_active: isActive, birthday: normalizeBirthday(birthday) })
      .eq('id', player.id)
    setSaving(false)
    onSaved()
  }

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-end animate-fade-in" onClick={onClose}>
        <div
          className="w-full max-w-md mx-auto bg-[#FBF6EA] rounded-t-3xl border-t border-[#E4D9BF] max-h-[90vh] overflow-y-auto animate-pop-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4D9BF]">
            <h2 className="font-[family-name:var(--font-display)] font-bold text-lg text-[#23201A]">Profil bearbeiten</h2>
            <button onClick={onClose} className="text-[#7C7461] text-2xl leading-none w-8 h-8">×</button>
          </div>

          <div className="px-5 py-5 space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => avatarUrl && setCropSrc(avatarUrl)}
                className="rounded-full"
                title={avatarUrl ? 'Bild ausrichten' : undefined}
              >
                <PlayerAvatar name={name || '?'} avatarUrl={avatarUrl} size={96} birthday={normalizeBirthday(birthday)} />
              </button>
              <div className="flex gap-2 flex-wrap justify-center">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="bg-[#FFFDF7] hover:bg-[#E4D9BF] text-[#23201A] text-sm font-medium rounded-xl px-4 py-2 transition-colors"
                >
                  📷 Bild wählen
                </button>
                {avatarUrl && (
                  <>
                    <button
                      onClick={() => setCropSrc(avatarUrl)}
                      className="bg-[#FFFDF7] hover:bg-[#E4D9BF] text-[#23201A] text-sm font-medium rounded-xl px-4 py-2 transition-colors"
                    >
                      ✂️ Ausrichten
                    </button>
                    <button
                      onClick={() => setAvatarUrl(null)}
                      className="bg-[#FFFDF7] hover:bg-[#E4D9BF] text-[#C8443B] text-sm font-medium rounded-xl px-4 py-2 transition-colors"
                    >
                      Entfernen
                    </button>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </div>

            {/* Name */}
            <div>
              <label className="block text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Anzeigename</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] outline-none focus:border-[#2E6B3A] transition-colors"
              />
            </div>

            {/* Birthday (day + month only) */}
            <div>
              <label className="block text-[#7C7461] text-xs uppercase tracking-wider mb-2 font-medium">Geburtstag (TT.MM.)</label>
              <input
                value={birthday}
                onChange={e => setBirthday(maskBirthdayInput(e.target.value))}
                inputMode="numeric"
                placeholder="TT.MM."
                className="w-full bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-4 py-3 text-[#23201A] outline-none focus:border-[#2E6B3A] transition-colors"
              />
              <p className="text-[#7C7461] text-[11px] mt-1.5 leading-snug">
                Nur Tag & Monat. In der Geburtstagswoche trägt der Spieler einen Lorbeerkranz. 🍻
              </p>
            </div>

            {/* Active toggle */}
            <button
              onClick={() => setIsActive(v => !v)}
              className="w-full flex items-center justify-between bg-[#FFFDF7] border border-[#E4D9BF] rounded-xl px-4 py-3"
            >
              <span className="text-[#23201A] text-sm">Aktiv (spielt mit)</span>
              <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${isActive ? 'bg-[#2E6B3A]' : 'bg-[#E4D9BF]'}`}>
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          </div>

          <div className="px-5 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="w-full bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-50 text-white font-semibold rounded-2xl py-3.5 transition-colors"
            >
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>

      {cropSrc && (
        <AvatarCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={dataUrl => { setAvatarUrl(dataUrl); setCropSrc(null) }}
        />
      )}
    </Portal>
  )
}
