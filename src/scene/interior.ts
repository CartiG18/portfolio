import * as THREE from 'three'
import { Stage } from './stage.ts'
import { mulberry32, texturedMaterial, VoxelBuilder } from './voxels.ts'
import { buildLibrary, LIBRARY_STYLES } from './library.ts'
import { createMotes } from './atmosphere.ts'
import { contactShadowTexture, doorGlowTexture, ensureFonts, placardTexture, portraitTexture, softGlowTexture } from './labels.ts'
import { findExhibit } from '../data/exhibits.ts'
import { ACCENT, PALETTE } from './palette.ts'
import { contactLabel, openEmail, socialLinks } from '../data/site.ts'
import { bookNotes } from '../data/content.ts'
import { sound } from '../audio.ts'
import { createClerestories, createClock, createSunlight } from './lobbyExtras.ts'
import { createDoors } from './doors.ts'
import { createDayBlend, toggleTimeOfDay } from './timeOfDay.ts'
import { EMAIL_ICON_PATH, SOCIAL_ICON_PATHS } from '../data/icons.ts'

export interface InteriorOptions {
  canvas: HTMLCanvasElement
  reducedMotion: boolean
  /** Arriving back from an exhibit: start at its doorway and walk back to the entrance. */
  returnFrom?: string
  /** A shelf book was pulled out (note + where it is on screen) or put back (null). */
  onBookNote?(note: { text: string; source: string } | null, screen?: { x: number; y: number }): void
  onDoorProgress(t: number): void
  /** The camera has reached an exhibit door. */
  onEnterExhibit(id: string): void
}

