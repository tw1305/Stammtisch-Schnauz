'use client'

import { useEffect, useRef, useState } from 'react'
import Portal from './Portal'

const FRAME = 264
const OUT = 256

type Props = {
  src: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}

export default function AvatarCropper({ src, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => setNat({ w: im.naturalWidth, h: im.naturalHeight })
    im.src = src
  }, [src])

  const base = nat ? FRAME / Math.min(nat.w, nat.h) : 1
  const eff = base * zoom
  const rw = nat ? nat.w * eff : FRAME
  const rh = nat ? nat.h * eff : FRAME
  const left = (FRAME - rw) / 2 + offset.x
  const top = (FRAME - rh) / 2 + offset.y

  // Re-clamp when zoom or image changes so the frame is always covered
  useEffect(() => {
    if (!nat) return
    const e = (FRAME / Math.min(nat.w, nat.h)) * zoom
    const hx = Math.max(0, (nat.w * e - FRAME) / 2)
    const hy = Math.max(0, (nat.h * e - FRAME) / 2)
    setOffset(o => ({
      x: Math.max(-hx, Math.min(hx, o.x)),
      y: Math.max(-hy, Math.min(hy, o.y)),
    }))
  }, [zoom, nat])

  function clampOffset(x: number, y: number) {
    const hx = Math.max(0, (rw - FRAME) / 2)
    const hy = Math.max(0, (rh - FRAME) / 2)
    return {
      x: Math.max(-hx, Math.min(hx, x)),
      y: Math.max(-hy, Math.min(hy, y)),
    }
  }

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy))
  }
  function onUp() {
    dragRef.current = null
  }

  function confirm() {
    if (!nat || !imgRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1B2230'
    ctx.fillRect(0, 0, OUT, OUT)
    const k = OUT / FRAME
    try {
      ctx.drawImage(imgRef.current, left * k, top * k, rw * k, rh * k)
      onConfirm(canvas.toDataURL('image/jpeg', 0.85))
    } catch {
      onConfirm(src) // tainted (CORS) -> keep original
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/90 z-[110] flex flex-col items-center justify-center px-6 animate-fade-in">
        <p className="text-[#F1F5F9] font-[family-name:var(--font-display)] font-bold text-lg mb-5">
          Bild ausrichten
        </p>

        <div
          className="relative rounded-full overflow-hidden border-2 border-[#6366F1] touch-none select-none bg-[#1B2230]"
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            crossOrigin="anonymous"
            draggable={false}
            className="absolute max-w-none select-none"
            style={{ left, top, width: rw, height: rh }}
          />
        </div>

        <div className="w-full max-w-xs mt-6 flex items-center gap-3">
          <span className="text-[#8B95A7] text-xs">−</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-[#6366F1]"
          />
          <span className="text-[#8B95A7] text-xs">+</span>
        </div>
        <p className="text-[#8B95A7] text-xs mt-3">Ziehen zum Verschieben · Regler zum Zoomen</p>

        <div className="flex gap-3 mt-7 w-full max-w-xs pb-[env(safe-area-inset-bottom)]">
          <button
            onClick={onCancel}
            className="flex-1 bg-[#1B2230] text-[#8B95A7] font-medium rounded-2xl py-3"
          >
            Abbrechen
          </button>
          <button
            onClick={confirm}
            disabled={!nat}
            className="flex-1 bg-[#6366F1] hover:bg-[#818CF8] disabled:opacity-50 text-white font-semibold rounded-2xl py-3"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </Portal>
  )
}
