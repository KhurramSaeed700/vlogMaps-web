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
// Fullscreen is opt-in and must belong to this player, never another element.
wrapper.dataset.playerFullscreen = 'true'
exportsObject.returnEditorPlayerFocus(wrapper, { ...doc, fullscreenElement: wrapper }, true)
assert.equal(focus, 2, 'F remains reachable after clicking the iframe in browser fullscreen')
exportsObject.returnEditorPlayerFocus(wrapper, doc, true)
assert.equal(focus, 3, 'Expanded fullscreen also returns iframe focus')
exportsObject.returnEditorPlayerFocus(wrapper, { ...doc, fullscreenElement: new Element() }, true)
assert.equal(focus, 3, 'Unrelated fullscreen never loses focus')
exportsObject.returnEditorPlayerFocus(wrapper, { ...doc, activeElement: new Element() }, true)
assert.equal(focus, 3, 'Typing and other controls retain their focus')
const source = fs.readFileSync('components/media/youtube-player.tsx', 'utf8')
const focusEffectStart = source.indexOf('    if (!allowKeyboard && !allowWatchKeyboardControls) return')
const focusEffectEnd = source.indexOf('  }, [allowKeyboard, allowWatchKeyboardControls, videoId])', focusEffectStart)
const focusEffect = source.slice(focusEffectStart, focusEffectEnd)
let scheduled, cancelledFrame=0
const listeners={}
const watchWindow={addEventListener(name,fn){listeners[name]=fn},removeEventListener(name){delete listeners[name]},requestAnimationFrame(fn){scheduled=fn;return 1},cancelAnimationFrame(){cancelledFrame++;scheduled=null}}
const installFocusHandback=new Function('allowKeyboard','allowWatchKeyboardControls','wrapperRef','document','window','returnEditorPlayerFocus',compile(focusEffect))
const cleanupFocus=installFocusHandback(false,true,{current:wrapper},doc,watchWindow,exportsObject.returnEditorPlayerFocus)
listeners.blur();assert.equal(focus,3,'Focus is not changed during the mouse event itself')
scheduled();assert.equal(focus,4,'Watch returns focus after a fullscreen iframe click')
wrapper.dataset.playerFullscreen='false';listeners.blur();scheduled();assert.equal(focus,4,'Normal watch iframe controls retain native focus')
wrapper.dataset.playerFullscreen='true';listeners.blur();cleanupFocus();assert.equal(scheduled,null);assert.ok(!listeners.blur,'Pending handback and blur listener are removed on unmount')
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
