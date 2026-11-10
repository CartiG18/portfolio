import * as THREE from 'three'
import { texturedMaterial, type BlockStyle } from './voxels.ts'
import { LIBRARY_STYLES } from './library.ts'
import { ACCENT, PALETTE } from './palette.ts'
import type { ExhibitId } from '../data/exhibits.ts'
import { projectCases, skillDrawers, timeline } from '../data/content.ts'

/**
 * Each exhibit room has one centrepiece with one distinct interaction:
 * Skills → card catalog drawers, Projects → glass display cases, About → open journal,
 * Résumé → wax-sealed letter, CV → ledger on a lectern, Experience → framed chronology.
 */

export interface ExhibitItem {
  id: string
  /** Accessible label for the item's button, e.g. "Open drawer: Languages". */
  label: string
  /** Object the cursor picks. */
  hit: THREE.Object3D
  /**
   * Where the camera moves when the item is opened. `size` is the object's rough extent
   * (world units) once open, so the room can frame it clear of the content panel.
   */
  view: { position: THREE.Vector3; target: THREE.Vector3; size: number }
  hover: number
  active: number
  /** 0–1 targets the room eases toward each frame. */
  wantHover: boolean
  wantActive: boolean
  apply(hover: number, active: number, time: number): void
}

export interface Centerpiece {
  group: THREE.Group
  items: ExhibitItem[]
  /** Default camera target. */
  focus: THREE.Vector3
  lights: THREE.Light[]
  tick?(time: number): void
}

// ---------- small kit for building animated (non-instanced) voxel props ----------

class Kit {
  private materials = new Map<string, THREE.Material>()
  private geometry = new THREE.BoxGeometry(1, 1, 1)

  material(style: string, extra: Partial<BlockStyle> = {}, unique = false): THREE.MeshStandardMaterial {
    const key = style + JSON.stringify(extra)
    if (!unique && this.materials.has(key)) return this.materials.get(key) as THREE.MeshStandardMaterial
    const base = LIBRARY_STYLES[style] ?? { color: 0xffffff }
    const m = texturedMaterial({ roughness: 0.8, ...base, ...extra })
    m.color.setHex(base.color)
    if (!unique) this.materials.set(key, m)
    return m
  }

  box(
    parent: THREE.Object3D,
    style: string | THREE.Material,
    size: [number, number, number],
    pos: [number, number, number],
    rot?: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, typeof style === 'string' ? this.material(style) : style)
    mesh.scale.set(...size)
    mesh.position.set(...pos)
    if (rot) mesh.rotation.set(...rot)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Parchment card with a heading and up to a few lines of text. */
function cardTexture(heading: string, lines: string[], headingSize = 54): THREE.CanvasTexture {
  return canvasTexture(512, 360, (g) => {
    g.fillStyle = '#efe3c4'
    g.fillRect(0, 0, 512, 360)
    g.strokeStyle = 'rgba(120,40,30,0.55)'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(24, 92)
    g.lineTo(488, 92)
    g.stroke()
    g.fillStyle = '#3a2610'
    g.textAlign = 'center'
    // Shrink the heading only if it would overflow the card.
    let size = headingSize
    g.font = `700 ${size}px "Cormorant SC", Georgia, serif`
    while (g.measureText(heading).width > 476 && size > 28) {
      size -= 2
      g.font = `700 ${size}px "Cormorant SC", Georgia, serif`
    }
    g.fillText(heading, 256, 72)
    // Each line shrinks only as much as it needs to stay inside the card.
    lines.slice(0, 5).forEach((line, i) => {
      let size = 38
      g.font = `italic 500 ${size}px "Cormorant Garamond", Georgia, serif`
      while (g.measureText(line).width > 470 && size > 20) {
        size -= 1
        g.font = `italic 500 ${size}px "Cormorant Garamond", Georgia, serif`
      }
      g.fillText(line, 256, 150 + i * 48)
    })
  })
}

function plate(text: string, w = 512, h = 128): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    const brass = g.createLinearGradient(0, 0, 0, h)
    brass.addColorStop(0, '#e4c47c')
    brass.addColorStop(1, '#9a7636')
    g.fillStyle = brass
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(50,30,8,0.7)'
    g.lineWidth = 5
    g.strokeRect(8, 8, w - 16, h - 16)
    g.fillStyle = '#2a1a08'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = h * 0.48
    g.font = `700 ${size}px "Cormorant SC", Georgia, serif`
    while (g.measureText(text).width > w - 40 && size > 14) {
      size -= 2
      g.font = `700 ${size}px "Cormorant SC", Georgia, serif`
    }
    g.fillText(text, w / 2, h / 2 + 2)
  })
}

