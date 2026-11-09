import * as THREE from 'three'

export interface BlockStyle {
  color: number
  /** Random brightness variation per block (0–1) for a hand-placed look. */
  jitter?: number
  emissive?: number
  emissiveIntensity?: number
  castShadow?: boolean
  receiveShadow?: boolean
}

interface Block {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
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

  /** Place a free-standing, arbitrarily sized box centred at (x, y, z); not grid-tracked. */
  prop(style: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    this.push(style, { x, y, z, sx, sy, sz })
  }

  build(): THREE.Group {
    const group = new THREE.Group()
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    const quat = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()

    for (const [styleName, list] of this.blocks) {
      const style = this.styles[styleName]
      const material = new THREE.MeshLambertMaterial({
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
        matrix.compose(pos, quat, scale)
        mesh.setMatrixAt(i, matrix)
        const j = style.jitter ?? 0
        color.setHex(style.color).multiplyScalar(1 - j / 2 + this.rand() * j)
        mesh.setColorAt(i, color)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
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
