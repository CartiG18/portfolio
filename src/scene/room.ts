import * as THREE from 'three'
import { Stage } from './stage.ts'
import { mulberry32, VoxelBuilder } from './voxels.ts'
import { LIBRARY_STYLES, shelfRow, type Wall } from './library.ts'
import { buildCenterpiece, type ExhibitItem } from './centerpieces.ts'
import { createMotes } from './atmosphere.ts'
import { contactShadowTexture, ensureFonts } from './labels.ts'
import type { ExhibitId } from '../data/exhibits.ts'
import { sound } from '../audio.ts'
import { createDayBlend } from './timeOfDay.ts'

export interface RoomOptions {
  canvas: HTMLCanvasElement
  exhibitId: ExhibitId
  reducedMotion: boolean
  /** An item was opened (id) or closed (null) from inside the canvas. */
  onOpenChange(id: string | null): void
  onHoverChange?(id: string | null): void
  onFirstInteraction?(): void
}

export interface RoomHandle {
  items: Array<Pick<ExhibitItem, 'id' | 'label'>>
  open(id: string): void
  close(): void
  highlight(id: string | null): void
  dispose(): void
}

/** A smaller wing of the library: 14 wide, 13 deep, shelved side walls, open toward the camera. */
const R = { halfW: 7, back: -13, front: 2, height: 9 }
const EYE = 3.3

function buildShell(b: VoxelBuilder, rand: () => number): THREE.Vector3 {
  for (let x = -R.halfW; x <= R.halfW; x++)
    for (let z = R.back; z <= R.front; z++) {
      b.set(x % 2 === 0 ? 'floorA' : 'floorB', x, 0, z)
      b.set('ceiling', x, R.height + 1, z)
    }
  const wallStyle = (y: number) => (y <= 2 ? 'wainscot' : y === 3 ? 'trimWood' : y === R.height ? 'crown' : 'maroon')
  for (let y = 1; y <= R.height; y++) {
    for (let x = -R.halfW; x <= R.halfW; x++) b.set(wallStyle(y), x, y, R.back)
    for (let z = R.back; z <= R.front; z++) {
      b.set(wallStyle(y), -R.halfW, y, z)
      b.set(wallStyle(y), R.halfW, y, z)
    }
  }
  for (let z = R.back + 1; z <= R.front; z += 3) b.prop('woodDark', 0, R.height + 0.35, z, R.halfW * 2, 0.5, 0.5)

  // Shelving along both side walls.
  for (const wall of ['left', 'right'] as Wall[]) {
    const x = wall === 'left' ? -R.halfW + 1 : R.halfW - 1
    const n = new THREE.Vector3(wall === 'left' ? 1 : -1, 0, 0)
    const along = new THREE.Vector3(0, 0, 1)
    for (let z = R.back + 1; z <= R.front - 2; z++) {
      b.set('woodDark', x, 1, z)
      b.set('crown', x, 7, z)
      for (let y = 2; y < 7; y++) {
        b.prop('shelfBoard', x, y - 0.45, z, 0.95, 0.1, 1)
        shelfRow(b, rand, wall, x, y, z, along, n)
      }
      if ((z - R.back) % 4 === 1) b.prop('woodDark', x, 4, z - 0.46, 0.98, 5.5, 0.14)
    }
  }
  // A runner leading to the centrepiece.
  b.prop('carpetGold', 0, 0.52, -5, 3.6, 0.05, 14.2)
  b.prop('carpet', 0, 0.55, -5, 3.2, 0.06, 14)

  // Chandelier.
  const c = new THREE.Vector3(0, 8, -6)
  b.prop('brass', 0, (c.y + R.height + 1) / 2, c.z, 0.08, R.height + 1 - c.y, 0.08)
  b.prop('brass', 0, c.y, c.z, 0.4, 0.9, 0.4)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const x = Math.cos(a) * 1.3
    const z = c.z + Math.sin(a) * 1.3
    b.prop('brass', x, c.y - 0.3, z, 0.26, 0.1, 0.26)
    b.prop('wax', x, c.y - 0.02, z, 0.11, 0.4, 0.11)
    b.prop('flame', x, c.y + 0.26, z, 0.08, 0.15, 0.08)
  }
  return c
}