function planeWith(texture: THREE.Texture, w: number, h: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 }))
}

const accent = new THREE.Color(ACCENT)

function item(partial: Omit<ExhibitItem, 'hover' | 'active' | 'wantHover' | 'wantActive'>): ExhibitItem {
  return { ...partial, hover: 0, active: 0, wantHover: false, wantActive: false }
}

/** Shared accent glow: lerp an emissive material toward the cool accent on hover. */
function glowWith(m: THREE.MeshStandardMaterial, base: THREE.Color, t: number, strength = 0.9): void {
  m.emissive.copy(base).lerp(accent, t)
  m.emissiveIntensity = 0.35 + t * strength
}

// ---------- Skills: card catalog ----------

function skills(kit: Kit): Centerpiece {
  const group = new THREE.Group()
  const z = -6
  const cols = 4
  const rows = 4
  const dw = 0.95
  const dh = 0.6
  const width = cols * dw + 0.3
  const height = rows * dh + 0.3
  const baseY = 1.25
  // Cabinet: carcass, plinth, cornice, legs.
  kit.box(group, 'woodDark', [width, height, 1.3], [0, baseY + height / 2, z - 0.1])
  kit.box(group, 'tableWood', [width + 0.25, 0.18, 1.5], [0, baseY + height + 0.09, z - 0.1])
  kit.box(group, 'tableWood', [width + 0.1, 0.14, 1.4], [0, baseY - 0.07, z - 0.1])
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) kit.box(group, 'woodDark', [0.18, 0.62, 0.18], [dx * (width / 2 - 0.15), 0.81, z - 0.1 + dz * 0.5])

  const items: ExhibitItem[] = []
  const activeRow = 1 // second row from the top sits near eye level
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * dw
      const y = baseY + 0.15 + (rows - 1 - r) * dh + dh / 2
      const drawer = new THREE.Group()
      drawer.position.set(x, y, z + 0.56)
      group.add(drawer)
      const category = r === activeRow ? skillDrawers[c] : undefined
      kit.box(drawer, 'tableWood', [dw - 0.08, dh - 0.08, 0.08], [0, 0, 0])
      kit.box(drawer, 'woodDark', [dw - 0.14, dh - 0.14, 1.0], [0, 0, -0.52]) // the drawer box
      const pull = kit.material('brass', {}, true)
      kit.box(drawer, pull, [0.2, 0.06, 0.07], [0, -0.13, 0.07])
      const holder = kit.material('brass', {}, true)
      kit.box(drawer, holder, [0.46, 0.2, 0.02], [0, 0.1, 0.05])
      const label = planeWith(plate(category ? category.label : '—', 384, 160), 0.4, 0.16)
      label.position.set(0, 0.1, 0.065)
      drawer.add(label)
      if (!category) continue

      // Skill cards standing in the drawer, risen when it's open.
      const cards = new THREE.Group()
      drawer.add(cards)
      // Index cards of up to four skills each, standing in the drawer.
      const all = category.items.length ? category.items : ['To be catalogued']
      const chunks: string[][] = []
      for (let i = 0; i < all.length; i += 4) chunks.push(all.slice(i, i + 4))
      chunks.slice(0, 4).forEach((lines, i) => {
        const card = planeWith(cardTexture(category.label, lines), dw - 0.3, (dw - 0.3) * 0.7)
        card.position.set(0, 0, -0.2 - i * 0.18)
        card.rotation.x = -0.12
        cards.add(card)
      })
      const holderBase = new THREE.Color(PALETTE.brass).multiplyScalar(0.25)
      items.push(
        item({
          id: category.id,
          label: `Open drawer: ${category.label}`,
          hit: drawer,
          view: {
            position: new THREE.Vector3(x * 0.5, y + 1.3, z + 3.3),
            target: new THREE.Vector3(x, y + 0.2, z + 1.1),
            size: 1.3,
          },
          apply(h, a) {
            drawer.position.z = z + 0.56 + h * 0.08 + a * 0.85
            drawer.position.y = y + h * 0.03 * (1 - a)
            cards.position.y = a * 0.32
            cards.visible = a > 0.02
            glowWith(holder, holderBase, Math.max(h, a))
            glowWith(pull, holderBase, Math.max(h, a), 0.6)
          },
        }),
      )
    }
  return { group, items, focus: new THREE.Vector3(0, 2.4, z), lights: [] }
}

