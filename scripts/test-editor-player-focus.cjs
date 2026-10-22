const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
class Element {}
class Frame extends Element {}
const exportsObject = {}
new Function('exports', 'HTMLIFrameElement', compile(fs.readFileSync('lib/editor-player-focus.ts', 'utf8')))(exportsObject, Frame)
const frame = new Frame()
let focus = 0
const wrapper = { dataset: {}, contains: element => element === frame, focus: options => { assert.equal(options.preventScroll, true); focus++ } }
const doc = { activeElement: frame, hasFocus: () => true, hidden: false, fullscreenElement: null }
exportsObject.returnEditorPlayerFocus(wrapper, doc)
assert.equal(focus, 1, 'Iframe focus returns to page playback shortcuts')
for (const override of [{ hidden: true }, { fullscreenElement: frame }, { hasFocus: () => false }, { activeElement: new Element() }]) {
  exportsObject.returnEditorPlayerFocus(wrapper, { ...doc, ...override })
}
wrapper.dataset.playerFullscreen = 'true'
exportsObject.returnEditorPlayerFocus(wrapper, doc)
assert.equal(focus, 1, 'Never steal focus from typing, other apps, hidden tabs or fullscreen')
const source = fs.readFileSync('components/media/youtube-player.tsx', 'utf8')
const handlerSource = source.slice(source.indexOf('const handleKeyDown ='), source.indexOf('const handleKeyUp ='))
let escapes = 0, cancelled = 0, cleared = 0, toggles = 0
const deps = {
  Node: Element, allowKeyboard: true, allowWatchKeyboardControls: false,
  wrapperRef: { current: wrapper }, speedHold: { cancel: () => cancelled++ }, clearSeekHoldTimers: () => cleared++,
  onKeyboardEscapeRef: { current: () => escapes++ }, shouldIgnorePlayerShortcut: target => target !== frame,
  getWatchShortcutDigit: () => null, togglePlaybackFromKeyboard: () => toggles++,
}
const handler = new Function(...Object.keys(deps), compile(handlerSource) + ';return handleKeyDown')(...Object.values(deps))
let prevented = false
handler({ code: 'Escape', target: frame, preventDefault() { prevented = true } })
assert.deepEqual([prevented, escapes, cancelled, cleared], [true, 1, 1, 1], 'Escape returns focus without changing playback or cancelling a draft')
handler({ code: 'KeyK', target: frame, preventDefault() {} })
assert.equal(toggles, 1, 'Page-owned video controls still toggle playback')
handler({ code: 'Escape', target: new Element(), preventDefault() { throw Error('Must not consume Escape outside the player') } })
assert.equal(escapes, 1)
assert.match(source, /window\.addEventListener\("blur", handlePlayerFocus\)/)
assert.match(source, /window\.removeEventListener\("blur", handlePlayerFocus\)/)
assert.match(source, /cancelAnimationFrame\(frame\)/, 'Pending focus check is cleaned up')
console.log('Editor player focus passed: event-driven handback, Escape, playback controls, typing/background/fullscreen safety and cleanup.')
