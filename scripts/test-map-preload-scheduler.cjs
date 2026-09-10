const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Run the actual component scheduler functions with deterministic timers and map events.
function harness(component) {
  const source = ts.createSourceFile(component, fs.readFileSync(path.resolve(__dirname, '../components/maps', component), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['clearRoutePreloadTimer', 'scheduleRoutePreloadStep', 'runRoutePreloadStep', 'resetRoutePreloader'])
  const declarations = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.has(node.name.getText(source))) {
      declarations.push(`const ${node.getText(source)};`)
    } else if (ts.isFunctionDeclaration(node) && names.has(node.name?.getText(source))) {
      declarations.push(node.getText(source))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(declarations.length, 4)
  const timers = new Map()
  const idle = new Set()
  const calls = []
  const state = { ready: true, hidden: false, maxTargets: 3 }
  let nextTimer = 0
  const map = {
    isStyleLoaded: () => state.ready,
    areTilesLoaded: () => state.ready,
    flyTo: (options) => calls.push(options),
    once: (event, callback) => { assert.equal(event, 'idle'); idle.add(callback) },
    off: (event, callback) => idle.delete(callback),
  }
  const refs = {
    routePreloadTimerRef: { current: null },
    routePreloadIdleCleanupRef: { current: null },
    routePreloadQueueRef: { current: Array.from({ length: 12 }, (_, i) => ({ center: [i, i], zoom: 8 })) },
    routePreloadGenerationRef: { current: 1 },
    routePreloadSignatureRef: { current: '' },
    routePreloadPlaybackSignatureRef: { current: '' },
    mapInstanceRef: { current: map },
  }
  const bindings = {
    ...refs,
    readMapPreloadPolicy: () => ({ maxTargets: state.maxTargets, delayMs: 500 }),
    window: {
      setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer },
      clearTimeout: (id) => timers.delete(id),
    },
    document: { get hidden() { return state.hidden } },
  }
  const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const api = new Function(...Object.keys(bindings), `${code}; return { runRoutePreloadStep, resetRoutePreloader }`)(...Object.values(bindings))
  function tick() {
    const entry = timers.entries().next().value
    assert.ok(entry, 'expected a scheduled retry')
    timers.delete(entry[0])
    entry[1]()
  }
  return { ...api, refs, state, calls, idle, timers, tick }
}

for (const component of ['mapbox-travel-map.tsx', 'mapbox-location-picker.tsx']) {
  test(`${component}: tile loading retries without waiting for a style.load event`, () => {
    const h = harness(component)
    h.state.ready = false
    h.runRoutePreloadStep(1)
    assert.equal(h.calls.length, 0)
    h.state.ready = true
    h.tick()
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0].preloadOnly, true)
    assert.equal(h.refs.routePreloadQueueRef.current.length, 2)
  })
  test(`${component}: hidden and disabled preloads do not consume targets`, () => {
    for (const change of [{ hidden: true }, { maxTargets: 0 }]) {
      const h = harness(component)
      Object.assign(h.state, change)
      h.runRoutePreloadStep(1)
      assert.equal(h.calls.length, 0)
      assert.equal(h.refs.routePreloadQueueRef.current.length, 12)
      h.resetRoutePreloader()
      assert.equal(h.timers.size, 0)
    }
  })
  test(`${component}: timeout and reset remove idle listeners and cancel stale work`, () => {
    const h = harness(component)
    h.runRoutePreloadStep(1)
    assert.equal(h.idle.size, 1)
    h.tick()
    assert.equal(h.idle.size, 0)
    h.tick()
    assert.equal(h.idle.size, 1)
    h.resetRoutePreloader()
    assert.equal(h.idle.size, 0)
    assert.equal(h.timers.size, 0)
    h.runRoutePreloadStep(1)
    assert.equal(h.calls.length, 2)
  })
}
