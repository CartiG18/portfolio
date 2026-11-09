import { exhibits } from '../data/exhibits.ts'
import { site, socialLinks } from '../data/site.ts'
import { bookNotes } from '../data/content.ts'
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
  const notes = bookNotes
    .map((n) => `<li><q>${esc(n.text)}</q> <span>— ${esc(n.source)}</span></li>`)
    .join('')
  return `
    <div class="scene-view lobby" data-scene>
      <canvas class="scene-view__canvas" aria-hidden="true"></canvas>
      <h1 class="visually-hidden">The Library · ${esc(site.museumName)}</h1>
      <nav class="lobby-directory" aria-label="Library doors">
        <ul>
          ${doorLinks}${outLinks}
          <li><button type="button" class="lobby-directory__book" data-pull-book>Pull a book from the shelf</button></li>
        </ul>
      </nav>
      <div class="book-note" data-book-note role="status" aria-live="polite" hidden>
        <p class="book-note__text"></p>
        <p class="book-note__source"></p>
      </div>
      <section class="visually-hidden" aria-label="Notes found in the library's books">
        <ul>${notes}</ul>
      </section>
      <div class="scene-view__fade" data-fade></div>
    </div>`
}

export async function mountLobby(
  root: HTMLElement,
  opts: { reducedMotion: boolean; onEnterExhibit(id: string): void },
): Promise<SceneController & { enterExhibit?(id: string): void }> {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!
  const fade = root.querySelector<HTMLElement>('[data-fade]')!
  const note = root.querySelector<HTMLElement>('[data-book-note]')!
  const pullButton = root.querySelector<HTMLButtonElement>('[data-pull-book]')!

  const showNote = (n: { text: string; source: string } | null, screen?: { x: number; y: number }) => {
    note.hidden = !n
    if (!n) return
    note.querySelector('.book-note__text')!.textContent = `“${n.text}”`
    note.querySelector('.book-note__source')!.textContent = `— ${n.source}`
    // Sit beside the book, kept inside the viewport.
    const x = Math.min(window.innerWidth - 300, Math.max(16, (screen?.x ?? window.innerWidth / 2) + 24))
    const y = Math.min(window.innerHeight - 140, Math.max(72, (screen?.y ?? window.innerHeight / 2) - 40))
    note.style.transform = `translate(${x}px, ${y}px)`
  }

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
      onBookNote: showNote,
    })
    const onPull = () => scene.pullNextBook()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !note.hidden) scene.putBookBack()
    }
    pullButton.addEventListener('click', onPull)
    document.addEventListener('keydown', onKey)
    root.classList.add('is-ready')
    return {
      enterExhibit: (id) => scene.enterExhibit(id),
      dispose: () => {
        pullButton.removeEventListener('click', onPull)
        document.removeEventListener('keydown', onKey)
        scene.dispose()
      },
    }
  } catch (error) {
    console.warn('3D scene unavailable.', error)
    root.classList.add('no-webgl')
    return { dispose() {} }
  }
}
