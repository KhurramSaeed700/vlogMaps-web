const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const mapSource = read('components/maps/mapbox-travel-map.tsx')
for (const file of ['components/maps/mapbox-travel-map.tsx', 'components/viewer/watch-experience.tsx', 'components/home/home-header.tsx']) {
  assert.doesNotMatch(read(file), /autoResumeTracking|trackingResumeDelay|scheduleManualFollowResume|NavigationSettingsSection|useNavigationPreferences/)
}
const suspendSource = mapSource.slice(mapSource.indexOf('const suspendFollowForManualInteraction ='), mapSource.indexOf('useEffect(() => {\n    onLocationClickRef.current'))
const code = ts.transpileModule(suspendSource, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
for (const enabled of [true, false]) {
  const ref = current => ({ current })
  const following = ref(enabled)
  const tracking = ref(enabled)
  let canceled = 0
  const deps = {
    isFollowingRef: following, isTrackingEnabledRef: tracking,
    cancelRouteIntroAutoStart: () => canceled++,
    clearRouteIntroAnimation: () => {}, clearTrackingLoading: () => {}, clearProgrammaticCameraMove: () => {},
    updateTrackingEnabled: value => { tracking.current = value },
    animatedCameraCenterRef: ref([0, 0]), animatedCameraZoomRef: ref(0),
  }
  const suspend = new Function(...Object.keys(deps), code + ';return suspendFollowForManualInteraction')(...Object.values(deps))
  suspend({ getCenter: () => ({ lng: 12, lat: 34 }), getZoom: () => 8 })
  assert.equal(following.current, false)
  assert.equal(tracking.current, false)
  assert.equal(canceled, enabled ? 1 : 0)
  // No resume timer exists; repeated interactions cannot re-enable tracking.
  suspend({})
  assert.equal(tracking.current, false)
}
assert.ok(mapSource.includes('const toggleTravelerTracking ='), 'Explicit tracking toggle remains available')
assert.match(mapSource, /centerOnCurrentLocation\(\)/, 'Explicit tracking button remains available')
console.log('Manual tracking passed: exploration disables follow, no auto-resume timer/settings, explicit tracking retained.')
