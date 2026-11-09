import * as THREE from 'three'
import { mulberry32 } from './voxels.ts'

/**
 * Procedural pixel-art textures for the voxel library. Each is drawn as a near-white
 * luminance pattern so the block style's colour (and per-instance jitter) stays in charge;
 * the texture only adds grain, seams and motifs. Nearest filtering keeps the pixels crisp.
 */
export type TextureName = 'planks' | 'grain' | 'damask' | 'leather' | 'carpet' | 'coffer' | 'brass' | 'paper'

const SIZE = 32
const cache = new Map<TextureName, THREE.CanvasTexture>()

type Draw = (px: (x: number, y: number, v: number) => void, rand: () => number) => void

function make(seed: number, draw: Draw): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(SIZE, SIZE)
  const values = new Float32Array(SIZE * SIZE).fill(1)
  const px = (x: number, y: number, v: number) => {
    const xi = ((Math.floor(x) % SIZE) + SIZE) % SIZE
    const yi = ((Math.floor(y) % SIZE) + SIZE) % SIZE
    values[yi * SIZE + xi] = v
  }
  draw(px, mulberry32(seed))
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(1, values[i])) * 255
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const DRAWERS: Record<TextureName, [number, Draw]> = {
  // Floorboards: four boards per block, dark seams, staggered butt joints, streaky grain.
  planks: [
    11,
    (px, r) => {
      for (let board = 0; board < 4; board++) {
        const base = 0.82 + r() * 0.14
        const joint = Math.floor(r() * SIZE)
        for (let y = board * 8; y < board * 8 + 8; y++)
          for (let x = 0; x < SIZE; x++) {
            const streak = Math.sin((x + board * 7) * 0.45 + Math.sin(y * 1.3) * 1.5) * 0.05
            let v = base + streak + (r() - 0.5) * 0.05
            if (y === board * 8) v = 0.45
            if (x === joint) v = 0.5
            px(x, y, v)
          }
        if (r() < 0.6) {
          const kx = Math.floor(r() * SIZE)
          const ky = board * 8 + 3 + Math.floor(r() * 3)
          px(kx, ky, 0.55)
          px(kx + 1, ky, 0.62)
        }
      }
    },
  ],
  // Fine vertical grain for furniture, shelving and panelling.
  grain: [
    23,
    (px, r) => {
      const offsets = Array.from({ length: SIZE }, () => r())
      for (let x = 0; x < SIZE; x++)
        for (let y = 0; y < SIZE; y++) {
          const wave = Math.sin(y * 0.35 + offsets[x] * 6 + x * 0.9) * 0.06
          const ring = Math.sin(x * 0.8 + Math.sin(y * 0.2) * 2) > 0.85 ? -0.12 : 0
          px(x, y, 0.86 + wave + ring + (r() - 0.5) * 0.04)
        }
    },
  ],
  // Damask wallpaper: a lighter diamond-and-fleur motif over a fine stripe.
  damask: [
    37,
    (px, r) => {
      for (let x = 0; x < SIZE; x++)
        for (let y = 0; y < SIZE; y++) {
          const cx = Math.abs(x - 15.5)
          const cy = Math.abs(y - 15.5)
          const diamond = cx / 12 + cy / 15 < 1 && cx / 9 + cy / 12 > 0.72
          const bud = Math.hypot(cx, cy - 6) < 2.4 || Math.hypot(cx, cy + 6) < 2.4 || Math.hypot(cx - 5, cy) < 1.8
          const corner = Math.hypot(Math.min(x, SIZE - x), Math.min(y, SIZE - y)) < 3
          let v = 0.8 + (x % 4 === 0 ? -0.04 : 0) + (r() - 0.5) * 0.03
          if (diamond || bud || corner) v = 1
          px(x, y, v)
        }
    },
  ],
  // Leather: mottled hide with button-tufting.
  leather: [
    41,
    (px, r) => {
      for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) px(x, y, 0.82 + (r() - 0.5) * 0.12)
      for (const [bx, by] of [[8, 8], [24, 8], [16, 24], [0, 24], [32, 24]]) {
        px(bx, by, 0.45)
        px(bx + 1, by, 0.55)
        for (let d = 1; d < 5; d++) {
          px(bx + d, by + d, 0.7)
          px(bx - d, by + d, 0.7)
        }
      }
    },
  ],
  // Woven carpet pile.
  carpet: [
    53,
    (px, r) => {
      for (let x = 0; x < SIZE; x++)
        for (let y = 0; y < SIZE; y++) {
          const weave = (x + y) % 4 === 0 || (x - y + 64) % 8 === 0 ? 0.08 : 0
          px(x, y, 0.84 + weave + (r() - 0.5) * 0.1)
        }
    },
  ],
  // Ceiling coffer: recessed panel with a lit bottom edge and shadowed top edge.
  coffer: [
    67,
    (px, r) => {
      for (let x = 0; x < SIZE; x++)
        for (let y = 0; y < SIZE; y++) {
          const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y)
          let v = 0.75 + (r() - 0.5) * 0.05
          if (edge < 3) v = 0.95
          else if (edge < 5) v = y < SIZE / 2 ? 0.55 : 0.9
          else if (edge === 9) v = 0.88
          px(x, y, v)
        }
    },
  ],
  // Aged, brushed brass.
  brass: [
    79,
    (px, r) => {
      for (let y = 0; y < SIZE; y++) {
        const row = 0.85 + (r() - 0.5) * 0.15
        for (let x = 0; x < SIZE; x++) px(x, y, row + (r() - 0.5) * 0.06 - (r() < 0.03 ? 0.25 : 0))
      }
    },
  ],
  paper: [
    83,
    (px, r) => {
      for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) px(x, y, 0.92 + (r() - 0.5) * 0.08)
    },
  ],
}

export function getTexture(name: TextureName): THREE.CanvasTexture {
  let t = cache.get(name)
  if (!t) {
    const [seed, draw] = DRAWERS[name]
    t = make(seed, draw)
    cache.set(name, t)
  }
  return t
}

/** Textures are shared between scenes; drop them when the 3D views are torn down. */
export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose()
  cache.clear()
}
