const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../lib/home-tour.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
function load() {
  const result = { exports: {} }
  new Function('module', 'exports', compiled)(result, result.exports)
  return result.exports
}
const tour = load()
const values = new Map()
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
assert.equal(tour.hasSeenHomeTour(storage), false, 'First-time visitors see the tutorial')
tour.markHomeTourSeen(storage)
assert.equal(tour.hasSeenHomeTour(storage), true)
assert.equal(load().hasSeenHomeTour(storage), true, 'A new page load must remember that the tutorial was already shown')
const unavailableStorage = { getItem() { throw new Error('Storage blocked') }, setItem() { throw new Error('Storage blocked') } }
const privateTour = load()
assert.equal(privateTour.hasSeenHomeTour(unavailableStorage), false)
privateTour.markHomeTourSeen(unavailableStorage)
assert.equal(privateTour.hasSeenHomeTour(unavailableStorage), true, 'Blocked storage still avoids repeat tours in this session')
for (const viewport of [{ width: 390, height: 844 }, { width: 1920, height: 1080 }, { width: 320, height: 568 }]) {
  for (const top of [60, 250, viewport.height - 100]) {
    const target = { top, bottom: top + 24, left: viewport.width - 80, width: 64 }
    const box = tour.getHomeTourPlacement(target, viewport, 260)
    assert.ok(box.left >= 16 && box.left + box.width <= viewport.width - 16, 'Callout stays inside horizontal viewport')
    assert.ok(box.top >= 16 && box.top + box.maxHeight <= viewport.height - 16, 'Callout stays inside vertical viewport')
    assert.ok(box.below ? box.top > target.bottom : box.top + box.maxHeight < target.top, 'Callout does not cover the highlighted target')
  }
}
console.log('Home tour passed: first visit, persistent dismissal, blocked storage, and mobile/desktop positioning.')
