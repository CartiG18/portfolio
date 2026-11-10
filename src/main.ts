import './styles/tokens.css'
import './styles/base.css'
import './styles/scenes.css'
import './styles/exhibit.css'
import './styles/hud.css'

import { exhibits, findExhibit } from './data/exhibits.ts'
import { contactLabel, openEmail, site, socialLinks } from './data/site.ts'
import { renderGrounds, mountGrounds, type SceneController } from './components/grounds.ts'
import { renderLobby, mountLobby } from './components/lobby.ts'
import { mountExhibit, renderExhibit, renderNotFound } from './components/exhibit.ts'
import { esc } from './components/html.ts'
import { sound } from './audio.ts'

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')

const main = document.querySelector<HTMLElement>('#main')!
const mapList = document.querySelector<HTMLOListElement>('#map-list')!
const mapDetails = document.querySelector<HTMLDetailsElement>('#map')!

type Route = { view: 'grounds' } | { view: 'lobby' } | { view: 'exhibit'; id: string }

/** Only "#/..." hashes are routes; others (e.g. the skip link's #main) are in-page anchors. */
function isRouteHash(hash: string): boolean {
  return hash === '' || hash === '#' || hash.startsWith('#/')
}

function parseRoute(hash: string): Route {
  const id = isRouteHash(hash) ? hash.replace(/^#\/?/, '') : ''
  if (!id) return { view: 'grounds' }
  if (id === 'lobby') return { view: 'lobby' }
  return { view: 'exhibit', id }
}

function routeHref(route: Route): string {
  if (route.view === 'grounds') return '#/'
  if (route.view === 'lobby') return '#/lobby'
  return `#/${route.id}`
}

let currentView: Route['view'] | null = null
/** The exhibit we're leaving, so the hall can walk us back from its door. */
let lastExhibit: string | null = null
let scene: (SceneController & { enterExhibit?(id: string): void }) | null = null
let renderToken = 0

function render(route: Route): void {
  const token = ++renderToken
  scene?.dispose()
  scene = null
  document.body.classList.remove('is-travelling')

  const adopt = (c: SceneController) => {
    if (token === renderToken) scene = c
    else c.dispose()
  }

  if (route.view === 'grounds') {
    main.innerHTML = renderGrounds()
    document.title = `${site.ownerName} · ${site.positioning}`
    const root = main.querySelector<HTMLElement>('[data-scene]')!
    void mountGrounds(root, {
      reducedMotion: REDUCED_MOTION.matches,
      onEntered: () => (location.hash = '#/lobby'),
    }).then(adopt)
  } else if (route.view === 'lobby') {
    main.innerHTML = renderLobby()
    document.title = `The Library · ${site.museumName}`
    const root = main.querySelector<HTMLElement>('[data-scene]')!
    void mountLobby(root, {
      reducedMotion: REDUCED_MOTION.matches,
      returnFrom: currentView === 'exhibit' ? (lastExhibit ?? undefined) : undefined,
      onEnterExhibit: (id) => (location.hash = `#/${id}`),
    }).then(adopt)
  } else {
    const exhibit = findExhibit(route.id)
    main.innerHTML = exhibit ? renderExhibit(exhibit) : renderNotFound()
    document.title = `${exhibit ? exhibit.title : 'Not found'} · ${site.museumName}`
    if (exhibit) {
      const root = main.querySelector<HTMLElement>('[data-scene]')!
      void mountExhibit(root, exhibit.id, { reducedMotion: REDUCED_MOTION.matches }).then(adopt)
    }
  }

  document.body.dataset.view = route.view === 'exhibit' && findExhibit(route.id) ? 'room' : route.view
  main.classList.remove('is-arriving')
  void main.offsetWidth // restart the arrival animation
  main.classList.add('is-arriving')
  updateMap(route)
  window.scrollTo(0, 0)

  // Move focus to the new page's heading on navigation (not on first load).
  if (currentView !== null) {
    const heading = main.querySelector<HTMLElement>('h1')
    heading?.setAttribute('tabindex', '-1')
    heading?.focus({ preventScroll: true })
  }
  currentView = route.view
  lastExhibit = route.view === 'exhibit' ? route.id : null
}

function renderMap(): void {
  const items = [
    { href: '#/', label: 'Grounds' },
    { href: '#/lobby', label: 'Library Lobby' },
    ...exhibits.map((e) => ({ href: `#/${e.id}`, label: `${e.number}. ${e.title}` })),
  ]
  const exhibitItems = items.map((i) => `<li><a href="${esc(i.href)}">${esc(i.label)}</a></li>`).join('')
  // Elsewhere: profiles, and the email link (address assembled only on click).
  const elsewhere = socialLinks
    .filter((l) => l.href)
    .map((l) => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}<span class="visually-hidden"> (opens in a new tab)</span></a></li>`)
    .join('')
  mapList.innerHTML = `${exhibitItems}<li class="map__rule" aria-hidden="true"></li>${elsewhere}<li><button type="button" class="map__email" data-email>${esc(contactLabel)}</button></li>`
  mapList.querySelector('[data-email]')!.addEventListener('click', openEmail)
}

function updateMap(route: Route): void {
  const current = routeHref(route)
  for (const link of mapList.querySelectorAll('a')) {
    if (link.getAttribute('href') === current) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  mapDetails.open = false
}

/**
 * When a link leads somewhere the current 3D scene can walk to (grounds → lobby,
 * lobby → exhibit door), play the camera move instead of cutting straight there.
 */
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#/"]')
  if (!link || !scene) return
  const target = parseRoute(link.getAttribute('href')!)

  if (currentView === 'grounds' && target.view === 'lobby' && scene.enter) {
    event.preventDefault()
    mapDetails.open = false
    scene.enter()
  } else if (currentView === 'lobby' && target.view === 'exhibit' && scene.enterExhibit) {
    event.preventDefault()
    mapDetails.open = false
    scene.enterExhibit(target.id)
  }
})

// Close the Portfolio menu when clicking elsewhere or pressing Escape.
document.addEventListener('click', (event) => {
  if (mapDetails.open && !mapDetails.contains(event.target as Node)) mapDetails.open = false
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mapDetails.open) {
    mapDetails.open = false
    mapDetails.querySelector('summary')?.focus()
  }
})

// Sound is off until the visitor turns it on; the click is the gesture that unlocks audio.
const soundToggle = document.querySelector<HTMLButtonElement>('#sound-toggle')!
soundToggle.addEventListener('click', () => {
  sound.setEnabled(!sound.on)
  soundToggle.setAttribute('aria-pressed', String(sound.on))
  soundToggle.querySelector('[data-sound-state]')!.textContent = sound.on ? 'on' : 'off'
})

window.addEventListener('hashchange', () => {
  if (isRouteHash(location.hash)) render(parseRoute(location.hash))
})

renderMap()
render(parseRoute(location.hash))
