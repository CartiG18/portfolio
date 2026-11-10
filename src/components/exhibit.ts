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
import { fadeHintOnInteraction } from './lobby.ts'

/** Shown wherever an exhibit's real content hasn't been provided yet. */
const NOTICE = `
  <div class="notice">
    <p class="notice__title">Exhibit being installed</p>
    <p>The curators are hanging this collection. Please check back soon.</p>
  </div>`

interface Entry {
  id: string
  /** Small line above the title (shown with a fleuron). */
  kicker: string
  heading: string
  body: string
}

function link(label: string, href: string): string {
  const external = /^https?:/.test(href)
  return `<a class="panel-link" href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}${external ? '<span class="visually-hidden"> (opens in a new tab)</span>' : ''}</a>`
}

/** Fields still awaiting the owner's words are left out rather than shown as placeholders. */
const known = (text: string) => text.trim() !== '' && !text.startsWith('TODO(content)')

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Plain-HTML content for each openable item in a room. Always present in the DOM. */
function entriesFor(id: ExhibitId): Entry[] {
  switch (id) {
    case 'skills':
      return skillDrawers.map((d) => ({
        id: d.id,
        kicker: 'Card catalog',
        heading: d.label,
        body: d.items.length ? `<ul class="card-list">${d.items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : NOTICE,
      }))
    case 'projects':
      return projectCases.map((p, i) => {
        const parts: string[] = []
        if (known(p.context)) parts.push(`<p class="panel-meta">${esc(p.context)}</p>`)
        if (known(p.what)) parts.push(`<p>${esc(p.what)}</p>`)
        if (known(p.why)) parts.push(`<h3 class="panel-sub">Why</h3><p>${esc(p.why)}</p>`)
        const how = p.how.filter(known)
        if (how.length) parts.push(`<h3 class="panel-sub">How</h3><ul class="card-list">${how.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`)
        if (known(p.result)) parts.push(`<h3 class="panel-sub">Result</h3><p>${esc(p.result)}</p>`)
        if (p.stack.length) parts.push(`<p class="panel-meta">${p.stack.map(esc).join(' · ')}</p>`)
        const links = p.links.map((l) => link(l.label, l.href))
        if (p.linkNote) links.push(`<span class="panel-note">${esc(p.linkNote)}</span>`)
        if (links.length) parts.push(`<p class="panel-links">${links.join('<span aria-hidden="true"> · </span>')}</p>`)
        return { id: p.id, kicker: `Case ${ROMAN[i] ?? i + 1}`, heading: p.title, body: parts.length ? parts.join('') : NOTICE }
      })
    case 'about':
      return [
        {
          id: 'journal',
          kicker: 'From the journal',
          heading: 'About',
          body: aboutParagraphs.length ? aboutParagraphs.map((p) => `<p>${esc(p)}</p>`).join('') : NOTICE,
        },
      ]
    case 'resume':
      return [
        {
          id: 'letter',
          kicker: 'The one-page summary',
          heading: 'Résumé',
          body: resumeHref ? `<p class="panel-links">${link('Open the résumé (PDF)', resumeHref)}</p>` : NOTICE,
        },
      ]
    case 'cv':
      return [{ id: 'ledger', kicker: 'The complete record', heading: 'Curriculum Vitae', body: cvHref ? link('Open the CV (PDF)', cvHref) : NOTICE }]
    case 'experience':
      return timeline.length
        ? timeline.map((t) => ({
            id: t.id,
            kicker: t.kind === 'education' ? 'Education' : t.kind === 'research' ? 'Research' : 'Experience',
            heading: t.title,
            body: `<p class="panel-meta">${esc(t.org)} · ${esc(t.location)} · ${esc(t.dates)}</p>
              <ul class="card-list">${t.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`,
          }))
        : [{ id: 'chronology', kicker: 'A chronology', heading: 'Chronology', body: NOTICE }]
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
      <a class="room-back" href="#/lobby"><span aria-hidden="true">←</span> Return to the Lobby</a>
      <nav class="room-items" aria-label="${esc(exhibit.title)} items">
        <ul>
          ${entries
            .map((e) => `<li><button type="button" data-item="${esc(e.id)}" aria-controls="entry-${esc(e.id)}" aria-expanded="false">${esc(e.heading)}</button></li>`)
            .join('')}
        </ul>
      </nav>
      <aside class="exhibit-panel is-closed" data-panel aria-label="${esc(exhibit.title)}">
        <button type="button" class="panel-close" data-close>Close<span class="panel-close__esc" aria-hidden="true">Esc</span></button>
        ${entries
          .map(
            (e) => `
          <section class="panel-entry" id="entry-${esc(e.id)}" data-entry="${esc(e.id)}" tabindex="-1">
            <p class="panel-entry__kicker"><span class="fleuron" aria-hidden="true">❦</span> ${esc(e.kicker)}</p>
            <h2 class="panel-entry__title">${esc(e.heading)}</h2>
            ${e.body}
          </section>`,
          )
          .join('')}
      </aside>
      <p class="scene-hint" data-hint aria-hidden="true">Click to examine · Esc to step back</p>
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
  let focusTimer = 0
  let room: { open(id: string): void; close(): void; highlight(id: string | null): void; dispose(): void } | null = null

  const hint = root.querySelector<HTMLElement>('[data-hint]')

  function showEntry(id: string | null): void {
    window.clearTimeout(focusTimer)
    // The "click to examine" hint would compete with the open panel.
    hint?.classList.toggle('is-hidden', id !== null)
    panel.classList.toggle('is-closed', id === null)
    // A closed panel is visually hidden; keep its controls out of the tab order too.
    // (Without WebGL the panel is the page, so it stays interactive.)
    panel.inert = id === null && !root.classList.contains('no-webgl')
    for (const s of panel.querySelectorAll<HTMLElement>('[data-entry]')) s.classList.toggle('is-active', s.dataset.entry === id)
    for (const b of buttons) b.setAttribute('aria-expanded', String(b.dataset.item === id))
    if (id) {
      const section = panel.querySelector<HTMLElement>(`[data-entry="${CSS.escape(id)}"]`)
      // Let the camera arrive before moving focus so the panel doesn't steal the moment.
      focusTimer = window.setTimeout(() => section?.focus({ preventScroll: true }), opts.reducedMotion ? 0 : 600)
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
  const stopHint = fadeHintOnInteraction(root)

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
  panel.inert = !root.classList.contains('no-webgl')

  return {
    dispose() {
      window.clearTimeout(focusTimer)
      stopHint()
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
