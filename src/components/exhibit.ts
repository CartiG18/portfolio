import type { Exhibit } from '../data/exhibits.ts'
import { esc } from './html.ts'

/** Placeholder room for an exhibit; each one gets its own layout as it's built. */
export function renderExhibit(exhibit: Exhibit): string {
  return `
    <article class="exhibit" data-exhibit="${esc(exhibit.id)}">
      <a class="back-link" href="#/lobby">
        <span aria-hidden="true">←</span> Return to the Lobby
      </a>
      <header class="exhibit__header">
        <p class="exhibit__kicker">Exhibit ${esc(exhibit.number)}</p>
        <h1 class="exhibit__title">${esc(exhibit.title)}</h1>
        <p class="exhibit__subtitle">${esc(exhibit.subtitle)}</p>
      </header>
      <div class="exhibit__wall">
        <div class="gilded-frame">
          <div class="notice">
            <p class="notice__title">Exhibit being installed</p>
            <p>The curators are hanging this collection. Please check back soon.</p>
          </div>
        </div>
      </div>
    </article>`
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
