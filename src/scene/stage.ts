import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

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
  bloom: { strength: number; radius: number; threshold: number }
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
  }
  /** Cursor response: drift the camera sideways (sky views)... */
  parallax?: { x: number; y: number; look: number }
  /** ...or turn the head to look around (eye-level views). */
  lookAround?: { yawDeg: number; pitchDeg: number }
}

export interface Pickable {
  id: string
  object: THREE.Object3D
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
  private pickables: Pickable[] = []
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = opts.exposure

    this.scene.background = new THREE.Color(opts.background)
    this.scene.fog = new THREE.Fog(opts.background, opts.fog.near, opts.fog.far)
    this.camera = new THREE.PerspectiveCamera(opts.camera.fov, 1, 0.3, 400)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const { strength, radius, threshold } = opts.bloom
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, threshold))
    this.composer.addPass(new OutputPass())

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
    this.pickables.push(p)
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

  /** Highlight an item from outside the canvas (e.g. a focused keyboard button). */
  highlight(id: string | null): void {
    this.setHover(id)
  }

  /** Fly the camera along a curve (its first point is replaced by the current position). */
  fly(flight: Flight): void {
    if (this.flight) return
    this.setHover(null)
    if (this.opts.reducedMotion) {
      // No camera travel: jump straight to the end pose.
      const end = flight.end ?? 'exit'
      this.held = end === 'hold' ? { position: flight.curve.getPoint(1), lookAt: flight.lookAt.clone() } : null
      flight.onProgress?.(1)
      window.setTimeout(flight.onDone, end === 'exit' ? 200 : 0)
      return
    }
    this.held = null
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
      const dt = Math.min(this.clock.getDelta(), 0.05)
      const time = this.clock.getElapsedTime()
      for (const t of this.tickers) t(time, dt)
      this.updateCamera(time, dt)
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
    this.camera.fov = this.fovFor(this.camera.aspect)
    this.camera.updateProjectionMatrix()
    this.placeBaseCamera()
  }

  /** Eye-level views keep their horizontal field of view on narrow screens by widening vertically. */
  private fovFor(aspect: number): number {
    const c = this.opts.camera
    if (!c.position) return c.fov
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * 1.6)
    const vFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / aspect))
    return Math.min(85, Math.max(c.fov, vFov))
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
        this.setHover(this.pick())
      }
      return
    }

    const before = this.parallax.clone()
    this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * 2.5))
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

    if (this.pointerDirty && this.pointerInside) {
      this.pointerDirty = false
      this.setHover(this.pick())
    }
  }

  private pick(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    let best: { id: string; distance: number } | null = null
    for (const p of this.pickables) {
      const hit = this.raycaster.intersectObject(p.object, true)[0]
      if (hit && (!best || hit.distance < best.distance)) best = { id: p.id, distance: hit.distance }
    }
    return best?.id ?? null
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
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointer(e)
    this.pointerInside = true
    this.pointerDirty = true
    if (this.finePointer && !this.opts.reducedMotion) this.parallaxTarget.copy(this.pointer)
  }

  private onPointerLeave = (): void => {
    this.pointerInside = false
    this.parallaxTarget.set(0, 0)
    this.setHover(null)
  }

  private onClick = (e: MouseEvent): void => {
    if (this.flight) return
    this.updatePointer(e)
    this.onPick(this.pick() ?? '')
  }
}
