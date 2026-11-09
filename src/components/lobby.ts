import { exhibits } from '../data/exhibits.ts'
import { site, socialLinks } from '../data/site.ts'
import { esc } from './html.ts'
import type { SceneController } from './grounds.ts'

/**
 * The lobby is a 3D library. Doors are picked in the canvas; the list below mirrors them
 * for keyboard and screen-reader visitors and becomes visible when focused (or without WebGL).
 */
export function renderLobby(): string {
  const doorLinks = exhibits
    .map((e) => `<li><a href="#/${e.id}" data-door="${esc(e.id)}">${esc(e.number)}. ${esc(e.title)}</a></li>`)
    .join('')
  const outLinks = socialLinks
    .filter((l) => l.href)
    .map((l) => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} (opens in a new tab)</a></li>`)
    .join('')
  return `
    <div class="scene-view lobby" data-scene>
      <canvas class="scene-view__canvas" aria-hidden="true"></canvas>
      <h1 class="visually-hidden">The Library · ${esc(site.museumName)}</h1>
      <nav class="lobby-directory" aria-label="Library doors">
        <ul>${doorLinks}${outLinks}</ul>
      </nav>
      <div class="scene-view__fade" data-fade></div>
    </div>`
}

export async function mountLobby(
  root: HTMLElement,
  opts: { reducedMotion: boolean; onEnterExhibit(id: string): void },
): Promise<SceneController & { enterExhibit?(id: string): void }> {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!
  const fade = root.querySelector<HTMLElement>('[data-fade]')!
  try {
    const { createInterior } = await import('../scene/interior.ts')
    const scene = await createInterior({
      canvas,
      reducedMotion: opts.reducedMotion,
      onDoorProgress(t) {
        document.body.classList.add('is-travelling')
        fade.style.opacity = String(Math.max(0, (t - 0.5) / 0.5))
      },
      onEnterExhibit: opts.onEnterExhibit,
    })
    root.classList.add('is-ready')
    return { enterExhibit: (id) => scene.enterExhibit(id), dispose: () => scene.dispose() }
  } catch (error) {
    console.warn('3D scene unavailable.', error)
    root.classList.add('no-webgl')
    return { dispose() {} }
  }
}
