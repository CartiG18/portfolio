import * as THREE from 'three'
import { Stage } from './stage.ts'
import { mulberry32, VoxelBuilder } from './voxels.ts'
import { buildGrounds, buildMuseum, GROUND_STYLES, MUSEUM_STYLES } from './world.ts'
import { createGroundFog, createMotes } from './atmosphere.ts'

export interface SceneHandle {
  /** Start the "walk inside" flight. */
  enter(): void
  dispose(): void
}

export interface ExteriorOptions {
  canvas: HTMLCanvasElement
  reducedMotion: boolean
  /** 0 → 1 as the camera reaches the door, for fading the screen. */
  onEnterProgress(t: number): void
  onEntered(): void
}

const NIGHT = 0x081020

export function createExterior(opts: ExteriorOptions): SceneHandle {
  const rand = mulberry32(20261109)

  const ground = new VoxelBuilder(GROUND_STYLES, rand)
  const { fountains } = buildGrounds(ground, rand)
  const museumBuilder = new VoxelBuilder(MUSEUM_STYLES, rand)
  const museum = buildMuseum(museumBuilder)

  const stage = new Stage({
    canvas: opts.canvas,
    reducedMotion: opts.reducedMotion,
    background: NIGHT,
    fog: { near: 95, far: 160 },
    exposure: 1.15,
    bloom: { strength: 0.7, radius: 0.5, threshold: 0.7 },
    camera: {
      fov: 32,
      // Aim slightly below the building's middle so it sits centred in the frame.
      target: new THREE.Vector3(0, 6, -4),
      elevationDeg: 44,
      azimuthDeg: 0, // head-on
      distance: 100,
    },
    parallax: { x: 3.5, y: 2, look: 0.9 },
  })
  const { scene } = stage

  scene.add(ground.build())
  const museumGroup = museumBuilder.build()
  scene.add(museumGroup)
  stage.addPickable({ id: 'museum', object: museumGroup })

  const fireflies = createMotes(
    {
      count: 380,
      center: new THREE.Vector3(0, 0, -2),
      radius: [8, 42],
      height: [1, 7],
      color: [0.86, 1.0, 0.42],
      size: 460,
      drift: 1,
    },
    rand,
  )
  scene.add(fireflies)
  const fog = createGroundFog(rand)
  scene.add(fog.group)

  // ---------- Lighting: dim silver moonlight over the forest ----------
  scene.add(new THREE.HemisphereLight(0x5674b0, 0x1a3018, 1.05))
  const moon = new THREE.DirectionalLight(0xc4d2ff, 1.7)
  moon.position.set(-35, 70, 25)
  moon.target.position.set(0, 0, -10)
  moon.castShadow = true
  moon.shadow.mapSize.set(4096, 4096)
  Object.assign(moon.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 220 })
  moon.shadow.bias = -0.0006
  scene.add(moon, moon.target)

  const doorLight = new THREE.PointLight(0xffa04a, 16, 16, 1.7)
  doorLight.position.set(0, 5, 4)
  scene.add(doorLight)

  const pathLights = [10, 24].map((z) => {
    const light = new THREE.PointLight(0xffb45e, 22, 16, 1.6)
    light.position.set(0, 5, z)
    scene.add(light)
    return light
  })
  for (const f of fountains) {
    const glow = new THREE.PointLight(0x5fa8ff, 6, 8, 1.8)
    glow.position.copy(f).add(new THREE.Vector3(0, 2, 0))
    scene.add(glow)
  }

  // ---------- Hover: the building warms up ----------
  const hoverMaterials = museumGroup.children
    .map((m) => (m as THREE.Mesh).material as THREE.MeshLambertMaterial)
    .filter((m) => m.emissive.getHex() === 0x000000)
  const hoverGlow = new THREE.Color(0x160f06)
  let hovering = false
  let hoverAmount = 0
  stage.onHover = (id) => (hovering = id === 'museum')
  stage.onPick = (id) => {
    if (id === 'museum') enter()
  }

  const timeScale = opts.reducedMotion ? 0.25 : 1
  stage.addTicker((time, dt) => {
    fireflies.material.uniforms.uTime.value = time * timeScale
    fog.update(time * timeScale)
    pathLights.forEach((l, i) => (l.intensity = 22 + Math.sin(time * 3 + i) * 1.5))
    hoverAmount += ((hovering ? 1 : 0) - hoverAmount) * Math.min(1, dt * 8)
    for (const m of hoverMaterials) m.emissive.copy(hoverGlow).multiplyScalar(hoverAmount)
    doorLight.intensity = 16 + hoverAmount * 30
  })

  function enter(): void {
    hovering = false
    const d = museum.doorway
    stage.fly({
      curve: new THREE.CubicBezierCurve3(
        new THREE.Vector3(),
        new THREE.Vector3(0, 45, 60),
        new THREE.Vector3(0, 8, 22),
        new THREE.Vector3(d.x, d.y + 0.5, d.z + 2.5),
      ),
      lookAt: d,
      duration: 2.6,
      onProgress: opts.onEnterProgress,
      onDone: opts.onEntered,
    })
  }

  stage.start()
  return { enter, dispose: () => stage.dispose() }
}
