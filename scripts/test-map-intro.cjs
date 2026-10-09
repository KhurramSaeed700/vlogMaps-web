const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const moduleUnderTest = { exports: {} }
new Function('module', 'exports', ts.transpileModule(read('lib/trip-preview.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleUnderTest, moduleUnderTest.exports)
const { getTripPreviewTiming, tripPreviewCompleteHoldMs } = moduleUnderTest.exports
const short = getTripPreviewTiming([[0, 0], [0.01, 0.01]], 2)
const long = getTripPreviewTiming([[-74, 40], [2, 49], [139, 35]], 60)
assert.ok(short.totalMs >= 10000)
assert.ok(long.totalMs > short.totalMs)
assert.ok(getTripPreviewTiming([[0, 0]], 80).totalMs > getTripPreviewTiming([[0, 0]], 5).totalMs)
assert.ok(getTripPreviewTiming([], 100000).totalMs <= 49200)
assert.ok(Number.isFinite(getTripPreviewTiming([[NaN, 0], [0, 0]], NaN).totalMs))
assert.equal(tripPreviewCompleteHoldMs, 3000)
const editor = read('components/maps/mapbox-location-picker.tsx')
const watch = read('components/maps/mapbox-travel-map.tsx')
assert.match(editor, /getTripPreviewTiming\(points.map/)
assert.match(editor, /fitMapToAvailablePoints\(mapInstanceRef.current/)
assert.doesNotMatch(editor, /onAnimationEnd=\{startTravelerTrackingFromAutoStart\}/)
assert.match(editor, /trackingAutoStartCancelledRef.current\s*\) \{\s*return/)
assert.match(watch, /routeIntroDurationMs = routeIntroTiming.totalMs/)
const animation = watch.slice(watch.indexOf('const startRouteIntroAnimation ='), watch.indexOf('const beginRouteIntroPreview ='))
assert.match(animation, /if \(!routeIntroAutoStartCancelledRef.current\)/)
assert.match(animation, /startTrackingFromRouteIntroRef.current\(\)/)
assert.match(animation, /window.requestAnimationFrame\(animateRouteIntro\)/)
assert.match(animation, /timestamp - lastRouteDrawAt >= 50/)
assert.ok(animation.indexOf('window.setTimeout') > animation.indexOf('if (progress >= 1)'), 'automatic tracking is scheduled only after the last frame')
assert.match(animation, /document.hidden/)
// Reproduce the asynchronous fallback -> detailed style transition. During
// the intro it must refit the journey, never restore the stale traveler camera.
const styleHandler = watch.slice(watch.indexOf('const handleStyleLoad ='), watch.indexOf('map.on("load", handleInitialLoad)'))
for (const active of [true, false]) {
  for (const canceled of [true, false]) {
    let jumped = 0, previewed = 0, fullRoute = 0
    const noop = () => {}
    const ref = current => ({ current })
    const map = { resize: noop, jumpTo: () => jumped++ }
    const deps = {
      map, setMapError: noop, setIsLoaded: noop, canUpdateCamera: () => true,
      rebuildCameraTimeline: noop, isJourneyCompleteRef: ref(false),
      showJourneyCompleteOverview: noop, drawRoute: noop,
      updateKeyframeMarkerSizes: noop, syncTravelerMarker: noop, refreshViewportMarkers: noop,
      animatedRouteTimeRef: ref(0), animatedRouteCoordinateRef: ref([0, 0]),
      isRouteIntroActiveRef: ref(active), hasFocusedCurrentLocationRef: ref(true),
      routeIntroAutoStartCancelledRef: ref(canceled), latestPlaybackTimeRef: ref(0),
      liveRouteCoordinateRef: ref([0, 0]), beginRouteIntroPreview: () => previewed++,
      drawFullRoutePreview: () => fullRoute++, beginProgrammaticCameraMove: noop,
      runAutomatedCameraUpdate: fn => fn(), clearProgrammaticCameraMove: noop,
      animatedCameraCenterRef: ref([0, 0]), animatedCameraZoomRef: ref(12),
    }
    const code = ts.transpileModule(styleHandler, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
    new Function(...Object.keys(deps), code + ';return handleStyleLoad')(...Object.values(deps))()
    assert.equal(jumped, active ? 0 : 1, 'style loading must not zoom to the traveler during preview')
    assert.equal(previewed, active && !canceled ? 1 : 0)
    assert.equal(fullRoute, active && canceled ? 1 : 0, 'manual camera interaction must remain respected')
  }
}
// Even before the overview is first fitted, playback must wait for the route
// resolution effects instead of starting an incomplete preview itself.
const syncPlayback = watch.slice(watch.indexOf('const syncPlaybackCamera ='), watch.indexOf('\n      syncPlaybackCamera()'))
for (const focused of [false, true]) {
  const deps = {
    mapInstanceRef: { current: {} }, hasUsableMapSize: () => true,
    isJourneyCompleteRef: { current: false }, isRouteIntroActiveRef: { current: true },
    hasFocusedCurrentLocationRef: { current: focused },
  }
  const code = ts.transpileModule(syncPlayback, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  // Unprovided camera dependencies would throw if this didn't exit early.
  new Function(...Object.keys(deps), code + ';return syncPlaybackCamera')(...Object.values(deps))()
}
assert.match(watch, /isFollowingRef.current = !isRouteIntroActiveRef.current/)
const queuedFollowFrame = watch.slice(watch.indexOf('const animateMarker ='), watch.indexOf('const startMarkerAnimation ='))
let followStopped = false
const queuedCode = ts.transpileModule(queuedFollowFrame, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
new Function('isRouteIntroActiveRef', 'stopMarkerAnimation', queuedCode + ';return animateMarker')(
  { current: true }, () => { followStopped = true },
)(0)
assert.equal(followStopped, true, 'a queued follow RAF cannot interrupt the overview')
assert.match(editor, /if \(!isTrackingTravelerRef.current && !trackingAutoStartCancelledRef.current\) \{\s*fitMapToAvailablePoints/)
// Execute the actual RAF callback with a fake clock: a timer must never win
// against a slow/hidden animation, and canceled previews must not auto-follow.
for (const canceled of [false, true]) {
  const ref = current => ({ current })
  let frame, timer, tracked = 0, completed = 0
  const document = { hidden: false }
  const noop = () => {}
  const deps = {
    clearRouteIntroFrame: noop, stopMarkerAnimation: noop, clearTrackingLoading: noop,
    setIsRouteIntroActive: noop, setRouteIntroCountdownCycle: noop,
    isRouteIntroActiveRef: ref(true), routeIntroStartedAtRef: ref(null),
    routeIntroAutoStartTimerRef: ref(null), routeIntroAutoStartCancelledRef: ref(canceled),
    drawFullRoutePreview: () => completed++, keyframesRef: ref([{ time: 0 }, { time: 60 }]),
    window: { clearTimeout: noop, setTimeout(fn, ms) { timer = { fn, ms }; return 1 }, requestAnimationFrame(fn) { frame = fn; return 1 } },
    mapInstanceRef: ref({}), markerRef: ref({}), routeIntroAnimationFrameRef: ref(null),
    canUpdateCamera: () => true, document, routeIntroTiming: short,
    tripPreviewCameraMs: moduleUnderTest.exports.tripPreviewCameraMs, tripPreviewCompleteHoldMs,
    easeInOutCubic: p => p, getRouteCoordinateAtDistanceProgress: () => [0, 0],
    getRouteCoordinateAtTime: () => [0, 0], getRouteTimeAtDistanceProgress: () => 0,
    positionedLegsRef: ref([]), routeCoordinatesRef: ref([[0, 0]]), liveRouteCoordinateRef: ref([0, 0]),
    targetRouteTimeRef: ref(0), animatedRouteTimeRef: ref(0), routeRevealTimeRef: ref(0),
    targetRouteCoordinateRef: ref([0, 0]), animatedRouteCoordinateRef: ref([0, 0]),
    syncTravelerMarker: noop, drawRouteIntroProgress: noop,
    startTrackingFromRouteIntroRef: ref(() => tracked++),
  }
  const compiled = ts.transpileModule(animation, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  new Function(...Object.keys(deps), compiled + ';return startRouteIntroAnimation')(...Object.values(deps))({})
  assert.equal(timer, undefined)
  frame(0); document.hidden = true; frame(100000)
  assert.equal(timer, undefined, 'background time must not complete the animation')
  document.hidden = false; frame(100100)
  for (let elapsed = 100; elapsed <= short.totalMs - tripPreviewCompleteHoldMs; elapsed += 100) frame(100100 + elapsed)
  assert.equal(completed, 2)
  if (canceled) assert.equal(timer, undefined)
  else { assert.equal(timer.ms, tripPreviewCompleteHoldMs); assert.equal(tracked, 0); timer.fn(); assert.equal(tracked, 1) }
}
console.log('Trip intro passed: adaptive timing, completion before tracking, full-trip hold, cancellation, hidden-tab pause and bounded route drawing.')
