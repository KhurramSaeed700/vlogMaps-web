const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  new Function('exports', 'require', code)(mod.exports, name => {
    if (name in deps) return deps[name]
    if (name.startsWith('@/')) return load(name.replace('@/', '') + '.ts', deps)
    return require(name)
  })
  return mod.exports
}
const regions = load('lib/stop-regions.ts')
const stop = { id: 'circle', time: 45, stopEndTime: 60, lat: 61.2, lng: -149.9, location: 'Old private name', description: 'Old name', pointType: 'stop', regionCircle: { radiusKm: 5, anonymous: true } }
const data = regions.stopRegionFeatures([stop])
assert.equal(data.features.length, 1)
const ring = data.features[0].geometry.coordinates[0]
assert.equal(ring.length, 65)
assert.deepEqual(ring[0], ring.at(-1))
for (const [lng, lat] of ring) {
  const radians = Math.PI / 180
  const a = Math.sin((lat-stop.lat)*radians/2)**2 + Math.cos(lat*radians)*Math.cos(stop.lat*radians)*Math.sin((lng-stop.lng)*radians/2)**2
  assert.ok(Math.abs(6371*2*Math.asin(Math.sqrt(a))-5) < 0.00001)
}
for (const radiusKm of [-1, 0, NaN, Infinity, 501]) assert.equal(regions.stopRegionFeatures([{ ...stop, regionCircle: { radiusKm } }]).features.length, 0)
assert.equal(regions.stopRegionFeatures([{ ...stop, pointType: 'point' }]).features.length, 0)
assert.equal(regions.stopRegionLabels([stop]).features[0].properties.radiusLabel, '5 km')
const radius = regions.stopRegionRadiusFeatures([stop]).features[0]
assert.equal(radius.properties.pointKey, stop.id)
assert.deepEqual(radius.geometry.coordinates[0], [stop.lng, stop.lat], 'Radius starts at circle center')
function distanceKm([lng,lat]) {
  const radians = Math.PI / 180
  const a = Math.sin((lat-stop.lat)*radians/2)**2 + Math.cos(lat*radians)*Math.cos(stop.lat*radians)*Math.sin((lng-stop.lng)*radians/2)**2
  return 6371*2*Math.asin(Math.sqrt(a))
}
assert.ok(Math.abs(distanceKm(radius.geometry.coordinates.at(-1))-5) < 0.00001, 'Radius ends exactly 5 km from center')
const label = regions.stopRegionLabels([stop]).features[0]
assert.deepEqual(radius.geometry.coordinates[8], label.geometry.coordinates, 'Label stays on the geodesic radius line')
assert.ok(Math.abs(distanceKm(label.geometry.coordinates)-2.5) < 0.00001, 'Label sits halfway along radius, away from pin')
assert.equal(regions.stopRegionRadiusFeatures([{...stop, pointType:'point'}]).features.length, 0)
assert.equal(regions.stopRegionRadiusFeatures([{...stop, regionCircle:{radiusKm:0}}]).features.length, 0)
assert.equal(regions.stopRegionLabels([{...stop, lat:NaN}]).features.length, 0)
assert.equal(regions.stopRegionRadiusFeatures([{...stop, lat:NaN}]).features.length, 0)
assert.equal(regions.stopRegionRadiusLabel(2.35), '2.35 km')
const bounds = regions.stopRegionBounds(stop, 5)
assert.ok(bounds[0] < stop.lng && bounds[2] > stop.lng && bounds[1] < stop.lat && bounds[3] > stop.lat)
assert.equal(regions.stopRegionBounds(stop, 0), null)
const payload = load('lib/creator-video-payload.ts')
const state = { points: [stop], tripRoute: { start: null, end: null }, routeShapes: { trip: [], timestampLegs: {} }, savedPlaces: [] }
const parsed = payload.parseCreatorVideoStatePayload(JSON.parse(JSON.stringify(state)))
assert.equal(parsed.success, true)
assert.deepEqual(parsed.data.points[0].regionCircle, stop.regionCircle)
assert.equal(parsed.data.points[0].location, 'Anonymous Region')
assert.equal(parsed.data.points[0].description, regions.anonymousRegionMessage)
assert.equal(payload.parseCreatorVideoStatePayload({ ...state, points: [{ ...stop, regionCircle: { radiusKm: 900 } }] }).success, false)
const points = load('lib/creator-points.ts')
assert.equal(points.upsertCreatorPoint('video', [], stop)[0].location, 'Anonymous Region')
const cleanup = []
const react = { useMemo: fn => fn(), useRef: current => ({ current }), useEffect: fn => { const end = fn(); if (end) cleanup.push(end) } }
const sources = new Map(), layers = new Map(), handlers = new Map()
const map = {
  getSource: id => sources.get(id), addSource(id, spec) { sources.set(id, { data: spec.data, setData(data) { this.data = data } }) },
  getLayer: id => layers.get(id), addLayer(spec) { layers.set(spec.id, spec) }, getCanvas: () => ({style:{}}),
  setLayoutProperty(id, property, value) { layers.get(id).layout[property] = value },
  queryRenderedFeatures: () => [{ properties: { pointKey: stop.id } }],
  on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn) },
  off(event, fn) { handlers.get(event)?.delete(fn) },
}
const hook = load('components/maps/use-stop-regions.ts', { react, '@/lib/map-loading': { isMapStyleReady: () => true } })
let selected
hook.useStopRegions({ current: map }, true, 'streets', [stop], value => { selected = value })
assert.equal(sources.get('stop-regions').data.features.length, 1)
assert.equal(sources.get('stop-region-labels').data.features[0].properties.radiusLabel, '5 km')
assert.equal(layers.get('stop-regions-radius').layout['text-allow-overlap'], true)
assert.deepEqual(sources.get('stop-region-radii').data.features[0], radius)
assert.equal(layers.get('stop-regions-radius-line').paint['line-width'], 1.5)
assert.deepEqual(layers.get('stop-regions-radius-line').paint['line-dasharray'], [0.2, 2.5])
assert.deepEqual(layers.get('stop-regions-radius').layout['text-offset'], [0,-0.9])