export interface InteriorHandle {
  enterExhibit(id: string): void
  /** Light a door and its plaque from outside the canvas (keyboard focus). */
  highlight(id: string | null): void
  /** Pull the next featured book (keyboard equivalent of clicking one). */
  pullNextBook(): void
  putBookBack(): void
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
    fog: { near: 40, far: 80 },
    exposure: 1.0,
    bloom: { strength: 0.45, radius: 0.4, threshold: 0.9 },
    grade: { vignette: 0.55, grain: 0.035, warmth: 0.6 },
    // Standing at the entrance end of the hall at eye level (~2.8 blocks above the floor),
    // facing the Projects Gallery doors.
    camera: {
      fov: 58,
      // Stepped back from the doors so all six doors and placards fit at rest, including the
      // CV door near the entrance end of the left wall.
      position: new THREE.Vector3(0, 3.3, 10.5),
      refAspect: 1.83,
      // Pitched up ~7° so the doors and placards sit near the vertical centre, not above a
      // half-frame of empty runner.
      target: new THREE.Vector3(0, 8.0, -19),
    },
    lookAround: { yawDeg: 38, pitchDeg: 12 },
  })
  const { scene } = stage
  const libraryGroup = builder.build(new THREE.Vector3(0, 3.3, 10.5)) // entrance eye position
  scene.add(libraryGroup)
  // Wood, shelving and walls lift by day (emissive materials like flames are left alone).
  const liftMats = libraryGroup.children
    .map((m) => (m as THREE.Mesh).material as THREE.MeshStandardMaterial)
    .filter((m) => m.emissive.getHex() === 0x000000 || m.emissiveIntensity < 0.6)
  const flameMats = libraryGroup.children
    .filter((m) => m.name === 'flame')
    .map((m) => (m as THREE.Mesh).material as THREE.MeshStandardMaterial)

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
  const glowTexture = doorGlowTexture()
  const plates = new Map<string, THREE.MeshBasicMaterial>()
  const halos = new Map<string, THREE.MeshBasicMaterial>()
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT,
    map: softGlowTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const brassMat = texturedMaterial({ ...LIBRARY_STYLES.brass })
  brassMat.color.setHex(PALETTE.brass)
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 })
  const washMat = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0xffc890,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  washMat.map = glowTexture.clone()
  washMat.map.rotation = Math.PI // bright at the top, under the lamp
  washMat.map.center.set(0.5, 0.5)
  for (const door of lib.doors) {
    const exhibit = findExhibit(door.id)!
    const facing = Math.atan2(door.normal.x, door.normal.z)

    // Sized to stay legible from the stepped-back entrance.
    // Side-wall plaques are a little smaller, leaving a clear gap between Résumé and CV.
    // Projects' plaque is a touch smaller so it clears the ceiling above its taller doorway.
    const plateWidth = (door.width + 1.8) * (door.grand ? 1.15 : door.wall === 'back' ? 1.35 : 1.25)
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(plateWidth, plateWidth * 0.29),
      new THREE.MeshBasicMaterial({ map: placardTexture(`Exhibit ${exhibit.number}`, exhibit.title) }),
    )
    plate.position
      .copy(door.center)
      // Just above the doorway's lintel row.
      .setY(door.height + 1.5 + 0.22 + (plateWidth * 0.29) / 2)
      .addScaledVector(door.normal, 1.02)
    plate.rotation.y = facing
    scene.add(plate)
    plates.set(door.id, plate.material as THREE.MeshBasicMaterial)
    stage.addPickable({ id: door.id, object: plate, pad: 0.25 }) // door + placard act as one target

    // Accent halo behind the plaque, shown on hover.
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(plateWidth + 0.5, plateWidth * 0.29 + 0.4), haloMaterial.clone())
    halo.position.copy(plate.position).addScaledVector(door.normal, -0.02)
    halo.rotation.y = facing
    scene.add(halo)
    halos.set(door.id, halo.material as THREE.MeshBasicMaterial)

    // Picture light: a brass bar above the plaque washing it with warm light.
    const barPos = plate.position.clone().add(new THREE.Vector3(0, plateWidth * 0.145 + 0.35, 0)).addScaledVector(door.normal, 0.28)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(plateWidth * 0.55, 0.12, 0.16), brassMat)
    bar.position.copy(barPos)
    bar.rotation.y = facing
    scene.add(bar)
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(plateWidth * 0.5, 0.03, 0.05), bulbMat)
    bulb.position.copy(barPos).add(new THREE.Vector3(0, -0.07, 0)).addScaledVector(door.normal, 0.05)
    bulb.rotation.y = facing
    scene.add(bulb)
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(plateWidth + 0.6, plateWidth * 0.29 + 0.9), washMat)
    wash.position.copy(plate.position).add(new THREE.Vector3(0, 0.15, 0)).addScaledVector(door.normal, 0.01)
    wash.rotation.y = facing
    scene.add(wash)

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(door.width + 1, door.height + 2.5, 0.6),
      new THREE.MeshBasicMaterial({ visible: false }), // invisible but still raycastable
    )
    hit.position.copy(door.center).setY(0.5 + (door.height + 2.5) / 2).addScaledVector(door.normal, 0.8)
    hit.rotation.y = facing
    scene.add(hit)
    stage.addPickable({ id: door.id, object: hit, pad: 0.1 })
  }

  // ---------- Grand doors in every exhibit doorway ----------
  const doors = createDoors(scene, lib.doors)

  // ---------- Haze: light shafts catching the chandelier light ----------
  const hazeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0xffb27a) }, uStrength: { value: 0.07 } },
    vertexShader: /* glsl */ `
      varying float vH;
      varying float vFacing;
      void main() {
        vH = uv.y;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vH;
      varying float vFacing;
      void main() {
        // Brightest near the chandelier, fading toward the floor and at the cone's silhouette.
        float a = uStrength * smoothstep(0.0, 0.9, vH) * pow(vFacing, 1.5);
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  })
  for (const c of lib.chandeliers) {
    const h = c.y - 0.5
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 4.2, h, 24, 1, true), hazeMaterial)
    cone.position.set(c.x, 0.5 + h / 2, c.z)
    scene.add(cone)
  }

  // ---------- Framed portraits linking out ----------
  for (const p of lib.portraits) {
    const isEmail = p.id === 'email'
    const link = isEmail ? undefined : socialLinks.find((l) => l.id === p.id)
    const map = isEmail
      ? portraitTexture(EMAIL_ICON_PATH, 'Email', 'evenodd')
      : portraitTexture(SOCIAL_ICON_PATHS[p.id as 'github' | 'linkedin'], link!.label)
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 2.45), new THREE.MeshBasicMaterial({ map }))
    canvas.position.copy(p.center).addScaledVector(p.normal, 0.13)
    canvas.rotation.y = Math.atan2(p.normal.x, p.normal.z)
    scene.add(canvas)
    if (isEmail || link?.href) stage.addPickable({ id: `link:${p.id}`, object: canvas, pad: 0.25 })
  }
  void contactLabel

  // ---------- Candlelight ----------
  // Warm bounce from below lights the ceiling and beams.
  const hemi = new THREE.HemisphereLight(0x9a7a58, 0x6a4428, 0.9)
  scene.add(hemi)
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
  // No point-light shadows: each costs six extra scene renders; contact shadows ground the furniture.
  // Lights hang well below each chandelier so its brass isn't blown out to white.
  lib.chandeliers.forEach((c) => addCandleLight(c.clone().setY(c.y - 2.2), 62, 30)) // higher ceiling: a little stronger to reach the floor
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

  // ---------- Day/night: clerestory windows, sunlight, the grandfather clock ----------
  const clerestories = createClerestories(scene, brassMat)
  const sunlight = createSunlight(scene, rand)
  const clock = createClock(scene)
  stage.addPickable({ id: 'clock', object: clock.hit, pad: 0.25 })
  const dayBlend = createDayBlend(opts.reducedMotion)
  const hemiNight = { sky: new THREE.Color(0x9a7a58), ground: new THREE.Color(0x6a4428) }
  const hemiDay = { sky: new THREE.Color(0xd9b98c), ground: new THREE.Color(0x8a6038) }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  let lastBlend = -1
  function applyTimeOfDay(b: number): void {
    hemi.color.lerpColors(hemiNight.sky, hemiDay.sky, b)
    hemi.groundColor.lerpColors(hemiNight.ground, hemiDay.ground, b)
    hemi.intensity = lerp(0.9, 1.75, b)
    fill.intensity = lerp(0.35, 0.95, b)
    for (const m of liftMats) m.color.setScalar(lerp(1, 1.35, b))
    stage.setLook({ exposure: lerp(1.0, 1.28, b), warmth: lerp(0.6, 0.8, b), vignette: lerp(0.55, 0.4, b) })
    clerestories.update(b)
  }
  applyTimeOfDay(dayBlend.value)

  // ---------- Featured books: pull one out to find a note tucked inside ----------
  const bookSpots: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
    // [cell centre, wall normal (into room), along-wall axis]
    [new THREE.Vector3(-12, 4, -18), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(5, 3, -18), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(12, 5, -18), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(-13, 4, -17), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(-13, 3, -9), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(13, 4, -17), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1)],
  ]
  const bookMat = texturedMaterial({ ...LIBRARY_STYLES.bookRed })
  bookMat.color.setHex(PALETTE.oxbloodBright)
  const books = bookSpots.slice(0, bookNotes.length).map(([c, n, along], i) => {
    const group = new THREE.Group()
    const depth = 0.66
    const home = c.clone().setY(c.y - 0.4 + 0.42).addScaledVector(n, -0.45 + depth / 2 + 0.12)
    group.position.copy(home)
    group.rotation.y = Math.atan2(n.x, n.z)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.84, depth), bookMat)
    body.castShadow = true
    group.add(body)
    const foil = texturedMaterial({ ...LIBRARY_STYLES.goldFoil })
    foil.color.setHex(PALETTE.brassBright)
    for (const y of [-0.28, 0.26]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.012), foil)
      band.position.set(0, y, depth / 2 + 0.006)
      group.add(band)
    }
    scene.add(group)
    stage.addPickable({ id: `book:${i}`, object: group, pad: 0.22 })
    void along
    return { group, home, normal: n, foil, hover: 0, pull: 0 }
  })
  let pulledBook: number | null = null

  function setBook(index: number | null): void {
    pulledBook = index
    if (index === null) {
      opts.onBookNote?.(null)
      return
    }
    sound.pageTurn()
    const b = books[index]
    const screen = b.home.clone().addScaledVector(b.normal, 0.6).project(stage.camera)
    const rect = opts.canvas.getBoundingClientRect()
    opts.onBookNote?.(bookNotes[index], {
      x: rect.left + ((screen.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - screen.y) / 2) * rect.height,
    })
  }

  // ---------- Interaction ----------
  let hovered: string | null = null
  stage.onHover = (id) => (hovered = id)
  stage.onPick = (id) => {
    if (id === 'clock') {
      // Winding the clock flips the time of day; the camera stays put.
      toggleTimeOfDay()
      sound.chime()
      return
    }
    if (id.startsWith('book:')) {
      const i = Number(id.slice(5))
      setBook(pulledBook === i ? null : i)
      return
    }
    if (pulledBook !== null) setBook(null)
    if (!id) return
    if (id === 'link:email') {
      openEmail()
      return
    }
    if (id.startsWith('link:')) {
      const link = socialLinks.find((l) => `link:${l.id}` === id)
      if (link?.href) window.open(link.href, '_blank', 'noopener,noreferrer')
      return
    }
    enterExhibit(id)
  }

  const plateBase = new THREE.Color(0xffffff)
  const plateHover = new THREE.Color(0xe6f6f8)
  const accentColor = new THREE.Color(ACCENT)
  const timeScale = opts.reducedMotion ? 0.3 : 1
  stage.addTicker((time, dt) => {
    motes.material.uniforms.uTime.value = time * timeScale
    const day = dayBlend.update(time)
    if (day !== lastBlend) {
      applyTimeOfDay(day)
      lastBlend = day
    }
    sunlight.update(day, time * timeScale)
    clock.update(day, time, dt, hovered === 'clock', opts.reducedMotion)
    // Candles stay lit by day but read weaker against the daylight.
    const candle = lerp(1, 0.7, day)
    for (const f of flickering) {
      const t = time * timeScale + f.seed
      f.light.intensity = f.base * candle * (0.88 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04 + Math.sin(t * 3.1) * 0.03)
    }
    // The flames themselves flicker slightly too.
    const ft = time * timeScale
    for (const m of flameMats) m.emissiveIntensity = 2.0 * candle * (0.85 + Math.sin(ft * 13) * 0.08 + Math.sin(ft * 29) * 0.05)
    const k = Math.min(1, dt * 8)
    doors.update(hovered, day, dt)
    // Plaques pick up a soft accent glow and tint when their door is hovered.
    for (const [id, mat] of halos) {
      const on = id === hovered ? 1 : 0
      mat.opacity += (on * 0.55 - mat.opacity) * k
      mat.visible = mat.opacity > 0.01
      plates.get(id)!.color.lerpColors(plateBase, plateHover, mat.opacity / 0.55)
    }
    books.forEach((b, i) => {
      b.hover += ((hovered === `book:${i}` ? 1 : 0) - b.hover) * k
      b.pull += ((pulledBook === i ? 1 : 0) - b.pull) * Math.min(1, dt * 5)
      b.group.position.copy(b.home).addScaledVector(b.normal, b.hover * 0.1 + b.pull * 0.45)
      b.group.rotation.z = b.pull * 0.12
      b.foil.emissive.set(0x7a5410).lerp(accentColor, Math.max(b.hover, b.pull))
      b.foil.emissiveIntensity = 0.6 + Math.max(b.hover, b.pull) * 0.8
    })
  })

  function enterExhibit(id: string): void {
    const door = lib.doors.find((d) => d.id === id)
    if (!door) return
    hovered = null
    if (pulledBook !== null) setBook(null)
    // Walk at eye level: turn toward the door, approach it head-on, then step through.
    const eye = 3.3
    const approach = door.center.clone().addScaledVector(door.normal, 5).setY(eye)
    // Stop just short of the threshold, looking level into the warm light (not up at the transom).
    const end = door.center.clone().addScaledVector(door.normal, 1.7).setY(eye)
    // Head down the centre aisle first so the walk doesn't cut across the reading tables.
    const firstStep = new THREE.Vector3(0, eye, Math.min(-2, approach.z * 0.75))
    // The doors start swinging at the click; the walk begins partway through the swing.
    doors.open(id, opts.reducedMotion)
    sound.doorOpen()
    const walk = () => {
      sound.steps(1.5)
      stage.fly({
        curve: new THREE.CubicBezierCurve3(new THREE.Vector3(), firstStep, approach, end),
        lookAt: door.center.clone().addScaledVector(door.normal, -3).setY(eye - 0.2),
        duration: 1.5,
        bob: 0.05,
        onProgress: opts.onDoorProgress,
        onDone: () => opts.onEnterExhibit(id),
      })
    }
    if (opts.reducedMotion) walk()
    else window.setTimeout(walk, 350)
  }

  stage.start()

  // Walking back into the hall from an exhibit: turn away from its door and return to the entrance.
  const back = opts.returnFrom ? lib.doors.find((d) => d.id === opts.returnFrom) : undefined
  if (back) {
    const eye = 3.3
    const home = stage.home
    const atDoor = back.center.clone().addScaledVector(back.normal, 2.2).setY(eye)
    const approach = back.center.clone().addScaledVector(back.normal, 5).setY(eye)
    sound.steps(1.5)
    stage.fly({
      from: { position: atDoor, lookAt: atDoor.clone().addScaledVector(back.normal, 6) },
      curve: new THREE.CubicBezierCurve3(
        new THREE.Vector3(),
        approach,
        new THREE.Vector3(0, eye, Math.min(-2, approach.z * 0.75)),
        home.position,
      ),
      lookAt: home.target,
      duration: 1.5,
      bob: 0.05,
      end: 'resume',
      onDone: () => {},
    })
  }

  return {
    enterExhibit,
    highlight: (id) => stage.highlight(id),
    pullNextBook: () => setBook(pulledBook === null ? 0 : (pulledBook + 1) % books.length),
    putBookBack: () => setBook(null),
    dispose: () => {
      dayBlend.dispose()
      stage.dispose()
    },
  }
}
