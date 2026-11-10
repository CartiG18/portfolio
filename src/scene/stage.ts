import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { createGradePass, type GradeOptions } from './grade.ts'

/**
 * Shared "diorama" stage for the 3D views: renderer + bloom, a raised camera aimed at a
 * target, cursor parallax, hover/click picking, and scripted camera flights.
 */
export interface StageOptions {
  canvas: HTMLCanvasElement
  reducedMotion: boolean
  background: number
  fog: { near: number; far: number }
  exposure: number
  bloom: { strength: number; radius: number; threshold: number; /** Fraction of render size (default 1). */ scale?: number }
  /** Vignette, grain and warm grade (display space). */
  grade?: GradeOptions
  /** Allow depth of field, used while an exhibit item is in focus. */
  depthOfField?: boolean
  camera: {
    /** Vertical FOV at a 16:10 landscape aspect. */
    fov: number
    target: THREE.Vector3
    /**
     * Either orbit-style placement (elevation/azimuth/distance from the target), or an explicit
     * eye position, e.g. a person standing in a room.
     */
    elevationDeg?: number
    azimuthDeg?: number
    /** Distance at a 16:10 landscape aspect; pulled back automatically on narrow screens. */
    distance?: number
    position?: THREE.Vector3
    /**
     * Eye-level views: the aspect at which `fov` applies. Narrower screens widen the vertical
     * FOV to keep this horizontal field of view, so the same things stay in frame.
     */
    refAspect?: number
  }
  /** Cursor response: drift the camera sideways (sky views)... */
  parallax?: { x: number; y: number; look: number }
  /** ...or turn the head to look around (eye-level views). */
  lookAround?: { yawDeg: number; pitchDeg: number }
}

export interface Pickable {
  id: string
  object: THREE.Object3D
  /**
   * Padding (world units) for the invisible pick proxy around the object's bounds, so targets
   * are easy to land on. `false` picks the exact mesh instead (e.g. the whole palace outside).
   * Several pickables may share an id (a door and its placard act as one target).
   */
  pad?: number | false
}

/**
 * Aim assist for eye-level views: a clickable target "locks" the view so it doesn't slide out
 * from under the cursor, with hysteresis on release and friction as the cursor approaches.
 * All tuning in one place.
 */
/** Frame-rate watchdog tuning (see Stage.watchFrameRate). */
export const WATCHDOG = {
  MIN_FPS: 50,
  WINDOW_S: 3,
  STEP: 0.15,
  FLOOR: 0.7,
} as const

export const AIM = {
  /** Ease into the head-turn freeze when a target is hovered. */
  LOCK_EASE_S: 0.15,
  /** Ease the head-turn back in after leaving a target. */
  RELEASE_EASE_S: 0.3,
  /** A locked target stays hovered until the cursor leaves its bounds grown by this fraction… */
  HYSTERESIS_FRAC: 0.25,
  /** …or by at least this many pixels. */
  HYSTERESIS_MIN_PX: 24,
  /** Within this many pixels of a target's bounds, head-turn gain starts to drop… */
  FRICTION_RADIUS_PX: 60,
  /** …down to this fraction at the bounds. */
  FRICTION_MIN_GAIN: 0.35,
  /** Default proxy padding (world units). */
  DEFAULT_PAD: 0.15,
} as const

interface PickProxy {
  id: string
  /** What the raycaster tests: an invisible padded box, or the object itself. */
  target: THREE.Object3D
  /** World-space bounds (padded), for screen-space hysteresis and friction. */
  box: THREE.Box3
}