export async function createExhibitRoom(opts: RoomOptions): Promise<RoomHandle> {
  await ensureFonts()
  const rand = mulberry32(opts.exhibitId.length * 7919)
  const builder = new VoxelBuilder(LIBRARY_STYLES, rand)
  const chandelier = buildShell(builder, rand)
  const piece = buildCenterpiece(opts.exhibitId)

  const stage = new Stage({
    canvas: opts.canvas,
    reducedMotion: opts.reducedMotion,
    background: 0x080504,
    fog: { near: 20, far: 45 },
    exposure: 1.0,
    bloom: { strength: 0.45, radius: 0.4, threshold: 0.9 },
    grade: { vignette: 0.55, grain: 0.035, warmth: 0.6 },
    depthOfField: true,
    camera: { fov: 55, position: new THREE.Vector3(0, EYE, 1.5), target: piece.focus },
    lookAround: { yawDeg: 20, pitchDeg: 7 },
  })
  const { scene } = stage
  const shell = builder.build()
  scene.add(shell, piece.group)
  const flameMats = new Set<THREE.MeshStandardMaterial>()
  for (const root of [shell, piece.group])
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'emissive' in m && m.emissive.getHex() === 0xff9a2a) flameMats.add(m)
    })

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }),
  )
  shadow.scale.set(5, 1, 3)
  shadow.position.set(0, 0.506, piece.focus.z)
  scene.add(shadow)

  const hemi = new THREE.HemisphereLight(0x9a7a58, 0x6a4428, 1.0)
  scene.add(hemi)
  // Key light on the centrepiece, as if from a lamp hung above the runner.
  const key = new THREE.SpotLight(0xffc98a, 26, 16, 0.55, 0.7, 1.4)
  key.position.set(0, 7.5, piece.focus.z + 5)
  key.target.position.copy(piece.focus)
  scene.add(key, key.target)
  const chandelierLight = new THREE.PointLight(0xffa850, 45, 20, 1.6)
  chandelierLight.position.copy(chandelier).setY(chandelier.y - 0.6)
  scene.add(chandelierLight)
  const fills = [-4, 4].map((x) => {
    const fill = new THREE.PointLight(0xffa850, 20, 12, 1.6)
    fill.position.set(x, 5, -2)
    scene.add(fill)
    return fill
  })

  // Day (no windows here): a touch more ambient and fill, with a warmer, cleaner grade.
  const dayBlend = createDayBlend(opts.reducedMotion)
  const hemiNightSky = new THREE.Color(0x9a7a58)
  const hemiDaySky = new THREE.Color(0xc8a77c)
  let lastBlend = -1
  const applyTimeOfDay = (b: number) => {
    hemi.intensity = 1.0 * (1 + 0.4 * b)
    hemi.color.lerpColors(hemiNightSky, hemiDaySky, b)
    for (const f of fills) f.intensity = 20 * (1 + 0.38 * b)
    key.intensity = 26 * (1 + 0.3 * b)
    stage.setLook({ exposure: 1.0 + 0.14 * b, warmth: 0.6 + 0.15 * b, vignette: 0.55 - 0.1 * b })
  }

  const motes = createMotes(
    { count: 110, center: piece.focus.clone().setY(0), radius: [0, 7], height: [1, 7], color: [1.0, 0.78, 0.5], size: 70, drift: 0.3 },
    rand,
  )
  scene.add(motes)

  for (const it of piece.items) stage.addPickable({ id: it.id, object: it.hit })

  let openId: string | null = null
  /** A close requested while the camera was still moving in; run it on arrival. */
  let pendingClose = false
  let interacted = false
  const firstInteraction = () => {
    if (interacted) return
    interacted = true
    opts.onFirstInteraction?.()
  }

  stage.onHover = (id) => {
    for (const it of piece.items) it.wantHover = it.id === id
    opts.onHoverChange?.(id)
  }
  stage.onPick = (id) => {
    firstInteraction()
    if (!id) {
      if (openId) close()
      return
    }
    if (id === openId) close()
    else open(id)
  }

  /**
   * Hold pose that keeps the opened object clear of the content panel: framed in the left
   * ~55% of the view on wide screens, or the top half when the panel docks to the bottom.
   */
  function framedView(it: ExhibitItem): { position: THREE.Vector3; target: THREE.Vector3 } {
    const narrow = window.innerWidth < 700
    const cam = stage.camera
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
    const tanH = tanV * cam.aspect
    const forward = it.view.target.clone().sub(it.view.position)
    let dist = forward.length()
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward)
    // Back off until the object, with a margin, fits its share of the frame: the left ~55%
    // (and below the room title) on wide screens, or the top half on narrow ones.
    const shareW = narrow ? tanH * 0.85 : tanH * 0.42
    const shareH = narrow ? tanV * 0.4 : tanV * 0.62
    dist = Math.max(dist, it.view.size / (2 * shareW * 0.85), it.view.size / (2 * shareH * 0.85))
    const position = it.view.target.clone().addScaledVector(forward, -dist)
    // Wide: object at NDC (-0.45, -0.12), left of the panel and clear of the title.
    // Narrow: object at NDC y = +0.45, above the bottom-docked panel.
    const offset = narrow
      ? up.clone().multiplyScalar(-0.45 * dist * tanV)
      : right.clone().multiplyScalar(0.45 * dist * tanH).addScaledVector(up, 0.12 * dist * tanV)
    return { position: position.add(offset), target: it.view.target.clone().add(offset) }
  }

  function open(id: string): void {
    const it = piece.items.find((i) => i.id === id)
    if (!it || stage.isFlying) return
    const view = framedView(it)
    firstInteraction()
    for (const other of piece.items) other.wantActive = other.id === id
    openId = id
    opts.onOpenChange(id)
    stage.setFocus(it.view.target)
    focusPoint.copy(it.view.target)
    sound.steps(1.1, 2)
    window.setTimeout(() => sound.pageTurn(), 700)
    stage.fly({
      curve: new THREE.CubicBezierCurve3(
        new THREE.Vector3(),
        stage.home.position.clone().lerp(view.position, 0.4),
        view.position.clone().lerp(stage.home.position, 0.15),
        view.position,
      ),
      lookAt: view.target,
      duration: 1.3,
      end: 'hold',
      onDone: () => {
        if (pendingClose) {
          pendingClose = false
          close()
        }
      },
    })
  }

  function close(): void {
    if (!openId) return
    if (stage.isFlying) {
      pendingClose = true
      return
    }
    for (const it of piece.items) it.wantActive = false
    openId = null
    opts.onOpenChange(null)
    stage.setFocus(null)
    const home = stage.home
    stage.fly({
      curve: new THREE.CubicBezierCurve3(
        new THREE.Vector3(),
        stage.camera.position.clone().lerp(home.position, 0.5),
        home.position.clone(),
        home.position.clone(),
      ),
      lookAt: home.target,
      duration: 1.2,
      end: 'resume',
      onDone: () => {},
    })
  }

  const focusPoint = new THREE.Vector3()
  motes.material.uniforms.uFocus.value = focusPoint
  const timeScale = opts.reducedMotion ? 0.3 : 1
  stage.addTicker((time, dt) => {
    motes.material.uniforms.uTime.value = time * timeScale
    const day = dayBlend.update(time)
    if (day !== lastBlend) {
      applyTimeOfDay(day)
      lastBlend = day
    }
    const fs = motes.material.uniforms.uFocusStrength
    fs.value += ((openId ? 1 : 0) - fs.value) * Math.min(1, dt * 2)
    const ft = time * timeScale
    for (const m of flameMats) m.emissiveIntensity = 2.0 * (0.85 + Math.sin(ft * 13) * 0.08 + Math.sin(ft * 29) * 0.05)
    const t = time * timeScale
    chandelierLight.intensity = 45 * (0.9 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23) * 0.03)
    const k = opts.reducedMotion ? 1 : Math.min(1, dt * 6)
    for (const it of piece.items) {
      it.hover += ((it.wantHover ? 1 : 0) - it.hover) * k
      it.active += ((it.wantActive ? 1 : 0) - it.active) * (opts.reducedMotion ? 1 : Math.min(1, dt * 3.5))
      it.apply(it.hover, it.active, time)
    }
    piece.tick?.(time)
  })

  stage.start()
  return {
    items: piece.items.map(({ id, label }) => ({ id, label })),
    open,
    close,
    highlight: (id) => stage.highlight(id),
    dispose: () => {
      dayBlend.dispose()
      stage.dispose()
    },
  }
}