// ---------- Projects: glass display cases under spotlights ----------

function projects(kit: Kit): Centerpiece {
  const group = new THREE.Group()
  const z = -6
  const items: ExhibitItem[] = []
  const lights: THREE.Light[] = []
  // Fit any number of cases across the room (inner width about 11 units).
  const spacing = Math.min(3.4, 10.5 / Math.max(1, projectCases.length))
  projectCases.forEach((p, i) => {
    const x = (i - (projectCases.length - 1) / 2) * spacing
    kit.box(group, 'woodDark', [1.3, 1.5, 1.3], [x, 1.25, z])
    kit.box(group, 'tableWood', [1.45, 0.12, 1.45], [x, 2.06, z])
    kit.box(group, 'tableWood', [1.45, 0.12, 1.45], [x, 0.56, z])
    const plaque = planeWith(plate(p.title), 0.8, 0.2)
    plaque.position.set(x, 1.5, z + 0.66)
    group.add(plaque)

    // Placeholder artefact: a bound volume on a small brass stand.
    kit.box(group, 'brass', [0.5, 0.06, 0.4], [x, 2.15, z])
    kit.box(group, 'bookRed', [0.42, 0.12, 0.56], [x, 2.25, z], [0, 0.3, 0])
    kit.box(group, 'goldFoil', [0.3, 0.005, 0.4], [x, 2.312, z], [0, 0.3, 0])

    // The glass hood and its brass frame lift together.
    const hood = new THREE.Group()
    hood.position.set(x, 2.12, z)
    group.add(hood)
    const glass = new THREE.MeshStandardMaterial({
      color: 0xcfe6ea,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    })
    kit.box(hood, glass, [1.2, 0.95, 1.2], [0, 0.48, 0])
    const frame = kit.material('brass', {}, true)
    for (const dx of [-0.6, 0.6])
      for (const dz of [-0.6, 0.6]) kit.box(hood, frame, [0.05, 0.95, 0.05], [dx, 0.48, dz])
    for (const y of [0, 0.95]) {
      kit.box(hood, frame, [1.25, 0.05, 0.05], [0, y, 0.6])
      kit.box(hood, frame, [1.25, 0.05, 0.05], [0, y, -0.6])
      kit.box(hood, frame, [0.05, 0.05, 1.25], [0.6, y, 0])
      kit.box(hood, frame, [0.05, 0.05, 1.25], [-0.6, y, 0])
    }

    const spot = new THREE.SpotLight(0xffd9a0, 30, 9, 0.38, 0.6, 1.5)
    spot.position.set(x, 7.5, z + 0.6)
    spot.target.position.set(x, 2.1, z)
    group.add(spot, spot.target)
    lights.push(spot)

    const frameBase = new THREE.Color(PALETTE.brass).multiplyScalar(0.2)
    const glassBase = new THREE.Color(0xcfe6ea)
    const glassHover = new THREE.Color(ACCENT)
    items.push(
      item({
        id: p.id,
        label: `View ${p.title}`,
        hit: hood,
        view: {
          position: new THREE.Vector3(x, 2.9, z + 2.6),
          target: new THREE.Vector3(x, 2.35, z),
          size: 2.6, // plaque to lifted hood
        },
        apply(h, a) {
          const t = Math.max(h, a)
          hood.position.y = 2.12 + t * 0.22
          spot.intensity = 30 + t * 50
          // Subtle selection: the glass takes a faint cool tint; the brass frame just warms.
          glowWith(frame, frameBase, t * 0.18, 0.25)
          glass.color.lerpColors(glassBase, glassHover, t)
          glass.opacity = 0.12 + t * 0.08 - a * 0.04
        },
      }),
    )
  })
  return { group, items, focus: new THREE.Vector3(0, 2.2, z), lights }
}

