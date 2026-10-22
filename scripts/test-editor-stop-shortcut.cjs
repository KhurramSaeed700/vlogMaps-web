const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const source = fs.readFileSync('components/creator/creator-video-editor.tsx', 'utf8')
const ast = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function extract(name) {
  let result
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast)
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(result, name)
  return result
}
function evaluate(expression, deps) {
  const code = ts.transpileModule(`const value = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(deps), code + '; return value')(...Object.values(deps))
}
class Element {
  constructor(tag, protectedArea = false) { this.tagName = tag; this.protectedArea = protectedArea }
  closest() { return this.protectedArea }
}
const ignore = evaluate(extract('shouldIgnorePlaybackShortcut'), { HTMLElement: Element })
assert.equal(ignore(new Element('BUTTON')), false, 'W works after clicking an ordinary toolbar button')
assert.equal(ignore(new Element('CANVAS')), false)
for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(ignore(new Element(tag)), true)
assert.equal(ignore(new Element('BUTTON', true)), true, 'Dialogs and menus keep keyboard ownership')
const calls = []
const state = { isRecordingStop: false, startStopRecording: () => calls.push('start'), setStopEndTime: () => calls.push('end'), savePointFromMap: () => calls.push('place') }
const location = { current: null }
const playerTarget = new Element('DIV')
const keydown = evaluate(extract('handleKeyDown'), {
  editorTourOpenRef: { current: false }, editorShortcutStateRef: { current: state },
  searchedLocationRef: location, shouldIgnorePlaybackShortcut: ignore,
  Node: Element, videoPreviewRef: { current: { contains: target => target === playerTarget } },
})
const press = target => keydown({ code: 'KeyW', target, preventDefault() {} })
press(new Element('BUTTON')); assert.deepEqual(calls, ['start'])
state.isRecordingStop = true
press(new Element('CANVAS')); assert.deepEqual(calls, ['start', 'end'])
state.isAwaitingMapPlacement = true; location.current = { lat: 1, lng: 2 }
press(new Element('CANVAS')); assert.deepEqual(calls, ['start', 'end', 'place'])
press(new Element('INPUT')); assert.equal(calls.length, 3)
let anonymous
state.isRecordingStop = false
state.isAwaitingMapPlacement = false
state.startStopRecording = value => { anonymous = value }
keydown({ code: 'KeyW', shiftKey: true, target: new Element('BUTTON'), preventDefault() {} })
assert.equal(anonymous, true, 'Shift W starts an anonymous region')
anonymous = null
keydown({ code: '', key: 'W', shiftKey: true, target: new Element('BUTTON'), preventDefault() {} })
assert.equal(anonymous, true, 'Shift W supports keyboards that omit the physical code')
anonymous = null
keydown({ code: 'KeyW', shiftKey: true, target: new Element('INPUT'), preventDefault() {} })
assert.equal(anonymous, null, 'Typing keeps Shift W')
state.isRecordingStop = true
const before = calls.length
keydown({ code: 'KeyW', shiftKey: true, target: new Element('CANVAS'), preventDefault() {} })
assert.equal(calls[before], 'end', 'Press Shift W again to finish without starting another region')
state.isAwaitingMapPlacement = true
state.draftPoint = { lat: null, lng: null }
state.cancelPointEdit = () => { throw Error('Video Escape must not cancel pending placement') }
keydown({ code: 'Escape', target: playerTarget })
let cancelled = false
state.draftPoint = { lat: 1, lng: 2 }
state.isAwaitingMapPlacement = false
state.cancelPointEdit = () => { cancelled = true }
keydown({ code: 'Escape', target: new Element('CANVAS'), preventDefault() {} })
assert.equal(cancelled, true, 'Escape replaces the removed cancel button for a placed pending stop')
console.log('Editor stop shortcut passed: button focus, W start/place/end, Shift W anonymous regions, and typing guards.')

// Exercise the actual editor handler, including modifier guards and native text undo.
const historyCalls = []
state.undoMapEdit = () => historyCalls.push('undo')
state.redoMapEdit = () => historyCalls.push('redo')
function historyKey(overrides = {}) {
  let prevented = false
  keydown({code:'KeyZ', key:'z', ctrlKey:true, target:new Element('CANVAS'), preventDefault() { prevented = true }, ...overrides})
  return prevented
}
assert.equal(historyKey(),true)
assert.equal(historyKey({shiftKey:true}),true)
assert.equal(historyKey({code:'',key:'Z',shiftKey:true}),true)
assert.equal(historyKey({ctrlKey:false,metaKey:true}),true)
assert.deepEqual(historyCalls,['undo','redo','redo','undo'])
for (const overrides of [{target:new Element('INPUT')},{target:new Element('TEXTAREA')},{target:new Element('DIV',true)},{repeat:true},{isComposing:true},{defaultPrevented:true},{altKey:true},{ctrlKey:false}]) {
  assert.equal(historyKey(overrides),false)
}
assert.equal(historyCalls.length,4,'Typing, dialogs, repeats and unrelated chords must not edit map history')
console.log('Editor history shortcuts passed: Ctrl Z, Ctrl Shift Z, Cmd variants, typing and modifier guards')

// Starting a stop is itself undoable, even before a map placement exists.
for (const selectedLocation of [null, { lat: 61, lng: -149 }]) {
  const editor = { draftPoint: null, isAwaitingMapPlacement: false, isRecordingStop: false, isPlaying: true }
  const draftPointRef = { current: null }
  const undoStack = [], redoStack = []
  const snapshot = () => ({ ...editor, points: [], tripRoute: {}, routeShapes: {}, activeTripEndpoint: null,
    draftFlightLandingPoint: null, activeFlightEditEndpoint: 'takeoff', flightEditLocationModes: {} })
  const setter = key => value => { editor[key] = value }
  const apply = evaluate(extract('applyMapEditSnapshot'), {
    cancelNearbyPlaceLookup() {}, setResumeCountdown() {}, draftPointRef,
    setIsRecordingStop: setter('isRecordingStop'), setIsPlaying: setter('isPlaying'),
    restoreMapDocument() {}, persistEditorState() {}, savedPlaces: [], setActiveTripEndpoint() {},
    setDraftPoint: setter('draftPoint'), setDraftFlightLandingPoint() {}, setActiveFlightEditEndpoint() {},
    setFlightEditLocationModes() {}, setIsAwaitingMapPlacement: setter('isAwaitingMapPlacement'),
  })
  const start = evaluate(extract('startStopRecording'), {
    pendingFlightTakeoff: null, flightAirportPrompt: null, isPlacingSavedPlace: false,
    recordMapEditSnapshot: () => undoStack.push(snapshot()), cancelNearbyPlaceLookup() {},
    currentTimeRef: { current: 20 }, setResumeCountdown() {}, setIsPlaying: setter('isPlaying'),
    anonymousRegionName: 'Anonymous Region', anonymousRegionMessage: 'Within region',
    getDraftLocation: () => 'Stop point', getDraftDescription: () => 'Stop', displayedRows: [],
    draftPointRef, setDraftPoint: setter('draftPoint'), searchedLocationRef: { current: selectedLocation },
    setIsAwaitingMapPlacement: setter('isAwaitingMapPlacement'), setIsRecordingStop: setter('isRecordingStop'),
    setIsTimestampNameEditing() {}, savePointFromMap(location, draft, awaiting, recording, skipLookup, recordPlacement) {
      assert.equal(recordPlacement, false, 'Automatic placement shares the W undo step')
      draftPointRef.current = { ...draft, ...location }; editor.draftPoint = draftPointRef.current
    },
  })
  const undo = evaluate(extract('undoMapEdit'), { undoStack, createMapEditSnapshot: snapshot,
    undoHistory: current => { redoStack.push(current); undoStack.pop() }, applyMapEditSnapshot: apply })
  const redo = evaluate(extract('redoMapEdit'), { redoStack, createMapEditSnapshot: snapshot,
    redoHistory: current => { undoStack.push(current); redoStack.pop() }, applyMapEditSnapshot: apply })
  start()
  assert.equal(editor.isRecordingStop, true)
  assert.equal(undoStack.length, 1)
  undo()
  assert.equal(editor.draftPoint, null)
  assert.equal(draftPointRef.current, null)
  assert.equal(editor.isRecordingStop, false)
  assert.equal(editor.isAwaitingMapPlacement, false)
  assert.equal(editor.isPlaying, true, 'Undo restores playback state before W')
  redo()
  assert.equal(editor.isRecordingStop, true)
  assert.equal(editor.isPlaying, false)
  assert.equal(draftPointRef.current.time, 20)
}
console.log('Pending stop undo passed: W → Ctrl Z restores state, Ctrl Shift Z restores the pending stop, with and without a selected marker.')
