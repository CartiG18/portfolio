import test from 'node:test'
import assert from 'node:assert/strict'
import { exhibits, findExhibit } from '../src/data/exhibits.ts'
import { esc } from '../src/components/html.ts'
import { isKnownExhibitRoute, isRouteHash, parseRoute, routeHref } from '../src/routes.ts'

test('route parsing keeps page anchors separate from app routes', () => {
  assert.deepEqual(parseRoute(''), { view: 'grounds' })
  assert.deepEqual(parseRoute('#'), { view: 'grounds' })
  assert.deepEqual(parseRoute('#/'), { view: 'grounds' })
  assert.deepEqual(parseRoute('#/lobby'), { view: 'lobby' })
  assert.deepEqual(parseRoute('#/projects'), { view: 'exhibit', id: 'projects' })
  assert.equal(isRouteHash('#main'), false)
  assert.deepEqual(parseRoute('#main'), { view: 'grounds' })
})

test('route links round trip and unknown exhibit routes stay identifiable', () => {
  const routes = [
    { view: 'grounds' },
    { view: 'lobby' },
    ...exhibits.map(({ id }) => ({ view: 'exhibit', id })),
  ]
  for (const route of routes) assert.deepEqual(parseRoute(routeHref(route)), route)
  assert.equal(isKnownExhibitRoute({ view: 'exhibit', id: 'projects' }), true)
  assert.equal(isKnownExhibitRoute({ view: 'exhibit', id: 'missing' }), false)
})

test('exhibits have unique route IDs and complete lobby placard data', () => {
  const ids = exhibits.map(({ id }) => id)
  assert.equal(new Set(ids).size, ids.length)
  for (const exhibit of exhibits) {
    assert.equal(findExhibit(exhibit.id), exhibit)
    assert.ok(exhibit.title.trim())
    assert.ok(exhibit.number.trim())
    assert.ok(exhibit.subtitle.trim())
  }
})

test('HTML interpolation escapes markup and quotes', () => {
  assert.equal(esc(`<script title="x">A & 'B'</script>`), '&lt;script title=&quot;x&quot;&gt;A &amp; &#39;B&#39;&lt;/script&gt;')
})