// ---------- About: reading desk with an open journal ----------

function about(kit: Kit): Centerpiece {
  const group = new THREE.Group()
  const z = -5.5
  kit.box(group, 'tableWood', [2.8, 0.14, 1.4], [0, 1.75, z])
  kit.box(group, 'woodDark', [2.6, 0.5, 1.2], [-0.65, 1.42, z], undefined)
  for (const dx of [-1.25, 1.25]) for (const dz of [-0.55, 0.55]) kit.box(group, 'woodDark', [0.16, 1.2, 0.16], [dx, 1.1, z + dz])
  // Candle, inkwell, quill.
  kit.box(group, 'brass', [0.26, 0.06, 0.26], [1.05, 1.85, z - 0.35])
  kit.box(group, 'wax', [0.12, 0.38, 0.12], [1.05, 2.07, z - 0.35])
  kit.box(group, 'flame', [0.08, 0.15, 0.08], [1.05, 2.33, z - 0.35])
  kit.box(group, 'bookBlack', [0.2, 0.16, 0.2], [-1.0, 1.9, z - 0.3])
  kit.box(group, 'wax', [0.03, 0.03, 0.7], [-0.9, 2.05, z - 0.15], [0.6, 0.4, 0])

  const journal = new THREE.Group()
  journal.position.set(0, 1.84, z + 0.05)
  group.add(journal)
  kit.box(journal, 'leather', [1.3, 0.04, 0.9], [0, 0, 0])
  const left = planeWith(cardTexture('About', ['— the curator —']), 0.6, 0.82)
  left.rotation.set(-Math.PI / 2, 0, 0.04)
  left.position.set(-0.31, 0.03, 0)
  const right = planeWith(cardTexture('', ['Entries to follow.']), 0.6, 0.82)
  right.rotation.set(-Math.PI / 2, 0, -0.04)
  right.position.set(0.31, 0.03, 0)
  journal.add(left, right)
  const ribbon = kit.material('leather', {}, true)
  kit.box(journal, ribbon, [0.04, 0.005, 0.5], [0.02, 0.05, 0.6])

  const lamp = new THREE.PointLight(PALETTE.candle, 14, 6, 1.6)
  lamp.position.set(1.05, 2.5, z - 0.2)
  group.add(lamp)
  const ribbonBase = new THREE.Color(PALETTE.oxblood).multiplyScalar(0.3)
  return {
    group,
    focus: new THREE.Vector3(0, 2, z),
    lights: [lamp],
    items: [
      item({
        id: 'journal',
        label: 'Read the journal',
        hit: journal,
        view: { position: new THREE.Vector3(0, 3.5, z + 1.7), target: new THREE.Vector3(0, 1.85, z), size: 1.5 },
        apply(h, a) {
          journal.position.y = 1.84 + h * 0.03
          glowWith(ribbon, ribbonBase, Math.max(h, a))
          lamp.intensity = 14 + a * 8
        },
      }),
    ],
  }
}

// ---------- Lectern shared by Résumé and CV ----------

