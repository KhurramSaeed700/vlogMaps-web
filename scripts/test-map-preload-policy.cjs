const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../lib/map-preload-policy.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const loaded = { exports: {} }
new Function('module', 'exports', code)(loaded, loaded.exports)
const { getMapPreloadPolicy: policy } = loaded.exports

test('offline and Data Saver disable speculative requests', () => {
  assert.equal(policy({ downlink: 100 }, false).maxTargets, 0)
  assert.equal(policy({ downlink: 100, saveData: true }).samples, 0)
})
test('slow or high-latency connections override optimistic bandwidth', () => {
  for (const hints of [{ effectiveType: '2g', downlink: 10 }, { rtt: 800, downlink: 100 }, { downlink: 0.5 }]) {
    assert.equal(policy(hints).seconds, 6)
  }
})
test('buffer grows with bandwidth but stays bounded', () => {
  const slow = policy({ downlink: 2 })
  const fallback = policy()
  const fast = policy({ downlink: 10 })
  assert.ok(slow.seconds < fallback.seconds && fallback.seconds < fast.seconds)
  assert.ok(slow.delayMs > fast.delayMs)
  assert.equal(fast.seconds, 45)
  assert.ok(fast.maxTargets <= 18)
  assert.deepEqual(policy({ downlink: 1000 }), fast)
})

test('observed tile latency and backlog override optimistic bandwidth', () => {
  assert.equal(policy({ downlink: 100 }, true, { latencyMs: 2100, samples: 8, pending: 5 }).maxTargets, 3)
  assert.equal(policy({ downlink: 100 }, true, { latencyMs: 1000, samples: 8, pending: 5 }).maxTargets, 6)
  assert.equal(policy(undefined, true, { latencyMs: 100, samples: 8, pending: 60 }).maxTargets, 3)
  assert.equal(policy(undefined, true, { latencyMs: 100, samples: 8, pending: 0 }).maxTargets, 18)
  assert.equal(policy({ saveData: true }, true, { latencyMs: 100, samples: 8, pending: 0 }).maxTargets, 0)
})
