'use client'

import { useEffect, useRef, useState } from 'react'
import Portal from './Portal'

const FRAME = 264
const OUT = 256
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

type Props = {
  src: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}

type Pt = { x: number; y: number }

export default function AvatarCropper({ src, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  // Active pointers (mouse or fingers) → enables one-finger drag and two-finger pinch.
  const pointers = useRef(new Map<number, Pt>())
  const gesture = useRef<{ dist: number; zoom: number; mid: Pt; offset: Pt } | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 })

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

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  // Free positioning, but keep at least part of the image inside the frame so it can't get lost.
  function clampOffset(o: Pt, z = zoom): Pt {
    const w = nat ? nat.w * base * z : FRAME
    const h = nat ? nat.h * base * z : FRAME
    const hx = (w + FRAME) / 2 - 24
    const hy = (h + FRAME) / 2 - 24
    return { x: Math.max(-hx, Math.min(hx, o.x)), y: Math.max(-hy, Math.min(hy, o.y)) }
  }

  // Zoom around a point (frame coords, centre = 0,0) so that point stays put.
  function zoomAround(newZoom: number, anchor: Pt, fromZoom: number, fromOffset: Pt) {
    const z = clampZoom(newZoom)
    const k = z / fromZoom
    setZoom(z)
    setOffset(clampOffset({ x: anchor.x - (anchor.x - fromOffset.x) * k, y: anchor.y - (anchor.y - fromOffset.y) * k }, z))
  }

  function toFrame(p: Pt): Pt {
    const r = frameRef.current!.getBoundingClientRect()
    return { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 }
  }

  function startGesture() {
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      const [a, b] = pts
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        offset,
      }
    } else if (pts.length === 1) {
      gesture.current = { dist: 0, zoom, mid: pts[0], offset }
    } else {
      gesture.current = null
    }
  }

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    startGesture()
  }

  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const pts = [...pointers.current.values()]
    if (pts.length >= 2 && g.dist > 0) {
      const [a, b] = pts
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      // Pinch: scale around the starting midpoint, then follow the midpoint (two-finger pan).
      const pannedOffset = { x: g.offset.x + (mid.x - g.mid.x), y: g.offset.y + (mid.y - g.mid.y) }
      zoomAround(g.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist), toFrame(mid), g.zoom, pannedOffset)
    } else if (pts.length === 1) {
      setOffset(clampOffset({ x: g.offset.x + (pts[0].x - g.mid.x), y: g.offset.y + (pts[0].y - g.mid.y) }))
    }
  }

  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    startGesture() // remaining finger continues as a drag from its current position
  }

  // Mouse wheel / trackpad zoom on desktop (non-passive so the page doesn't scroll).
  const wheelState = useRef({ zoom, offset })
  useEffect(() => {
    wheelState.current = { zoom, offset }
  }, [zoom, offset])
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const { zoom: z, offset: o } = wheelState.current
      zoomAround(z * Math.exp(-e.deltaY * 0.0015), toFrame({ x: e.clientX, y: e.clientY }), z, o)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat])

  function confirm() {
    if (!nat || !imgRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    // Same background as the editor frame, so uncovered areas look identical.
    ctx.fillStyle = '#FFFDF7'
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
        <p className="text-[#F4ECDA] font-[family-name:var(--font-display)] font-bold text-xl mb-5">
          Bild ausrichten
        </p>

        <div
          ref={frameRef}
          className="relative rounded-full overflow-hidden border-2 border-[#2E6B3A] touch-none select-none bg-[#FFFDF7] cursor-grab active:cursor-grabbing"
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
            className="absolute max-w-none select-none pointer-events-none"
            style={{ left, top, width: rw, height: rh }}
          />
        </div>

        <div className="w-full max-w-xs mt-6 flex items-center gap-3">
          <span className="text-[#D8CDB4] text-xs">−</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={e => zoomAround(parseFloat(e.target.value), { x: 0, y: 0 }, zoom, offset)}
            className="flex-1 accent-[#5BA46A]"
          />
          <span className="text-[#D8CDB4] text-xs">+</span>
        </div>
        <p className="text-[#D8CDB4] text-xs mt-3 text-center">
          Ziehen zum Verschieben · Regler, Mausrad oder zwei Finger zum Zoomen
        </p>
        <button
          onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}
          className="text-[#D8CDB4] text-xs underline mt-2"
        >
          Zurücksetzen
        </button>

        <div className="flex gap-3 mt-6 w-full max-w-xs pb-[env(safe-area-inset-bottom)]">
          <button
            onClick={onCancel}
            className="flex-1 bg-[#FFFDF7] text-[#23201A] font-medium rounded-2xl py-3"
          >
            Abbrechen
          </button>
          <button
            onClick={confirm}
            disabled={!nat}
            className="flex-1 bg-[#2E6B3A] hover:bg-[#3A8049] disabled:opacity-50 text-white font-semibold rounded-2xl py-3"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </Portal>
  )
}
