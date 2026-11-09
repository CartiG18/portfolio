import * as THREE from 'three'
import { Stage } from './stage.ts'
import { mulberry32, VoxelBuilder } from './voxels.ts'
import { LIBRARY_STYLES, shelfRow, type Wall } from './library.ts'
import { buildCenterpiece, type ExhibitItem } from './centerpieces.ts'
import { createMotes } from './atmosphere.ts'
import { contactShadowTexture, ensureFonts } from './labels.ts'
import type { ExhibitId } from '../data/exhibits.ts'

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
    camera: { fov: 55, position: new THREE.Vector3(0, EYE, 1.5), target: piece.focus },
    lookAround: { yawDeg: 22, pitchDeg: 8 },
  })
  const { scene } = stage
  scene.add(builder.build(), piece.group)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }),
  )
  shadow.scale.set(5, 1, 3)
  shadow.position.set(0, 0.506, piece.focus.z)
  scene.add(shadow)

  scene.add(new THREE.HemisphereLight(0x9a7a58, 0x6a4428, 1.0))
  // Key light on the centrepiece, as if from a lamp hung above the runner.
  const key = new THREE.SpotLight(0xffc98a, 26, 16, 0.55, 0.7, 1.4)
  key.position.set(0, 7.5, piece.focus.z + 5)
  key.target.position.copy(piece.focus)
  scene.add(key, key.target)
  const chandelierLight = new THREE.PointLight(0xffa850, 45, 20, 1.6)
  chandelierLight.position.copy(chandelier).setY(chandelier.y - 0.6)
  chandelierLight.castShadow = true
  chandelierLight.shadow.mapSize.set(1024, 1024)
  chandelierLight.shadow.bias = -0.002
  scene.add(chandelierLight)
  for (const x of [-4, 4]) {
    const fill = new THREE.PointLight(0xffa850, 20, 12, 1.6)
    fill.position.set(x, 5, -2)
    scene.add(fill)
  }

  const motes = createMotes(
    { count: 110, center: piece.focus.clone().setY(0), radius: [0, 7], height: [1, 7], color: [1.0, 0.78, 0.5], size: 70, drift: 0.3 },
    rand,
  )
  scene.add(motes)

  for (const it of piece.items) stage.addPickable({ id: it.id, object: it.hit })

  let openId: string | null = null
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

  function open(id: string): void {
    const it = piece.items.find((i) => i.id === id)
    if (!it || stage.isFlying) return
    firstInteraction()
    for (const other of piece.items) other.wantActive = other.id === id
    openId = id
    opts.onOpenChange(id)
    stage.fly({
      curve: new THREE.CubicBezierCurve3(
        new THREE.Vector3(),
        stage.home.position.clone().lerp(it.view.position, 0.4),
        it.view.position.clone().lerp(stage.home.position, 0.15),
        it.view.position,
      ),
      lookAt: it.view.target,
      duration: 1.3,
      end: 'hold',
      onDone: () => {},
    })
  }

  function close(): void {
    if (!openId || stage.isFlying) return
    for (const it of piece.items) it.wantActive = false
    openId = null
    opts.onOpenChange(null)
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

  const timeScale = opts.reducedMotion ? 0.3 : 1
  stage.addTicker((time, dt) => {
    motes.material.uniforms.uTime.value = time * timeScale
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
    dispose: () => stage.dispose(),
  }
}
