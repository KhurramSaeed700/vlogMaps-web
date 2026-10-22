const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const regionsSource = fs.readFileSync('lib/stop-regions.ts', 'utf8')
const exportsObject = {}
new Function('exports', ts.transpileModule(regionsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exportsObject)
const { anonymousRegionName, anonymousRegionMessage } = exportsObject
const source = fs.readFileSync('components/creator/creator-video-editor.tsx', 'utf8')
const ast = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function extract(name) {
  let value
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) value = node.initializer.getText(ast)
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) value = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast); assert.ok(value, name); return value
}
function evaluate(expression, deps) {
  const js = ts.transpileModule(`const fn = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(deps), js + ';return fn')(...Object.values(deps))
}
const noop = () => {}
let draft = null, awaited, recording, resumed = 0, reverseLookups = 0, cancelled = 0
const ref = { current: null }
const location = { current: { lat: 61.2, lng: -149.9 } }
const common = {
  draftPoint: null, isAwaitingMapPlacement: true, isRecordingStop: true, draftPointRef: ref,
  setDraftPoint: value => { draft = typeof value === 'function' ? value(draft) : value },
  setIsAwaitingMapPlacement: value => awaited = value, setIsTimestampNameEditing: noop,
  getDraftLocation: () => 'Normal stop', getDraftDescription: () => 'Normal stop description', recordMapEditSnapshot: noop,
  beginNearbyPlaceLookup: () => { reverseLookups++; return null }, scheduleAutoplay: () => resumed++,
}
const place = evaluate(extract('savePointFromMap'), common)
const start = evaluate(extract('startStopRecording'), {
  ...common, savePointFromMap: place, searchedLocationRef: location, pendingFlightTakeoff: null, flightAirportPrompt: null,
  isPlacingSavedPlace: false, cancelNearbyPlaceLookup: () => cancelled++, currentTimeRef: { current: 45 },
  setResumeCountdown: noop, setIsPlaying: noop, displayedRows: [], setIsRecordingStop: value => recording = value,
  anonymousRegionName, anonymousRegionMessage,
})
start(true)
assert.equal(draft.time, 45)
assert.deepEqual([draft.lat, draft.lng], [61.2, -149.9])
assert.deepEqual(draft.regionCircle, { radiusKm: 5, anonymous: true })
assert.equal(draft.location, anonymousRegionName)
assert.equal(draft.description, anonymousRegionMessage)
assert.equal(reverseLookups, 0, 'Never reverse-geocode anonymous stops')
assert.equal(resumed, 1, 'Anonymous placement keeps normal autoplay countdown')
assert.equal(awaited, false); assert.equal(recording, true); assert.equal(cancelled, 1)
start()
assert.equal(draft.regionCircle, undefined)
assert.equal(draft.location, 'Normal stop')
assert.equal(reverseLookups, 1, 'Normal W behavior remains intact')
location.current = null
start(true)
assert.equal(draft.lat, null); assert.equal(awaited, true)
const create = evaluate(extract('createDraftPoint'), { getAirportCodeLocation: () => null })
const saved = { ...draft, id: 'region', lat: 1, lng: 2, stopEndTime: 80 }
assert.deepEqual(create(saved).regionCircle, { radiusKm: 5, anonymous: true }, 'Existing Edit preserves the radius and anonymity')
let radiusChange, radiusCondition, circleClick
function visit(node) {
  if (ts.isConditionalExpression(node) && node.whenTrue.getText(ast).includes('aria-label="Stop radius in kilometers"') && ts.isJsxElement(node.whenTrue)) radiusCondition = node.condition.getText(ast)
  if (ts.isJsxSelfClosingElement(node)) {
    const attrs = node.attributes.properties
    const label = attrs.find(attr => attr.name?.getText(ast) === 'aria-label')
    if (label?.initializer?.text === 'Stop radius in kilometers') radiusChange = attrs.find(attr => attr.name?.getText(ast) === 'onChange').initializer.expression.getText(ast)
    if (node.tagName.getText(ast) === 'MapboxLocationPicker') circleClick = attrs.find(attr => attr.name?.getText(ast) === 'onStopRegionClick').initializer.expression.getText(ast)
  }
  ts.forEachChild(node, visit)
}
visit(ast)
let error
draft = saved
const change = evaluate(radiusChange, { draftPoint: draft, draftPointRef: ref, setStopRadiusError: value => error = value, setDraftPoint: common.setDraftPoint })
change({ target: { value: '12.5' } })
assert.deepEqual(draft.regionCircle, { radiusKm: 12.5, anonymous: true })
change({ target: { value: '0' } }); assert.ok(error); assert.equal(draft.regionCircle.radiusKm, 12.5)
draft = { ...saved, regionCircle: undefined }
const changeNormal = evaluate(radiusChange, { draftPoint: draft, draftPointRef: ref, setStopRadiusError: value => error = value, setDraftPoint: common.setDraftPoint })
changeNormal({ target: { value: '3' } }); assert.equal(draft.regionCircle, undefined, 'Normal stops cannot gain a radius')
changeNormal({ target: { value: '0' } }); assert.equal(draft.regionCircle, undefined)
assert.ok(radiusCondition)
for (const [point, visible] of [[{pointType:'stop'},false],[{pointType:'stop',regionCircle:{radiusKm:3}},false],[{pointType:'stop',regionCircle:{radiusKm:5,anonymous:true}},true],[{pointType:'point',regionCircle:{radiusKm:5,anonymous:true}},false]]) {
  assert.equal(Boolean(evaluate(radiusCondition,{draftPoint:point})),visible,'Radius input appears only on anonymous stops')
}
let opened, focused = 0
const click = evaluate(circleClick, {
  isRecordingStop: false, isAwaitingMapPlacement: false, sortedPoints: [saved], beginEditPoint: point => opened = point,
  window: { requestAnimationFrame: fn => fn() }, stopRadiusInputRef: { current: { scrollIntoView: noop, focus: () => focused++, select: noop } },
})
click(saved); assert.equal(opened, saved); assert.equal(focused, 1)
const watchSource = fs.readFileSync('components/viewer/watch-experience.tsx', 'utf8')
const watchAst = ts.createSourceFile('watch.tsx', watchSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let show, label
function watchVisit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(watchAst) === 'showAnonymousRegion') show = node.initializer.getText(watchAst)
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'getWatchTimestampLabel') label = node.getText(watchAst)
  ts.forEachChild(node, watchVisit)
}
watchVisit(watchAst)
assert.equal(evaluate(label, { anonymousRegionName })({ ...saved, location: 'Hidden address' }), 'Anonymous Region')
for (const [currentTime, expected] of [[44,false],[45,true],[60,true],[80,false]]) {
  assert.equal(evaluate(show, { activeAnonymousRegion: saved, routePoints: [saved], activeTimestampIndex: 0, currentTime }), expected)
}
assert.match(watchSource, /\{anonymousRegionMessage\}/)
console.log('Anonymous regions passed: Shift W 5 km creation, normal W, selected/missing location, no reverse lookup, autoplay, radius editing, circle-click focus and Watch visibility.')
