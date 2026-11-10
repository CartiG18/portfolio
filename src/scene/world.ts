import * as THREE from 'three'
import { VoxelBuilder, type BlockStyle } from './voxels.ts'

/** Terrain bounds in blocks (the camera looks toward -z). */
const BOUNDS = { x: 70, zMin: -72, zMax: 34 }

export const GROUND_STYLES: Record<string, BlockStyle> = {
  grass: { color: 0x2f7030, jitter: 0.18, castShadow: false },
  grassDark: { color: 0x245a26, jitter: 0.15, castShadow: false },
  // Trees and ground clutter don't receive shadows (cheaper shading; they're mostly in shade).
  dirt: { color: 0x4a3324, jitter: 0.15, castShadow: false, receiveShadow: false },
  path: { color: 0x7d7a72, jitter: 0.18, castShadow: false },
  rock: { color: 0x5d6168, jitter: 0.2, receiveShadow: false },
  trunk: { color: 0x4a3020, jitter: 0.15, receiveShadow: false },
  pine: { color: 0x2c6a48, jitter: 0.25, receiveShadow: false },
  pineDark: { color: 0x215538, jitter: 0.2, receiveShadow: false },
  tuft: { color: 0x4a9440, jitter: 0.3, castShadow: false, receiveShadow: false },
  flower: { color: 0xb9c6ff, emissive: 0x6d7dff, emissiveIntensity: 1.6, castShadow: false, receiveShadow: false },
  mushroom: { color: 0x7fe3ff, emissive: 0x29b6e8, emissiveIntensity: 2.2, castShadow: false, receiveShadow: false },
  iron: { color: 0x1e1f24, jitter: 0.1 },
  lantern: { color: 0xffd38a, emissive: 0xffa53d, emissiveIntensity: 2.6, castShadow: false },
  hedge: { color: 0x1f4f2a, jitter: 0.2, receiveShadow: false },
  basin: { color: 0xbdb3a0, jitter: 0.1 },
  water: { color: 0x3a6a8a, emissive: 0x1b4a7a, emissiveIntensity: 0.9, castShadow: false },
}

export const MUSEUM_STYLES: Record<string, BlockStyle> = {
  terrace: { color: 0xa39d90, jitter: 0.1 },
  plinth: { color: 0x9d9282, jitter: 0.14 },
  limestone: { color: 0xcfc0a0, jitter: 0.07 },
  pilaster: { color: 0xddd0b4, jitter: 0.05 },
  column: { color: 0xe2d8c2, jitter: 0.04 },
  trim: { color: 0xd3c3a0, jitter: 0.06 },
  gold: { color: 0xe0b24a, emissive: 0x6a4608, emissiveIntensity: 0.7, jitter: 0.08 },
  slate: { color: 0x34404d, jitter: 0.12 },
  slateDark: { color: 0x27303a, jitter: 0.1 },
  window: { color: 0xffd9a0, emissive: 0xffa94d, emissiveIntensity: 1.05, castShadow: false },
  door: { color: 0xffc77a, emissive: 0xff9a35, emissiveIntensity: 1.3, castShadow: false },
}

export interface MuseumInfo {
  center: THREE.Vector3
  doorway: THREE.Vector3
  lanterns: THREE.Vector3[]
  fountains: THREE.Vector3[]
}

const CLEARING = 17

function clearingDistance(x: number, z: number): number {
  return Math.hypot(x / 1.55, (z + 4) / 1.05)
}

function isPath(x: number, z: number): boolean {
  return Math.abs(x) <= 2 && z >= 3 && z <= BOUNDS.zMax
}

function isMuseumPlot(x: number, z: number): boolean {
  return (x >= -23 && x <= 23 && z >= -17 && z <= 6) || isGarden(x, z)
}

/** Formal garden in front of the palace, kept clear of trees. */
function isGarden(x: number, z: number): boolean {
  return Math.abs(x) <= 15 - Math.max(0, z - 20) * 0.6 && z > 6 && z <= 30
}

