import * as THREE from 'three'
import { VoxelBuilder, type BlockStyle } from './voxels.ts'
import type { ExhibitId } from '../data/exhibits.ts'

/** Victorian library interior: dark woods, maroon, brass, candlelight. */
export const LIBRARY_STYLES: Record<string, BlockStyle> = {
  floorA: { color: 0x4a2d1a, jitter: 0.1, castShadow: false, texture: 'planks', roughness: 0.7, floorAO: true },
  floorB: { color: 0x3e2515, jitter: 0.1, castShadow: false, texture: 'planks', roughness: 0.7, floorAO: true },
  wainscot: { color: 0x34200f, jitter: 0.06, texture: 'grain', roughness: 0.6, floorAO: true },
  trimWood: { color: 0x553319, jitter: 0.06, texture: 'grain', roughness: 0.55 },
  maroon: { color: 0x4a1418, jitter: 0.04, texture: 'damask', texScale: 0.5, roughness: 0.9, floorAO: true },
  crown: { color: 0x452816, jitter: 0.06, texture: 'grain', roughness: 0.55 },
  woodDark: { color: 0x2e1a0e, jitter: 0.08, texture: 'grain', roughness: 0.6, floorAO: true },
  shelfBoard: { color: 0x5e3a1d, jitter: 0.08, texture: 'grain', roughness: 0.6 },
  tableWood: { color: 0x5a331b, jitter: 0.05, texture: 'grain', texScale: 2, roughness: 0.45, floorAO: true },
  leather: { color: 0x5a1519, jitter: 0.08, texture: 'leather', texScale: 2, roughness: 0.55 },
  carpet: { color: 0x4f1216, jitter: 0.04, castShadow: false, texture: 'carpet', texScale: 2, roughness: 1 },
  carpetGold: { color: 0x9a7a3e, jitter: 0.04, castShadow: false, texture: 'carpet', texScale: 4, roughness: 0.9 },
  brass: { color: 0xb08d4a, emissive: 0x2e1f06, emissiveIntensity: 0.4, jitter: 0.06, texture: 'brass', texScale: 4, roughness: 0.35, metalness: 0.8 },
  goldFoil: { color: 0xd8b56a, emissive: 0x7a5410, emissiveIntensity: 0.9, castShadow: false, roughness: 0.3, metalness: 0.9 },
  wax: { color: 0xefe3c4, jitter: 0.05, castShadow: false, texture: 'paper', texScale: 4, roughness: 0.8 },
  flame: { color: 0xffd27a, emissive: 0xff9a2a, emissiveIntensity: 2.0, castShadow: false },
  shade: { color: 0xefe3c4, emissive: 0xffb866, emissiveIntensity: 1.1, castShadow: false, texture: 'paper', texScale: 4 },
  bookRed: { color: 0x7e2022, jitter: 0.3, texture: 'leather', texScale: 3, roughness: 0.7 },
  bookUmber: { color: 0x5a331b, jitter: 0.3, texture: 'leather', texScale: 3, roughness: 0.7 },
  bookBurgundy: { color: 0x6a1c20, jitter: 0.3, texture: 'leather', texScale: 3, roughness: 0.7 },
  bookBrown: { color: 0x7d5228, jitter: 0.3, texture: 'leather', texScale: 3, roughness: 0.7 },
  bookTan: { color: 0x9a6f3a, jitter: 0.3, texture: 'leather', texScale: 3, roughness: 0.7 },
  bookBlack: { color: 0x2e2925, jitter: 0.3, texture: 'leather', texScale: 3, roughness: 0.7 },
  beyond: { color: 0x030202, castShadow: false },
  ceiling: { color: 0x3a2214, jitter: 0.06, castShadow: false, texture: 'coffer', texScale: 0.5, roughness: 0.8 },
}

// Warm leathers only: oxblood, burgundy, umber, brown, tan, black.
const BOOKS = ['bookRed', 'bookBurgundy', 'bookUmber', 'bookBrown', 'bookTan', 'bookBlack', 'bookRed', 'bookBrown']

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

