import * as THREE from 'three'

/** Wait (briefly) for the display fonts so canvas-drawn placards use them. */
export async function ensureFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 72px "Cormorant SC"'),
        document.fonts.load('italic 500 40px "Cormorant Garamond"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  } catch {
    // Fall back to Georgia.
  }
}

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A polished brass plate with an engraved exhibit number and title. */
export function placardTexture(kicker: string, title: string): THREE.CanvasTexture {
  const w = 1024
  const h = 300
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!

  const brass = g.createLinearGradient(0, 0, 0, h)
  brass.addColorStop(0, '#f0d58a')
  brass.addColorStop(0.5, '#c9a04a')
  brass.addColorStop(1, '#8f6a25')
  g.fillStyle = brass
  g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(60,40,10,0.7)'
  g.lineWidth = 6
  g.strokeRect(14, 14, w - 28, h - 28)
  g.strokeStyle = 'rgba(255,240,200,0.5)'
  g.lineWidth = 2
  g.strokeRect(26, 26, w - 52, h - 52)

  g.textAlign = 'center'
  g.fillStyle = '#3a2610'
  g.font = '700 40px "Cormorant SC", Georgia, serif'
  g.letterSpacing = '10px'
  g.fillText(kicker.toUpperCase(), w / 2, 100)
  g.letterSpacing = '2px'

  let size = 104
  g.font = `700 ${size}px "Cormorant SC", Georgia, serif`
  while (g.measureText(title).width > w - 110 && size > 40) {
    size -= 4
    g.font = `700 ${size}px "Cormorant SC", Georgia, serif`
  }
  g.fillStyle = 'rgba(255,240,200,0.45)'
  g.fillText(title, w / 2, 212 + 2)
  g.fillStyle = '#2a1a08'
  g.fillText(title, w / 2, 212)
  return texture(c)
}

/** A framed portrait: an icon on dark velvet, with a small caption. */
export function portraitTexture(iconPath: string, caption: string, fillRule: CanvasFillRule = 'nonzero'): THREE.CanvasTexture {
  const w = 512
  const h = 640
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const velvet = g.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h * 0.45, w * 0.8)
  velvet.addColorStop(0, '#4a1d26')
  velvet.addColorStop(1, '#16070b')
  g.fillStyle = velvet
  g.fillRect(0, 0, w, h)

  g.save()
  g.translate(w / 2 - 150, h * 0.42 - 150)
  g.scale(300 / 24, 300 / 24)
  g.fillStyle = '#e8c872'
  g.fill(new Path2D(iconPath), fillRule)
  g.restore()

  g.textAlign = 'center'
  g.fillStyle = '#e8c872'
  g.font = '700 64px "Cormorant SC", Georgia, serif'
  g.fillText(caption, w / 2, h - 60)
  return texture(c)
}

/** Warm light spilling from a room beyond a doorway: bright at the floor, fading upward and to the edges. */
export function doorGlowTexture(): THREE.CanvasTexture {
  const w = 128
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const vertical = g.createLinearGradient(0, h, 0, 0)
  vertical.addColorStop(0, 'rgba(255,190,110,1)')
  vertical.addColorStop(0.45, 'rgba(255,150,70,0.55)')
  vertical.addColorStop(1, 'rgba(255,120,50,0)')
  g.fillStyle = vertical
  g.fillRect(0, 0, w, h)
  // Darken the sides so the light reads as coming from deeper in.
  g.globalCompositeOperation = 'destination-in'
  const sides = g.createLinearGradient(0, 0, w, 0)
  sides.addColorStop(0, 'rgba(0,0,0,0.15)')
  sides.addColorStop(0.5, 'rgba(0,0,0,1)')
  sides.addColorStop(1, 'rgba(0,0,0,0.15)')
  g.fillStyle = sides
  g.fillRect(0, 0, w, h)
  return texture(c)
}

/** A soft dark oval used for contact shadows under furniture. */
export function contactShadowTexture(): THREE.CanvasTexture {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.85)')
  grad.addColorStop(0.6, 'rgba(0,0,0,0.45)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(c)
}

/** A soft white oval, used as a mask for additive glows (tinted by the material colour). */
export function softGlowTexture(): THREE.CanvasTexture {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(c)
}
