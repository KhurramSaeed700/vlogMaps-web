const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const code = ts.transpileModule(read('lib/mapbox-directions.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'require', code)(mod, mod.exports, () => ({ reportHandledError() {} }))
const { fetchRoutedLegsForKeyframes, createInitialRoutedLegs } = mod.exports
const oldFetch = global.fetch
let response
let requests = 0
global.fetch = async () => { requests++; return { ok: true, status: 200, json: async () => response } }
const point = (time, lng, lat, extra = {}) => ({ time, lng, lat, ...extra })
async function resolve(points, coordinates) {
  response = coordinates ? { routes: [{ geometry: { coordinates } }] } : { code: 'NoRoute', routes: [] }
  return (await fetchRoutedLegsForKeyframes(points))[0]
}
async function main() {
  const water = [point(0, 18.1, 59.4), point(30, 18.12, 59.41)]
  let leg = await resolve(water, [[18.09, 59.39], [18.11, 59.40]])
  assert.equal(leg.routeKind, 'offroad', 'Do not use a road snapped far from water points')
  assert.deepEqual(leg.coordinates, water.map(p => [p.lng, p.lat]))
  leg = await resolve([point(0, 10, 40), point(2, 10.02, 40.03)], null)
  assert.equal(leg.routeKind, 'offroad')
  assert.equal(leg.coordinates.length, 2, 'Missing roads still connect recorded positions')
  const trail = [point(10, 20, 50, { via: [[20.01, 50.01]] }), point(60, 20.02, 50.02)]
  leg = await resolve(trail, null)
  assert.deepEqual(leg.coordinates, [[20, 50], [20.01, 50.01], [20.02, 50.02]], 'Preserve creator waypoint shape')
  const road = [point(0, 1, 1), point(100, 1.001, 1.001)]
  leg = await resolve(road, [[1.00001, 1.00001], [1.0005, 1.0005], [1.001, 1.001]])
  assert.equal(leg.routeKind, 'road', 'Nearby roads keep normal road tracking')
  assert.equal(leg.isFallback, false)
  const flight = [point(0, 1, 1, { pointType: 'flight' }), point(2, 30, 40, { pointType: 'flight' })]
  const before = requests
  assert.equal((await fetchRoutedLegsForKeyframes(flight))[0].routeKind, 'flight')
  assert.equal(requests, before, 'Flights never request roads')
  assert.equal(createInitialRoutedLegs(water)[0].routeKind, 'offroad', 'Pending routes do not imply road certainty')
  for (const file of ['components/maps/mapbox-travel-map.tsx', 'components/maps/mapbox-location-picker.tsx']) {
    const source = read(file)
    assert.match(source, /"routeKind"\], "offroad"/)
    assert.match(source, /"line-width": 1\.8, "line-dasharray": \[0\.2, 2\.5\]/)
  }
  console.log('Off-road routing passed: remote snaps, no route, creator waypoints, normal roads, flights, pending paths, and matching thin dotted layers on watch/edit.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { global.fetch = oldFetch })