function lectern(kit: Kit, group: THREE.Group, z: number): THREE.Group {
  kit.box(group, 'tableWood', [0.9, 0.12, 0.9], [0, 0.56, z])
  kit.box(group, 'woodDark', [0.28, 1.5, 0.28], [0, 1.37, z])
  kit.box(group, 'tableWood', [0.5, 0.12, 0.5], [0, 2.1, z])
  const top = new THREE.Group()
  top.position.set(0, 2.25, z)
  top.rotation.x = 0.38
  group.add(top)
  kit.box(top, 'tableWood', [1.2, 0.08, 0.85], [0, 0, 0])
  kit.box(top, 'woodDark', [1.2, 0.08, 0.06], [0, 0.06, 0.42]) // book ledge
  return top
}

// ---------- Résumé: sealed letter ----------

function resume(kit: Kit): Centerpiece {
  const group = new THREE.Group()
  const z = -5
  const top = lectern(kit, group, z)
  const letter = new THREE.Group()
  letter.position.set(0, 0.06, 0)
  top.add(letter)
  kit.box(letter, 'wax', [0.9, 0.02, 0.62], [0, 0, 0])
  // Envelope flap, hinged along the top edge.
  const flap = new THREE.Group()
  flap.position.set(0, 0.015, -0.31)
  letter.add(flap)
  kit.box(flap, 'wax', [0.9, 0.01, 0.34], [0, 0, 0.17])
  // The folded résumé inside, which slides up when opened.
  const sheet = new THREE.Group()
  letter.add(sheet)
  kit.box(sheet, 'wax', [0.8, 0.008, 0.56], [0, -0.004, 0])

  // Wax seal in two halves that split apart.
  const sealMat = new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.4, emissive: 0x2a0505 })
  const halves = [0, 1].map((i) => {
    const half = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 8, 1, false, i * Math.PI, Math.PI), sealMat)
    half.position.set(0, 0.03, 0.02)
    half.castShadow = true
    flap.add(half)
    return half
  })
  const light = new THREE.SpotLight(0xffd9a0, 7, 7, 0.4, 0.6, 1.5)
  light.position.set(0.6, 6.5, z + 1)
  light.target.position.set(0, 2.3, z)
  group.add(light, light.target)
  const sealBase = new THREE.Color(0x2a0505)
  return {
    group,
    focus: new THREE.Vector3(0, 2.2, z),
    lights: [light],
    items: [
      item({
        id: 'letter',
        label: 'Break the seal and read the résumé',
        hit: letter,
        view: { position: new THREE.Vector3(0, 3.5, z + 1.6), target: new THREE.Vector3(0, 2.25, z), size: 1.2 },
        apply(h, a) {
          letter.position.y = 0.06 + h * 0.04 * (1 - a)
          const split = Math.min(1, a * 1.6)
          halves[0].position.x = -split * 0.18
          halves[1].position.x = split * 0.18
          halves[0].rotation.z = split * 0.5
          halves[1].rotation.z = -split * 0.5
          halves.forEach((hm) => (hm.position.y = 0.03 - split * split * 0.25))
          halves.forEach((hm) => (hm.visible = split < 0.98))
          flap.rotation.x = -Math.max(0, a * 1.6 - 0.5) * 2.4
          sheet.position.z = -Math.max(0, a - 0.5) * 0.7
          sheet.position.y = Math.max(0, a - 0.5) * 0.04
          glowWith(sealMat, sealBase, h * (1 - a))
        },
      }),
    ],
  }
}

// ---------- CV: ledger on a lectern ----------

