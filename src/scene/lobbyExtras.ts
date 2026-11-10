import * as THREE from 'three'
import { texturedMaterial } from './voxels.ts'
import { LIBRARY_STYLES } from './library.ts'
import { ACCENT, PALETTE } from './palette.ts'
import { createMotes, createShaft, createShaftMaterial, type ShaftMaterial } from './atmosphere.ts'
import { softGlowTexture } from './labels.ts'

/**
 * Additions to the library hall for the day/night easter egg:
 *  - tall arched clerestory windows high on both side walls (both modes)
 *  - sunlight by day: shafts from the left windows, warm patches, dust in the beams
 *  - a grandfather clock near the entrance that toggles the time of day
 */

const WALL_FACE = 13.5 // inner face of the side walls (x = ±13.5)

// Windows sit above the shelving, clear of the door sconces, placards and portraits.
const WINDOW_Z = [-12.5, -5.5, 1.5, 8]
// Full height, above the placards over the grand doors (the hall ceiling was raised for them).
const WINDOW_Y = 12.75
const WINDOW_W = 3.0
const WINDOW_H = 3.2

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Arched leaded glass with a thin stained border and a gilded frame (alpha outside the arch). */
function windowTexture(): THREE.CanvasTexture {
  const w = 256
  const h = Math.round((256 * WINDOW_H) / WINDOW_W)
  return canvasTexture(w, h, (g) => {
    const r = w / 2
    const arch = (inset: number) => {
      g.beginPath()
      g.moveTo(inset, h - inset)
      g.lineTo(inset, r)
      g.arc(r, r, r - inset, Math.PI, 0)
      g.lineTo(w - inset, h - inset)
      g.closePath()
    }
    // Gilded frame.
    arch(0)
    g.fillStyle = '#c9a04a'
    g.fill()
    // Stained-glass border band: alternating amber and oxblood panes.
    g.save()
    arch(14)
    g.clip()
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? '#c98a3a' : '#7a2226'
      g.fillRect(0, i * 14 - 6, w, 14)
    }
    g.restore()
    // Clear glass in the middle, then leaded diamond mullions.
    g.save()
    arch(30)
    g.clip()
    g.fillStyle = '#e8e6df'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(30,24,18,0.9)'
    g.lineWidth = 3
    for (let k = -h; k < w + h; k += 34) {
      g.beginPath()
      g.moveTo(k, 0)
      g.lineTo(k + h, h)
      g.moveTo(k, h)
      g.lineTo(k + h, 0)
      g.stroke()
    }
    // A central mullion and transom.
    g.lineWidth = 6
    g.beginPath()
    g.moveTo(r, 30)
    g.lineTo(r, h)
    g.moveTo(0, h * 0.58)
    g.lineTo(w, h * 0.58)
    g.stroke()
    g.restore()
    // Thin dark lines separating frame, border and glass.
    g.strokeStyle = 'rgba(40,28,10,0.9)'
    g.lineWidth = 3
    arch(14)
    g.stroke()
    arch(30)
    g.stroke()
  })
}

export function createClerestories(scene: THREE.Scene, brass: THREE.Material) {
  const map = windowTexture()
  const glass = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, toneMapped: false })
  const glowMap = softGlowTexture()
  const coolGlow = new THREE.MeshBasicMaterial({
    map: glowMap,
    color: 0x6f8fc8,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const warmGlow = coolGlow.clone()
  warmGlow.color.set(0xffd69a)
  const plane = new THREE.PlaneGeometry(WINDOW_W, WINDOW_H)
  const halo = new THREE.PlaneGeometry(WINDOW_W * 2.2, WINDOW_H * 1.8)
  for (const side of [-1, 1]) {
    for (const z of WINDOW_Z) {
      const rotY = side < 0 ? Math.PI / 2 : -Math.PI / 2
      const x = side * (WALL_FACE - 0.02)
      const pane = new THREE.Mesh(plane, glass)
      pane.position.set(x, WINDOW_Y, z)
      pane.rotation.y = rotY
      scene.add(pane)
      for (const m of [coolGlow, warmGlow]) {
        const glow = new THREE.Mesh(halo, m)
        glow.position.set(x - side * 0.06, WINDOW_Y, z)
        glow.rotation.y = rotY
        glow.renderOrder = 2
        scene.add(glow)
      }
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, WINDOW_W + 0.3), brass)
      sill.position.set(side * (WALL_FACE - 0.12), WINDOW_Y - WINDOW_H / 2 - 0.05, z)
      scene.add(sill)
    }
  }
  const night = new THREE.Color(0x1f2d4a)
  const day = new THREE.Color(0xfff1cf).multiplyScalar(1.7)
  return {
    update(b: number): void {
      glass.color.lerpColors(night, day, b)
      coolGlow.opacity = 0.12 * (1 - b)
      warmGlow.opacity = 0.22 * b
      coolGlow.visible = coolGlow.opacity > 0.005
      warmGlow.visible = warmGlow.opacity > 0.005
    },
  }
}

