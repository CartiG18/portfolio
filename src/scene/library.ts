import * as THREE from 'three'
import { VoxelBuilder, type BlockStyle } from './voxels.ts'
import type { ExhibitId } from '../data/exhibits.ts'

/** Victorian library interior: dark woods, maroon, brass, candlelight. */
export const LIBRARY_STYLES: Record<string, BlockStyle> = {
  floorA: { color: 0x3b2416, jitter: 0.12, castShadow: false },
  floorB: { color: 0x2f1c11, jitter: 0.12, castShadow: false },
  wainscot: { color: 0x2a170d, jitter: 0.1 },
  trimWood: { color: 0x4a2c18, jitter: 0.08 },
  maroon: { color: 0x48161b, jitter: 0.1 },
  crown: { color: 0x3a2214, jitter: 0.08 },
  woodDark: { color: 0x24140b, jitter: 0.1 },
  shelfBoard: { color: 0x553319, jitter: 0.1 },
  tableWood: { color: 0x4a2a17, jitter: 0.08 },
  leather: { color: 0x5c1a1a, jitter: 0.12 },
  carpet: { color: 0x4a1015, jitter: 0.06, castShadow: false },
  carpetGold: { color: 0x9a7330, jitter: 0.05, castShadow: false },
  brass: { color: 0xc9a14a, emissive: 0x3a2604, emissiveIntensity: 0.5, jitter: 0.08 },
  wax: { color: 0xf1e6c8, jitter: 0.05, castShadow: false },
  flame: { color: 0xffd27a, emissive: 0xff9a2a, emissiveIntensity: 2.0, castShadow: false },
  greenGlass: { color: 0x2f7a4a, emissive: 0x1f8a4a, emissiveIntensity: 1.6, castShadow: false },
  bookRed: { color: 0x9a2a26, jitter: 0.3 },
  bookGreen: { color: 0x2d6a45, jitter: 0.3 },
  bookNavy: { color: 0x2c3f70, jitter: 0.3 },
  bookBrown: { color: 0x7d5228, jitter: 0.3 },
  bookOchre: { color: 0xb88431, jitter: 0.3 },
  bookBlack: { color: 0x2e2925, jitter: 0.3 },
  beyond: { color: 0x030202, castShadow: false },
  ceiling: { color: 0x2c1910, jitter: 0.08, castShadow: false },
}

const BOOKS = ['bookRed', 'bookGreen', 'bookNavy', 'bookBrown', 'bookOchre', 'bookBlack', 'bookRed', 'bookBrown']

/** Room extents (inner floor is x -13..13, z -18..0; walls at x ±14 and z -19). */
const ROOM = { halfW: 14, back: -19, front: 1, height: 12, shelfTop: 9 }

type Wall = 'back' | 'left' | 'right'

export interface DoorSpot {
  id: ExhibitId
  wall: Wall
  /** Centre of the opening, on the room-side face of the wall. */
  center: THREE.Vector3
  /** Unit vector pointing from the wall into the room. */
  normal: THREE.Vector3
  width: number
  height: number
}

export interface PortraitSpot {
  id: 'github' | 'linkedin'
  center: THREE.Vector3
  normal: THREE.Vector3
}

export interface LibraryInfo {
  doors: DoorSpot[]
  portraits: PortraitSpot[]
  chandeliers: THREE.Vector3[]
  tableCandles: THREE.Vector3[]
  sconces: THREE.Vector3[]
}

interface DoorDef {
  id: ExhibitId
  wall: Wall
  /** Position along the wall (x for the back wall, z for side walls). */
  at: number
  halfWidth: number
  height: number
}

const DOOR_DEFS: DoorDef[] = [
  { id: 'about', wall: 'back', at: -8, halfWidth: 1, height: 5 },
  { id: 'projects', wall: 'back', at: 0, halfWidth: 2, height: 7 },
  { id: 'skills', wall: 'back', at: 8, halfWidth: 1, height: 5 },
  { id: 'resume', wall: 'left', at: -13, halfWidth: 1, height: 5 },
  { id: 'cv', wall: 'left', at: -6, halfWidth: 1, height: 5 },
  { id: 'experience', wall: 'right', at: -13, halfWidth: 1, height: 5 },
]

