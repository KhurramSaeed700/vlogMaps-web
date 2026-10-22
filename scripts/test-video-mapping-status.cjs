const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync('lib/video-mapping-status.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const mod = {exports:{}}
new Function('module','exports',code)(mod,mod.exports)
const status = mod.exports.getVideoMappingStatus
assert.equal(status({durationSeconds:1200,keyframes:[]}), 'not-mapped')
assert.equal(status({durationSeconds:1200,keyframes:[{time:899}]}), 'mapping')
assert.equal(status({durationSeconds:1200,keyframes:[{time:900}]}), 'mapped')
assert.equal(status({durationSeconds:1200,keyframes:[{time:20,stopEndTime:901}]}), 'mapped')
assert.equal(status({durationSeconds:1200,keyframes:[{time:1100},{time:20}]}), 'mapped')
assert.equal(status({durationSeconds:0,keyframes:[{time:100}]}), 'checking')
assert.equal(status({durationSeconds:240,keyframes:[{time:10}]}), 'mapped')
assert.equal(status({durationSeconds:1200,keyframes:[{time:1250}]}), 'mapped')
assert.equal(status({durationSeconds:1200,keyframes:[{time:1080}]}), 'mapped')
assert.equal(status({durationSeconds:1200,keyframes:[{time:1200}]}), 'mapped')
console.log('Mapping states passed: empty, in progress, five-minute boundary, stop end time, unordered timestamps, unknown duration and short videos.')