export interface Flight {
  curve: THREE.Curve<THREE.Vector3>
  lookAt: THREE.Vector3
  duration: number
  onProgress?(t: number): void
  onDone(): void
  /**
   * What happens when the flight ends: 'exit' stops rendering (the view is about to change),
   * 'hold' keeps the camera at the end pose, 'resume' returns to normal cursor-driven framing.
   */
  end?: 'exit' | 'hold' | 'resume'
  /** Head-bob amplitude for walking flights (world units). Kept small; 0 = no bob. */
  bob?: number
  /** Start pose; defaults to wherever the camera is now. */
  from?: { position: THREE.Vector3; lookAt: THREE.Vector3 }
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export class Stage {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly clock = new THREE.Clock()
  onHover: (id: string | null) => void = () => {}
  onPick: (id: string) => void = () => {}

  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bokeh: BokehPass | null = null
  private bloom: UnrealBloomPass
  private grade: ReturnType<typeof createGradePass> | null = null
  private focusTarget: THREE.Vector3 | null = null
  private focusAmount = 0
  private opts: StageOptions
  private basePos = new THREE.Vector3()
  private right = new THREE.Vector3()
  private up = new THREE.Vector3()
  private lookAt = new THREE.Vector3()
  private lookDir = new THREE.Vector3()
  private side = new THREE.Vector3()
  private pointer = new THREE.Vector2()
  private parallaxTarget = new THREE.Vector2()
  private parallax = new THREE.Vector2()
  private raycaster = new THREE.Raycaster()
  private proxies: PickProxy[] = []
  /** Target under the pointer (or locked); clicks activate this, never a fresh raycast. */
  private pointerHovered: string | null = null
  private locked: string | null = null
  /** Head-turn gain: 1 = free, 0 = frozen on a target. */
  private aimGain = 1
  private pointerPx = new THREE.Vector2()
  private hovered: string | null = null
  private pointerInside = false
  private pointerDirty = false
  private flight: (Flight & { start: number; lookFrom: THREE.Vector3 }) | null = null
  private held: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null = null
  private tickers: Array<(time: number, dt: number) => void> = []
  private frame = 0
  private resizeObserver: ResizeObserver
  private finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

  constructor(opts: StageOptions) {
    this.opts = opts
    const { canvas } = opts

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    // 1.5× is visually indistinguishable here under bloom and grain, and much cheaper than 2×.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    // Shadow casters in these scenes are static, so shadow maps render only on request
    // (see refreshShadows) instead of every frame; this was the exterior's biggest cost.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = opts.exposure

    this.scene.background = new THREE.Color(opts.background)
    this.scene.fog = new THREE.Fog(opts.background, opts.fog.near, opts.fog.far)
    this.camera = new THREE.PerspectiveCamera(opts.camera.fov, 1, 0.3, 400)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    if (opts.depthOfField) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 5, aperture: 0.004, maxblur: 0.008 })
      this.bokeh.enabled = false
      this.composer.addPass(this.bokeh)
    }
    const { strength, radius, threshold } = opts.bloom
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, threshold)
    // Optionally run bloom at reduced resolution (it's blurred anyway).
    const bloomScale = opts.bloom.scale ?? 1
    if (bloomScale !== 1) {
      const setSize = this.bloom.setSize.bind(this.bloom)
      this.bloom.setSize = (w: number, h: number) => setSize(Math.max(1, Math.round(w * bloomScale)), Math.max(1, Math.round(h * bloomScale)))
    }
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    if (opts.grade) {
      this.grade = createGradePass(opts.grade)
      this.composer.addPass(this.grade)
    }

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()

    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('click', this.onClick)
  }

  get reducedMotion(): boolean {
    return this.opts.reducedMotion
  }

  addPickable(p: Pickable): void {
    p.object.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(p.object)
    if (p.pad === false) {
      this.proxies.push({ id: p.id, target: p.object, box })
      return
    }
    box.expandByScalar(p.pad ?? AIM.DEFAULT_PAD)
    const size = box.getSize(new THREE.Vector3())
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }))
    box.getCenter(proxy.position)
    proxy.updateMatrixWorld()
    this.scene.add(proxy)
    this.proxies.push({ id: p.id, target: proxy, box })
  }

  addTicker(fn: (time: number, dt: number) => void): void {
    this.tickers.push(fn)
  }

  get isFlying(): boolean {
    return this.flight !== null
  }

  get isHeld(): boolean {
    return this.held !== null
  }

  /** The resting eye position and look target (where cursor framing is centred). */
  get home(): { position: THREE.Vector3; target: THREE.Vector3 } {
    return { position: this.basePos.clone(), target: this.opts.camera.target.clone() }
  }

  /** Current look target, e.g. to start a flight from where the camera is pointing. */
  get currentLookAt(): THREE.Vector3 {
    return this.lookAt.clone()
  }

  // ---------- Frame-rate watchdog ----------
  // If a scene averages under WATCHDOG.MIN_FPS for WATCHDOG.WINDOW_S, step the render
  // resolution down (never below WATCHDOG.FLOOR) so slower GPUs settle at a steady rate.
  private watchTime = 0
  private watchFrames = 0
  private watchSkip = 2 // ignore the first windows (shader compile, warm-up)

  private watchFrameRate(dt: number): void {
    if (dt > 0.5) return // tab was hidden
    this.watchTime += dt
    this.watchFrames++
    if (this.watchTime < WATCHDOG.WINDOW_S) return
    const fps = this.watchFrames / this.watchTime
    this.watchTime = 0
    this.watchFrames = 0
    if (this.watchSkip > 0) {
      this.watchSkip--
      return
    }
    const current = this.renderer.getPixelRatio()
    if (fps < WATCHDOG.MIN_FPS && current > WATCHDOG.FLOOR + 0.01) {
      const next = Math.max(WATCHDOG.FLOOR, current - WATCHDOG.STEP)
      this.renderer.setPixelRatio(next)
      this.composer.setPixelRatio(next)
      this.resize()
    }
  }

  /** Re-render shadow maps on the next frame (call when a shadow-casting light moves). */
  refreshShadows(): void {
    this.renderer.shadowMap.needsUpdate = true
  }

  /** Adjust the global look (used for the day/night crossfade). */
  setLook(look: {
    exposure?: number
    bloomStrength?: number
    bloomThreshold?: number
    background?: THREE.Color
    fogColor?: THREE.Color
    fogNear?: number
    fogFar?: number
    vignette?: number
    warmth?: number
    rays?: number
  }): void {
    if (look.exposure !== undefined) this.renderer.toneMappingExposure = look.exposure
    if (look.bloomStrength !== undefined) this.bloom.strength = look.bloomStrength
    if (look.bloomThreshold !== undefined) this.bloom.threshold = look.bloomThreshold
    if (look.background) (this.scene.background as THREE.Color).copy(look.background)
    const fog = this.scene.fog as THREE.Fog
    if (look.fogColor) fog.color.copy(look.fogColor)
    if (look.fogNear !== undefined) fog.near = look.fogNear
    if (look.fogFar !== undefined) fog.far = look.fogFar
    if (this.grade) {
      if (look.vignette !== undefined) this.grade.uniforms.uVignette.value = look.vignette
      if (look.warmth !== undefined) this.grade.uniforms.uWarmth.value = look.warmth
      if (look.rays !== undefined) this.grade.uniforms.uRays.value = look.rays
    }
  }

  /** Bring a point into sharp focus with depth of field (null to clear). */
  setFocus(target: THREE.Vector3 | null): void {
    this.focusTarget = target ? target.clone() : null
  }

  /** Highlight an item from outside the canvas (e.g. a focused keyboard button). */
  highlight(id: string | null): void {
    this.setHover(id)
  }

  /** Fly the camera along a curve (its first point is replaced by the current position). */
  fly(flight: Flight): void {
    if (this.flight) return
    this.locked = null
    this.setPointerHover(null)
    if (this.opts.reducedMotion) {
      // No camera travel: jump straight to the end pose.
      const end = flight.end ?? 'exit'
      this.held = end === 'hold' ? { position: flight.curve.getPoint(1), lookAt: flight.lookAt.clone() } : null
      flight.onProgress?.(1)
      window.setTimeout(flight.onDone, end === 'exit' ? 200 : 0)
      return
    }
    this.held = null
    if (flight.from) {
      this.camera.position.copy(flight.from.position)
      this.lookAt.copy(flight.from.lookAt)
      this.camera.lookAt(this.lookAt)
    }
    const curve = flight.curve as THREE.CubicBezierCurve3
    if ('v0' in curve) curve.v0.copy(this.camera.position)
    this.flight = {
      ...flight,
      start: this.clock.getElapsedTime(),
      lookFrom: this.lookAt.clone(),
    }
  }

  start(): void {
    const tick = () => {
      this.frame = requestAnimationFrame(tick)
      const raw = this.clock.getDelta()
      this.watchFrameRate(raw)
      const dt = Math.min(raw, 0.05)
      const time = this.clock.getElapsedTime()
      for (const t of this.tickers) t(time, dt)
      this.updateCamera(time, dt)
      this.updatePost(time, dt)
      this.composer.render()
    }
    tick()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    const { canvas } = this.opts
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    canvas.removeEventListener('click', this.onClick)
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        ;(m as THREE.MeshBasicMaterial).map?.dispose()
        m.dispose()
      }
    })
    this.composer.dispose()
    this.renderer.dispose()
  }

  // ---------- internals ----------

  private resize(): void {
    const { canvas } = this.opts
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    if (this.grade) this.grade.uniforms.uAspect.value = this.camera.aspect
    this.camera.fov = this.fovFor(this.camera.aspect)
    this.camera.updateProjectionMatrix()
    this.placeBaseCamera()
  }

  /** Eye-level views keep their horizontal field of view on narrow screens by widening vertically. */
  private fovFor(aspect: number): number {
    const c = this.opts.camera
    if (!c.position) return c.fov
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * (c.refAspect ?? 1.6))
    // Hold the horizontal field of view at every aspect: narrow screens widen vertically, and
    // short-wide screens narrow vertically so placards don't shrink. Clamped to stay natural.
    const vFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / aspect))
    return Math.min(85, Math.max(36, vFov))
  }

  private placeBaseCamera(): void {
    const c = this.opts.camera
    if (c.position) {
      this.basePos.copy(c.position)
    } else {
      const el = THREE.MathUtils.degToRad(c.elevationDeg ?? 45)
      const az = THREE.MathUtils.degToRad(c.azimuthDeg ?? 0)
      // Pull back on narrow/portrait screens so the subject stays in frame.
      const distance = (c.distance ?? 50) * Math.max(1, Math.pow(1.6 / this.camera.aspect, 0.8))
      this.basePos
        .set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
        .multiplyScalar(distance)
        .add(c.target)
    }
    if (!this.flight) {
      this.camera.position.copy(this.basePos)
      this.lookAt.copy(c.target)
      this.camera.lookAt(this.lookAt)
    }
    const m = new THREE.Matrix4().lookAt(this.basePos, c.target, THREE.Object3D.DEFAULT_UP)
    this.right.setFromMatrixColumn(m, 0)
    this.up.setFromMatrixColumn(m, 1)
  }

  private updateCamera(time: number, dt: number): void {
    if (this.flight) {
      const f = this.flight
      const raw = Math.min(1, (time - f.start) / f.duration)
      const t = easeInOutCubic(raw)
      this.camera.position.copy(f.curve.getPoint(t))
      if (f.bob) {
        // About two steps per world unit walked, fading in and out with the walk.
        const steps = Math.max(2, Math.round(f.curve.getLength() * 0.55))
        this.camera.position.y += Math.abs(Math.sin(t * Math.PI * steps)) * f.bob * Math.sin(t * Math.PI)
      }
      this.lookAt.lerpVectors(f.lookFrom, f.lookAt, Math.min(1, t * 1.3))
      this.camera.lookAt(this.lookAt)
      f.onProgress?.(raw)
      if (raw >= 1) {
        this.flight = null
        const end = f.end ?? 'exit'
        if (end === 'exit') cancelAnimationFrame(this.frame)
        if (end === 'hold') this.held = { position: this.camera.position.clone(), lookAt: this.lookAt.clone() }
        if (end === 'resume') this.parallax.set(0, 0)
        f.onDone()
      }
      return
    }

    if (this.held) {
      this.camera.position.copy(this.held.position)
      this.lookAt.copy(this.held.lookAt)
      this.camera.lookAt(this.lookAt)
      if (this.pointerDirty && this.pointerInside) {
        this.pointerDirty = false
        this.setPointerHover(this.pick())
      }
      return
    }

    const before = this.parallax.clone()
    const aiming = !!this.opts.lookAround && this.finePointer && !this.opts.reducedMotion && this.pointerInside
    if (aiming) this.updateAim(dt)
    else this.aimGain += (1 - this.aimGain) * Math.min(1, dt * 4)
    this.parallax.lerp(this.parallaxTarget, (1 - Math.exp(-dt * 2.5)) * this.aimGain)
    // The view is still easing, so what's under the cursor can change without the mouse moving.
    if (before.distanceToSquared(this.parallax) > 1e-7) this.pointerDirty = true
    const target = this.opts.camera.target
    const look = this.opts.lookAround
    if (look) {
      // Turn the head toward the cursor: yaw around the eye, then tilt up/down.
      const dir = this.lookDir.copy(target).sub(this.basePos)
      dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.parallax.x * THREE.MathUtils.degToRad(look.yawDeg))
      const side = this.side.crossVectors(dir, THREE.Object3D.DEFAULT_UP).normalize()
      dir.applyAxisAngle(side, this.parallax.y * THREE.MathUtils.degToRad(look.pitchDeg))
      this.camera.position.copy(this.basePos)
      this.lookAt.copy(this.basePos).add(dir)
    } else {
      // Ease toward the cursor: the camera drifts slightly toward the side the pointer is on.
      const p = this.opts.parallax ?? { x: 0, y: 0, look: 0 }
      this.camera.position
        .copy(this.basePos)
        .addScaledVector(this.right, this.parallax.x * p.x)
        .addScaledVector(this.up, this.parallax.y * p.y)
      this.lookAt.copy(target).addScaledVector(this.right, this.parallax.x * p.look)
    }
    this.camera.lookAt(this.lookAt)

    if (!aiming && this.pointerDirty && this.pointerInside) {
      this.pointerDirty = false
      this.setPointerHover(this.pick())
    }
  }

  private updatePost(time: number, dt: number): void {
    if (this.grade) {
      const u = this.grade.uniforms
      u.uTime.value = time
      // Skip the full-screen pass entirely when it would be a no-op (e.g. the exterior at night).
      this.grade.enabled = u.uVignette.value > 0.001 || u.uGrain.value > 0.001 || u.uWarmth.value > 0.001 || u.uRays.value > 0.001
    }
    if (!this.bokeh) return
    const want = this.focusTarget && !this.opts.reducedMotion ? 1 : 0
    this.focusAmount += (want - this.focusAmount) * Math.min(1, dt * 3)
    this.bokeh.enabled = this.focusAmount > 0.02
    if (this.bokeh.enabled) {
      const u = (this.bokeh as unknown as { uniforms: Record<string, THREE.IUniform> }).uniforms
      if (this.focusTarget) u.focus.value = this.camera.position.distanceTo(this.focusTarget)
      u.aperture.value = 0.0035 * this.focusAmount
      u.maxblur.value = 0.008 * this.focusAmount
    }
  }

  private pick(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    let best: { id: string; distance: number } | null = null
    for (const p of this.proxies) {
      const hit = this.raycaster.intersectObject(p.target, true)[0]
      if (hit && (!best || hit.distance < best.distance)) best = { id: p.id, distance: hit.distance }
    }
    return best?.id ?? null
  }

  private corner = new THREE.Vector3()
  private canvasRect = new DOMRect()

  /** Screen-space bounds (px) of every proxy with this id, unioned; null if behind the camera. */
  private screenRect(id: string): { x0: number; y0: number; x1: number; y1: number } | null {
    const rect = this.canvasRect
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of this.proxies) {
      if (p.id !== id) continue
      const { min, max } = p.box
      for (let i = 0; i < 8; i++) {
        this.corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).project(this.camera)
        if (this.corner.z > 1) return null
        const sx = ((this.corner.x + 1) / 2) * rect.width
        const sy = ((1 - this.corner.y) / 2) * rect.height
        x0 = Math.min(x0, sx)
        y0 = Math.min(y0, sy)
        x1 = Math.max(x1, sx)
        y1 = Math.max(y1, sy)
      }
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null
  }

  /** Lock, hysteresis and friction for eye-level views (runs only while the pointer is in). */
  private updateAim(dt: number): void {
    // One layout read per frame, shared by every target's screen-space bounds.
    this.canvasRect = this.opts.canvas.getBoundingClientRect()
    const p = this.pointerPx
    // Release a locked target only once the cursor leaves its expanded bounds.
    if (this.locked) {
      const r = this.screenRect(this.locked)
      const mx = r ? Math.max(AIM.HYSTERESIS_MIN_PX, (r.x1 - r.x0) * AIM.HYSTERESIS_FRAC) : 0
      const my = r ? Math.max(AIM.HYSTERESIS_MIN_PX, (r.y1 - r.y0) * AIM.HYSTERESIS_FRAC) : 0
      if (!r || p.x < r.x0 - mx || p.x > r.x1 + mx || p.y < r.y0 - my || p.y > r.y1 + my) this.locked = null
    }
    if (!this.locked && this.pointerDirty) {
      this.pointerDirty = false
      this.locked = this.pick()
    }
    this.setPointerHover(this.locked)

    // Friction: slow the head turn as the cursor nears any target.
    let nearest = Infinity
    const seen = new Set<string>()
    for (const proxy of this.proxies) {
      if (seen.has(proxy.id)) continue
      seen.add(proxy.id)
      const r = this.screenRect(proxy.id)
      if (!r) continue
      const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1)
      const dy = Math.max(r.y0 - p.y, 0, p.y - r.y1)
      nearest = Math.min(nearest, Math.hypot(dx, dy))
    }
    const friction = THREE.MathUtils.lerp(AIM.FRICTION_MIN_GAIN, 1, THREE.MathUtils.smoothstep(nearest, 0, AIM.FRICTION_RADIUS_PX))
    const want = this.locked ? 0 : friction
    const tau = want < this.aimGain ? AIM.LOCK_EASE_S : AIM.RELEASE_EASE_S
    this.aimGain += (want - this.aimGain) * (1 - Math.exp((-dt * 3) / tau))
  }

  private setPointerHover(id: string | null): void {
    this.pointerHovered = id
    this.setHover(id)
  }

  private setHover(id: string | null): void {
    if (id === this.hovered) return
    this.hovered = id
    this.opts.canvas.style.cursor = id ? 'pointer' : ''
    this.onHover(id)
  }

  private updatePointer(e: MouseEvent): void {
    const rect = this.opts.canvas.getBoundingClientRect()
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.pointerPx.set(e.clientX - rect.left, e.clientY - rect.top)
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointer(e)
    this.pointerInside = true
    this.pointerDirty = true
    if (this.finePointer && !this.opts.reducedMotion) {
      if (this.opts.lookAround) {
        // Eye-level views: no head turn while the cursor is in the middle half of the screen,
        // easing in only toward the edges, so targets don't slide away from the cursor.
        const ease = (v: number, dead: number) => Math.sign(v) * THREE.MathUtils.smoothstep(Math.abs(v), dead, 1)
        this.parallaxTarget.set(ease(this.pointer.x, 0.5), ease(this.pointer.y, 0.4))
      } else {
        this.parallaxTarget.copy(this.pointer)
      }
    }
  }

  private onPointerLeave = (): void => {
    this.pointerInside = false
    this.parallaxTarget.set(0, 0)
    this.locked = null
    this.setPointerHover(null)
  }

  private onClick = (e: MouseEvent): void => {
    if (this.flight) return
    this.updatePointer(e)
    // With a fine pointer, activate what's hovered/locked (no fresh raycast after drift).
    // Touch has no hover, so a tap picks directly.
    const id = this.finePointer ? this.pointerHovered : this.pick()
    this.onPick(id ?? '')
  }
}