/** Range along the right wall kept clear of shelves for the framed links. */
const PORTRAIT_RANGE = [-9, -2]

/** Map (wall, u, y, depth) → world cell. depth 0 = the wall itself, 1 = first cell inside the room. */
function cell(wall: Wall, u: number, y: number, depth: number): [number, number, number] {
  if (wall === 'back') return [u, y, ROOM.back + depth]
  if (wall === 'left') return [-ROOM.halfW + depth, y, u]
  return [ROOM.halfW - depth, y, u]
}

function wallNormal(wall: Wall): THREE.Vector3 {
  if (wall === 'back') return new THREE.Vector3(0, 0, 1)
  if (wall === 'left') return new THREE.Vector3(1, 0, 0)
  return new THREE.Vector3(-1, 0, 0)
}

function wallRange(wall: Wall): [number, number] {
  return wall === 'back' ? [-ROOM.halfW, ROOM.halfW] : [ROOM.back, ROOM.front - 1]
}

function inOpening(d: DoorDef, u: number, y: number): boolean {
  const off = Math.abs(u - d.at)
  if (y < 1) return false
  if (y < d.height) return off <= d.halfWidth
  if (y === d.height) return off <= d.halfWidth - 1 // stepped arch
  return false
}

export function buildLibrary(b: VoxelBuilder, rand: () => number): LibraryInfo {
  // ---------- Floor: dark plank rows ----------
  for (let x = -ROOM.halfW; x <= ROOM.halfW; x++)
    for (let z = ROOM.back; z <= ROOM.front + 1; z++) b.set(x % 2 === 0 ? 'floorA' : 'floorB', x, 0, z)

  // Maroon runner with a gold border leading to the gallery doors.
  b.prop('carpetGold', 0, 0.52, -9, 5.6, 0.05, 20.4)
  b.prop('carpet', 0, 0.55, -9, 5, 0.06, 20)

  const doorsOn = (wall: Wall) => DOOR_DEFS.filter((d) => d.wall === wall)
  const doors: DoorSpot[] = []
  const sconces: THREE.Vector3[] = []

  for (const wall of ['back', 'left', 'right'] as Wall[]) {
    const [u0, u1] = wallRange(wall)
    const defs = doorsOn(wall)

    // ---------- Wall surface ----------
    for (let u = u0; u <= u1; u++)
      for (let y = 1; y <= ROOM.height; y++) {
        const door = defs.find((d) => inOpening(d, u, y))
        if (door) {
          b.set('beyond', ...cell(wall, u, y, -1))
          continue
        }
        const style = y <= 2 ? 'wainscot' : y === 3 ? 'trimWood' : y === ROOM.height ? 'crown' : 'maroon'
        b.set(style, ...cell(wall, u, y, 0))
      }

    // ---------- Door frames ----------
    for (const d of defs) {
      const frameStyle = 'woodDark'
      for (let y = 1; y <= d.height + 1; y++) {
        b.set(frameStyle, ...cell(wall, d.at - d.halfWidth - 1, y, 1))
        b.set(frameStyle, ...cell(wall, d.at + d.halfWidth + 1, y, 1))
      }
      for (let u = d.at - d.halfWidth - 1; u <= d.at + d.halfWidth + 1; u++) b.set('trimWood', ...cell(wall, u, d.height + 1, 1))
      // Brass caps on the frame posts.
      for (const side of [-1, 1]) {
        const [x, y, z] = cell(wall, d.at + side * (d.halfWidth + 1), d.height + 2, 1)
        b.prop('brass', x, y - 0.3, z, 0.5, 0.4, 0.5)
      }

      const [cx, , cz] = cell(wall, d.at, 0, 0)
      const n = wallNormal(wall)
      doors.push({
        id: d.id,
        wall,
        center: new THREE.Vector3(cx, 0.5 + d.height / 2, cz).addScaledVector(n, 0.5),
        normal: n,
        width: d.halfWidth * 2 + 1,
        height: d.height,
      })

      // Candle sconces flanking each door, just above the shelves' base.
      for (const side of [-1, 1]) {
        const [x, y, z] = cell(wall, d.at + side * (d.halfWidth + 2), 0, 1)
        const p = new THREE.Vector3(x, y, z).addScaledVector(n, -0.2)
        const sconce = p.clone().setY(ROOM.shelfTop + 1.2)
        b.prop('brass', sconce.x, sconce.y - 0.3, sconce.z, 0.35, 0.15, 0.35)
        b.prop('wax', sconce.x, sconce.y, sconce.z, 0.14, 0.45, 0.14)
        b.prop('flame', sconce.x, sconce.y + 0.32, sconce.z, 0.1, 0.18, 0.1)
        sconces.push(sconce.clone().setY(sconce.y + 0.32))
      }
    }

    // ---------- Bookshelves ----------
    const blocked = (u: number) =>
      defs.some((d) => Math.abs(u - d.at) <= d.halfWidth + 1) ||
      (wall === 'right' && u >= PORTRAIT_RANGE[0] && u <= PORTRAIT_RANGE[1]) ||
      (wall === 'back' && Math.abs(u) >= ROOM.halfW - 1) || // corners belong to the side shelves
      (wall !== 'back' && (u <= ROOM.back || u > 0))

    let runIndex = 0
    for (let u = u0; u <= u1; u++) {
      if (blocked(u)) {
        runIndex = 0
        continue
      }
      const startsRun = blocked(u - 1) || runIndex % 4 === 0
      const endsRun = blocked(u + 1)
      runIndex++
      b.set('woodDark', ...cell(wall, u, 1, 1))
      b.set('crown', ...cell(wall, u, ROOM.shelfTop, 1))
      // Thin vertical dividers between shelf bays.
      const along = wall === 'back' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
      for (const [edge, side] of [[startsRun, -1], [endsRun, 1]] as const) {
        if (!edge) continue
        const [x, , z] = cell(wall, u, 0, 1)
        const p = new THREE.Vector3(x, (ROOM.shelfTop + 1) / 2, z).addScaledVector(along, side * 0.46)
        if (wall === 'back') b.prop('woodDark', p.x, p.y, p.z, 0.14, ROOM.shelfTop - 1.5, 0.98)
        else b.prop('woodDark', p.x, p.y, p.z, 0.98, ROOM.shelfTop - 1.5, 0.14)
      }
      for (let y = 2; y < ROOM.shelfTop; y++) {
        const [x, , z] = cell(wall, u, y, 1)
        const n = wallNormal(wall)
        // Shelf board under each row of books.
        const boardPos = new THREE.Vector3(x, y - 0.45, z)
        b.prop(
          'shelfBoard',
          boardPos.x,
          boardPos.y,
          boardPos.z,
          wall === 'back' ? 1 : 0.95,
          0.1,
          wall === 'back' ? 0.95 : 1,
        )
        // Books packed across the cell, with the odd gap.
        let offset = -0.46
        while (offset < 0.4) {
          const thick = 0.1 + rand() * 0.12
          if (rand() < 0.07) {
            offset += thick + 0.1
            continue
          }
          const tall = 0.55 + rand() * 0.3
          const depth = 0.55 + rand() * 0.15
          const pos = new THREE.Vector3(x, y - 0.4 + tall / 2, z)
            .addScaledVector(along, offset + thick / 2)
            .addScaledVector(n, -0.45 + depth / 2)
          const style = BOOKS[Math.floor(rand() * BOOKS.length)]
          if (wall === 'back') b.prop(style, pos.x, pos.y, pos.z, thick * 0.92, tall, depth)
          else b.prop(style, pos.x, pos.y, pos.z, depth, tall, thick * 0.92)
          offset += thick
        }
      }
    }
  }

  // Coffered ceiling: dark panels between heavy beams.
  b.fill('ceiling', -ROOM.halfW, ROOM.height + 1, ROOM.back, ROOM.halfW, ROOM.height + 1, ROOM.front)
  for (let z = ROOM.back + 1; z <= ROOM.front; z += 3) b.prop('woodDark', 0, ROOM.height + 0.35, z, ROOM.halfW * 2, 0.5, 0.5)
  for (const x of [-9, -3, 3, 9]) b.prop('woodDark', x, ROOM.height + 0.35, (ROOM.back + ROOM.front) / 2, 0.5, 0.5, ROOM.front - ROOM.back)

  // Corner posts where the walls meet the open front.
  for (const x of [-ROOM.halfW, ROOM.halfW]) b.fill('woodDark', x, 1, ROOM.front, x, ROOM.height, ROOM.front)

  // Rolling library ladder against the back shelves.
  for (const x of [-4.4, -3.6]) b.prop('woodDark', x, 5, -17.3, 0.12, 9, 0.12)
  for (let y = 1.5; y <= 9; y += 0.9) b.prop('tableWood', -4, y, -17.3, 0.8, 0.08, 0.1)

  // ---------- Reading tables, chairs, lamps, candles ----------
  const tableCandles: THREE.Vector3[] = []
  for (const tx of [-6.5, 6.5]) {
    b.prop('tableWood', tx, 1.7, -9, 2.6, 0.2, 9)
    for (const dx of [-1.1, 1.1]) for (const dz of [-4.2, 4.2]) b.prop('woodDark', tx + dx, 1.05, -9 + dz, 0.25, 1.1, 0.25)
    for (const z of [-11.5, -6.5]) {
      b.prop('brass', tx, 2.05, z, 0.18, 0.5, 0.18)
      b.prop('greenGlass', tx, 2.35, z, 0.9, 0.25, 0.45)
    }
    for (const z of [-13, -9, -5]) {
      b.prop('brass', tx, 1.85, z, 0.3, 0.08, 0.3)
      b.prop('wax', tx, 2.1, z, 0.14, 0.45, 0.14)
      b.prop('flame', tx, 2.42, z, 0.1, 0.18, 0.1)
      tableCandles.push(new THREE.Vector3(tx, 2.42, z))
    }
    // A few books left open on the table.
    for (const z of [-12.2, -8, -3.8]) {
      b.prop(BOOKS[Math.floor(rand() * 6)], tx + 0.5, 1.86, z, 0.7, 0.1, 0.5)
      b.prop('wax', tx + 0.5, 1.92, z, 0.62, 0.03, 0.44)
    }
    for (const side of [-1, 1])
      for (const z of [-12, -9, -6]) {
        const cx = tx + side * 1.9
        b.prop('woodDark', cx, 0.85, z, 0.8, 0.7, 0.8)
        b.prop('leather', cx, 1.25, z, 0.9, 0.15, 0.9)
        b.prop('leather', cx + side * 0.4, 1.85, z, 0.15, 1.1, 0.9)
      }
  }

  // ---------- Chandeliers ----------
  const chandeliers = [new THREE.Vector3(0, 10.4, -4.5), new THREE.Vector3(0, 10.4, -9.5)]
  for (const c of chandeliers) {
    b.prop('brass', c.x, (c.y + ROOM.height + 1) / 2, c.z, 0.08, ROOM.height + 1 - c.y, 0.08)
    b.prop('brass', c.x, c.y, c.z, 0.5, 1.1, 0.5)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const x = c.x + Math.cos(a) * 1.8
      const z = c.z + Math.sin(a) * 1.8
      b.prop('brass', (c.x + x) / 2, c.y - 0.35, (c.z + z) / 2, 0.15, 0.1, 0.15)
      b.prop('brass', x, c.y - 0.35, z, 0.3, 0.12, 0.3)
      b.prop('wax', x, c.y - 0.05, z, 0.12, 0.45, 0.12)
      b.prop('flame', x, c.y + 0.28, z, 0.1, 0.18, 0.1)
    }
  }

  const portraits: PortraitSpot[] = [
    { id: 'github', center: new THREE.Vector3(ROOM.halfW - 0.45, 6.5, -7.5), normal: new THREE.Vector3(-1, 0, 0) },
    { id: 'linkedin', center: new THREE.Vector3(ROOM.halfW - 0.45, 6.5, -3.5), normal: new THREE.Vector3(-1, 0, 0) },
  ]
  for (const p of portraits) {
    const frame = p.center.clone().addScaledVector(p.normal, 0.05)
    b.prop('brass', frame.x, frame.y, frame.z, 0.12, 3.6, 2.9)
  }

  return { doors, portraits, chandeliers, tableCandles, sconces }
}
