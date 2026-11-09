import * as THREE from 'three'
import { Stage } from './stage.ts'
import { mulberry32, VoxelBuilder } from './voxels.ts'
import { buildLibrary, LIBRARY_STYLES } from './library.ts'
import { createMotes } from './atmosphere.ts'
import { contactShadowTexture, doorGlowTexture, ensureFonts, placardTexture, portraitTexture } from './labels.ts'
import { findExhibit } from '../data/exhibits.ts'
import { ACCENT } from './palette.ts'
import { socialLinks } from '../data/site.ts'
import { SOCIAL_ICON_PATHS } from '../data/icons.ts'

export interface InteriorOptions {
  canvas: HTMLCanvasElement
  reducedMotion: boolean
  onDoorProgress(t: number): void
  /** The camera has reached an exhibit door. */
  onEnterExhibit(id: string): void
}

export interface InteriorHandle {
  enterExhibit(id: string): void
  dispose(): void
}

export async function createInterior(opts: InteriorOptions): Promise<InteriorHandle> {
  await ensureFonts()
  const rand = mulberry32(1837) // the year Victoria took the throne

  const builder = new VoxelBuilder(LIBRARY_STYLES, rand)
  const lib = buildLibrary(builder, rand)

  const stage = new Stage({
    canvas: opts.canvas,
    reducedMotion: opts.reducedMotion,
    background: 0x080504,
    fog: { near: 32, far: 70 },
    exposure: 1.0,
    bloom: { strength: 0.45, radius: 0.4, threshold: 0.9 },
    // Standing just inside the entrance at eye level (~2.8 blocks above the floor),
    // facing the Projects Gallery doors.
    camera: {
      fov: 58,
      position: new THREE.Vector3(0, 3.3, 0),
      target: new THREE.Vector3(0, 4.6, -19),
    },
    lookAround: { yawDeg: 38, pitchDeg: 12 },
  })
  const { scene } = stage
  scene.add(builder.build())

  // Contact shadows where furniture meets the floor (one instanced draw call).
  const shadows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: contactShadowTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    lib.contactShadows.length,
  )
  const m4 = new THREE.Matrix4()
  lib.contactShadows.forEach((c, i) => {
    m4.compose(new THREE.Vector3(c.x, 0.505, c.z), new THREE.Quaternion(), new THREE.Vector3(c.w, 1, c.d))
    shadows.setMatrixAt(i, m4)
  })
  shadows.renderOrder = 1
  scene.add(shadows)

  // ---------- Doors: glowing openings, brass placards, hit boxes ----------
  const doorGlows = new Map<string, THREE.MeshBasicMaterial>()
  const glowTexture = doorGlowTexture()
  for (const door of lib.doors) {
    const exhibit = findExhibit(door.id)!
    const facing = Math.atan2(door.normal.x, door.normal.z)

    // Hover is an interactive state, so the light from beyond takes the cool accent.
    const glowMat = new THREE.MeshBasicMaterial({
      color: ACCENT,
      map: glowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      visible: false,
    })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(door.width, door.height), glowMat)
    glow.position.copy(door.center).addScaledVector(door.normal, -0.9)
    glow.rotation.y = facing
    scene.add(glow)
    doorGlows.set(door.id, glowMat)

    const plateWidth = door.width + 1.8
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(plateWidth, plateWidth * 0.29),
      new THREE.MeshBasicMaterial({ map: placardTexture(`Exhibit ${exhibit.number}`, exhibit.title) }),
    )
    plate.position
      .copy(door.center)
      .setY(0.5 + door.height + 2.1)
      .addScaledVector(door.normal, 1.02)
    plate.rotation.y = facing
    scene.add(plate)

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(door.width + 1, door.height + 2.5, 0.6),
      new THREE.MeshBasicMaterial({ visible: false }), // invisible but still raycastable
    )
    hit.position.copy(door.center).setY(0.5 + (door.height + 2.5) / 2).addScaledVector(door.normal, 0.8)
    hit.rotation.y = facing
    scene.add(hit)
    stage.addPickable({ id: door.id, object: hit })
  }

  // ---------- Framed portraits linking out ----------
  for (const p of lib.portraits) {
    const link = socialLinks.find((l) => l.id === p.id)!
    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3),
      new THREE.MeshBasicMaterial({ map: portraitTexture(SOCIAL_ICON_PATHS[p.id], link.label) }),
    )
    canvas.position.copy(p.center).addScaledVector(p.normal, 0.13)
    canvas.rotation.y = Math.atan2(p.normal.x, p.normal.z)
    scene.add(canvas)
    if (link.href) stage.addPickable({ id: `link:${p.id}`, object: canvas })
  }

  // ---------- Candlelight ----------
  scene.add(new THREE.HemisphereLight(0x9a7a58, 0x1a100a, 0.9))
  const fill = new THREE.DirectionalLight(0xffc890, 0.35)
  fill.position.set(6, 30, 20)
  scene.add(fill)

  const flickering: Array<{ light: THREE.PointLight; base: number; seed: number }> = []
  const addCandleLight = (pos: THREE.Vector3, intensity: number, distance: number, shadow = false) => {
    const light = new THREE.PointLight(0xffa850, intensity, distance, 1.6)
    light.position.copy(pos)
    if (shadow) {
      light.castShadow = true
      light.shadow.mapSize.set(1024, 1024)
      light.shadow.bias = -0.002
    }
    scene.add(light)
    flickering.push({ light, base: intensity, seed: rand() * 100 })
  }
  lib.chandeliers.forEach((c, i) => addCandleLight(c.clone().setY(c.y - 0.6), 55, 26, i === 0))
  for (const x of [-6.5, 6.5]) addCandleLight(new THREE.Vector3(x, 3.2, -9), 16, 9)
  addCandleLight(new THREE.Vector3(0, 6, -15), 20, 14)
  for (const x of [-10, 10]) addCandleLight(new THREE.Vector3(x, 6, -14), 18, 13)
  for (const x of [-10, 10]) addCandleLight(new THREE.Vector3(x, 6, -5), 14, 11)

  const motes = createMotes(
    {
      count: 180,
      center: new THREE.Vector3(0, 0, -9),
      radius: [0, 12],
      height: [1.5, 10],
      color: [1.0, 0.78, 0.5],
      size: 70,
      drift: 0.35,
    },
    rand,
  )
  scene.add(motes)

  // ---------- Interaction ----------
  let hovered: string | null = null
  stage.onHover = (id) => (hovered = id)
  stage.onPick = (id) => {
    if (id.startsWith('link:')) {
      const link = socialLinks.find((l) => `link:${l.id}` === id)
      if (link?.href) window.open(link.href, '_blank', 'noopener,noreferrer')
      return
    }
    enterExhibit(id)
  }

  const timeScale = opts.reducedMotion ? 0.3 : 1
  stage.addTicker((time, dt) => {
    motes.material.uniforms.uTime.value = time * timeScale
    for (const f of flickering) {
      const t = time * timeScale + f.seed
      f.light.intensity = f.base * (0.88 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04 + Math.sin(t * 3.1) * 0.03)
    }
    for (const [id, mat] of doorGlows) {
      const target = id === hovered ? 0.75 : 0
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 8)
      mat.visible = mat.opacity > 0.01
    }
  })

  function enterExhibit(id: string): void {
    const door = lib.doors.find((d) => d.id === id)
    if (!door) return
    hovered = null
    // Walk at eye level: turn toward the door, approach it head-on, then step through.
    const eye = 3.3
    const approach = door.center.clone().addScaledVector(door.normal, 5).setY(eye)
    const end = door.center.clone().addScaledVector(door.normal, 0.6).setY(Math.min(eye, door.center.y + 0.5))
    // Head down the centre aisle first so the walk doesn't cut across the reading tables.
    const firstStep = new THREE.Vector3(0, eye, Math.min(-2, approach.z * 0.75))
    stage.fly({
      curve: new THREE.CubicBezierCurve3(new THREE.Vector3(), firstStep, approach, end),
      lookAt: door.center,
      duration: 2.2,
      onProgress: opts.onDoorProgress,
      onDone: () => opts.onEnterExhibit(id),
    })
  }

  stage.start()
  return { enterExhibit, dispose: () => stage.dispose() }
}
