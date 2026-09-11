const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, clock = { now: () => 0 }) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../lib', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const result = { exports: {} }
  new Function('module', 'exports', 'require', 'performance', code)(result, result.exports, (name) => {
    if (name === '@/lib/world-land.json') return require('../lib/world-land.json')
    if (name === '@/lib/mapbox') return { mapboxAccessToken: 'test-token' }
    throw new Error(`Unexpected dependency: ${name}`)
  }, clock)
  return result.exports
}

test('bundled world style has real geometry and needs no remote source', () => {
  const api = load('map-loading.ts')
  const style = api.createWorldFallbackStyle()
  const source = style.sources['travelmap-world']
  assert.equal(source.type, 'geojson')
  assert.ok(source.data.features.length > 100)
  assert.ok(source.data.features.every(f => f.geometry.type === 'Polygon'))
  assert.equal(style.layers[0].type, 'background')
  assert.equal(style.layers[1].type, 'fill')
  assert.equal(style.sprite, undefined)
})

test('tile-independent style readiness, fallback reinstatement, measurements and cleanup', async () => {
  let time = 0
  const api = load('map-loading.ts', { now: () => time })
  let style = api.createWorldFallbackStyle()
  const events = new Map()
  const on = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn) }
  const off = (name, fn) => events.get(name)?.delete(fn)
  const emit = (name, event) => [...(events.get(name) ?? [])].forEach(fn => fn(event))
  let requested
  const previousFetch = global.fetch
  global.fetch = async url => ({ ok: true, json: async () => ({ version: 8, name: 'Detailed', sources: {}, layers: [{ id: 'background', type: 'background' }, { id: 'detail', type: 'raster' }] }), url })
  const map = {
    on, off,
    once: (name, fn) => { const once = e => { off(name, once); fn(e) }; on(name, once) },
    getStyle: () => style,
    getSource: id => style.sources[id],
    setStyle: value => { requested = value },
    setPaintProperty: () => {},
    addSource: (id, source) => { style.sources[id] = source },
    addLayer: (layer, before) => { assert.equal(before, 'detail'); assert.equal(layer.maxzoom, undefined); style.layers.splice(1, 0, layer) },
    isStyleLoaded: () => false,
    areTilesLoaded: () => false,
  }
  api.attachMapLoading(map, () => 'mapbox://styles/detail')
  assert.equal(api.isMapStyleReady(map), true)
  assert.equal(api.canPreloadMap(map), false)
  emit('load')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requested.name, 'Detailed')
  assert.ok(requested.sources['travelmap-world'])
  assert.equal(requested.layers[1].id, 'travelmap-world-land')
  style = requested
  assert.equal(api.isMapStyleReady(map), true)
  emit('style.load')
  assert.equal(api.isMapStyleReady(map), true)
  assert.equal(api.canPreloadMap(map), true)
  const tile = { dataType: 'source', sourceId: 'remote', coord: { overscaledZ: 4, wrap: 0, canonical: { x: 2, y: 3 } } }
  emit('sourcedataloading', tile)
  time = 2000
  assert.equal(api.getMapLoadingObservation(map).latencyMs, 2000)
  emit('sourcedata', tile)
  assert.deepEqual(api.getMapLoadingObservation(map), { latencyMs: 2000, samples: 1, pending: 0 })
  for (let x = 0; x < 300; x++) emit('sourcedataloading', { ...tile, coord: { ...tile.coord, canonical: { x, y: 1 } } })
  assert.equal(api.getMapLoadingObservation(map).pending, 256)
  time = 18000
  assert.equal(api.getMapLoadingObservation(map).pending, 0)
  emit('remove')
  assert.equal(api.getMapLoadingObservation(map), undefined)
  assert.equal(events.get('sourcedataloading').size, 0)
  assert.equal(events.get('sourcedata').size, 0)
  global.fetch = previousFetch
})

test('flight preparation puts overview and arrival ahead of intermediate views', () => {
  const api = load('map-navigation-motion.ts')
  const overview = { center: [-30, 40], zoom: 2 }
  const arrival = [2.35, 48.85]
  const targets = api.getFlightCameraPreloadTargets({ overview, takeoffCenter: [-74, 40.7], landingCenter: arrival, takeoffZoom: 12, landingZoom: 12 })
  assert.deepEqual(targets.slice(0, 3), [overview, { center: arrival, zoom: 6 }, { center: arrival, zoom: 12 }])
  const flight = { fromTime: 40, toTime: 42, routeKind: 'flight' }
  assert.equal(api.getFlightPreloadSegment([flight], 0, 45), flight)
  assert.equal(api.getFlightPreloadSegment([flight], 0, 12), null)
})