function terrainHeight(x: number, z: number, rand: () => number): number {
  const d = clearingDistance(x, z)
  const wobble = Math.sin(x * 0.35) * 1.3 + Math.cos(z * 0.4) * 1.3 + rand() * 1.1
  if (d < CLEARING + wobble || isMuseumPlot(x, z) || isPath(x, z)) return 0
  const n = Math.sin(x * 0.19) + Math.cos(z * 0.17) + Math.sin((x + z) * 0.1)
  return Math.max(0, Math.min(5, Math.round(n * 0.8 + (d - CLEARING) * 0.06)))
}

function pine(b: VoxelBuilder, x: number, ground: number, z: number, rand: () => number): void {
  const height = 7 + Math.floor(rand() * 6)
  const leafStyle = rand() < 0.4 ? 'pineDark' : 'pine'
  for (let y = ground + 1; y <= ground + height - 2; y++) b.set('trunk', x, y, z)
  const tiers = height - 2
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1)
    const r = Math.max(0, Math.round((1 - t) * 2.4 - (i % 2) * 0.7))
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (r >= 2 && Math.abs(dx) === r && Math.abs(dz) === r) continue
        b.set(leafStyle, x + dx, ground + 3 + i, z + dz)
      }
  }
  b.set(leafStyle, x, ground + 3 + tiers, z)
}

export function buildGrounds(b: VoxelBuilder, rand: () => number): Pick<MuseumInfo, 'lanterns' | 'fountains'> {
  const heights = new Map<string, number>()
  for (let x = -BOUNDS.x; x <= BOUNDS.x; x++)
    for (let z = BOUNDS.zMin; z <= BOUNDS.zMax; z++) {
      const h = terrainHeight(x, z, rand)
      heights.set(`${x},${z}`, h)
      for (let y = 0; y < h; y++) b.set('dirt', x, y, z)
      b.set(isPath(x, z) ? 'path' : rand() < 0.3 ? 'grassDark' : 'grass', x, h, z)
    }

  // Forest of pines beyond the clearing.
  const trunks: Array<[number, number]> = []
  for (let x = -BOUNDS.x + 2; x <= BOUNDS.x - 2; x++)
    for (let z = BOUNDS.zMin + 2; z <= BOUNDS.zMax - 2; z++) {
      const d = clearingDistance(x, z)
      if (d < CLEARING + 1 || isPath(x, z) || isMuseumPlot(x, z)) continue
      if (rand() > (d < CLEARING + 4 ? 0.05 : 0.085)) continue
      // Skip trees that would sit entirely in the fog (beyond ~155 units from the sky camera).
      if (Math.hypot(x, 75 - 6, z - 68) > 155) continue
      if (trunks.some(([tx, tz]) => Math.abs(tx - x) < 3 && Math.abs(tz - z) < 3)) continue
      trunks.push([x, z])
      const h = heights.get(`${x},${z}`)!
      pine(b, x, h, z, rand)
      if (rand() < 0.2) b.prop('mushroom', x + 1, h + 0.62, z + (rand() < 0.5 ? 1 : -1), 0.25, 0.25, 0.25)
    }

  // Clearing details.
  for (let x = -32; x <= 32; x++)
    for (let z = -24; z <= 26; z++) {
      const h = heights.get(`${x},${z}`)
      if (h === undefined || b.has(x, h + 1, z) || isPath(x, z) || isMuseumPlot(x, z)) continue
      const r = rand()
      const ox = (rand() - 0.5) * 0.6
      const oz = (rand() - 0.5) * 0.6
      if (r < 0.2) b.prop('tuft', x + ox, h + 0.65, z + oz, 0.14, 0.3, 0.14)
      else if (r < 0.222) b.prop('flower', x + ox, h + 0.6, z + oz, 0.18, 0.18, 0.18)
      else if (r < 0.23) b.set('rock', x, h + 1, z)
    }

  // Formal garden: hedges lining the approach, two fountains, Parisian lamp posts.
  for (const side of [-1, 1]) {
    b.fill('hedge', side * 4, 1, 9, side * 4, 1, 24)
    b.fill('hedge', side * 12, 1, 9, side * 12, 1, 18)
  }
  const fountains = [new THREE.Vector3(-8, 1, 13), new THREE.Vector3(8, 1, 13)]
  for (const f of fountains) {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2
        if (edge) b.set('basin', f.x + dx, 1, f.z + dz)
        else b.prop('water', f.x + dx, 0.85, f.z + dz, 1, 0.3, 1)
      }
    b.fill('basin', f.x, 1, f.z, f.x, 2, f.z)
    b.prop('water', f.x, 2.75, f.z, 0.5, 0.5, 0.5)
  }

  const lanterns: THREE.Vector3[] = []
  for (const z of [8, 15, 22, 29])
    for (const x of [-3, 3]) {
      b.fill('iron', x, 1, z, x, 3, z)
      b.prop('lantern', x, 4.05, z, 0.6, 0.65, 0.6)
      b.prop('iron', x, 4.5, z, 0.75, 0.15, 0.75)
      lanterns.push(new THREE.Vector3(x, 4.05, z))
    }
  return { lanterns, fountains }
}

