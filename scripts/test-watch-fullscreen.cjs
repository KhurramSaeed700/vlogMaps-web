const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../components/media/youtube-player.tsx'), 'utf8')
const transpile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
class Element {
  constructor(tagName, editable = false, combobox = false) {
    Object.assign(this, { tagName, isContentEditable: editable, combobox })
  }
  closest() { return this.combobox }
}
const helpers = source.slice(source.indexOf('function shouldIgnorePlayerShortcut'), source.indexOf('export function YouTubePlayer'))
const { shouldIgnorePlayerShortcut, getWatchShortcutDigit } = new Function('HTMLElement', transpile(helpers) + ';return {shouldIgnorePlayerShortcut, getWatchShortcutDigit}') (Element)
const handlerSource = source.slice(source.indexOf('const handleKeyDown ='), source.indexOf('const handleKeyUp ='))
let fullscreenToggles = 0
const noop = () => {}
const dependencies = {
  allowKeyboard: false, allowWatchKeyboardControls: true,
  shouldIgnorePlayerShortcut, getWatchShortcutDigit,
  toggleFullscreenFromKeyboard: () => fullscreenToggles++,
  seekToDurationPercentage: noop, togglePlaybackFromKeyboard: noop, startKeyboardSeek: noop,
  adjustVolumeFromKeyboard: noop, toggleCaptionsFromKeyboard: noop, toggleMuteFromKeyboard: noop,
}
const handleKeyDown = new Function(...Object.keys(dependencies), transpile(handlerSource) + ';return handleKeyDown')(...Object.values(dependencies))
function press(overrides = {}) {
  let prevented = false
  handleKeyDown({ code: 'KeyF', key: 'f', target: new Element('DIV'), repeat: false,
    preventDefault() { prevented = true }, ...overrides })
  return prevented
}
assert.equal(press(), true)
assert.equal(fullscreenToggles, 1)
press() // Second press exits fullscreen through the same toggle.
assert.equal(fullscreenToggles, 2)
press({ target: new Element('BUTTON') })
assert.equal(fullscreenToggles, 3, 'Focused watch controls must not block fullscreen')
for (const target of [new Element('INPUT'), new Element('TEXTAREA'), new Element('SELECT'), new Element('DIV', true), new Element('DIV', false, true)]) {
  assert.equal(press({ target }), false, 'Typing must not trigger fullscreen')
}
for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing', 'defaultPrevented']) press({ [flag]: true })
press({ repeat: true })
assert.equal(fullscreenToggles, 3, 'Modifiers, composition, consumed events and key repeats must not toggle')
for (const editor of [false, true]) {
  const seeks = []
  const deps = { ...dependencies, allowKeyboard: editor, allowWatchKeyboardControls: !editor, seekToDurationPercentage: value => seeks.push(value) }
  const handler = new Function(...Object.keys(deps), transpile(handlerSource) + ';return handleKeyDown')(...Object.values(deps))
  const key = (code, overrides = {}) => {
    let prevented = false
    handler({ code, key: code, target: new Element('BUTTON'), preventDefault() { prevented = true }, ...overrides })
    return prevented
  }
  assert.equal(key('Home'), true)
  assert.equal(key('End'), true)
  assert.deepEqual(seeks, [0, 1], 'Watch and editor must jump to the video boundaries')
  for (const target of [new Element('INPUT'), new Element('TEXTAREA'), new Element('DIV', true), new Element('DIV', false, true)]) {
    assert.equal(key('Home', { target }), false, 'Text navigation and dialogs retain Home/End')
    assert.equal(key('End', { target }), false)
  }
  for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing', 'defaultPrevented', 'repeat']) key('End', { [flag]: true })
  assert.deepEqual(seeks, [0, 1])
}
const boundarySeekSource = source.slice(source.indexOf('const seekToDurationPercentage ='), source.indexOf('  useEffect(() => {', source.indexOf('const seekToDurationPercentage =')))
let duration = 1121
const destinations = []
const boundarySeek = new Function('onSeekToEndRef', 'playerRef', 'beginPendingSeek', 'clampVideoTime', transpile(boundarySeekSource) + ';return seekToDurationPercentage')(
  { current: undefined }, { current: { getDuration: () => duration } }, (_, time) => destinations.push(time), (time, total) => Math.min(Math.max(time, 0), total),
)
boundarySeek(0); boundarySeek(1)
assert.deepEqual(destinations, [0, 1121], 'Seek to the actual beginning and full duration')
duration = 0; boundarySeek(1)
assert.deepEqual(destinations, [0, 1121], 'Ignore unavailable duration')
const toggleSource = source.slice(source.indexOf('const toggleFullscreenFromKeyboard ='), source.indexOf('const seekToDurationPercentage ='))
async function checkFullscreenRequests() {
  let requested = 0, exited = 0
  const errors = []
  const expanded = []
  const element = { requestFullscreen: async () => { requested++ } }
  const document = { fullscreenElement: null, exitFullscreen: async () => { exited++ } }
  const toggle = new Function('wrapperRef', 'document', 'setFullscreenError', 'isExpanded', 'setIsExpanded', 'diagnosticEvent', 'videoId', 'reportHandledError', transpile(toggleSource) + ';return toggleFullscreenFromKeyboard')(
    { current: element }, document, value => errors.push(value), false, value => expanded.push(value), noop, "test", noop,
  )
  await toggle()
  assert.equal(requested, 1, 'Only the video wrapper enters fullscreen')
  document.fullscreenElement = element
  await toggle()
  assert.equal(exited, 1)
  document.exitFullscreen = async () => { throw new Error('Fullscreen request denied') }
  await toggle()
  assert.equal(errors.at(-1), 'Could not exit fullscreen. Press Escape to exit.', 'Rejected exit requests must be handled')
  document.fullscreenElement = null
  element.requestFullscreen = async () => { throw new Error('Fullscreen request denied') }
  await toggle()
  assert.equal(expanded.at(-1), true, 'Rejected entry requests must fall back to an expanded video')
  const closeExpanded = new Function('wrapperRef', 'document', 'setFullscreenError', 'isExpanded', 'setIsExpanded', 'diagnosticEvent', 'videoId', 'reportHandledError', transpile(toggleSource) + ';return toggleFullscreenFromKeyboard')({ current: element }, document, value => errors.push(value), true, value => expanded.push(value), noop, "test", noop)
  await closeExpanded()
  assert.equal(expanded.at(-1), false, 'The exit control must close expanded mode')
  const escapeSource = source.slice(source.indexOf('const handleEscape ='), source.indexOf('    document.addEventListener("keydown", handleEscape'))
  const escape = new Function('setIsExpanded', transpile(escapeSource) + ';return handleEscape')(value => expanded.push(value))
  let preventedEscape = false
  escape({ key: 'Escape', preventDefault() { preventedEscape = true } })
  assert.equal(preventedEscape, true)
  assert.equal(expanded.at(-1), false, 'Escape must close the fallback fullscreen mode')
  assert.doesNotMatch(source, /window\.focus\(\)|restoreFocusTimeout/, 'Player must not fight iframe focus with recurring timers')
  assert.ok(!source.includes('aria-label={isFullscreen ? "Exit video fullscreen"'), 'No persistent fullscreen button')
  assert.ok(!source.includes('flex min-h-8 shrink-0'), 'No footer reserves black space below the video')
  console.log('Watch fullscreen passed: enter/exit, rejected requests, keyboard exits, no permanent footer, and no iframe focus timers.')
}
checkFullscreenRequests().catch(error => { console.error(error); process.exitCode = 1 })
