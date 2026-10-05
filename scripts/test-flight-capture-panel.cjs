const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const sourceText = fs.readFileSync(path.join(__dirname, '../components/creator/creator-video-editor.tsx'), 'utf8')
const source = ts.createSourceFile('editor.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let initializer
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'renderFlightCapturePanel') initializer = node.initializer.getText(source)
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(initializer)
const code = ts.transpileModule('export const render = ' + initializer, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const jsx = (type, props) => ({ type, props })
const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
function fixture(role = 'landing') {
  const state = { flightAirportPrompt: { role, timestamp: 300, mode: 'airport' }, flightAirportCode: 'EDI', flightAirportPreview: null, isResolvingAirportCode: false, airportCodeMessage: '',
    Button: 'button', AirportSearchInput: 'airport-input', Plane: 'plane', MapIcon: 'map-icon', X: 'x', AirportSearchStatus: 'loading', AirportConfirmation: 'confirmation',
    normalizeAirportCode: value => value.toUpperCase(), getAirportCodeLocation: () => null, formatDuration: () => '5:00', saved: 0,
    cancelFlightAirportPrompt() { state.flightAirportPrompt = null }, previewFlightAirportCode() {}, saveFlightAirport() { state.saved++ },
    setFlightAirportCode(value) { state.flightAirportCode = value }, setFlightAirportPreview(value) { state.flightAirportPreview = value }, setAirportCodeMessage(value) { state.airportCodeMessage = value },
    setFlightAirportPrompt(fn) { state.flightAirportPrompt = fn(state.flightAirportPrompt) },
  }
  return { state, render() {
    const exports = {}
    new Function('exports', 'require', ...Object.keys(state), code)(exports, () => ({ jsx, jsxs: jsx }), ...Object.values(state))
    return walk(exports.render())
  } }
}
for (const role of ['landing', 'takeoff']) {
  const app = fixture(role)
  let nodes = app.render()
  const field = nodes.find(node => node.type === 'airport-input')
  assert.ok(field); assert.equal(field.props.autoFocus, true); assert.equal(field.props.disabled, false)
  assert.equal(field.props['aria-label'], role + ' airport')
  const map = nodes.find(node => node.props?.['aria-label'] === 'Pick ' + role + ' on map')
  assert.equal(map.props.type, 'button'); assert.equal(map.props['aria-pressed'], false)
  assert.ok(walk(map).some(node => node.type === 'map-icon'))
  map.props.onClick()
  assert.equal(app.state.flightAirportPrompt.mode, 'map')
  nodes = app.render()
  assert.equal(nodes.find(node => node.type === 'airport-input').props.disabled, true)
  assert.equal(nodes.find(node => node.props?.type === 'submit').props.disabled, true)
  nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(app.state.saved, 0, 'map mode must not submit an airport')
  nodes.find(node => node.props?.['aria-label'] === 'Search ' + role + ' airport instead').props.onClick()
  assert.equal(app.state.flightAirportPrompt.mode, 'airport')
  assert.equal(app.state.flightAirportCode, 'EDI', 'toggling modes must preserve airport input')
  nodes = app.render()
  nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(app.state.saved, 1)
  nodes.find(node => node.props?.['aria-label'] === 'Cancel flight entry').props.onClick()
  assert.equal(app.render().length, 0)
}
assert.equal(sourceText.includes('mode: "choose"'), false)
assert.equal(sourceText.includes('Back to options'), false)
console.log('Flight capture panel passed: direct airport search, takeoff/landing icon toggles, focus, retained input, guarded map submission, cancellation, no chooser.')