for (const fn of handlers.get('click')) fn({ point: [20,20], preventDefault() {} })
assert.equal(selected, stop, 'Clicking the circle selects its radius editor')
sources.clear(); layers.clear()
for (const fn of handlers.get('style.load')) fn()
assert.equal(sources.get('stop-region-labels').data.features[0].properties.radiusLabel, '5 km', 'Radius survives map style changes')
assert.deepEqual(sources.get('stop-region-radii').data.features[0], radius, 'Radius line survives style reload')
for (const fn of cleanup) fn()
assert.equal(handlers.get('click').size, 0)
const editor = fs.readFileSync('components/creator/creator-video-editor.tsx', 'utf8')
assert.doesNotMatch(editor, /StopAreaSearch|areaKind|isDrawingStopCircle|Draw region|City \/ town|Stop in progress/)
const status = editor.slice(editor.indexOf('<div data-editor-tour="stop"'), editor.indexOf('</div>', editor.indexOf('<div data-editor-tour="stop"')))
assert.doesNotMatch(status, /onClick=|<Button/, 'Stop status must not create points with physical controls')
for (const file of ['mapbox-location-picker.tsx', 'mapbox-travel-map.tsx']) assert.match(fs.readFileSync('components/maps/' + file, 'utf8'), /useStopRegions\(/)
assert.match(editor, /value=\{activeDraftMapValue\}/, 'Video progress must not repeatedly reset selected-map camera and user zoom')
console.log('Stop regions passed: geometry, anonymous labels, save validation, km labels, circle editing, style reload, keyboard-only status and watch/edit parity.')