/** Sunlight on the floor in the shape of a clerestory window: arched, with leaded mullions. */
function windowPatchTexture(): THREE.CanvasTexture {
  const w = 128
  const h = 180
  return canvasTexture(w, h, (g) => {
    const r = w / 2
    g.beginPath()
    g.moveTo(8, h - 8)
    g.lineTo(8, r)
    g.arc(r, r, r - 8, Math.PI, 0)
    g.lineTo(w - 8, h - 8)
    g.closePath()
    g.save()
    g.clip()
    g.filter = 'blur(1.5px)' // lead lines read as soft shadows, not hard decals
    const grad = g.createLinearGradient(0, h, 0, 0)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0.55)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    // Lead lines cast as soft shadows.
    g.strokeStyle = 'rgba(0,0,0,0.75)'
    g.lineWidth = 3
    for (let k = -h; k < w + h; k += 22) {
      g.beginPath()
      g.moveTo(k, 0)
      g.lineTo(k + h, h)
      g.moveTo(k, h)
      g.lineTo(k + h, 0)
      g.stroke()
    }
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(r, 0)
    g.lineTo(r, h)
    g.moveTo(0, h * 0.58)
    g.lineTo(w, h * 0.58)
    g.stroke()
    g.restore()
    // Feather every edge so the patch reads as light rather than a decal.
    g.filter = 'none'
    g.globalCompositeOperation = 'destination-in'
    const fadeX = g.createLinearGradient(0, 0, w, 0)
    fadeX.addColorStop(0, 'rgba(0,0,0,0)')
    fadeX.addColorStop(0.18, 'rgba(0,0,0,1)')
    fadeX.addColorStop(0.82, 'rgba(0,0,0,1)')
    fadeX.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = fadeX
    g.fillRect(0, 0, w, h)
    const fadeY = g.createLinearGradient(0, 0, 0, h)
    fadeY.addColorStop(0, 'rgba(0,0,0,0)')
    fadeY.addColorStop(0.2, 'rgba(0,0,0,1)')
    fadeY.addColorStop(0.85, 'rgba(0,0,0,1)')
    fadeY.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = fadeY
    g.fillRect(0, 0, w, h)
  })
}

/**
 * Daylight through the right-hand clerestories, falling left and down across the hall.
 * Every right window casts a shaft. The far two are short (they stop above the placards);
 * the entrance-end windows reach the runner along paths that, from the resting view,
 * pass beneath every placard rather than across one.
 */
