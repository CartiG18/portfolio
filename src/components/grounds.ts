import { site } from '../data/site.ts'
import { esc } from './html.ts'

/** The exterior is pure scenery: no visible HUD besides the header's Portfolio menu. */
export function renderGrounds(): string {
  return `
    <div class="scene-view grounds" data-scene>
      <canvas class="scene-view__canvas" aria-hidden="true"></canvas>
      <h1 class="visually-hidden">${esc(site.museumName)}: ${esc(site.tagline)}</h1>
      <p class="visually-hidden">
        A library in a moonlit forest clearing. Click the building, or choose Lobby from the
        Portfolio menu, to go inside.
      </p>
      <div class="scene-view__fade" data-fade></div>
    </div>`
}

export interface SceneController {
  enter?(): void
  dispose(): void
}

export async function mountGrounds(
  root: HTMLElement,
  opts: { reducedMotion: boolean; onEntered(): void },
): Promise<SceneController> {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!
  const fade = root.querySelector<HTMLElement>('[data-fade]')!
  try {
    const { createExterior } = await import('../scene/exterior.ts')
    const scene = createExterior({
      canvas,
      reducedMotion: opts.reducedMotion,
      onEnterProgress(t) {
        document.body.classList.add('is-travelling')
        fade.style.opacity = String(Math.max(0, (t - 0.55) / 0.45))
      },
      onEntered: opts.onEntered,
    })
    root.classList.add('is-ready')
    return { enter: () => scene.enter(), dispose: () => scene.dispose() }
  } catch (error) {
    console.warn('3D scene unavailable.', error)
    root.classList.add('no-webgl')
    return { dispose() {} }
  }
}
