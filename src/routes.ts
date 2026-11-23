import { findExhibit } from './data/exhibits.ts'

export type Route = { view: 'grounds' } | { view: 'lobby' } | { view: 'professional' } | { view: 'exhibit'; id: string }

/** Only "#/..." hashes are routes; other hashes (such as #main) are in-page anchors. */
export function isRouteHash(hash: string): boolean {
  return hash === '' || hash === '#' || hash.startsWith('#/')
}

export function parseRoute(hash: string): Route {
  // A bare site URL opens the professional portfolio; #/ remains the museum grounds route.
  if (hash === '' || hash === '#') return { view: 'professional' }
  const id = isRouteHash(hash) ? hash.replace(/^#\/?/, '') : ''
  if (!id) return { view: 'grounds' }
  if (id === 'lobby') return { view: 'lobby' }
  if (id === 'professional') return { view: 'professional' }
  return { view: 'exhibit', id }
}

export function routeHref(route: Route): string {
  if (route.view === 'grounds') return '#/'
  if (route.view === 'lobby') return '#/lobby'
  if (route.view === 'professional') return '#/professional'
  return `#/${route.id}`
}

export function isKnownExhibitRoute(route: Route): boolean {
  return route.view !== 'exhibit' || findExhibit(route.id) !== undefined
}