export function createSunlight(scene: THREE.Scene, rand: () => number) {
  const shafts: ShaftMaterial[] = []
  const src = (z: number) => new THREE.Vector3(WALL_FACE - 0.3, WINDOW_Y - 0.2, z)
  // Sun direction: from the right, steeply down, slightly toward the back of the hall.
  const sun = new THREE.Vector3(-14.5, -10, -2.2).normalize()
  const beams: Array<[THREE.Vector3, THREE.Vector3, number]> = [
    [src(-12.5), src(-12.5).addScaledVector(sun, 2.2), 0.55],
    [src(-5.5), src(-5.5).addScaledVector(sun, 2.6), 0.65],
    [src(1.5), src(1.5).addScaledVector(sun, 6), 0.8],
    [src(7.4), new THREE.Vector3(0.4, 0.55, 1.6), 1.0],
    [src(8.8), new THREE.Vector3(-2.6, 0.55, 1.4), 1.15],
  ]
  for (const [from, to, r] of beams) {
    const m = createShaftMaterial(0xffe2b0, rand())
    scene.add(createShaft(from, to, r * 0.7, r * 1.5, m))
    shafts.push(m)
  }

  const patchMat = new THREE.MeshBasicMaterial({
    map: windowPatchTexture(),
    color: 0xffd39a,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  })
  // Window-shaped patches, stretched along the sun's path (arch toward the far side).
  const patch = (x: number, z: number, length: number, width: number) => {
    const geo = new THREE.PlaneGeometry(width, length)
    geo.rotateX(-Math.PI / 2)
    // Skew: shear the far end back along z to match the sun's slight rake.
    geo.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0.12, 0, 1, 0, 0, 0, 0, 1))
    const m = new THREE.Mesh(geo, patchMat)
    m.position.set(x, 0.6, z)
    m.rotation.y = Math.PI / 2 + Math.atan2(-sun.z, -sun.x) // arch points away from the window
    scene.add(m)
  }
  patch(0.2, 1.8, 4.6, 2.6)
  patch(-2.8, 1.2, 4.4, 2.5) // kept off the bottom-centre hint
  patch(-4.5, -2.5, 4.4, 2.4) // the far windows' light, landing on the left floor
  // Light reaching the lower left shelving.
  const shelfPatch = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), patchMat)
  shelfPatch.position.set(-12.45, 2.2, 4.8)
  shelfPatch.rotation.y = Math.PI / 2
  scene.add(shelfPatch)

  const dust = createMotes(
    { count: 110, center: new THREE.Vector3(3, 0, 3.5), radius: [0, 6], height: [1, 9.5], color: [1, 0.86, 0.6], size: 55, drift: 0.22 },
    rand,
  )
  scene.add(dust)
  return {
    update(b: number, time: number): void {
      for (const m of shafts) {
        m.uniforms.uOpacity.value = 0.13 * b
        m.uniforms.uTime.value = time
      }
      patchMat.opacity = 0.3 * b
      patchMat.visible = b > 0.005
      dust.material.uniforms.uTime.value = time
      dust.material.uniforms.uColor.value.set(1, 0.86, 0.6).multiplyScalar(b)
      dust.visible = b > 0.005
    },
  }
}

/** Clock-face canvas: parchment dial with Roman numerals on a brass square. */
function dialTexture(): THREE.CanvasTexture {
  const s = 256
  return canvasTexture(s, s, (g) => {
    g.fillStyle = '#b08d4a'
    g.fillRect(0, 0, s, s)
    g.fillStyle = '#efe3c4'
    g.beginPath()
    g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#3a2610'
    g.lineWidth = 3
    g.stroke()
    g.fillStyle = '#2a1a08'
    g.font = '700 26px "Cormorant SC", Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
    numerals.forEach((n, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2
      g.fillText(n, s / 2 + Math.cos(a) * s * 0.34, s / 2 + Math.sin(a) * s * 0.34)
    })
  })
}

/**
 * A voxel grandfather clock (~3 blocks tall) standing against the right wall near the entrance,
 * just outside the resting view. Hands read ~9pm at night, ~6pm by day.
 */
