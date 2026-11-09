import * as THREE from 'three'
import { getTexture, type TextureName } from './textures.ts'

export interface BlockStyle {
  color: number
  /** Random brightness variation per block (0–1) for a hand-placed look. */
  jitter?: number
  emissive?: number
  emissiveIntensity?: number
  castShadow?: boolean
  receiveShadow?: boolean
  /** Pixel-art surface texture, tiled in world units (so stretched props don't smear it). */
  texture?: TextureName
  /** Texture repeats per world unit (default 1). */
  texScale?: number
  roughness?: number
  metalness?: number
  /** Darken surfaces near the floor, a cheap stand-in for ambient occlusion. */
  floorAO?: boolean
}

export interface PropRotation {
  x?: number
  y?: number
  z?: number
}

interface Block {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  rot?: PropRotation
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)

/** Small seeded PRNG so the world looks the same on every visit. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A standard material whose map is projected in world space along each face's dominant
 * axis. Every block face is axis-aligned, so this gives exact, unstretched pixels on props
 * of any size, and lets us add a floor-contact darkening term in the same pass.
 */
export function texturedMaterial(style: BlockStyle): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: style.texture ? getTexture(style.texture) : null,
    roughness: style.roughness ?? 0.85,
    metalness: style.metalness ?? 0,
    emissive: style.emissive ?? 0x000000,
    emissiveIntensity: style.emissiveIntensity ?? 1,
  })
  const texScale = style.texScale ?? 1
  const floorAO = style.floorAO ?? false
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTexScale = { value: texScale }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          wn = mat3(instanceMatrix) * wn;
        #endif
        vWPos = (modelMatrix * wp).xyz;
        vWNormal = normalize(mat3(modelMatrix) * wn);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform float uTexScale;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec3 an = abs(vWNormal);
          vec2 wuv = an.x > an.y && an.x > an.z ? vWPos.zy : (an.y > an.z ? vWPos.xz : vWPos.xy);
          diffuseColor *= texture2D(map, wuv * uTexScale);
        #endif
        ${floorAO ? 'diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.5, 2.4, vWPos.y));' : ''}`,
      )
  }
  material.customProgramCacheKey = () => `voxel-${texScale}-${floorAO}`
  return material
}

/**
 * Collects blocks by style, then turns each style into one InstancedMesh.
 * Block coordinates are integer grid cells; a block at (x, y, z) occupies that unit cube.
 */
export class VoxelBuilder {
  private blocks = new Map<string, Block[]>()
  private occupied = new Set<string>()
  private styles: Record<string, BlockStyle>
  private rand: () => number

  constructor(styles: Record<string, BlockStyle>, rand: () => number) {
    this.styles = styles
    this.rand = rand
  }

  /** Place a full block. Later placements in the same cell are ignored. */
  set(style: string, x: number, y: number, z: number): void {
    const key = `${x},${y},${z}`
    if (this.occupied.has(key)) return
    this.occupied.add(key)
    this.push(style, { x, y, z, sx: 1, sy: 1, sz: 1 })
  }

  has(x: number, y: number, z: number): boolean {
    return this.occupied.has(`${x},${y},${z}`)
  }

  /** Fill an inclusive box of cells. */
  fill(style: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(style, x, y, z)
  }

  /** Place a free-standing, arbitrarily sized (and optionally rotated) box centred at (x, y, z). */
  prop(style: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot?: PropRotation): void {
    this.push(style, { x, y, z, sx, sy, sz, rot })
  }

  build(): THREE.Group {
    const group = new THREE.Group()
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    const quat = new THREE.Quaternion()
    const euler = new THREE.Euler()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()

    for (const [styleName, list] of this.blocks) {
      const style = this.styles[styleName]
      const textured = style.texture !== undefined || style.roughness !== undefined
      const material = textured
        ? texturedMaterial(style)
        : new THREE.MeshLambertMaterial({
            color: 0xffffff,
            emissive: style.emissive ?? 0x000000,
            emissiveIntensity: style.emissiveIntensity ?? 1,
          })
      const mesh = new THREE.InstancedMesh(UNIT_BOX, material, list.length)
      mesh.name = styleName
      mesh.castShadow = style.castShadow ?? true
      mesh.receiveShadow = style.receiveShadow ?? true

      list.forEach((b, i) => {
        pos.set(b.x, b.y, b.z)
        scale.set(b.sx, b.sy, b.sz)
        if (b.rot) quat.setFromEuler(euler.set(b.rot.x ?? 0, b.rot.y ?? 0, b.rot.z ?? 0))
        else quat.identity()
        matrix.compose(pos, quat, scale)
        mesh.setMatrixAt(i, matrix)
        const j = style.jitter ?? 0
        color.setHex(style.color).multiplyScalar(1 - j / 2 + this.rand() * j)
        mesh.setColorAt(i, color)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
    return group
  }

  private push(style: string, block: Block): void {
    if (!this.styles[style]) throw new Error(`Unknown block style: ${style}`)
    let list = this.blocks.get(style)
    if (!list) this.blocks.set(style, (list = []))
    list.push(block)
  }
}