/** A heavily ornamented French Renaissance palace, voxel style. Front faces +z. */
export function buildMuseum(b: VoxelBuilder): Pick<MuseumInfo, 'center' | 'doorway'> {
  // Terrace, rusticated plinth, and front steps.
  b.fill('terrace', -22, 1, -16, 22, 1, 4)
  b.fill('plinth', -20, 2, -15, 20, 2, 1)
  b.fill('terrace', -4, 2, 2, 4, 2, 2)

  // ----- Wings (x 7..13 on each side) -----
  for (const s of [-1, 1]) {
    const xs: number[] = []
    for (let i = 7; i <= 13; i++) xs.push(i * s)
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)

    for (const x of xs) {
      const windowBay = Math.abs(x) % 2 === 0
      for (let y = 3; y <= 10; y++) {
        const isWindow = windowBay && ((y >= 3 && y <= 5) || (y >= 7 && y <= 9))
        b.set(isWindow ? 'window' : 'limestone', x, y, -2)
      }
      b.fill('limestone', x, 3, -14, x, 11, -3)
      if (windowBay) {
        b.prop('gold', x, 6.2, -1.45, 0.4, 0.4, 0.15) // keystone over the arched window
        b.prop('trim', x, 9.75, -1.4, 1.3, 0.25, 0.3) // window pediment
      } else {
        b.fill('pilaster', x, 3, -1, x, 10, -1)
        b.prop('gold', x, 10.45, -0.95, 1.1, 0.3, 1.1)
      }
    }
    b.prop('trim', s * 10, 6.5, -1.4, hi - lo + 1, 0.3, 0.3) // floor band
    b.fill('trim', lo, 11, -1, hi, 11, -1) // cornice
    for (let x = lo; x <= hi; x += 0.5) b.prop('limestone', x, 12.05, -1, 0.22, 0.8, 0.22) // balustrade
    b.prop('trim', s * 10, 12.5, -1, hi - lo + 1, 0.18, 0.35)

    // Mansard roof with dormers and gold cresting.
    b.fill('slate', lo, 12, -14, hi, 12, -2)
    b.fill('slate', lo, 13, -13, hi, 13, -3)
    b.fill('slateDark', lo, 14, -12, hi, 14, -4)
    for (const x of xs) {
      if (Math.abs(x) % 2 !== 0) continue
      b.set('limestone', x, 13, -2)
      b.prop('window', x, 13, -1.45, 0.5, 0.6, 0.1)
      b.prop('gold', x, 13.65, -2, 0.9, 0.25, 0.9)
    }
    for (let x = lo; x <= hi; x += 2) b.prop('gold', x, 14.75, -8, 0.3, 0.5, 0.3)
  }

  // ----- End pavilions (|x| 14..19), project forward and rise higher -----
  for (const s of [-1, 1]) {
    const lo = Math.min(14 * s, 19 * s)
    const hi = Math.max(14 * s, 19 * s)
    for (let x = lo; x <= hi; x++)
      for (let y = 3; y <= 12; y++) {
        const inner = Math.abs(x) >= 16 && Math.abs(x) <= 17
        const isWindow = inner && ((y >= 3 && y <= 5) || (y >= 7 && y <= 10))
        b.set(isWindow ? 'window' : 'limestone', x, y, 0)
      }
    b.fill('limestone', lo, 3, -15, hi, 12, -1)
    for (const x of [lo, hi, 15 * s, 18 * s]) {
      b.fill('pilaster', x, 3, 1, x, 12, 1)
      b.prop('gold', x, 12.45, 1.05, 1.1, 0.3, 1.1)
    }
    b.prop('gold', 16.5 * s, 6.3, 0.55, 0.5, 0.5, 0.15)
    b.prop('trim', 16.5 * s, 10.8, 0.6, 2.4, 0.3, 0.3)
    b.fill('trim', lo, 13, -15, hi, 13, 1)
    for (let k = 0; k < 6; k++) {
      const sh = Math.floor(k / 2)
      b.fill(k % 2 ? 'slateDark' : 'slate', lo + sh, 14 + k, -15 + sh, hi - sh, 14 + k, 0 - sh)
      b.prop('gold', lo + sh, 14.6 + k, -sh, 0.25, 0.4, 0.25)
      b.prop('gold', hi - sh, 14.6 + k, -sh, 0.25, 0.4, 0.25)
    }
    b.prop('gold', 16.5 * s, 20.4, -7.5, 0.5, 1.4, 0.5)
    b.prop('gold', 16.5 * s, 21.4, -7.5, 0.25, 0.8, 0.25)
  }

  // ----- Central pavilion (x -6..6), grand entrance -----
  const isDoor = (x: number, y: number) => Math.abs(x) <= 1 && y <= 6
  for (let x = -6; x <= 6; x++)
    for (let y = 3; y <= 13; y++) {
      if (isDoor(x, y)) continue
      const lit =
        (Math.abs(x) === 2 && ((y >= 3 && y <= 5) || (y >= 8 && y <= 10))) ||
        (Math.abs(x) <= 1 && y >= 8 && y <= 10)
      b.set(lit ? 'window' : 'limestone', x, y, 1)
    }
  b.fill('door', -1, 3, 0, 1, 6, 0)
  b.fill('limestone', -6, 3, -15, 6, 13, -1)
  b.prop('gold', 0, 7.2, 1.55, 0.6, 0.6, 0.15)
  b.prop('trim', 0, 7.6, 1.6, 4, 0.3, 0.4)
  for (const x of [-6, -5, -3, 3, 5, 6]) {
    b.set('trim', x, 3, 2)
    b.fill('column', x, 4, 2, x, 12, 2)
    b.prop('gold', x, 12.45, 2, 1.1, 0.3, 1.1)
  }
  b.fill('trim', -7, 13, 0, 7, 13, 2)
  b.prop('gold', 0, 13.5, 2.55, 14, 0.2, 0.15)
  // Pediment with a gilded relief.
  const pediment: Array<[number, number]> = [[14, 6], [15, 4], [16, 2], [17, 0]]
  for (const [y, w] of pediment) {
    b.set('gold', -w, y, 2)
    b.set('gold', w, y, 2)
    b.fill('limestone', -w, y, 1, w, y, 2)
  }
  b.prop('gold', 0, 14.6, 2.55, 3.2, 0.9, 0.15)
  b.prop('gold', 0, 15.4, 2.55, 1.4, 0.7, 0.15)
  // Tall central dome-mansard, crowned with a lantern and spire.
  for (let k = 0; k < 10; k++) {
    const sh = Math.floor(k * 0.6)
    const y = 14 + k
    const x0 = -6 + sh
    const x1 = 6 - sh
    if (x0 > x1) break
    b.fill(k % 2 ? 'slateDark' : 'slate', x0, y, -15 + sh, x1, y, 0 - sh)
    b.prop('gold', x0, y + 0.6, -sh, 0.25, 0.4, 0.25)
    b.prop('gold', x1, y + 0.6, -sh, 0.25, 0.4, 0.25)
    if (k % 3 === 1) b.prop('window', 0, y, 0.55 - sh, 0.7, 0.7, 0.1)
  }
  b.fill('limestone', -1, 24, -9, 1, 25, -7)
  b.prop('window', 0, 24.5, -5.95, 0.6, 0.9, 0.1)
  b.prop('gold', 0, 26.2, -8, 1.6, 0.4, 1.6)
  b.prop('gold', 0, 27.4, -8, 0.4, 2, 0.4)

  return {
    center: new THREE.Vector3(0, 9, -6),
    doorway: new THREE.Vector3(0, 4.5, 0),
  }
}
