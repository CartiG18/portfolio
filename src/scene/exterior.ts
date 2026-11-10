import * as THREE from 'three'
import { Stage } from './stage.ts'
import { mulberry32, VoxelBuilder } from './voxels.ts'
import { buildGrounds, buildMuseum, GROUND_STYLES, MUSEUM_STYLES } from './world.ts'
import { createGroundFog, createMotes, createSkyDome } from './atmosphere.ts'
import { createDayBlend } from './timeOfDay.ts'

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
    bloom: { strength: 0.7, radius: 0.5, threshold: 0.7, scale: 0.5 },
    // Neutral at night (the original look); golden hour adds amber and sunbeams.
    grade: { vignette: 0, grain: 0, warmth: 0, rays: 0 },
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

  // Typical sky-camera position, for nearest-first instance ordering.
  const VIEW_FROM = new THREE.Vector3(0, 75, 68)
  const groundGroup = ground.build(VIEW_FROM)
  scene.add(groundGroup)
  const museumGroup = museumBuilder.build(VIEW_FROM)
  scene.add(museumGroup)
  stage.addPickable({ id: 'museum', object: museumGroup, pad: false })

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

  // ---------- Lighting: dim silver moonlight over the forest (golden-hour sun by day) ----------
  const hemi = new THREE.HemisphereLight(0x5674b0, 0x1a3018, 1.05)
  scene.add(hemi)
  const moon = new THREE.DirectionalLight(0xc4d2ff, 1.7)
  moon.position.set(-35, 70, 25)
  moon.target.position.set(0, 0, -10)
  moon.castShadow = true
  moon.shadow.mapSize.set(2048, 2048) // soft golden-hour shadows don't need 4096; saves GPU time on the heaviest scene
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
  const fountainGlows = fountains.map((f) => {
    const glow = new THREE.PointLight(0x5fa8ff, 6, 8, 1.8)
    glow.position.copy(f).add(new THREE.Vector3(0, 2, 0))
    scene.add(glow)
    return glow
  })

  // ---------- Day: sky; sunbeams are drawn in the grade pass ----------
  const sky = createSkyDome(NIGHT)
  scene.add(sky)
  // Low golden-hour sun behind the camera's right shoulder: long shadows across the garden.
  const SUN_POS = new THREE.Vector3(95, 34, 85)
  // Emissive materials that change between night and day.
  const byName = (group: THREE.Group, name: string) =>
    group.children.filter((m) => m.name === name).map((m) => (m as THREE.Mesh).material as THREE.MeshLambertMaterial)
  const glowing = [
    ...byName(groundGroup, 'lantern').map((m) => ({ m, night: 2.6, day: 0.2 })),
    ...byName(groundGroup, 'flower').map((m) => ({ m, night: 1.6, day: 0.15 })),
    ...byName(groundGroup, 'mushroom').map((m) => ({ m, night: 2.2, day: 0.25 })),
    ...byName(groundGroup, 'water').map((m) => ({ m, night: 0.9, day: 0.35 })),
    ...byName(museumGroup, 'door').map((m) => ({ m, night: 1.3, day: 0.45 })),
  ]
  // Palace windows: warm interior glow at night, reflected sky by day.
  const windows = byName(museumGroup, 'window')
  // Dark slate reads as a black hole under warm light; lift it a little by day.
  const slates = [...byName(museumGroup, 'slate'), ...byName(museumGroup, 'slateDark')]
  // Lantern posts are near-black iron; give them a visible bronze by day.
  const irons = byName(groundGroup, 'iron')
  const sunRim = new THREE.Color(0x4a2a12)
  const windowNight = new THREE.Color(0xffa94d)
  const windowDay = new THREE.Color(0x86acd0)
  const mistMats = fog.group.children.map((m) => (m as THREE.Mesh).material as THREE.MeshBasicMaterial)
  const mistBase = mistMats.map((m) => m.opacity)

  const L = {
    night: {
      background: new THREE.Color(NIGHT), fog: new THREE.Color(NIGHT),
      hemiSky: new THREE.Color(0x5674b0), hemiGround: new THREE.Color(0x1a3018),
      sun: new THREE.Color(0xc4d2ff), mist: new THREE.Color(0x5f7396),
    },
    day: {
      background: new THREE.Color(0xf2b47a), fog: new THREE.Color(0xe3b48c),
      hemiSky: new THREE.Color(0xffd6a6), hemiGround: new THREE.Color(0x3e4a24),
      sun: new THREE.Color(0xffb46a), mist: new THREE.Color(0xf3cfa6),
    },
  }
  const MOON_POS = moon.position.clone()
  const dayBlend = createDayBlend(opts.reducedMotion)
  const tmp = new THREE.Color()
  const tmp2 = new THREE.Color()
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  let lastBlend = -1

  function applyTimeOfDay(b: number): void {
    stage.setLook({
      exposure: lerp(1.15, 1.0, b),
      bloomStrength: lerp(0.7, 0.32, b),
      bloomThreshold: lerp(0.7, 0.88, b),
      background: tmp.lerpColors(L.night.background, L.day.background, b),
      fogColor: tmp2.lerpColors(L.night.fog, L.day.fog, b),
      fogNear: lerp(95, 135, b),
      fogFar: lerp(160, 270, b),
      warmth: lerp(0, 1.85, b),
      vignette: lerp(0, 0.35, b),
      rays: lerp(0, 0.16, b),
    })
    sky.material.uniforms.uBlend.value = b
    hemi.color.lerpColors(L.night.hemiSky, L.day.hemiSky, b)
    hemi.groundColor.lerpColors(L.night.hemiGround, L.day.hemiGround, b)
    hemi.intensity = lerp(1.05, 1.3, b)
    moon.color.lerpColors(L.night.sun, L.day.sun, b)
    moon.intensity = lerp(1.7, 3.2, b)
    moon.position.lerpVectors(MOON_POS, SUN_POS, b)
    stage.refreshShadows() // only while the sun/moon is actually moving
    for (const g of glowing) g.m.emissiveIntensity = lerp(g.night, g.day, b)
    for (const w of windows) {
      w.emissive.lerpColors(windowNight, windowDay, b)
      w.emissiveIntensity = lerp(1.05, 0.5, b)
    }
    for (const g of fountainGlows) g.intensity = 6 * (1 - b)
    for (const m of slates) {
      m.color.setScalar(lerp(1, 2.6, b))
      m.emissive.copy(sunRim).multiplyScalar(b) // warm sunlit cast on the roofs
    }
    for (const m of irons) {
      m.color.setRGB(lerp(1, 4.2, b), lerp(1, 3.2, b), lerp(1, 2.2, b))
    }
    mistMats.forEach((m, i) => {
      m.color.lerpColors(L.night.mist, L.day.mist, b)
      m.opacity = mistBase[i] * lerp(1, 0.55, b) // thinner haze by day
    })
    fireflies.material.uniforms.uColor.value.set(0.86, 1.0, 0.42).multiplyScalar(1 - b)
  }
  applyTimeOfDay(dayBlend.value)

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
    const b = dayBlend.update(time)
    if (b !== lastBlend) {
      applyTimeOfDay(b)
      lastBlend = b
    }
    pathLights.forEach((l, i) => (l.intensity = (22 + Math.sin(time * 3 + i) * 1.5) * (1 - 0.85 * b)))
    hoverAmount += ((hovering ? 1 : 0) - hoverAmount) * Math.min(1, dt * 8)
    for (const m of hoverMaterials) m.emissive.copy(hoverGlow).multiplyScalar(hoverAmount)
    doorLight.intensity = (16 + hoverAmount * 30) * (1 - 0.7 * b)
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
  return {
    enter,
    dispose: () => {
      dayBlend.dispose()
      stage.dispose()
    },
  }
}
