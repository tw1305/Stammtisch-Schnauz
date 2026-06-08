'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import PlayerAvatar from '@/components/ui/PlayerAvatar'
import type { Player } from '@/types/database'

async function fileToAvatar(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = dataUrl
  })
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const scale = Math.max(size / img.width, size / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
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
    return <div className="flex items-center justify-center min-h-[60vh] text-[#8B95A7]">Laden...</div>
  }

  return (
    <div className="flex flex-col max-w-md mx-auto w-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[#F1F5F9] tracking-tight">
          Spieler
        </h1>
        <p className="text-[#8B95A7] text-sm mt-1">Profile & Bilder verwalten</p>
      </div>

      {/* Add new player */}
      <div className="px-4 mb-5">
        <div className="flex gap-2">
          <input
            value={newPlayerName}
            onChange={e => setNewPlayerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPlayer()}
            placeholder="Neuen Spieler anlegen..."
            className="flex-1 bg-[#141925] border border-[#2A3344] rounded-2xl px-4 py-3 text-[#F1F5F9] text-sm outline-none focus:border-[#6366F1] transition-colors"
          />
          <button
            onClick={addPlayer}
            disabled={!newPlayerName.trim()}
            className="bg-[#6366F1] hover:bg-[#818CF8] disabled:opacity-40 text-white font-semibold rounded-2xl px-5 text-sm transition-colors"
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
            className="w-full flex items-center gap-3.5 bg-[#141925] border border-[#2A3344] rounded-2xl px-4 py-3 hover:border-[#6366F1]/50 transition-colors text-left"
          >
            <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size={48} eliminated={!p.is_active} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${p.is_active ? 'text-[#F1F5F9]' : 'text-[#8B95A7] line-through'}`}>
                {p.name}
              </p>
              <p className="text-[#8B95A7] text-xs mt-0.5">
                {p.is_active ? 'Aktiv' : 'Inaktiv'} · Zum Bearbeiten tippen
              </p>
            </div>
            <span className="text-[#8B95A7] text-lg">›</span>
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
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await fileToAvatar(file)
      setAvatarUrl(dataUrl)
    } catch {
      alert('Bild konnte nicht verarbeitet werden.')
    }
    setUploading(false)
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    await supabase
      .from('players')
      .update({ name: name.trim(), avatar_url: avatarUrl, is_active: isActive })
      .eq('id', player.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-end animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md mx-auto bg-[#141925] rounded-t-3xl border-t border-[#2A3344] max-h-[90vh] overflow-y-auto animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A3344]">
          <h2 className="font-[family-name:var(--font-display)] font-bold text-lg text-[#F1F5F9]">Profil bearbeiten</h2>
          <button onClick={onClose} className="text-[#8B95A7] text-2xl leading-none w-8 h-8">×</button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <PlayerAvatar name={name || '?'} avatarUrl={avatarUrl} size={96} />
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="bg-[#1B2230] hover:bg-[#2A3344] text-[#F1F5F9] text-sm font-medium rounded-xl px-4 py-2 transition-colors"
              >
                {uploading ? 'Lädt...' : '📷 Bild wählen'}
              </button>
              {avatarUrl && (
                <button
                  onClick={() => setAvatarUrl(null)}
                  className="bg-[#1B2230] hover:bg-[#2A3344] text-[#F87171] text-sm font-medium rounded-xl px-4 py-2 transition-colors"
                >
                  Entfernen
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </div>

          {/* Name */}
          <div>
            <label className="block text-[#8B95A7] text-xs uppercase tracking-wider mb-2 font-medium">Anzeigename</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#1B2230] border border-[#2A3344] rounded-xl px-4 py-3 text-[#F1F5F9] outline-none focus:border-[#6366F1] transition-colors"
            />
          </div>

          {/* Active toggle */}
          <button
            onClick={() => setIsActive(v => !v)}
            className="w-full flex items-center justify-between bg-[#1B2230] border border-[#2A3344] rounded-xl px-4 py-3"
          >
            <span className="text-[#F1F5F9] text-sm">Aktiv (spielt mit)</span>
            <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${isActive ? 'bg-[#6366F1]' : 'bg-[#2A3344]'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        </div>

        <div className="px-5 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="w-full bg-[#6366F1] hover:bg-[#818CF8] disabled:opacity-50 text-white font-semibold rounded-2xl py-3.5 transition-colors"
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