export function createClock(scene: THREE.Scene) {
  const walnut = texturedMaterial({ ...LIBRARY_STYLES.woodDark })
  walnut.color.setHex(PALETTE.walnut)
  const trim = texturedMaterial({ ...LIBRARY_STYLES.tableWood })
  trim.color.setHex(PALETTE.umber)
  const brass = texturedMaterial({ ...LIBRARY_STYLES.brass })
  brass.color.setHex(PALETTE.brass)
  const box = new THREE.BoxGeometry(1, 1, 1)
  const group = new THREE.Group()
  const add = (m: THREE.Material, s: [number, number, number], p: [number, number, number], parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(box, m)
    mesh.scale.set(...s)
    mesh.position.set(...p)
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }
  // Built facing +z, then turned to face into the room.
  add(trim, [1.05, 0.3, 0.75], [0, 0.65, 0]) // plinth
  add(walnut, [0.8, 1.35, 0.58], [0, 1.47, 0]) // trunk
  add(new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 0.3 }), [0.42, 0.95, 0.02], [0, 1.47, 0.3]) // trunk window
  add(trim, [0.95, 0.1, 0.68], [0, 2.18, 0]) // waist moulding
  add(walnut, [0.95, 0.85, 0.66], [0, 2.65, 0]) // hood
  add(trim, [1.1, 0.12, 0.76], [0, 3.13, 0]) // cornice
  add(walnut, [0.7, 0.16, 0.5], [0, 3.27, 0]) // pediment
  for (const x of [-0.42, 0, 0.42]) add(brass, [0.08, 0.16, 0.08], [x, 3.43, 0]) // finials

  const dialMap = dialTexture()
  // A faint warm catch-light on the dial so a curious visitor notices the clock.
  const dial = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshStandardMaterial({ map: dialMap, emissiveMap: dialMap, emissive: 0xffc27a, emissiveIntensity: 0.35, roughness: 0.6 }),
  )
  dial.position.set(0, 2.66, 0.335)
  group.add(dial)
  const hand = (length: number, width: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(0, 2.66, 0.345)
    group.add(pivot)
    add(new THREE.MeshStandardMaterial({ color: 0x1a120a, roughness: 0.5 }), [width, length, 0.01], [0, length / 2 - 0.02, 0], pivot)
    return pivot
  }
  const hourHand = hand(0.17, 0.03)
  const minuteHand = hand(0.25, 0.02)

  // Pendulum, pivoting at the top of the trunk window.
  const pendulum = new THREE.Group()
  pendulum.position.set(0, 1.9, 0.32)
  group.add(pendulum)
  add(brass, [0.02, 0.7, 0.01], [0, -0.35, 0], pendulum)
  add(brass, [0.16, 0.16, 0.03], [0, -0.72, 0], pendulum)

  group.position.set(WALL_FACE - 0.42, 0, 1)
  group.rotation.y = -Math.PI / 2
  scene.add(group)

  // Hover: accent halo behind the clock and an accent tint on its brass, like the doors.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 3.8),
    new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: ACCENT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  halo.position.set(0, 1.95, -0.32)
  group.add(halo)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.0, 0.85), new THREE.MeshBasicMaterial({ visible: false }))
  hit.position.set(0, 2.0, 0)
  group.add(hit)

  const accent = new THREE.Color(ACCENT)
  const brassBase = new THREE.Color(0x5a3a10) // brass catches a little candlelight
  let hover = 0
  const NIGHT_HOUR = 9
  const DAY_HOUR = 6
  return {
    hit,
    update(b: number, time: number, dt: number, hovered: boolean, reducedMotion: boolean): void {
      // Hands wind back from 9 to 6 as day arrives; the minute hand sweeps three full turns.
      const hours = NIGHT_HOUR + (DAY_HOUR - NIGHT_HOUR) * b
      hourHand.rotation.z = -(hours / 12) * Math.PI * 2
      minuteHand.rotation.z = -(hours % 1) * Math.PI * 2 - (NIGHT_HOUR - hours) * Math.PI * 2
      pendulum.rotation.z = reducedMotion ? 0 : Math.sin(time * Math.PI) * 0.12
      hover += ((hovered ? 1 : 0) - hover) * Math.min(1, dt * 8)
      const hm = halo.material as THREE.MeshBasicMaterial
      hm.opacity = 0.5 * hover
      hm.visible = hm.opacity > 0.01
      brass.emissive.copy(brassBase).lerp(accent, hover)
      brass.emissiveIntensity = 0.4 + hover * 0.8
    },
  }
}
