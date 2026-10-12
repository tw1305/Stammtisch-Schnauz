/** Shared, pre-rendered fire particle sprites (FireRing + fire explosion effect). */

// Colour ramp over a particle's life: white-hot → yellow → orange → red → dark smoke.
const STOPS: [number, [number, number, number]][] = [
  [0, [255, 250, 225]],
  [0.15, [255, 214, 90]],
  [0.4, [255, 140, 30]],
  [0.7, [225, 60, 20]],
  [1, [90, 20, 10]],
]

export function fireColorAt(t: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1]
      const [t1, c1] = STOPS[i]
      const k = (t - t0) / (t1 - t0)
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

// Pre-rendered soft blobs per colour step, so each frame is just drawImage calls.
export const FIRE_SPRITE_STEPS = 24
let sprites: HTMLCanvasElement[] | null = null
export function getFireSprites(): HTMLCanvasElement[] {
  if (sprites) return sprites
  sprites = Array.from({ length: FIRE_SPRITE_STEPS }, (_, i) => {
    const s = document.createElement('canvas')
    s.width = s.height = 64
    const g = s.getContext('2d')!
    const [r, gr, b] = fireColorAt(i / (FIRE_SPRITE_STEPS - 1))
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, `rgba(${r | 0},${gr | 0},${b | 0},1)`)
    grad.addColorStop(0.45, `rgba(${r | 0},${gr | 0},${b | 0},0.55)`)
    grad.addColorStop(1, `rgba(${r | 0},${gr | 0},${b | 0},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return s
  })
  return sprites
}