function cv(kit: Kit): Centerpiece {
  const group = new THREE.Group()
  const z = -5
  const top = lectern(kit, group, z)
  const book = new THREE.Group()
  book.position.set(0, 0.08, 0)
  top.add(book)
  kit.box(book, 'wax', [0.56, 0.12, 0.74], [0.29, 0.06, 0]) // page block
  kit.box(book, 'bookBurgundy', [0.6, 0.04, 0.78], [0.3, 0, 0]) // back cover
  const cover = new THREE.Group() // hinged on the spine (x = 0)
  cover.position.set(0, 0.13, 0)
  book.add(cover)
  const coverMat = kit.material('bookBurgundy', {}, true)
  kit.box(cover, coverMat, [0.6, 0.04, 0.78], [0.3, 0, 0])
  const foil = kit.material('goldFoil', {}, true)
  kit.box(cover, foil, [0.36, 0.005, 0.05], [0.3, 0.025, -0.2])
  kit.box(cover, foil, [0.36, 0.005, 0.05], [0.3, 0.025, 0.2])
  const page = planeWith(cardTexture('Curriculum Vitae', ['The complete record']), 0.55, 0.72)
  page.rotation.x = -Math.PI / 2
  page.position.set(0.29, 0.125, 0)
  book.add(page)
  book.position.x = -0.3
  const light = new THREE.SpotLight(0xffd9a0, 7, 7, 0.4, 0.6, 1.5)
  light.position.set(-0.6, 6.5, z + 1)
  light.target.position.set(0, 2.3, z)
  group.add(light, light.target)
  const foilBase = new THREE.Color(0x7a5410)
  return {
    group,
    focus: new THREE.Vector3(0, 2.2, z),
    lights: [light],
    items: [
      item({
        id: 'ledger',
        label: 'Open the ledger',
        hit: book,
        view: { position: new THREE.Vector3(0, 3.5, z + 1.6), target: new THREE.Vector3(0, 2.25, z), size: 1.4 },
        apply(h, a) {
          book.position.y = 0.08 + h * 0.04
          cover.rotation.z = a * Math.PI * 0.96
          glowWith(foil, foilBase, Math.max(h, a) * (1 - a * 0.6))
        },
      }),
    ],
  }
}

// ---------- Experience & Education: framed chronology ----------

function experience(kit: Kit): Centerpiece {
  const group = new THREE.Group()
  const z = -11.4
  // One frame per entry, newest first, hung in rows of three (reading order).
  const entries = timeline.length
    ? timeline.map((t) => ({ id: t.id, heading: t.dates, lines: [t.title, t.org] }))
    : [{ id: 'chronology', heading: 'Chronology', lines: ['Being compiled'] }]
  const items: ExhibitItem[] = []
  const cols = Math.min(3, entries.length)
  const rows = Math.ceil(entries.length / cols)
  const fw = 1.9
  const fh = 1.45
  const gapX = 2.4
  const gapY = 1.95
  const top = 3.4 + ((rows - 1) * gapY) / 2
  entries.forEach((e, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = (col - (cols - 1) / 2) * gapX
    const y = top - row * gapY
    const frame = kit.material('brass', {}, true)
    const g = new THREE.Group()
    g.position.set(x, y, z)
    group.add(g)
    kit.box(g, frame, [fw, fh, 0.1], [0, 0, 0])
    // Dates as large as fit, so the chronology reads from across the room.
    const art = planeWith(cardTexture(e.heading, e.lines, 76), fw - 0.25, fh - 0.25)
    art.position.z = 0.06
    g.add(art)
    const base = new THREE.Color(PALETTE.brass).multiplyScalar(0.2)
    items.push(
      item({
        id: e.id,
        label: `Examine: ${e.lines[0]}`,
        hit: g,
        view: { position: new THREE.Vector3(x, y, z + 3), target: new THREE.Vector3(x, y, z), size: 2.1 },
        apply(h, a) {
          g.position.z = z + h * 0.06
          glowWith(frame, base, Math.max(h, a) * (1 - a * 0.5), 0.45)
        },
      }),
    )
  })
  // A brass picture rail above the top row.
  kit.box(group, 'brass', [cols * gapX + 0.6, 0.08, 0.16], [0, top + fh / 2 + 0.35, z + 0.25])
  const wash = new THREE.PointLight(PALETTE.candle, 10, 9, 1.6)
  wash.position.set(0, top + 2, z + 2.5)
  group.add(wash)
  return { group, items, focus: new THREE.Vector3(0, 3.4, z), lights: [wash] }
}

const BUILDERS: Record<ExhibitId, (kit: Kit) => Centerpiece> = {
  skills,
  projects,
  about,
  resume,
  cv,
  experience,
}

export function buildCenterpiece(id: ExhibitId): Centerpiece {
  return BUILDERS[id](new Kit())
}

