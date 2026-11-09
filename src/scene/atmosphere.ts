import * as THREE from 'three'

export interface MoteOptions {
  count: number
  center: THREE.Vector3
  /** Horizontal spread: [inner, outer] radius of the ring the motes start in. */
  radius: [number, number]
  height: [number, number]
  color: [number, number, number]
  size: number
  drift: number
}

/** Glowing particles: fireflies outdoors, candle-lit dust motes indoors. */
export function createMotes(o: MoteOptions, rand: () => number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const { count } = o
  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2
    const radius = o.radius[0] + Math.pow(rand(), 0.7) * (o.radius[1] - o.radius[0])
    positions[i * 3] = o.center.x + Math.cos(angle) * radius
    positions[i * 3 + 1] = o.center.y + o.height[0] + rand() * (o.height[1] - o.height[0])
    positions[i * 3 + 2] = o.center.z + Math.sin(angle) * radius
    phases[i] = rand()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: o.size },
      uDrift: { value: o.drift },
      uColor: { value: new THREE.Vector3(...o.color) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform float uDrift;
      attribute float aPhase;
      varying float vGlow;
      void main() {
        vec3 p = position;
        float t = uTime + aPhase * 100.0;
        p.x += (sin(t * 0.31) * 1.6 + sin(t * 0.83) * 0.4) * uDrift;
        p.y += sin(t * 0.57) * 0.8 * uDrift;
        p.z += (cos(t * 0.27) * 1.6 + cos(t * 0.71) * 0.4) * uDrift;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPixelRatio / -mv.z;
        // Slow pulse, with each firefly occasionally going dark.
        float pulse = 0.5 + 0.5 * sin(t * 1.7);
        vGlow = smoothstep(0.15, 1.0, pulse);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.18, 0.0, d);
        float halo = smoothstep(0.5, 0.0, d) * 0.35;
        vec3 color = uColor * (core * 4.0 + halo * 1.5);
        gl_FragColor = vec4(color * vGlow, (core + halo) * vGlow);
      }
    `,
  })
  return new THREE.Points(geometry, material)
}

function fogTexture(rand: () => number): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  for (let i = 0; i < 40; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 30 + rand() * 70
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    // Draw wrapped copies so the texture tiles seamlessly.
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        ctx.save()
        ctx.translate(ox, oy)
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
        ctx.restore()
      }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

export interface FogLayers {
  group: THREE.Group
  update(time: number): void
}

/** Stacked translucent sheets of low-lying mist that slowly drift. */
export function createGroundFog(rand: () => number): FogLayers {
  const texture = fogTexture(rand)
  const group = new THREE.Group()
  const layers: Array<{ mesh: THREE.Mesh; speed: THREE.Vector2; map: THREE.Texture }> = []

  for (let i = 0; i < 5; i++) {
    const map = texture.clone()
    map.repeat.set(2.5, 2.5)
    map.needsUpdate = true
    const material = new THREE.MeshBasicMaterial({
      map,
      color: 0x5f7396,
      transparent: true,
      opacity: 0.06 - i * 0.008,
      depthWrite: false,
      fog: true,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.9 + i * 0.75
    mesh.renderOrder = 2
    group.add(mesh)
    layers.push({
      mesh,
      map,
      speed: new THREE.Vector2((rand() - 0.5) * 0.006, (rand() - 0.5) * 0.006),
    })
  }

  return {
    group,
    update(time) {
      for (const layer of layers) {
        layer.map.offset.set(layer.speed.x * time, layer.speed.y * time)
      }
    },
  }
}
