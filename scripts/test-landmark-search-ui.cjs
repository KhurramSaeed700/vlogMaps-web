// Lightweight component contract tests with mocked browser capture and Google responses.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file, dependencies, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: (id) => dependencies[id] ?? require(id), ...globals })
  return exports
}
const crop = load('lib/video-frame-crop.ts', {})
const jsx = (type, props) => ({ type, props })
function fixture(mode = 'success', matches = [{ name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945, score: 0.99 }]) {
  const slots = [], effects = [], listeners = {}
  let index = 0, config, fetchCount = 0, stopped = false, drawn, chosen = null
  const react = {
    useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], (value) => { slots[slot] = value }] },
    useRef(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot] },
    useEffect(fn) { effects.push(fn) },
  }
  const track = { stop() { stopped = true }, getSettings() { return { displaySurface: mode === 'window' ? 'window' : 'browser' } },
    getCaptureHandle() { return { handle: mode === 'wrong-tab' ? 'other' : config.handle, origin: 'http://localhost:3000' } } }
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] }
  const document = {
    addEventListener: (name, fn) => { listeners[name] = fn }, removeEventListener() {},
    createElement(type) {
      if (type === 'video') return { videoWidth: 3200, videoHeight: 1800, play: async () => {}, requestVideoFrameCallback: (fn) => queueMicrotask(fn) }
      assert.equal(type, 'canvas')
      return { getContext: () => ({ drawImage: (...args) => { drawn = args.slice(1) } }), toDataURL: () => 'data:image/jpeg;base64,/9j/AA==' }
    },
  }
  class HTMLElement { constructor(input = false) { this.input = input } closest() { return this.input ? this : null } }
  const { LandmarkSearchButton } = load('components/creator/landmark-search-button.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-dom': { createPortal: (node, target) => ({ type: 'portal', props: { children: node, target } }) },
    'lucide-react': { ScanSearch: 'scan', Loader2: 'loader', X: 'close', MapPin: 'pin' },
    '@/components/ui/button': { Button: 'button' }, '@/lib/video-frame-crop': crop,
  }, { document, HTMLElement, DOMException, AbortController, crypto: { randomUUID: () => 'self-tab' },
    window: { innerWidth: 1600, innerHeight: 900, location: { origin: 'http://localhost:3000' }, setTimeout, clearTimeout },
    navigator: { mediaDevices: { setCaptureHandleConfig: (value) => { config = value }, getDisplayMedia: async () => {
      if (mode === 'cancel') throw new DOMException('denied', 'NotAllowedError')
      return stream
    } } },
    fetch: async () => { fetchCount++; assert.equal(stopped, true, 'sharing must stop before upload'); return { ok: true, json: async () => ({ results: matches }) } },
  })
  const target = { id: 'map-overlay' }
  const props = { previewRef: { current: { scrollIntoView() {}, getBoundingClientRect: () => ({ left: 10, top: 80, width: 800, height: 450 }) } },
    mapOverlayRef: { current: target }, onPause() {}, onDetected(value) { chosen = value } }
  let tree
  const render = () => { index = 0; effects.length = 0; tree = LandmarkSearchButton(props); effects.forEach((fn) => fn()); return tree }
  const walk = (node) => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
  const nodes = () => walk(tree)
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); render() }
  render()
  return { render, nodes, flush, listeners, HTMLElement, target,
    get fetchCount() { return fetchCount }, get drawn() { return drawn }, get chosen() { return chosen },
    clickCapture() { nodes().find((node) => node.props?.['aria-label'] === 'Search video landmark').props.onClick() },
  }
}
async function run() {
  const app = fixture()
  app.clickCapture()
  await app.flush()
  assert.equal(app.fetchCount, 1)
  assert.deepEqual(app.drawn, [20, 160, 1600, 900, 0, 0, 800, 450], 'capture must use only video rectangle')
  assert.equal(app.chosen, null, 'even a score of 0.99 must wait for a user choice')
  assert.equal(app.nodes().find((node) => node.type === 'portal').props.target, app.target)
  const candidate = app.nodes().find((node) => node.type === 'button' && !node.props['aria-label'] && node.props.variant === 'outline')
  assert.ok(candidate)
  candidate.props.onClick()
  assert.equal(app.chosen.name, 'Eiffel Tower')
  app.render()
  assert.equal(app.nodes().some((node) => node.type === 'portal'), false)
  for (const mode of ['wrong-tab', 'window', 'cancel']) {
    const invalid = fixture(mode)
    invalid.clickCapture()
    await invalid.flush()
    assert.equal(invalid.fetchCount, 0, `${mode} must not upload any pixels`)
    assert.ok(invalid.nodes().some((node) => node.props?.role === 'alert'))
  }
  const empty = fixture('success', [])
  empty.clickCapture(); await empty.flush()
  assert.equal(empty.chosen, null)
  assert.ok(empty.nodes().some((node) => node.props?.role === 'status'))
  const keyboard = fixture()
  let prevented = false
  keyboard.listeners.keydown?.({ code: 'KeyR', target: new keyboard.HTMLElement(true), preventDefault() { prevented = true } })
  await keyboard.flush()
  assert.equal(keyboard.fetchCount, 0)
  keyboard.listeners.keydown?.({ code: 'KeyR', target: new keyboard.HTMLElement(), preventDefault() { prevented = true } })
  await keyboard.flush()
  assert.equal(prevented, false, 'R must remain available for typing')
  assert.equal(keyboard.fetchCount, 0, 'R must not trigger landmark capture')
  assert.equal(keyboard.listeners.keydown, undefined, 'landmark search must not register a keyboard shortcut')
  console.log('Landmark UI tests passed: video-only crop, sharing stopped before upload, candidate choice, map portal, wrong-tab/window rejection, cancellation, no results, button capture and no R shortcut.')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
