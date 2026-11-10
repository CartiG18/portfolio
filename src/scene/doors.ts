import * as THREE from 'three'
import { mulberry32, VoxelBuilder } from './voxels.ts'
import { LIBRARY_STYLES, type DoorSpot } from './library.ts'
import { doorGlowTexture, softGlowTexture } from './labels.ts'

/**
 * Grand closed double doors in every exhibit doorway. Each leaf is a hinge-pivot group of
 * instanced voxels (carved panels, gilded trim, brass ring pull and hinges). At rest a thin warm
 * line of light shows at the seam and threshold; hover warms the brass and that line; opening
 * swings both leaves inward with a weighty settle and spills warm light onto the floor.
 */

const OPEN_ANGLE = 1.42 // ~81°
const OPEN_SECONDS = 0.95
const LEAF_Z = -0.38 // leaves sit just inside the opening, behind the frame face

// Slight overshoot, then settle: reads as heavy doors.
const easeOutBack = (t: number) => {
  const c1 = 0.9
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

interface DoorState {
  id: string
  pivots: [THREE.Group, THREE.Group]
  hardware: THREE.MeshStandardMaterial[]
  seam: THREE.MeshBasicMaterial
  spill: THREE.MeshBasicMaterial
  haze: THREE.MeshBasicMaterial
  hover: number
  open: number // 0..1 animation progress
  opening: boolean
}

function buildLeaf(width: number, height: number, sign: 1 | -1, seed: number): THREE.Group {
  const b = new VoxelBuilder(LIBRARY_STYLES, mulberry32(seed))
  const w = width
  const cx = (sign * w) / 2 // leaf centre, measured from the hinge
  const FACE = 0.08 // front face of the slab
  // Slab, with stiles and rails standing proud of it.
  b.prop('doorWood', cx, height / 2, 0, w - 0.03, height, 0.16)
  for (const ex of [0.09, w - 0.09]) b.prop('doorPanel', sign * ex, height / 2, FACE + 0.015, 0.16, height - 0.1, 0.03)
  b.prop('doorPanel', cx, height - 0.1, FACE + 0.015, w - 0.1, 0.18, 0.03)
  // Brass kick plate along the bottom.
  b.prop('brass', cx, 0.2, FACE + 0.02, w - 0.14, 0.34, 0.03)

  // Three raised panels, with a carved rail across the middle of the leaf.
  const railY = height * 0.47
  const zones: Array<[number, number]> = [
    [0.48, railY - 0.2],
    [railY + 0.2, railY + 0.2 + (height - 0.3 - (railY + 0.2) - 0.18) / 2],
    [railY + 0.2 + (height - 0.3 - (railY + 0.2) - 0.18) / 2 + 0.18, height - 0.3],
  ]
  const pw = w - 0.48
  for (const [y0, y1] of zones) {
    const ph = y1 - y0
    const py = (y0 + y1) / 2
    // Recess: a dark sunken border around the field.
    b.prop('doorShadow', cx, py, FACE + 0.005, pw, ph, 0.01)
    // Raised field, well proud, with a lit top edge and a shadowed bottom edge.
    b.prop('doorPanel', cx, py, FACE + 0.06, pw - 0.14, ph - 0.14, 0.1)
    b.prop('doorHighlight', cx, py + (ph - 0.14) / 2 - 0.02, FACE + 0.112, pw - 0.16, 0.04, 0.01)
    b.prop('doorShadow', cx, py - (ph - 0.14) / 2 + 0.02, FACE + 0.112, pw - 0.16, 0.04, 0.01)
    // Gilded trim line around the field.
    for (const dy of [-1, 1]) b.prop('goldFoil', cx, py + (dy * (ph - 0.05)) / 2, FACE + 0.03, pw - 0.02, 0.03, 0.01)
    for (const dx of [-1, 1]) b.prop('goldFoil', cx + (dx * (pw - 0.02)) / 2, py, FACE + 0.03, 0.03, ph - 0.02, 0.01)
  }
  // The carved middle rail with a row of gilt beads.
  b.prop('doorPanel', cx, railY, FACE + 0.05, w - 0.12, 0.3, 0.08)
  b.prop('goldFoil', cx, railY, FACE + 0.095, w - 0.2, 0.03, 0.01)
  for (let i = 0; i < 5; i++) b.prop('giltDim', sign * (0.25 + ((w - 0.5) * i) / 4), railY, FACE + 0.1, 0.07, 0.07, 0.04)

  // Brass studs down both stiles.
  for (let y = 0.6; y < height - 0.3; y += 0.42)
    for (const ex of [0.09, w - 0.09]) b.prop('brass', sign * ex, y, FACE + 0.045, 0.06, 0.06, 0.03)

  // A large brass ring pull near the meeting edge.
  const rx = sign * (w - 0.38)
  const ry = Math.min(2.6, railY)
  b.prop('brass', rx, ry + 0.16, FACE + 0.06, 0.32, 0.42, 0.04)
  b.prop('brass', rx, ry + 0.32, FACE + 0.1, 0.1, 0.1, 0.06) // boss
  const r = 0.22
  const cy = ry - 0.12
  b.prop('brass', rx, cy - r, FACE + 0.11, 2 * r, 0.06, 0.05)
  b.prop('brass', rx, cy + r * 0.8, FACE + 0.11, 2 * r * 0.7, 0.06, 0.05)
  b.prop('brass', rx - r, cy - r * 0.1, FACE + 0.11, 0.06, 1.7 * r, 0.05)
  b.prop('brass', rx + r, cy - r * 0.1, FACE + 0.11, 0.06, 1.7 * r, 0.05)
  // Three strap hinges on the hinge edge.
  for (const hy of [0.7, height / 2, height - 0.7]) {
    b.prop('brass', sign * 0.18, hy, FACE + 0.05, 0.4, 0.12, 0.03)
    b.prop('brass', sign * 0.03, hy, FACE + 0.02, 0.1, 0.36, 0.08)
  }
  return b.build()
}

export function createDoors(scene: THREE.Scene, spots: DoorSpot[]) {
  const glowMap = doorGlowTexture()
  const spillMap = softGlowTexture()
  const doors = new Map<string, DoorState>()
  // Bright under the lintel, fading toward the floor.
  const washMap = glowMap.clone()
  washMap.rotation = Math.PI
  washMap.center.set(0.5, 0.5)
  washMap.needsUpdate = true
  const washMat = new THREE.MeshBasicMaterial({
    map: washMap,
    color: 0xffa860,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const washes: THREE.Mesh[] = []
  const washByDoor = new Map<string, THREE.Mesh>()

  spots.forEach((spot, i) => {
    const root = new THREE.Group()
    root.position.set(spot.center.x, 0.5, spot.center.z)
    root.rotation.y = Math.atan2(spot.normal.x, spot.normal.z)
    scene.add(root)

    const W = spot.width - 0.06
    const H = spot.leafHeight - 0.08
    const pivots = ([-1, 1] as const).map((side, k) => {
      const pivot = new THREE.Group()
      pivot.position.set((side * W) / 2, 0.06, LEAF_Z)
      // The left leaf extends right from its hinge (+x), the right leaf extends left.
      pivot.add(buildLeaf(W / 2 - 0.02, H, side < 0 ? 1 : -1, 100 + i * 2 + k))
      root.add(pivot)
      return pivot
    }) as [THREE.Group, THREE.Group]

    // Each door's brass and gilt warm up independently on hover.
    const hardware: THREE.MeshStandardMaterial[] = []
    for (const pivot of pivots)
      pivot.traverse((o) => {
        if (o.name === 'brass' || o.name === 'goldFoil') hardware.push((o as THREE.Mesh).material as THREE.MeshStandardMaterial)
      })

    // Thin warm light at the seam and under the doors (seen through the gaps).
    const seam = new THREE.MeshBasicMaterial({ color: 0xffa95a, transparent: true, opacity: 0.2, depthWrite: false })
    const vertical = new THREE.Mesh(new THREE.PlaneGeometry(0.05, H), seam)
    vertical.position.set(0, 0.06 + H / 2, LEAF_Z - 0.12)
    const threshold = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.07), seam)
    threshold.position.set(0, 0.04, LEAF_Z - 0.12)
    root.add(vertical, threshold)

    // Beyond the doors: warm light, not a void. A warm backdrop, a lit floor, and layered haze
    // that brightens as the doors open (no room contents).
    const backMat = new THREE.MeshBasicMaterial({ color: 0x2a1408 })
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W + 3, spot.height + 2), backMat)
    back.position.set(0, (spot.height + 2) / 2 - 0.5, -4.6)
    const floorBeyond = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 2, 4.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: spillMap, color: 0x8a4a1e }),
    )
    floorBeyond.position.set(0, 0.01, -2.4)
    const haze = new THREE.MeshBasicMaterial({
      map: glowMap,
      color: 0xffb46e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    root.add(back, floorBeyond)
    for (const [z, scale] of [[-1.2, 1.0], [-2.3, 1.25], [-3.5, 1.5]] as const) {
      const layer = new THREE.Mesh(new THREE.PlaneGeometry((W + 0.6) * scale, (spot.height + 0.6) * scale), haze)
      layer.position.set(0, ((spot.height + 0.6) * scale) / 2, z)
      root.add(layer)
    }

    // A pair of brass candle sconces on the pilasters, and a warm downlight from the lintel.
    const sb = new VoxelBuilder(LIBRARY_STYLES, mulberry32(300 + i))
    const sy = Math.min(4.6, spot.leafHeight * 0.72 + 0.4)
    const postX = spot.width / 2 + 0.5
    for (const side of [-1, 1]) {
      const x = side * postX
      sb.prop('brass', x, sy - 0.15, 1.15, 0.36, 0.1, 0.36) // drip pan
      sb.prop('brass', x, sy - 0.45, 1.05, 0.1, 0.5, 0.1) // bracket
      sb.prop('brass', x, sy - 0.65, 1.0, 0.22, 0.12, 0.08) // wall plate
      sb.prop('wax', x, sy + 0.1, 1.15, 0.13, 0.42, 0.13)
      sb.prop('flame', x, sy + 0.4, 1.15, 0.09, 0.17, 0.09)
    }
    root.add(sb.build())
    // Downlight wash from the lintel, baked as an additive gradient on the door face rather than a
    // real light (six extra point lights halved the hall's frame rate).
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, H + 0.2), washMat)
    wash.position.set(0, 0.06 + (H + 0.2) / 2, LEAF_Z + 0.32)
    wash.renderOrder = 2
    root.add(wash)
    washes.push(wash)

    // Warm light spilling out across the floor when the doors open.
    const spill = new THREE.MeshBasicMaterial({
      map: spillMap,
      color: 0xffb46e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    })
    const spillPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, 4.2).rotateX(-Math.PI / 2), spill)
    spillPlane.position.set(0, 0.015, 1.7)
    root.add(spillPlane)

    washByDoor.set(spot.id, washes[washes.length - 1])
    doors.set(spot.id, { id: spot.id, pivots, hardware, seam, spill, haze, hover: 0, open: 0, opening: false })
  })

  const warm = new THREE.Color(0xffb35a)
  const brassRest = new THREE.Color(0x5a3a10) // brighter at rest so the hardware reads
  return {
    /** Start swinging a door open (snap open with reduced motion). */
    open(id: string, reducedMotion: boolean): void {
      const d = doors.get(id)
      if (!d) return
      d.opening = true
      if (reducedMotion) d.open = 1
    },
    update(hovered: string | null, day: number, dt: number): void {
      for (const d of doors.values()) {
        const target = hovered === d.id || hovered === `plate:${d.id}` ? 1 : 0
        d.hover += (target - d.hover) * Math.min(1, dt * 8)
        if (d.opening && d.open < 1) d.open = Math.min(1, d.open + dt / OPEN_SECONDS)
        const swing = OPEN_ANGLE * (d.opening ? easeOutBack(d.open) : 0)
        // Both leaves swing inward (away from the hall) on their hinges.
        d.pivots[0].rotation.y = swing
        d.pivots[1].rotation.y = -swing
        for (const m of d.hardware) {
          m.emissive.copy(brassRest).lerp(warm, d.hover * 0.8)
          m.emissiveIntensity = 0.5 + d.hover * 0.5
        }
        // The seam line is subtle at rest (fainter by day), a touch brighter on hover.
        const openAmt = d.opening ? Math.min(1, d.open * 1.4) : 0
        d.seam.opacity = (0.18 + d.hover * 0.22) * (1 - 0.45 * day) * (1 - openAmt)
        d.spill.opacity = 0.55 * openAmt
        washByDoor.get(d.id)!.visible = openAmt < 0.05
        d.haze.opacity = 0.42 * openAmt
      }
    },
  }
}
