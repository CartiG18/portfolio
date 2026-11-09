import type { Exhibit, ExhibitId } from '../data/exhibits.ts'
import {
  aboutParagraphs,
  cvHref,
  projectCases,
  resumeHref,
  skillDrawers,
  timeline,
} from '../data/content.ts'
import { esc } from './html.ts'

/** Shown wherever an exhibit's real content hasn't been provided yet. */
const NOTICE = `
  <div class="notice">
    <p class="notice__title">Exhibit being installed</p>
    <p>The curators are hanging this collection. Please check back soon.</p>
  </div>`

interface Entry {
  id: string
  heading: string
  body: string
}

function link(label: string, href: string): string {
  const external = /^https?:/.test(href)
  return `<a class="panel-link" href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}${external ? '<span class="visually-hidden"> (opens in a new tab)</span>' : ''}</a>`
}

/** Plain-HTML content for each openable item in a room. Always present in the DOM. */
function entriesFor(id: ExhibitId): Entry[] {
  switch (id) {
    case 'skills':
      return skillDrawers.map((d) => ({
        id: d.id,
        heading: d.label,
        body: d.items.length ? `<ul class="card-list">${d.items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : NOTICE,
      }))
    case 'projects':
      return projectCases.map((p) => ({
        id: p.id,
        heading: p.title,
        body: p.summary
          ? `<p>${esc(p.summary)}</p>
             ${p.stack.length ? `<p class="panel-meta">${p.stack.map(esc).join(' · ')}</p>` : ''}
             ${p.links.map((l) => link(l.label, l.href)).join(' ')}`
          : NOTICE,
      }))
    case 'about':
      return [
        {
          id: 'journal',
          heading: 'About',
          body: aboutParagraphs.length ? aboutParagraphs.map((p) => `<p>${esc(p)}</p>`).join('') : NOTICE,
        },
      ]
    case 'resume':
      return [{ id: 'letter', heading: 'Résumé', body: resumeHref ? link('Download the résumé (PDF)', resumeHref) : NOTICE }]
    case 'cv':
      return [{ id: 'ledger', heading: 'Curriculum Vitae', body: cvHref ? link('Download the CV (PDF)', cvHref) : NOTICE }]
    case 'experience':
      return timeline.length
        ? timeline.map((t) => ({
            id: t.id,
            heading: t.title,
            body: `<p class="panel-meta">${esc(t.org)} · ${esc(t.dates)}</p><p>${esc(t.detail)}</p>`,
          }))
        : [{ id: 'chronology', heading: 'Chronology', body: NOTICE }]
  }
}

export function renderExhibit(exhibit: Exhibit): string {
  const entries = entriesFor(exhibit.id)
  return `
    <div class="scene-view exhibit-room" data-scene data-exhibit="${esc(exhibit.id)}">
      <canvas class="scene-view__canvas" aria-hidden="true"></canvas>
      <header class="room-placard">
        <p class="room-placard__kicker">Exhibit ${esc(exhibit.number)}</p>
        <h1 class="room-placard__title">${esc(exhibit.title)}</h1>
        <p class="room-placard__subtitle">${esc(exhibit.subtitle)}</p>
      </header>
      <a class="room-back bezel" href="#/lobby"><span aria-hidden="true">←</span> Return to the Lobby</a>
      <nav class="room-items" aria-label="${esc(exhibit.title)} items">
        <ul>
          ${entries
            .map((e) => `<li><button type="button" data-item="${esc(e.id)}" aria-controls="entry-${esc(e.id)}" aria-expanded="false">${esc(e.heading)}</button></li>`)
            .join('')}
        </ul>
      </nav>
      <aside class="exhibit-panel is-closed" data-panel aria-label="${esc(exhibit.title)}">
        <button type="button" class="panel-close bezel" data-close>Close <span aria-hidden="true">· Esc</span></button>
        ${entries
          .map(
            (e) => `
          <section class="panel-entry" id="entry-${esc(e.id)}" data-entry="${esc(e.id)}" tabindex="-1">
            <h2 class="panel-entry__title">${esc(e.heading)}</h2>
            ${e.body}
          </section>`,
          )
          .join('')}
      </aside>
      <div class="scene-view__fade" data-fade></div>
    </div>`
}

export function renderNotFound(): string {
  return `
    <article class="exhibit">
      <a class="back-link" href="#/lobby"><span aria-hidden="true">←</span> Return to the Lobby</a>
      <header class="exhibit__header">
        <p class="exhibit__kicker">Lost in the halls</p>
        <h1 class="exhibit__title">No such exhibit</h1>
      </header>
    </article>`
}

export interface RoomController {
  dispose(): void
}

/** Connect the room's 3D scene, item buttons and content panel. */
export async function mountExhibit(
  root: HTMLElement,
  exhibitId: ExhibitId,
  opts: { reducedMotion: boolean },
): Promise<RoomController> {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!
  const panel = root.querySelector<HTMLElement>('[data-panel]')!
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-item]')]
  let lastButton: HTMLButtonElement | null = null
  let room: { open(id: string): void; close(): void; highlight(id: string | null): void; dispose(): void } | null = null

  function showEntry(id: string | null): void {
    panel.classList.toggle('is-closed', id === null)
    for (const s of panel.querySelectorAll<HTMLElement>('[data-entry]')) s.classList.toggle('is-active', s.dataset.entry === id)
    for (const b of buttons) b.setAttribute('aria-expanded', String(b.dataset.item === id))
    if (id) {
      const section = panel.querySelector<HTMLElement>(`[data-entry="${CSS.escape(id)}"]`)
      // Let the camera arrive before moving focus so the panel doesn't steal the moment.
      window.setTimeout(() => section?.focus({ preventScroll: true }), opts.reducedMotion ? 0 : 600)
    } else {
      lastButton?.focus({ preventScroll: true })
    }
  }

  const onButton = (e: Event) => {
    const b = e.currentTarget as HTMLButtonElement
    lastButton = b
    const id = b.dataset.item!
    if (room) {
      if (b.getAttribute('aria-expanded') === 'true') room.close()
      else room.open(id)
    } else {
      showEntry(id)
    }
  }
  const onFocus = (e: Event) => room?.highlight((e.currentTarget as HTMLButtonElement).dataset.item!)
  const onBlur = () => room?.highlight(null)
  for (const b of buttons) {
    b.addEventListener('click', onButton)
    b.addEventListener('focus', onFocus)
    b.addEventListener('blur', onBlur)
  }
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-close]')!
  const onClose = () => (room ? room.close() : showEntry(null))
  closeBtn.addEventListener('click', onClose)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !panel.classList.contains('is-closed')) {
      e.preventDefault()
      onClose()
    }
  }
  document.addEventListener('keydown', onKey)

  try {
    const { createExhibitRoom } = await import('../scene/room.ts')
    room = await createExhibitRoom({
      canvas,
      exhibitId,
      reducedMotion: opts.reducedMotion,
      onOpenChange: showEntry,
    })
    root.classList.add('is-ready')
  } catch (error) {
    console.warn('3D scene unavailable; showing the exhibit as text.', error)
    root.classList.add('no-webgl')
  }

  return {
    dispose() {
      document.removeEventListener('keydown', onKey)
      closeBtn.removeEventListener('click', onClose)
      for (const b of buttons) {
        b.removeEventListener('click', onButton)
        b.removeEventListener('focus', onFocus)
        b.removeEventListener('blur', onBlur)
      }
      room?.dispose()
    },
  }
}