/** Soft dark ovals under furniture where it meets the floor. */
export interface ContactShadow {
  x: number
  z: number
  w: number
  d: number
}

export interface LibraryInfo {
  contactShadows: ContactShadow[]
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
  const shelfTops: Array<{ x: number; z: number }> = []
  const contactShadows: ContactShadow[] = []

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
      {
        const [tx, , tz] = cell(wall, u, 0, 1)
        shelfTops.push({ x: tx, z: tz })
      }
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
        shelfRow(b, rand, wall, x, y, z, along, n)
      }
    }
  }

  // Books lying flat on top of some shelf bays.
  for (const t of shelfTops) {
    if (rand() > 0.35) continue
    let top = ROOM.shelfTop + 0.5
    const count = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i++) {
      const h = 0.1 + rand() * 0.06
      const w = 0.5 + rand() * 0.25
      const d = 0.4 + rand() * 0.15
      b.prop(BOOKS[Math.floor(rand() * BOOKS.length)], t.x + (rand() - 0.5) * 0.15, top + h / 2, t.z + (rand() - 0.5) * 0.1, w, h, d, { y: (rand() - 0.5) * 0.5 })
      top += h
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
    readingTable(b, tx, -9)
    contactShadows.push({ x: tx, z: -9, w: 3.4, d: 9.8 })
    for (const z of [-11.5, -6.5]) {
      b.prop('brass', tx, 1.86, z, 0.36, 0.06, 0.36)
      b.prop('brass', tx, 2.12, z, 0.1, 0.5, 0.1)
      b.prop('shade', tx, 2.4, z, 0.85, 0.22, 0.42)
      b.prop('brass', tx, 2.52, z, 0.9, 0.03, 0.46)
    }
    for (const z of [-13, -9, -5]) {
      b.prop('brass', tx, 1.86, z, 0.3, 0.06, 0.3)
      b.prop('brass', tx, 1.93, z, 0.18, 0.08, 0.18)
      b.prop('wax', tx, 2.15, z, 0.13, 0.4, 0.13)
      b.prop('flame', tx, 2.44, z, 0.08, 0.16, 0.08)
      tableCandles.push(new THREE.Vector3(tx, 2.44, z))
    }
    // Open books and a closed stack on each table.
    for (const z of [-12.2, -8, -3.8]) {
      const style = BOOKS[Math.floor(rand() * 6)]
      b.prop(style, tx + 0.5, 1.88, z, 0.72, 0.06, 0.52, { y: (rand() - 0.5) * 0.4 })
      b.prop('wax', tx + 0.36, 1.93, z, 0.33, 0.04, 0.46, { y: (rand() - 0.5) * 0.4, z: 0.08 })
      b.prop('wax', tx + 0.64, 1.93, z, 0.33, 0.04, 0.46, { y: (rand() - 0.5) * 0.4, z: -0.08 })
    }
    for (let i = 0; i < 3; i++) b.prop(BOOKS[Math.floor(rand() * 6)], tx - 0.6, 1.9 + i * 0.13, -10.2, 0.6, 0.12, 0.45, { y: (rand() - 0.5) * 0.5 })
    for (const side of [-1, 1])
      for (const z of [-12, -9, -6]) {
        chair(b, tx + side * 1.95, z, side)
        contactShadows.push({ x: tx + side * 1.95, z, w: 1.1, d: 1.1 })
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

  return { contactShadows, doors, portraits, chandeliers, tableCandles, sconces }
}

/** One shelf row: books of varied height and thickness, a few leaning, some with gold-foil bands. */
function shelfRow(
  b: VoxelBuilder,
  rand: () => number,
  wall: Wall,
  x: number,
  y: number,
  z: number,
  along: THREE.Vector3,
  n: THREE.Vector3,
): void {
  let offset = -0.46
  let leaned = false
  while (offset < 0.42) {
    const thick = 0.08 + rand() * 0.14
    if (rand() < 0.06) {
      // A gap, with the next book leaning into it.
      offset += 0.12
      leaned = true
      continue
    }
    const tall = 0.5 + rand() * 0.36
    const depth = 0.5 + rand() * 0.2
    const style = BOOKS[Math.floor(rand() * BOOKS.length)]
    const lean = leaned ? 0.28 : 0
    leaned = false
    const pos = new THREE.Vector3(x, y - 0.4 + (tall / 2) * Math.cos(lean), z)
      .addScaledVector(along, offset + thick / 2 + Math.sin(lean) * tall * 0.4)
      .addScaledVector(n, -0.45 + depth / 2)
    // Lean toward the gap (the -along direction).
    const rot = wall === 'back' ? { z: lean } : { x: wall === 'left' ? -lean : -lean }
    if (wall === 'back') b.prop(style, pos.x, pos.y, pos.z, thick * 0.92, tall, depth, rot)
    else b.prop(style, pos.x, pos.y, pos.z, depth, tall, thick * 0.92, rot)

    // Gold-foil bands across the spine on roughly a third of the books.
    if (!lean && rand() < 0.35) {
      const spine = pos.clone().addScaledVector(n, depth / 2 + 0.006)
      for (const dy of rand() < 0.5 ? [-0.32, 0.3] : [0.28]) {
        const by = spine.y + dy * tall
        if (wall === 'back') b.prop('goldFoil', spine.x, by, spine.z, thick * 0.85, 0.05, 0.012)
        else b.prop('goldFoil', spine.x, by, spine.z, 0.012, 0.05, thick * 0.85)
      }
    }
    offset += thick + Math.sin(lean) * tall * 0.6
  }
}

/** A long reading table: overhanging top with a moulded edge, apron, and turned legs. */
function readingTable(b: VoxelBuilder, x: number, z: number): void {
  const w = 2.6
  const d = 9
  const topY = 1.72
  b.prop('tableWood', x, topY, z, w, 0.14, d)
  b.prop('tableWood', x, topY - 0.1, z, w - 0.12, 0.06, d - 0.12) // moulded underside
  b.prop('leather', x, topY + 0.072, z, w - 0.5, 0.01, d - 0.6) // inset writing surface
  b.prop('woodDark', x, topY - 0.25, z + d / 2 - 0.35, w - 0.4, 0.22, 0.1) // aprons
  b.prop('woodDark', x, topY - 0.25, z - d / 2 + 0.35, w - 0.4, 0.22, 0.1)
  b.prop('woodDark', x + w / 2 - 0.3, topY - 0.25, z, 0.1, 0.22, d - 0.7)
  b.prop('woodDark', x - w / 2 + 0.3, topY - 0.25, z, 0.1, 0.22, d - 0.7)
  for (const dx of [-1, 1])
    for (const dz of [-1, 1]) {
      const lx = x + dx * (w / 2 - 0.3)
      const lz = z + dz * (d / 2 - 0.35)
      b.prop('woodDark', lx, 1.22, lz, 0.22, 0.6, 0.22) // upper leg
      b.prop('tableWood', lx, 0.88, lz, 0.28, 0.1, 0.28) // turned collar
      b.prop('woodDark', lx, 0.66, lz, 0.16, 0.34, 0.16) // tapered foot
    }
  b.prop('woodDark', x, 0.75, z, 0.08, 0.08, d - 0.9) // stretcher
}

/** A leather library chair facing the table; `side` is which side of the table it's on. */
function chair(b: VoxelBuilder, x: number, z: number, side: number): void {
  for (const dx of [-0.32, 0.32])
    for (const dz of [-0.32, 0.32]) b.prop('woodDark', x + dx, 0.85, z + dz, 0.1, 0.7, 0.1)
  b.prop('woodDark', x, 1.22, z, 0.86, 0.08, 0.86) // seat frame
  b.prop('leather', x, 1.32, z, 0.76, 0.12, 0.76) // cushion
  const bx = x + side * 0.38
  for (const dz of [-0.36, 0.36]) b.prop('woodDark', bx, 1.85, z + dz, 0.1, 1.2, 0.1) // back posts
  b.prop('tableWood', bx, 2.42, z, 0.12, 0.1, 0.84) // top rail
  b.prop('leather', bx - side * 0.02, 1.9, z, 0.06, 0.8, 0.62) // padded back
}
