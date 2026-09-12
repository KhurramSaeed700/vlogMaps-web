const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
// Exercise the actual TypeScript helpers without adding a test framework.
const cache = new Map()
function load(name) {
  const filename = path.resolve(__dirname, '../lib', name + '.ts')
  if (cache.has(filename)) return cache.get(filename)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', code)(module, module.exports, (id) => load(id))
  cache.set(filename, module.exports)
  return module.exports
}
const { buildCameraZoomPlan, getCameraPlanTarget, getCameraPlanZoom } = load('map-camera-plan')
const { getFlightLandingFocusPoint, getStationaryCameraFocusProgress } = load('map-navigation-motion')
const desktop = { width: 900, height: 700, minZoom: 0, maxZoom: 18 }
const flight = (fromTime, toTime, totalDistance = 5840) => ({
  fromTime, toTime, totalDistance, routeKind: 'flight',
  coordinates: [[-74, 40.7], [2.35, 48.86]],
})
const build = (segments, viewport = desktop) => buildCameraZoomPlan(segments, viewport, () => 12)

test('one-second Atlantic flight is wide BEFORE moving and arrives on video time', () => {
  const plan = build([flight(10, 11)])
  const w = plan[0]
  assert.ok(w.start < 9)
  assert.equal(getCameraPlanZoom(plan, w.start), 12)
  assert.equal(getCameraPlanZoom(plan, 10), w.zoom)
  assert.equal(getCameraPlanZoom(plan, 11), w.zoom)
  assert.equal(getCameraPlanZoom(plan, w.end), 12)
  assert.equal(getCameraPlanZoom(plan, w.end + 0.01), null)
  assert.ok(w.zoom >= 3)
})
test('long-haul flights use a readable regional scale and follow the traveler', () => {
  const plan = build([flight(10, 70)])
  const target = getCameraPlanTarget(plan, 40)
  assert.ok(target.zoom >= 3)
  assert.equal(target.center, null)
})
test('Pacific flight context uses the short path across the antimeridian', () => {
  const pacific = {
    ...flight(10, 70, 8300),
    coordinates: [[139.7, 35.7], [179, 42], [-150, 40], [-122.4, 37.6]],
  }
  const target = getCameraPlanTarget(build([pacific]), 40)
  assert.equal(target.center, null)
  assert.ok(target.zoom >= 3)
})
test('short flights recover regional detail after long flights without airport zoom pulses', () => {
  const secondFlight = {
    ...flight(12, 13, 800),
    coordinates: [[2.35, 48.86], [31.24, 30.04]],
  }
  const plan = build([flight(10, 11), secondFlight, flight(14, 15, 11000)])
  assert.equal(plan.length, 3)
  assert.ok(getCameraPlanZoom(plan, 12.5) > getCameraPlanZoom(plan, 10.5))
  for (let time = 11; time < 12; time += 1 / 60) {
    assert.ok(getCameraPlanZoom(plan, time) <= plan[1].zoom)
  }
  assert.equal(getCameraPlanTarget(plan, 12.5).center, null)
})
test('seeking, pausing and dropped frames cannot accumulate animation delay', () => {
  const plan = build([flight(10, 11), flight(30, 31)])
  const before = getCameraPlanZoom(plan, 10.7)
  for (const time of [30.8, 4, 10.7, 10.7, 10.7]) getCameraPlanZoom(plan, time)
  assert.equal(getCameraPlanZoom(plan, 10.7), before)
  assert.equal(getCameraPlanZoom(plan, 31), plan[1].zoom)
})
test('slow roads and stationary segments keep normal navigation', () => {
  assert.equal(build([{ ...flight(0, 120, 2), routeKind: 'road' }]).length, 0)
  assert.equal(build([{ ...flight(0, 5), isStationary: true }]).length, 0)
  assert.equal(build([flight(10, 10)]).length, 0)
  assert.equal(getCameraPlanZoom([], 0), null)
})
test('stationary camera targets never prepare a zoom-out before movement', () => {
  const watchSource = fs.readFileSync(path.resolve(__dirname, '../components/maps/mapbox-travel-map.tsx'), 'utf8')
  const editorSource = fs.readFileSync(path.resolve(__dirname, '../components/maps/mapbox-location-picker.tsx'), 'utf8')
  assert.doesNotMatch(watchSource, /departureZoom[\s\S]*departureProgress/)
  assert.doesNotMatch(editorSource, /stopZoom[\s\S]{0,500}departurePreparation/)
  assert.match(editorSource, /return stopZoom/)
  let previous = 0
  for (let time = 10; time <= 30; time += 0.1) {
    const progress = getStationaryCameraFocusProgress({ fromTime: 10, toTime: 30 }, time)
    assert.ok(progress >= previous)
    previous = progress
  }
  assert.equal(previous, 1)
})
test('landing focus holds the airport until the next distinct movement timestamp', () => {
  const points = [
    { time: 10, lat: 40.6, lng: -73.7, pointType: 'flight', flightPhase: 'takeoff' },
    { time: 20, lat: 49.0, lng: 2.55, pointType: 'flight', flightPhase: 'landing' },
    { time: 20.05, lat: 49.0, lng: 2.55, pointType: 'point' },
    { time: 24, lat: 48.86, lng: 2.35, pointType: 'point' },
  ]
  assert.equal(getFlightLandingFocusPoint(points, 19.99), null)
  assert.equal(getFlightLandingFocusPoint(points, 20.1), points[1])
  assert.equal(getFlightLandingFocusPoint(points, 23.99), points[1])
  assert.equal(getFlightLandingFocusPoint(points, 24), null)
})
test('rapid land movement and narrow mobile viewports also prepare early', () => {
  const road = { ...flight(10, 12, 400), routeKind: 'road' }
  const wide = build([road])
  const mobile = build([road], { ...desktop, width: 360, height: 300 })
  assert.ok(mobile[0].zoom <= wide[0].zoom)
  assert.ok(mobile[0].zoom >= 5.2)
  assert.equal(getCameraPlanZoom(mobile, 10), mobile[0].zoom)
})
test('zoom is continuous and monotonic during preparation and recovery', () => {
  const plan = build([flight(10, 11)])
  const w = plan[0]
  let previous = 12
  for (let t = w.start; t < w.departure; t += 1 / 120) {
    const zoom = getCameraPlanZoom(plan, t)
    assert.ok(zoom <= previous + 1e-9)
    assert.ok(Math.abs(zoom - previous) < 0.1)
    previous = zoom
  }
  previous = w.zoom
  for (let t = w.arrival; t < w.end; t += 1 / 120) {
    const zoom = getCameraPlanZoom(plan, t)
    assert.ok(zoom >= previous - 1e-9)
    previous = zoom
  }
})
test('large routes retain disjoint windows and logarithmic lookup', () => {
  const plan = build(Array.from({ length: 10000 }, (_, i) => flight(i * 20 + 10, i * 20 + 11)))
  assert.equal(plan.length, 10000)
  for (let i = 0; i < plan.length; i += 137) {
    assert.equal(getCameraPlanZoom(plan, i * 20 + 10.5), plan[i].zoom)
  }
})
