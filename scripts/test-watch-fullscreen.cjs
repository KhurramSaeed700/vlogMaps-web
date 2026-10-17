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
  assert.match(source, /aria-label=\{isFullscreen \? "Exit video fullscreen" : "Enter video fullscreen"\}/, 'An explicit fullscreen exit control must remain available')
  console.log('Watch fullscreen passed: enter/exit, rejected requests, explicit exit control, and no iframe focus timers.')
}
checkFullscreenRequests().catch(error => { console.error(error); process.exitCode = 1 })
